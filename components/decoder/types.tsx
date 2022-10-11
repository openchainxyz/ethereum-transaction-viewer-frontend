import { BigNumber, ethers } from 'ethers';
import {
    PriceMetadata,
    TokenMetadata,
    TraceEntry,
    TraceEntryCall,
    TraceEntryCallable,
    TraceEntryLog,
    TraceMetadata,
    TraceResult,
} from '../types';
import { defaultAbiCoder, Result } from '@ethersproject/abi';
import { DataRenderer } from '../DataRenderer';
import * as React from 'react';
import { Tooltip } from '@mui/material';
import { formatUsd } from '../helpers';
import { getChain } from '../Chains';
import { ParamType } from 'ethers/lib/utils';
import WithSeparator from 'react-with-separator';
import { TraceTreeNodeLabel } from '../TraceTreeItem';

export type DecodeResultCommon = {
    type: string;
    children?: DecodeResult[];
};

export type DecodeNode = {
    node: TraceEntry;
    results: DecodeResultCommon[];
    children: DecodeNode[];
};

export type Metadata = {
    tokens: Set<string>;
};

export type DecodeResult = {
    root: DecodeNode;
    requestedMetadata: Metadata;
};

export type DecodeState = {
    trace: TraceResult;
    metadata: TraceMetadata;
    requestedMetadata: Metadata;
    handled: Record<string, boolean>;
};

export type DecodeFormatOpts = {
    chain: string;
    labels: Record<string, string>;
    prices: PriceMetadata;
    tokens: TokenMetadata;
};

export abstract class Decoder<T extends DecodeResultCommon> {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    abstract decode(node: TraceEntry, state: DecodeState): T | null;

    abstract format(result: T, opts: DecodeFormatOpts): JSX.Element;

    requestTokenMetadata(state: DecodeState, token: string) {
        state.requestedMetadata.tokens.add(token.toLowerCase());
    }

    handleRecursively(state: DecodeState, node: TraceEntryCallable) {
        const visit = (node: TraceEntry) => {
            state.handled[node.id] = true;

            if (node.type === 'call' || node.type === 'create') {
                node.children.forEach(visit);
            }
        };
        visit(node);
    }

    handle(state: DecodeState, node: TraceEntryCallable) {
        state.handled[node.id] = true;
        node.children.forEach((v) => (state.handled[v.id] = true));
    }

    handleLogs(node: TraceEntryCallable, state: DecodeState) {
        node.children.filter((v) => v.type === 'log').forEach((v) => (state.handled[v.id] = true));
    }

    handleTransfer(state: DecodeState, node: TraceEntryCall) {
        let inputs = defaultAbiCoder.decode(
            [ParamType.from('address'), ParamType.from('uint256')],
            '0x' + node.input.substring(10),
        );

        // handle the call itself
        state.handled[node.id] = true;

        let src = ethers.utils.getAddress(node.from);

        const visit = (node: TraceEntryCall) => {
            // handle any transfer events we might find, must be a match on from and to, because it might take fees
            node.children
                .filter((v): v is TraceEntryLog => v.type === 'log')
                .filter(
                    (v) =>
                        v.topics.length > 0 &&
                        v.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                )
                .forEach((log) => {
                    let logValues = this.decodeEvent(state, log);
                    if (logValues[0] === src && logValues[1] === inputs[0]) {
                        state.handled[log.id] = true;
                    }
                });

            node.children
                .filter((v): v is TraceEntryCall => v.type === 'call' && v.variant === 'delegatecall')
                .forEach(visit);
        };
        visit(node);
    }

    handleTransferFrom(state: DecodeState, node: TraceEntryCall) {
        let inputs = defaultAbiCoder.decode(
            [ParamType.from('address'), ParamType.from('address'), ParamType.from('uint256')],
            '0x' + node.input.substring(10),
        );

        // handle the call itself
        state.handled[node.id] = true;

        const visit = (node: TraceEntryCall) => {
            // handle any transfer events we might find, must be a match on from and to, because it might take fees
            node.children
                .filter((v): v is TraceEntryLog => v.type === 'log')
                .filter(
                    (v) =>
                        v.topics.length > 0 &&
                        v.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                )
                .forEach((log) => {
                    let logValues = this.decodeEvent(state, log);
                    if (logValues[0] === inputs[0] && logValues[1] === inputs[1]) {
                        state.handled[log.id] = true;
                    }
                });

            node.children
                .filter((v): v is TraceEntryCall => v.type === 'call' && v.variant === 'delegatecall')
                .forEach(visit);
        };
        visit(node);
    }

    decodeEvent(state: DecodeState, node: TraceEntryLog) {
        let parentId = node.id.split('.');
        parentId.pop();
        let parentNode = state.metadata.nodesById[parentId.join('.')] as TraceEntryCallable;

        let abi = state.metadata.abis[parentNode.to][parentNode.codehash];
        let eventFragment = abi.getEvent(node.topics[0]);

        return abi.decodeEventLog(eventFragment, node.data, node.topics);
    }

    decodeFunction(node: TraceEntryCall, state: DecodeState): [Result, Result] {
        let functionFragment = state.metadata.abis[node.to][node.codehash].getFunction(node.input.substring(0, 10));

        return [
            defaultAbiCoder.decode(functionFragment.inputs, ethers.utils.arrayify(node.input).slice(4)),
            defaultAbiCoder.decode(functionFragment.outputs, ethers.utils.arrayify(node.output)),
        ];
    }

    formatTokenAmount(opts: DecodeFormatOpts, token: string, amount: BigNumber): JSX.Element {
        token = token.toLowerCase();
        if (token === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
            token = getChain(opts.chain)?.nativeTokenAddress || token;
        }

        let amountFormatted = amount.toString();
        let address = <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={token} />;
        let price;

        let tokenInfo = opts.tokens.tokens[token];
        if (tokenInfo !== undefined) {
            if (tokenInfo.decimals !== undefined) {
                amountFormatted = ethers.utils.formatUnits(amount, tokenInfo.decimals);
            }
            if (tokenInfo.symbol !== undefined) {
                address = (
                    <DataRenderer
                        chain={opts.chain}
                        labels={{ [token]: tokenInfo.symbol }}
                        preferredType={'address'}
                        data={token}
                    />
                );
            }
        }

        let historicalPrice = opts.prices.historicalPrices[token];
        let currentPrice = opts.prices.currentPrices[token];
        if (historicalPrice !== undefined && currentPrice !== undefined) {
            price = (
                <>
                    &nbsp;(
                    <Tooltip
                        title={currentPrice ? formatUsd(amount.mul(currentPrice)) + ' today' : 'Current price unknown'}
                    >
                        <span>{formatUsd(amount.mul(historicalPrice))}</span>
                    </Tooltip>
                    )
                </>
            );
        }

        return (
            <>
                {amountFormatted}&nbsp;<span style={{ color: '#7b9726' }}>{address}</span>
                {price}
            </>
        );
    }

    renderResult(nodeType: string, nodeColor: string, keys: string[], values: any[]) {
        return (
            <>
                <TraceTreeNodeLabel nodeType={nodeType} nodeColor={nodeColor} />
                &nbsp;
                <WithSeparator separator={<>,&nbsp;</>}>
                    {keys.map((key, idx) => {
                        return (
                            <React.Fragment key={`param_${idx}`}>
                                <span style={{ color: '#a8a19f' }}>{key}</span>={values[idx]}
                            </React.Fragment>
                        );
                    })}
                </WithSeparator>
            </>
        );
    }
}
