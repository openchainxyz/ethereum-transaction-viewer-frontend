import { TraceEntry, TraceEntryCall, TraceEntryCallable } from '../types';
import { DecodeFormatOpts, Decoder, DecodeResult, DecodeState } from './types';
import { TraceTreeNodeLabel } from '../TraceTreeItem';
import { DataRenderer } from '../DataRenderer';
import { BigNumber } from 'ethers';
import * as React from 'react';
import { Result } from '@ethersproject/abi';

export type UniswapV2RouterSwapResult = {
    type: string;
    actor: string;
    recipient: string;
    firstToken: string;
    lastToken: string;
    inputAmount: BigNumber;
    outputAmount: BigNumber;
};

// remove liquidity: 392b58
abstract class UniswapV2RouterSwapDecoder extends Decoder<UniswapV2RouterSwapResult> {
    selector: string;

    constructor(name: string, selector: string) {
        super(name);
        this.selector = selector;
    }

    decode(node: TraceEntry, state: DecodeState): UniswapV2RouterSwapResult | null {
        if (state.handled[node.id]) return null;

        if (node.type !== 'call') return null;
        if (node.status !== 1) return null;

        if (!node.input.startsWith(this.selector)) return null;

        state.handled[node.id] = true;

        let [inputs, outputs] = this.decodeFunction(node, state);

        let subcalls: TraceEntryCall[] = node.children.filter(
            (v) => v.type === 'call' && v.variant === 'call',
        ) as TraceEntryCall[];

        let result = this.decode0(node, state, inputs, outputs, subcalls);

        this.requestTokenMetadata(state, result.firstToken);
        this.requestTokenMetadata(state, result.lastToken);

        return result;
    }

    abstract decode0(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ): UniswapV2RouterSwapResult;

    format(result: UniswapV2RouterSwapResult, opts: DecodeFormatOpts): JSX.Element {
        return (
            <>
                <TraceTreeNodeLabel nodeType={'swap'} nodeColor={'#645e9d'} />
                &nbsp;recipient=
                <DataRenderer labels={opts.labels} preferredType={'address'} data={result.recipient} />
                ,&nbsp;from={this.formatTokenAmount(opts, result.firstToken, result.inputAmount)}
                ,&nbsp;to={this.formatTokenAmount(opts, result.lastToken, result.outputAmount)}
                ,&nbsp;actor=
                <DataRenderer labels={opts.labels} preferredType={'address'} data={result.actor} />
            </>
        );
    }
}

export class UniswapV2ExactEthForTokensDecoder extends UniswapV2RouterSwapDecoder {
    constructor() {
        super('uniswap_exactEthForTokens', '0x7ff36ab5');
    }

    decode0(node: TraceEntryCall, state: DecodeState, inputs: Result, outputs: Result, subcalls: TraceEntryCall[]) {
        let pathLen = inputs[1].length;

        // don't bother rendering weth deposit
        this.handleLogs(subcalls[pathLen - 1], state);
        // don't bother rendering weth transfer
        this.handleLogs(subcalls[pathLen - 1 + 1], state);

        this.requestTokenMetadata(state, inputs[1][0]);
        this.requestTokenMetadata(state, inputs[1][inputs[1].length - 1]);

        return {
            type: this.name,
            actor: node.from,
            recipient: inputs[2].toString(),
            firstToken: inputs[1][0],
            lastToken: inputs[1][inputs[1].length - 1],
            inputAmount: BigNumber.from(node.value),
            outputAmount: BigNumber.from(outputs[0][outputs[0].length - 1]),
        };
    }
}

export class UniswapV2ExactTokensForEthSupportingFeeOnTransferTokens extends UniswapV2RouterSwapDecoder {
    constructor() {
        super('uniswap_exactEthForTokens', '0x791ac947');
    }

    decode0(node: TraceEntryCall, state: DecodeState, inputs: Result, outputs: Result, subcalls: TraceEntryCall[]) {
        // don't bother rendering transfer from sender to router
        this.handleLogs(subcalls[0], state);

        // handle all the internal pairs
        for (let i = 1; i < subcalls.length - 2; i++) {
            subcalls[i].children.filter((v) => v.type === 'call').forEach((v) => this.handleLogs(v, state));
        }

        // don't bother rendering eth transfer
        this.handleRecursively(subcalls[subcalls.length - 1], state);

        // don't bother rendering weth withdraw
        this.handle(subcalls[subcalls.length - 2], state);

        return {
            type: this.name,
            actor: node.from,
            recipient: inputs[3].toString(),
            firstToken: inputs[2][0],
            lastToken: inputs[2][inputs[2].length - 1],
            inputAmount: BigNumber.from(inputs[0]),
            outputAmount: BigNumber.from(subcalls[subcalls.length - 1].value),
        };
    }
}

