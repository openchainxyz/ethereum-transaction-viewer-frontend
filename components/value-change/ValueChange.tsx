import {Box, Collapse, Table, TableBody, TableCell, TableHead, TableRow} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import {TraceEntryCall, TraceEntryLog, TraceMetadata, TraceResult} from '../types';
import React, {useContext} from 'react';
import {SpanIconButton} from '../SpanIconButton';
import {BigNumber, ethers} from 'ethers';
import {NATIVE_TOKEN} from '../decoder/actions';
import {formatUsd} from '../helpers';
import {DataRenderer} from '../DataRenderer';
import {getChain} from '../Chains';
import {getPriceOfToken, PriceMetadataContext, toDefiLlamaId} from '../metadata/prices';
import {TokenMetadata, TokenMetadataContext} from '../metadata/tokens';
import {LabelMetadataContext} from "../metadata/labels";

export type ValueChangeProps = {
    traceResult: TraceResult;
    traceMetadata: TraceMetadata;

    requestMetadata: (tokens: Array<string>) => void;
};

type RowProps = {
    address: string;
    changes: Record<string, bigint>;
    traceMetadata: TraceMetadata;
};

function Row(props: RowProps) {
    const {address, changes, traceMetadata} = props;

    const priceMetadata = useContext(PriceMetadataContext);
    const tokenMetadata = useContext(TokenMetadataContext);

    const [open, setOpen] = React.useState(false);

    let hasMissingPrice = false;
    let changeInValue = 0n;
    Object.entries(changes).forEach(([token, delta]) => {
        const defiLlamaId = toDefiLlamaId(traceMetadata.chain, token);

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
        <span style={{color: changeInValue < 0n ? '#ed335f' : changeInValue > 0n ? '#067034' : ''}}>
            {formatUsd(changeInValue)}
        </span>
    );

    const tokenBreakdown = Object.keys(changes)
        .sort()
        .map((token) => {
            let labels;
            let tokenAddress = token;
            let priceId = toDefiLlamaId(traceMetadata.chain, token);
            if (token === NATIVE_TOKEN) {
                tokenAddress = getChain(traceMetadata.chain)?.nativeTokenAddress || '';
                priceId = getChain(traceMetadata.chain)?.coingeckoId || '';
                labels = {[tokenAddress]: getChain(traceMetadata.chain)?.nativeSymbol || ''};
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
                        {<DataRenderer preferredType={'address'} labels={labels} data={tokenAddress}/>}
                    </TableCell>
                    <TableCell>{amountFormatted}</TableCell>
                    <TableCell align="right">{tokenPriceRendered}</TableCell>
                </TableRow>
            );
        });

    return (
        <React.Fragment>
            <TableRow>
                <TableCell style={{borderBottom: 'none'}}>
                    <SpanIconButton
                        icon={open ? KeyboardArrowUpIcon : KeyboardArrowDownIcon}
                        onClick={() => setOpen(!open)}
                    />
                </TableCell>
                <TableCell component="th" scope="row" style={{borderBottom: 'none'}}>
                    <DataRenderer preferredType={'address'} data={address}/>
                </TableCell>
                <TableCell align="right" style={{borderBottom: 'none'}}>{changeInPriceRendered}</TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{paddingBottom: 0, paddingTop: 0}} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{margin: 1}}>
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
                if (traceLog.topics[0] !== '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') return;

                const parentNode = node;

                try {
                    const parsedEvent = traceMetadata.abis[parentNode.to][parentNode.codehash].parseLog({
                        topics: traceLog.topics,
                        data: traceLog.data,
                    });

                    const value = (parsedEvent.args[2] as BigNumber).toBigInt();
                    addChange(parsedEvent.args[0] as string, parentNode.to, -value);
                    addChange(parsedEvent.args[1] as string, parentNode.to, value);
                } catch (e) {
                    console.error("failed to process value change", e);
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
    const {traceResult, traceMetadata, requestMetadata} = props;
    const tokenMetadata = useContext(TokenMetadataContext);

    const [changes, allTokens] = React.useMemo(() => {
        return computeBalanceChanges(traceResult.entrypoint, traceMetadata, tokenMetadata);
    }, [traceResult, traceMetadata, tokenMetadata]);

    requestMetadata(Array.from(allTokens));

    return Object.entries(changes).length > 0 ?
        <Table aria-label="collapsible table" size={'small'} sx={{maxWidth: {md: '100vw', lg: '75vw', xl: '50vw'}}}>
            <TableHead>
                <TableRow>
                    <TableCell/>
                    <TableCell>Address</TableCell>
                    <TableCell align="right">Change In Value</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {Object.keys(changes)
                    .sort()
                    .map((row) => {
                        return <Row key={row} traceMetadata={traceMetadata} address={row} changes={changes[row]}/>;
                    })}
            </TableBody>
        </Table> : null;
};
