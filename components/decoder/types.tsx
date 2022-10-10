import {BigNumber, ethers} from 'ethers';
import {
    PriceMetadata,
    TokenMetadata,
    TraceEntry,
    TraceEntryCall,
    TraceEntryCallable,
    TraceMetadata,
    TraceResult,
} from '../types';
import {defaultAbiCoder, Result} from '@ethersproject/abi';
import {DataRenderer} from '../DataRenderer';
import * as React from 'react';
import {Tooltip} from '@mui/material';
import {formatUsd} from '../helpers';
import {getChain} from "../Chains";

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
    chain: string,
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

    handleRecursively(node: TraceEntryCallable, state: DecodeState) {
        const visit = (node: TraceEntry) => {
            state.handled[node.id] = true;

            if (node.type === 'call' || node.type === 'create') {
                node.children.forEach(visit);
            }
        };
        visit(node);
    }

    handle(node: TraceEntryCallable, state: DecodeState) {
        state.handled[node.id] = true;
        node.children.forEach((v) => (state.handled[v.id] = true));
    }

    handleLogs(node: TraceEntryCallable, state: DecodeState) {
        node.children.filter((v) => v.type === 'log').forEach((v) => (state.handled[v.id] = true));
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
        if (token === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
            token = getChain(opts.chain)?.nativeTokenAddress || token;
        }

        let amountFormatted = amount.toString();
        let address = <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={token}/>;
        let price;

        let tokenInfo = opts.tokens.tokens[token];
        if (tokenInfo !== undefined) {
            if (tokenInfo.decimals !== undefined) {
                amountFormatted = ethers.utils.formatUnits(amount, tokenInfo.decimals);
            }
            if (tokenInfo.symbol !== undefined) {
                address = (
                    <DataRenderer chain={opts.chain} labels={{[token]: tokenInfo.symbol}} preferredType={'address'} data={token}/>
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
                {amountFormatted}&nbsp;{address}
                {price}
            </>
        );
    }
}
