import { Box, Collapse, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { TraceMetadata } from '../types';
import React, { useContext } from 'react';
import { SpanIconButton } from '../SpanIconButton';
import { BigNumber, ethers } from 'ethers';
import { NATIVE_TOKEN } from '../decoder/sdk/actions';
import { findAffectedContract, formatUsd } from '../helpers';
import { DataRenderer } from '../DataRenderer';
import { ChainConfigContext } from '../Chains';
import { fetchDefiLlamaPrices, getPriceOfToken, PriceMetadataContext, toDefiLlamaId } from '../metadata/prices';
import { fetchTokenMetadata, TokenMetadata, TokenMetadataContext } from '../metadata/tokens';
import { TraceEntryCall, TraceEntryLog, TraceResponse } from '../api';
import { BaseProvider } from '@ethersproject/providers';
import { TransactionMetadataContext } from '../metadata/transaction';

export type ValueChangeProps = {
    traceResult: TraceResponse;
    traceMetadata: TraceMetadata;
    provider: BaseProvider;
};

type RowProps = {
    address: string;
    changes: Record<string, bigint>;
};

function Row(props: RowProps) {
    const { address, changes } = props;

    const priceMetadata = useContext(PriceMetadataContext);
    const tokenMetadata = useContext(TokenMetadataContext);
    const chainConfig = useContext(ChainConfigContext);

    const [open, setOpen] = React.useState(false);

    let hasMissingPrice = false;
    let changeInValue = 0n;
    Object.entries(changes).forEach(([token, delta]) => {
        const defiLlamaId = toDefiLlamaId(chainConfig, token);

        const deltaPrice = getPriceOfToken(priceMetadata, defiLlamaId, delta, 'historical');
        if (deltaPrice === null) {
            hasMissingPrice = true;
            return;
        }

        changeInValue += deltaPrice;
    });

    const changeInPriceRendered = hasMissingPrice ? (
        <span>Loading...</span>
    ) : (
        <span style={{ color: changeInValue < 0n ? '#ed335f' : changeInValue > 0n ? '#067034' : '' }}>
            {formatUsd(changeInValue)}
        </span>
    );

    const tokenBreakdown = Object.keys(changes)
        .sort()
        .map((token) => {
            let labels;
            let tokenAddress = token;
            let priceId = toDefiLlamaId(chainConfig, token);
            if (token === NATIVE_TOKEN) {
                tokenAddress = chainConfig.nativeTokenAddress || '';
                priceId = chainConfig.coingeckoId || '';
                labels = { [tokenAddress]: chainConfig.nativeSymbol || '' };
            }
            tokenAddress = tokenAddress.toLowerCase();

            let amountFormatted = changes[token].toString();
            let tokenPriceRendered = 'Loading...';

            let tokenInfo = tokenMetadata.tokens[tokenAddress];
            if (tokenInfo !== undefined && tokenInfo.decimals !== undefined) {
                amountFormatted = ethers.utils.formatUnits(changes[token], tokenInfo.decimals);
            }
            if (priceMetadata.status[priceId] === 'fetched') {
                tokenPriceRendered = formatUsd(getPriceOfToken(priceMetadata, priceId, changes[token], 'historical')!);
            }

            return (
                <TableRow key={token}>
                    <TableCell component="th" scope="row">
                        {<DataRenderer preferredType={'address'} labels={labels} data={tokenAddress} />}
                    </TableCell>
                    <TableCell>{amountFormatted}</TableCell>
                    <TableCell align="right">{tokenPriceRendered}</TableCell>
                </TableRow>
            );
        });

    return (
        <React.Fragment>
            <TableRow>
                <TableCell style={{ borderBottom: 'none' }}>
                    <SpanIconButton
                        icon={open ? KeyboardArrowUpIcon : KeyboardArrowDownIcon}
                        onClick={() => setOpen(!open)}
                    />
                </TableCell>
                <TableCell component="th" scope="row" style={{ borderBottom: 'none' }}>
                    <DataRenderer preferredType={'address'} data={address} />
                </TableCell>
                <TableCell align="right" style={{ borderBottom: 'none' }}>
                    {changeInPriceRendered}
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Table size="small" aria-label="purchases">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Token</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell align="right">Value</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>{tokenBreakdown}</TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
}

const computeBalanceChanges = (
    entrypoint: TraceEntryCall,
    traceMetadata: TraceMetadata,
    tokenMetadata: TokenMetadata,
): [Record<string, Record<string, bigint>>, Set<string>] => {
    const changes: Record<string, Record<string, bigint>> = {};
    const allTokens = new Set<string>();

    const addChange = (address: string, token: string, change: bigint) => {
        address = address.toLowerCase();
        token = token.toLowerCase();

        allTokens.add(token);

        if (tokenMetadata.status[token] === 'fetched' && tokenMetadata.tokens[token].isNft) {
            change = change > 0n ? 1n : -1n;
        }

        if (!(address in changes)) {
            changes[address] = {};
        }
        if (!(token in changes[address])) {
            changes[address][token] = change;
            return;
        }

        changes[address][token] = changes[address][token] + change;
    };

    const visitNode = (node: TraceEntryCall) => {
        // skip failed calls because their events don't matter
        if (node.status === 0) return;

        const value = BigNumber.from(node.value).toBigInt();
        if (value != 0n) {
            addChange(node.from, NATIVE_TOKEN, -value);
            addChange(node.to, NATIVE_TOKEN, value);
        }

        node.children
            .filter((child): child is TraceEntryLog => child.type === 'log')
            .forEach((traceLog) => {
                if (traceLog.topics.length === 0) return;
                if (traceLog.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                    const [parentNode] = findAffectedContract(traceMetadata, traceLog);

                    try {
                        const parsedEvent = traceMetadata.abis[node.to][node.codehash].parseLog({
                            topics: traceLog.topics,
                            data: traceLog.data,
                        });

                        const value = (parsedEvent.args[2] as BigNumber).toBigInt();
                        addChange(parsedEvent.args[0] as string, parentNode.to, -value);
                        addChange(parsedEvent.args[1] as string, parentNode.to, value);
                    } catch (e) {
                        console.error('failed to process value change', e);
                    }
                } else if (
                    traceLog.topics[0] === '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65'
                ) {
                    const [parentNode] = findAffectedContract(traceMetadata, traceLog);

                    try {
                        const parsedEvent = traceMetadata.abis[node.to][node.codehash].parseLog({
                            topics: traceLog.topics,
                            data: traceLog.data,
                        });

                        const value = (parsedEvent.args[1] as BigNumber).toBigInt();
                        addChange(parsedEvent.args[0] as string, parentNode.to, -value);
                    } catch (e) {
                        console.error('failed to process value change', e);
                    }
                }
            });

        node.children.filter((child): child is TraceEntryCall => child.type === 'call').forEach(visitNode);
    };
    visitNode(entrypoint);

    for (let [addr, addrChanges] of Object.entries(changes)) {
        for (let [token, delta] of Object.entries(addrChanges)) {
            if (delta === 0n) {
                delete addrChanges[token];
            }
        }

        if (Object.entries(addrChanges).length === 0) {
            delete changes[addr];
        }
    }

    return [changes, allTokens];
};

export const ValueChange = (props: ValueChangeProps) => {
    console.log('rendering value change');
    const { traceResult, traceMetadata, provider } = props;
    const tokenMetadata = useContext(TokenMetadataContext);
    const chainConfig = useContext(ChainConfigContext);
    const transactionMetadata = useContext(TransactionMetadataContext);
    const priceMetadata = useContext(PriceMetadataContext);

    const [changes, allTokens] = React.useMemo(() => {
        return computeBalanceChanges(traceResult.entrypoint, traceMetadata, tokenMetadata);
    }, [traceResult, traceMetadata, tokenMetadata]);

    fetchDefiLlamaPrices(
        priceMetadata.updater,
        Array.from(allTokens).map((token) => {
            const tokenAddress = token === NATIVE_TOKEN ? ethers.constants.AddressZero : token;
            return `${chainConfig.defillamaPrefix}:${tokenAddress}`;
        }),
        transactionMetadata.block.timestamp,
    );
    fetchTokenMetadata(tokenMetadata.updater, provider, Array.from(allTokens));

    return Object.entries(changes).length > 0 ? (
        <Table aria-label="collapsible table" size={'small'} sx={{ maxWidth: { md: '100vw', lg: '75vw', xl: '50vw' } }}>
            <TableHead>
                <TableRow>
                    <TableCell />
                    <TableCell>Address</TableCell>
                    <TableCell align="right">Change In Value</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {Object.keys(changes)
                    .sort()
                    .map((row) => {
                        return <Row key={row} address={row} changes={changes[row]} />;
                    })}
            </TableBody>
        </Table>
    ) : null;
};