export class UniswapV2ExactTokensForTokens extends UniswapV2RouterSwapDecoder {
    constructor() {
        super('uniswap_exactTokensForTokens', '0x38ed1739');
    }

    decode0(node: TraceEntryCall, state: DecodeState, inputs: Result, outputs: Result, subcalls: TraceEntryCall[]) {
        // don't bother rendering transfer from sender to first pair
        this.handleLogs(subcalls[0], state);

        // handle all the internal pairs
        for (let i = 1; i < subcalls.length; i++) {
            subcalls[1].children.filter((v) => v.type === 'call').forEach((v) => this.handleLogs(v, state));
        }

        return {
            type: this.name,
            actor: node.from,
            recipient: inputs[3].toString(),
            firstToken: inputs[2][0],
            lastToken: inputs[2][inputs[2].length - 1],
            inputAmount: BigNumber.from(inputs[0]),
            outputAmount: outputs[0][outputs[0].length - 1],
        };
    }
}

export type UniswapV2RouterAddLiquidityResult = {
    type: string;
    actor: string;
    recipient: string;
    pool: string;
    tokenA: string;
    tokenB: string;
    tokenAAmount: BigNumber;
    tokenBAmount: BigNumber;
    liquidity: BigNumber;
};

abstract class UniswapV2RouterAddLiquidityDecoder extends Decoder<UniswapV2RouterAddLiquidityResult> {
    format(result: UniswapV2RouterAddLiquidityResult, opts: DecodeFormatOpts): JSX.Element {
        return (
            <>
                <TraceTreeNodeLabel nodeType={'add liquidity'} nodeColor={'#6c969d'} />
                &nbsp;recipient=
                <DataRenderer labels={opts.labels} preferredType={'address'} data={result.recipient} />
                ,&nbsp;amountA={this.formatTokenAmount(opts, result.tokenA, result.tokenAAmount)}
                ,&nbsp;amountB={this.formatTokenAmount(opts, result.tokenB, result.tokenBAmount)}
                ,&nbsp;amountOut={this.formatTokenAmount(opts, result.pool, result.liquidity)}
                ,&nbsp;actor=
                <DataRenderer labels={opts.labels} preferredType={'address'} data={result.actor} />
            </>
        );
    }
}

export class UniswapV2AddLiquidityEth extends UniswapV2RouterAddLiquidityDecoder {
    constructor() {
        super('uniswap_addLiquidityETH');
    }

    decode(node: TraceEntry, state: DecodeState): UniswapV2RouterAddLiquidityResult | null {
        if (state.handled[node.id]) return null;

        if (node.type !== 'call') return null;
        if (node.status !== 1) return null;

        if (!node.input.startsWith('0xf305d719')) return null;

        state.handled[node.id] = true;

        let [inputs, outputs] = this.decodeFunction(node, state);

        let subcalls: TraceEntryCall[] = node.children.filter(
            (v) => v.type === 'call' && v.variant === 'call',
        ) as TraceEntryCall[];

        // ignore transfer from caller to pair
        this.handleLogs(subcalls[0], state);

        // ignore weth deposit
        this.handle(subcalls[1], state);

        // ignore weth transfer
        this.handle(subcalls[2], state);

        // ignore mint transfer
        this.handle(subcalls[3], state);

        if (subcalls.length > 4) {
            // ignore eth refund
            this.handle(subcalls[4], state);
        }

        this.requestTokenMetadata(state, inputs[0]);
        this.requestTokenMetadata(state, subcalls[3].to);

        return {
            type: this.name,
            actor: node.from,
            recipient: inputs[4].toString(),
            pool: subcalls[3].to,
            tokenA: inputs[0],
            tokenB: '0xeeeeeeeeeeeeeeeeeeEeeEEEeeeeEeeeeeeeEEeE',
            tokenAAmount: outputs[0],
            tokenBAmount: outputs[1],
            liquidity: outputs[2],
        };
    }
}
