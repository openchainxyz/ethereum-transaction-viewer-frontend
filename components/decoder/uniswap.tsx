import { TraceEntry, TraceEntryCall, TraceEntryCallable } from '../types';
import { DecodeFormatOpts, Decoder, DecodeResult, DecodeState } from './types';
import { TraceTreeNodeLabel } from '../TraceTreeItem';
import { DataRenderer } from '../DataRenderer';
import { BigNumber, ethers } from 'ethers';
import * as React from 'react';
import {Fragment, Result} from '@ethersproject/abi';
import {FunctionFragment} from "@ethersproject/abi/lib";

export type UniswapV2RouterSwapResult = {
    type: string;

    actor: string;
    recipient: string;

    tokenIn: string;
    tokenOut: string;

    amountIn: BigNumber;
    amountOut: BigNumber;
};

export class UniswapV2RouterSwapDecoder extends Decoder<UniswapV2RouterSwapResult> {
    swapFunctions = {
        'swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] memory path,address to,uint256 deadline) returns (uint[] memory amounts)':
            this.decodeSwapExactTokensForTokens.bind(this),
        'swapTokensForExactTokens(uint256 amountOut,uint256 amountInMax,address[] memory path,address to,uint256 deadline) returns (uint[] memory amounts)':
            this.decodeSwapTokensForExactTokens.bind(this),
        'swapExactETHForTokens(uint256 amountOutMin,address[] memory path,address to,uint256 deadline) returns (uint[] memory amounts)': this.decodeSwapExactETHForTokens.bind(this),
        'swapTokensForExactETH(uint256 amountOut,uint256 amountInMax,address[] memory path,address to,uint256 deadline) returns (uint[] memory amounts)': this.decodeSwapTokensForExactETH.bind(this),
        'swapExactTokensForETH(uint256 amonutIn,uint256 amountOutMin,address[] memory path,address to,uint256 deadline) returns (uint[] memory amounts)': this.decodeSwapExactTokensForETH.bind(this),
        'swapETHForExactTokens(uint256 amountOut,address[] memory path,address to,uint256 deadline) returns (uint[] memory amounts)': this.decodeSwapETHForExactTokens.bind(this),
    };

    swapWithFeeFunctions = {
        'swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] memory path,address to,uint256 deadline)':
            this.decodeSwapExactTokensForTokensSupportingFeeOnTransferTokens.bind(this),
        'swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] memory path,address to,uint256 deadline)':
            this.decodeSwapExactETHForTokensSupportingFeeOnTransferTokens.bind(this),
        'swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] memory path,address to,uint256 deadline)':
            this.decodeSwapExactTokensForETHSupportingFeeOnTransferTokens.bind(this),
    };

    constructor() {
        super('uniswap-v2-router-swap');
    }

    decode(node: TraceEntry, state: DecodeState): UniswapV2RouterSwapResult | null {
        if (state.handled[node.id]) return null;

        if (node.type !== 'call') return null;
        if (node.status !== 1) return null;

        let selector = node.input.substring(0, 10);
        let swapDecoder = Object.entries(this.swapFunctions).find(([name, func]) => {
            return ethers.utils.id(FunctionFragment.from(name).format()).substring(0, 10) === selector;
        });
        let swapWithFeeDecoder = Object.entries(this.swapWithFeeFunctions).find(([name, func]) => {
            return ethers.utils.id(FunctionFragment.from(name).format()).substring(0, 10) === selector;
        });
        let decoder = swapDecoder || swapWithFeeDecoder;

        if (!decoder) return null;

        state.handled[node.id] = true;

        let [inputs, outputs] = this.decodeFunctionWithFragment(node, FunctionFragment.from(decoder[0]));

        let subcalls: TraceEntryCall[] = node.children.filter(
            (v) => v.type === 'call' && v.variant === 'call',
        ) as TraceEntryCall[];

        let [tokenIn, tokenOut, amountIn, amountOut, recipient] = decoder[1](node, state, inputs, outputs, subcalls);

        this.requestTokenMetadata(state, tokenIn);
        this.requestTokenMetadata(state, tokenOut);

        return {
            type: this.name,
            actor: node.from,
            recipient: recipient,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: BigNumber.from(amountIn),
            amountOut: BigNumber.from(amountOut),
        };
    }

