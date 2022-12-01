import { Box, Collapse, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { TraceMetadata } from '../types';
import React, { useContext } from 'react';
import { SpanIconButton } from '../SpanIconButton';
import { BigNumber, ethers } from 'ethers';
import { NATIVE_TOKEN } from '../decoder/actions';
import { findAffectedContract, formatUsd } from '../helpers';
import { DataRenderer } from '../DataRenderer';
import { ChainConfig, ChainConfigContext } from '../Chains';
import { fetchDefiLlamaPrices, getPriceOfToken, PriceMetadata, PriceMetadataContext, toDefiLlamaId } from '../metadata/prices';
import { fetchTokenMetadata, TokenMetadata, TokenMetadataContext } from '../metadata/tokens';
import { TraceEntryCall, TraceEntryLog, TraceResponse } from '../api';
import { BaseProvider } from '@ethersproject/providers';
import { TransactionMetadataContext } from '../metadata/transaction';

type AddressValueInfo = {
    hasMissingPrices: boolean;
    totalValueChange: bigint;
    changePerToken: Record<string, bigint>;
};

export type ValueChangeProps = {
    traceResult: TraceResponse;
    traceMetadata: TraceMetadata;
    provider: BaseProvider;
};

type RowProps = {
    address: string;
    changes: AddressValueInfo;
};

function Row(props: RowProps) {
    const { address, changes: valueInfo } = props;

    const priceMetadata = useContext(PriceMetadataContext);
    const tokenMetadata = useContext(TokenMetadataContext);
    const chainConfig = useContext(ChainConfigContext);

    const [open, setOpen] = React.useState(false);

    const changeInPriceRendered = valueInfo.hasMissingPrices ? (
        <span>Loading...</span>
    ) : (
        <span style={{ color: valueInfo.totalValueChange < 0n ? '#ed335f' : valueInfo.totalValueChange > 0n ? '#067034' : '' }}>
            {formatUsd(valueInfo.totalValueChange)}
        </span>
    );

    const tokenBreakdown = Object.keys(valueInfo.changePerToken)
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

            let amountFormatted = valueInfo.changePerToken[token].toString();
            let tokenPriceRendered = 'Loading...';

            let tokenInfo = tokenMetadata.tokens[tokenAddress];
            if (tokenInfo !== undefined && tokenInfo.decimals !== undefined) {
                amountFormatted = ethers.utils.formatUnits(valueInfo.changePerToken[token], tokenInfo.decimals);
            }
            if (priceMetadata.status[priceId] === 'fetched') {
                tokenPriceRendered = formatUsd(getPriceOfToken(priceMetadata, priceId, valueInfo.changePerToken[token], 'historical')!);
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
    chainConfig: ChainConfig,
    priceMetadata: PriceMetadata,
): [Record<string, AddressValueInfo>, Set<string>] => {
    const changes: Record<string, AddressValueInfo> = {};
    const allTokens = new Set<string>();

    const addChange = (address: string, token: string, change: bigint) => {
        address = address.toLowerCase();
        token = token.toLowerCase();

        allTokens.add(token);

        if (tokenMetadata.status[token] === 'fetched' && tokenMetadata.tokens[token].isNft) {
            change = change > 0n ? 1n : -1n;
        }

        if (!(address in changes)) {
            changes[address] = {
                hasMissingPrices: false,
                totalValueChange: 0n,
                changePerToken: {},
            };
        }
        if (!(token in changes[address].changePerToken)) {
            changes[address].changePerToken[token] = change;
            return;
        }

        changes[address].changePerToken[token] = changes[address].changePerToken[token] + change;
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
                delete addrChanges.changePerToken[token];
            }
        }

        if (Object.entries(addrChanges).length === 0) {
            delete changes[addr];
        }
    }

    Object.values(changes).forEach(info => {
        let hasMissingPrice = false;
        let changeInValue = 0n;
        Object.entries(info.changePerToken).forEach(([token, delta]) => {
            const defiLlamaId = toDefiLlamaId(chainConfig, token);

            const deltaPrice = getPriceOfToken(priceMetadata, defiLlamaId, delta, 'historical');
            if (deltaPrice === null) {
                hasMissingPrice = true;
                return;
            }

            changeInValue += deltaPrice;
        });

        info.hasMissingPrices = hasMissingPrice;
        info.totalValueChange = changeInValue;
    });


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
        return computeBalanceChanges(traceResult.entrypoint, traceMetadata, tokenMetadata, chainConfig, priceMetadata);
    }, [traceResult, traceMetadata, tokenMetadata, priceMetadata, chainConfig]);
    const [sortOptions, setSortOptions] = React.useState<['address' | 'price', 'asc' | 'desc']>(['price', 'desc']);

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
                    <TableCell>
                        <TableSortLabel
                            active={sortOptions[0] === 'address'}
                            direction={sortOptions[0] === 'address' ? sortOptions[1] : 'asc'}
                            onClick={() => {
                                setSortOptions((prevOptions) => {
                                    return ['address', prevOptions[0] === 'address' && prevOptions[1] === 'asc' ? 'desc' : 'asc'];
                                });
                            }}
                        >
                            Address
                        </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                        <TableSortLabel
                            active={sortOptions[0] === 'price'}
                            direction={sortOptions[0] === 'price' ? sortOptions[1] : 'asc'}
                            onClick={() => {
                                setSortOptions((prevOptions) => {
                                    return ['price', prevOptions[0] === 'price' && prevOptions[1] === 'asc' ? 'desc' : 'asc'];
                                });
                            }}
                        >
                            Change In Value
                        </TableSortLabel>
                    </TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {Object.entries(changes)
                    .sort(sortOptions[0] === 'address' ? (a, b) => {
                        return sortOptions[1] === 'asc' ?
                            a[0].localeCompare(b[0]) :
                            b[0].localeCompare(a[0]);
                    } : (a, b) => {
                        if (!a[1].hasMissingPrices && !b[1].hasMissingPrices) {
                            return sortOptions[1] === 'asc' ?
                                (a[1].totalValueChange < b[1].totalValueChange ? -1 : 1) :
                                (b[1].totalValueChange < a[1].totalValueChange ? -1 : 1);
                        } else if (a[1].hasMissingPrices) {
                            return sortOptions[1] === 'asc' ? -1 : 1;
                        } else if (b[1].hasMissingPrices) {
                            return sortOptions[1] === 'asc' ? 1 : -1;
                        } else {
                            return 0;
                        }
                    })
                    .map((entry) => {
                        return <Row key={entry[0]} address={entry[0]} changes={entry[1]} />;
                    })}
            </TableBody>
        </Table>
    ) : null;
};