    format(result: UniswapV2RouterSwapResult, opts: DecodeFormatOpts): JSX.Element {
        return this.renderResult(
            'swap',
            '#645e9d',
            ['tokenIn', 'tokenOut', 'recipient', 'actor'],
            [
                this.formatTokenAmount(opts, result.tokenIn, result.amountIn),
                this.formatTokenAmount(opts, result.tokenOut, result.amountOut),
                <DataRenderer
                    chain={opts.chain}
                    labels={opts.labels}
                    preferredType={'address'}
                    data={result.recipient}
                />,
                <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={result.actor} />,
            ],
        );
    }

    // handles the _swap function
    handleSwap(node: TraceEntryCall, state: DecodeState, subcalls: TraceEntryCall[]) {
        subcalls.forEach((call) => {
            // we don't expect any callbacks so we'll just ignore everything here
            state.handled[call.id] = true;

            call.children
                .filter(
                    (v): v is TraceEntryCall =>
                        v.type === 'call' &&
                        v.variant === 'call' &&
                        v.input.startsWith(ethers.utils.id('transfer(address,uint256)').substring(0, 10)),
                )
                .forEach((v) => this.handleTransfer(state, v));
        });
    }

    decodeSwapExactTokensForTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip initial transfer from sender to first pair
        this.handleTransferFrom(state, subcalls[0]);

        this.handleSwap(node, state, subcalls.slice(1));

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            outputs['amounts'][0],
            outputs['amounts'][outputs['amounts'].length - 1],
            inputs['to'],
        ];
    }

    decodeSwapTokensForExactTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip initial transfer from sender to first pair
        this.handleTransferFrom(state, subcalls[0]);

        this.handleSwap(node, state, subcalls.slice(1));

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            outputs['amounts'][0],
            outputs['amounts'][outputs['amounts'].length - 1],
            inputs['to'],
        ];
    }

    decodeSwapExactETHForTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip weth deposit
        this.handleRecursively(state, subcalls[0]);

        // skip weth transfer
        this.handleRecursively(state, subcalls[1]);

        this.handleSwap(node, state, subcalls.slice(2));

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            outputs['amounts'][0],
            outputs['amounts'][outputs['amounts'].length - 1],
            inputs['to'],
        ];
    }

    decodeSwapTokensForExactETH(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip transfer
        this.handleTransferFrom(state, subcalls[0]);

        this.handleSwap(node, state, subcalls.slice(1, subcalls.length - 2));

        // skip weth withdraw
        this.handleRecursively(state, subcalls[subcalls.length - 2]);

        // skip eth transfer
        this.handleRecursively(state, subcalls[subcalls.length - 1]);

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            outputs['amounts'][0],
            outputs['amounts'][outputs['amounts'].length - 1],
            inputs['to'],
        ];
    }

    decodeSwapExactTokensForETH(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip transfer
        this.handleTransferFrom(state, subcalls[0]);

        this.handleSwap(node, state, subcalls.slice(1, subcalls.length - 2));

        // skip weth withdraw
        this.handleRecursively(state, subcalls[subcalls.length - 2]);

        // skip eth transfer
        this.handleRecursively(state, subcalls[subcalls.length - 1]);

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            outputs['amounts'][0],
            outputs['amounts'][outputs['amounts'].length - 1],
            inputs['to'],
        ];
    }

    decodeSwapETHForExactTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip weth deposit
        this.handleRecursively(state, subcalls[0]);

        // skip weth transfer
        this.handleRecursively(state, subcalls[1]);

        // skip potential eth refund
        let last = subcalls.length - 1;
        if (subcalls[last].to === node.from && !BigNumber.from(subcalls[last].value).isZero()) {
            state.handled[subcalls[last].id] = true;
            last--;
        }

        this.handleSwap(node, state, subcalls.slice(2, last + 1));

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            outputs['amounts'][0],
            outputs['amounts'][outputs['amounts'].length - 1],
            inputs['to'],
        ];
    }

    decodeSwapExactTokensForTokensSupportingFeeOnTransferTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip transfer
        this.handleTransferFrom(state, subcalls[0]);

        // this can be the same
        this.handleSwap(node, state, subcalls.slice(1));

        let staticcalls = node.children.filter(
            (v): v is TraceEntryCall => v.type === 'call' && v.variant === 'staticcall',
        );
        let initialBalance = BigNumber.from(staticcalls[0].output);
        let finalBalance = BigNumber.from(staticcalls[staticcalls.length - 1].output);

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            BigNumber.from(inputs['amountIn']),
            finalBalance.sub(initialBalance),
            inputs['to'],
        ];
    }

    decodeSwapExactETHForTokensSupportingFeeOnTransferTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip weth deposit
        this.handleRecursively(state, subcalls[0]);

        // skip weth transfer
        this.handleRecursively(state, subcalls[1]);

        // this can be the same
        this.handleSwap(node, state, subcalls.slice(1));

        let staticcalls = node.children.filter(
            (v): v is TraceEntryCall => v.type === 'call' && v.variant === 'staticcall',
        );
        let initialBalance = BigNumber.from(staticcalls[0].output);
        let finalBalance = BigNumber.from(staticcalls[staticcalls.length - 1].output);

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            BigNumber.from(node.value),
            finalBalance.sub(initialBalance),
            inputs['to'],
        ];
    }

    decodeSwapExactTokensForETHSupportingFeeOnTransferTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        // skip transfer
        this.handleTransferFrom(state, subcalls[0]);

        // this can be the same
        this.handleSwap(node, state, subcalls.slice(1, subcalls.length - 2));

        // skip weth withdraw
        this.handleRecursively(state, subcalls[subcalls.length - 2]);

        // skip eth transfer
        this.handleRecursively(state, subcalls[subcalls.length - 1]);

        return [
            inputs['path'][0],
            inputs['path'][inputs['path'].length - 1],
            BigNumber.from(inputs['amountIn']),
            BigNumber.from(subcalls[subcalls.length - 1].value),
            inputs['to'],
        ];
    }
}

export type UniswapV2RouterAddLiquidityResult = {
    type: string;
    actor: string;
    recipient: string;
    pool: string;
    tokenA: string;
    tokenB: string;
    amountA: BigNumber;
    amountB: BigNumber;
    liquidity: BigNumber;
};

export class UniswapV2RouterAddLiquidityDecoder extends Decoder<UniswapV2RouterAddLiquidityResult> {
    addLiquidityFunctions = {
        'addLiquidity(address tokenA,address tokenB,uint256 amountADesired,uint256 amountBDesired,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint amountA, uint amountB, uint liquidity)':
            this.decodeAddLiquidity.bind(this),
        'addLiquidityETH(address token,uint256 amountTokenDesired,uint256 amountTokenMin,uint256 amountETHMin,address to,uint256) returns (uint amountA, uint amountB, uint liquidity)': this.decodeAddLiquidityETH.bind(this),
    };

    constructor() {
        super('uniswap-v2-router-add-liquidity');
    }

    decode(node: TraceEntry, state: DecodeState): UniswapV2RouterAddLiquidityResult | null {
        if (state.handled[node.id]) return null;

        if (node.type !== 'call') return null;
        if (node.status !== 1) return null;

        let selector = node.input.substring(0, 10);
        let decoder = Object.entries(this.addLiquidityFunctions).find(([name, func]) => {
            return ethers.utils.id(FunctionFragment.from(name).format()).substring(0, 10) === selector;
        });

        if (!decoder) return null;

        state.handled[node.id] = true;

        let [inputs, outputs] = this.decodeFunctionWithFragment(node, FunctionFragment.from(decoder[0]));

        let subcalls: TraceEntryCall[] = node.children.filter(
            (v) => v.type === 'call' && v.variant === 'call',
        ) as TraceEntryCall[];

        let [pool, tokenA, tokenB, amountA, amountB, liquidity, to] = decoder[1](
            node,
            state,
            inputs,
            outputs,
            subcalls,
        );

        this.requestTokenMetadata(state, tokenA);
        this.requestTokenMetadata(state, tokenB);

        return {
            type: this.name,
            actor: node.from,
            recipient: to,
            pool: pool,
            tokenA: tokenA,
            tokenB: tokenB,
            amountA: amountA,
            amountB: amountB,
            liquidity: liquidity,
        };
    }

    format(result: UniswapV2RouterAddLiquidityResult, opts: DecodeFormatOpts): JSX.Element {
        return this.renderResult(
            'add liquidity',
            '#6c969d',
            ['tokenA', 'tokenB', 'liquidity', 'recipient', 'actor'],
            [
                this.formatTokenAmount(opts, result.tokenA, result.amountA),
                this.formatTokenAmount(opts, result.tokenB, result.amountB),
                this.formatTokenAmount(opts, result.pool, result.liquidity),
                <DataRenderer
                    chain={opts.chain}
                    labels={opts.labels}
                    preferredType={'address'}
                    data={result.recipient}
                />,
                <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={result.actor} />,
            ],
        );
    }

    // handles the _addLiquidity function
    handleAddLiquidity(node: TraceEntryCall, subcalls: TraceEntryCall[], state: DecodeState): boolean {
        return subcalls[0].input.substring(0, 10) === ethers.utils.id('createPair(address,address)').substring(0, 10);
    }

    decodeAddLiquidity(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        let idx = this.handleAddLiquidity(node, subcalls, state) ? 1 : 0;

        // handle the transfer from tokenA -> pair
        this.handleTransferFrom(state, subcalls[idx]);

        // handle the transfer from tokenB -> pair
        this.handleTransfer(state, subcalls[idx + 1]);

        // handle the mint call
        this.handleRecursively(state, subcalls[idx + 2]);

        return [
            subcalls[idx + 2].to,
            inputs['tokenA'],
            inputs['tokenB'],
            outputs['amountA'],
            outputs['amountB'],
            outputs['liquidity'],
            inputs['to'],
        ];
    }

    decodeAddLiquidityETH(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        let idx = this.handleAddLiquidity(node, subcalls, state) ? 1 : 0;

        // handle the transfer from tokenA -> pair
        this.handleTransferFrom(state, subcalls[idx]);

        // handle the weth deposit
        this.handleRecursively(state, subcalls[idx + 1]);

        // handle the weth transfer
        this.handleRecursively(state, subcalls[idx + 2]);

        // handle the mint call
        this.handleRecursively(state, subcalls[idx + 3]);

        // handle the optional eth refund
        if (idx + 4 < subcalls.length) {
            this.handleRecursively(state, subcalls[idx + 4]);
        }

        return [
            subcalls[idx + 3].to,
            inputs['token'],
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            outputs['amountToken'],
            outputs['amountETH'],
            outputs['liquidity'],
            inputs['to'],
        ];
    }
}

export type UniswapV2RouterRemoveLiquidityResult = {
    type: string;
    actor: string;
    recipient: string;
    pool: string;
    tokenA: string;
    tokenB: string;
    amountA: BigNumber;
    amountB: BigNumber;
    liquidity: BigNumber;
};

export class UniswapV2RouterRemoveLiquidityDecoder extends Decoder<UniswapV2RouterRemoveLiquidityResult> {
    addLiquidityFunctions = {
        'removeLiquidity(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint amountA, uint amountB)':
            this.decodeRemoveLiquidity.bind(this),
        'removeLiquidityETH(address token,uint256 liquidity,uint256 amountTokenMin,uint256 amountETHMin,address to,uint256 deadline) returns (uint amountToken, uint amountETH)': this.decodeRemoveLiquidityETH.bind(this),
        'removeLiquidityWithPermit(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline,bool approveMax,uint8 v,bytes32 r,bytes32 s) returns (uint amountA, uint amountB)':
            this.decodeRemoveLiquidityWithPermit.bind(this),
        'removeLiquidityETHWithPermit(address token,uint256 liquidity,uint256 amountTokenMin,uint256 amountETHMin,address to,uint256 deadline,bool approveMax,uint8 v,bytes32 r,bytes32 s) returns (uint amountToken, uint amountETH)':
            this.decodeRemoveLiquidityETHWithPermit.bind(this),
        'removeLiquidityETHSupportingFeeOnTransferTokens(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint amountA, uint amountB)':
            this.decodeRemoveLiquidityETHSupportingFeeOnTransferTokens.bind(this),
        'removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address token,uint256 liquidity,uint256 amountTokenMin,uint256 amountETHMin,address to,uint256 deadline,bool approveMax,uint8 v,bytes32 r,bytes32 s) returns (uint amountToken, uint amountETH)':
            this.decodeRemoveLiquidityETHWithPermitSupportingFeeOnTransferTokens.bind(this),
    };

    constructor() {
        super('uniswap-v2-router-remove-liquidity');
    }

    decode(node: TraceEntry, state: DecodeState): UniswapV2RouterRemoveLiquidityResult | null {
        if (state.handled[node.id]) return null;

        if (node.type !== 'call') return null;
        if (node.status !== 1) return null;

        let selector = node.input.substring(0, 10);
        let decoder = Object.entries(this.addLiquidityFunctions).find(([name, func]) => {
            return ethers.utils.id(FunctionFragment.from(name).format()).substring(0, 10) === selector;
        });

        if (!decoder) return null;

        state.handled[node.id] = true;

        let [inputs, outputs] = this.decodeFunctionWithFragment(node, FunctionFragment.from(decoder[0]));

        let subcalls: TraceEntryCall[] = node.children.filter(
            (v) => v.type === 'call' && v.variant === 'call',
        ) as TraceEntryCall[];

        let [pool, tokenA, tokenB, amountA, amountB, liquidity, to] = decoder[1](
            node,
            state,
            inputs,
            outputs,
            subcalls,
        );

        this.requestTokenMetadata(state, tokenA);
        this.requestTokenMetadata(state, tokenB);
        this.requestTokenMetadata(state, pool);

        return {
            type: this.name,
            actor: node.from,
            recipient: to,
            pool: pool,
            tokenA: tokenA,
            tokenB: tokenB,
            amountA: amountA,
            amountB: amountB,
            liquidity: liquidity,
        };
    }

    format(result: UniswapV2RouterRemoveLiquidityResult, opts: DecodeFormatOpts): JSX.Element {
        return this.renderResult(
            'remove liquidity',
            '#392b58',
            ['tokenA', 'tokenB', 'liquidity', 'recipient', 'actor'],
            [
                this.formatTokenAmount(opts, result.tokenA, result.amountA),
                this.formatTokenAmount(opts, result.tokenB, result.amountB),
                this.formatTokenAmount(opts, result.pool, result.liquidity),
                <DataRenderer
                    chain={opts.chain}
                    labels={opts.labels}
                    preferredType={'address'}
                    data={result.recipient}
                />,
                <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={result.actor} />,
            ],
        );
    }

    // handles the removeLiquidity function
    handleRemoveLiquidity(
        node: TraceEntryCall,
        subcalls: TraceEntryCall[],
        state: DecodeState,
        offset: number,
    ): number {
        // handle the transfer from tokenA -> pair
        this.handleTransferFrom(state, subcalls[offset]);

        // handle the burn call
        this.handleRecursively(state, subcalls[offset + 1]);

        return offset + 2;
    }

    decodeRemoveLiquidity(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        this.handleRemoveLiquidity(node, subcalls, state, 0);

        return [
            subcalls[0].to,
            inputs['tokenA'],
            inputs['tokenB'],
            outputs['amountA'],
            outputs['amountB'],
            inputs['liquidity'],
            inputs['to'],
        ];
    }

    decodeRemoveLiquidityETH(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        this.handleRemoveLiquidity(node, subcalls, state, 0);

        // handle the transfer
        this.handleTransfer(state, subcalls[2]);

        // handle the weth withdraw
        this.handleRecursively(state, subcalls[3]);

        // handle the eth return
        state.handled[subcalls[4].id] = true;

        return [
            subcalls[0].to,
            inputs['token'],
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            outputs['amountToken'],
            outputs['amountETH'],
            inputs['liquidity'],
            inputs['to'],
        ];
    }

    decodeRemoveLiquidityWithPermit(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        this.handleRemoveLiquidity(node, subcalls, state, 1);

        return [
            subcalls[0].to,
            inputs['tokenA'],
            inputs['tokenB'],
            outputs['amountA'],
            outputs['amountB'],
            inputs['liquidity'],
            inputs['to'],
        ];
    }

    decodeRemoveLiquidityETHWithPermit(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        let offset = this.handleRemoveLiquidity(node, subcalls, state, 1);

        // handle the transfer
        this.handleTransfer(state, subcalls[offset]);

        // handle the weth withdraw
        this.handleRecursively(state, subcalls[offset + 1]);

        // handle the eth return
        state.handled[subcalls[offset + 2].id] = true;

        return [
            subcalls[0].to,
            inputs['token'],
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            outputs['amountToken'],
            outputs['amountETH'],
            inputs['liquidity'],
            inputs['to'],
        ];
    }

    decodeRemoveLiquidityETHSupportingFeeOnTransferTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        let offset = this.handleRemoveLiquidity(node, subcalls, state, 0);

        // handle the transfer
        this.handleTransfer(state, subcalls[offset]);

        // handle the weth withdraw
        this.handleRecursively(state, subcalls[offset + 1]);

        // handle the eth return
        state.handled[subcalls[offset + 2].id] = true;

        let staticcalls = node.children.filter(
            (v): v is TraceEntryCall => v.type === 'call' && v.variant === 'staticcall',
        );
        let output = BigNumber.from(staticcalls[staticcalls.length - 1].output);

        return [
            subcalls[0].to,
            inputs['token'],
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            output,
            outputs['amountETH'],
            inputs['liquidity'],
            inputs['to'],
        ];
    }

    decodeRemoveLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        node: TraceEntryCall,
        state: DecodeState,
        inputs: Result,
        outputs: Result,
        subcalls: TraceEntryCall[],
    ) {
        let offset = this.handleRemoveLiquidity(node, subcalls, state, 1);

        // handle the transfer
        this.handleTransfer(state, subcalls[offset]);

        // handle the weth withdraw
        this.handleRecursively(state, subcalls[offset + 1]);

        // handle the eth return
        state.handled[subcalls[offset + 2].id] = true;

        let staticcalls = node.children.filter(
            (v): v is TraceEntryCall => v.type === 'call' && v.variant === 'staticcall',
        );
        let output = BigNumber.from(staticcalls[staticcalls.length - 1].output);

        return [
            subcalls[0].to,
            inputs['token'],
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            output,
            outputs['amountETH'],
            inputs['liquidity'],
            inputs['to'],
        ];
    }
}
