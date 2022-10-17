import { BigNumber, BigNumberish, BytesLike, ethers } from 'ethers';
import { DataRenderer } from '../DataRenderer';
import * as React from 'react';
import { Tooltip } from '@mui/material';
import { formatUsd } from '../helpers';
import { getChain } from '../Chains';
import { ParamType } from 'ethers/lib/utils';
import WithSeparator from 'react-with-separator';
import { TraceTreeNodeLabel } from '../trace/TraceTreeItem';
import { defaultAbiCoder, EventFragment, FunctionFragment, Result } from '@ethersproject/abi/lib';
import { Log } from '@ethersproject/abstract-provider';
import { NATIVE_TOKEN } from './actions';
import { PriceMetadata } from '../metadata/prices';
import { TokenMetadata } from '../metadata/tokens';

export const hasSelector = (calldata: BytesLike, selector: string | FunctionFragment) => {
    return (
        ethers.utils.hexlify(ethers.utils.arrayify(calldata).slice(0, 4)) ===
        ethers.utils.id(FunctionFragment.from(selector).format()).substring(0, 10)
    );
};

export const hasTopic = (log: Log, selector: string | EventFragment) => {
    return log.topics.length > 0 && log.topics[0] == ethers.utils.id(EventFragment.from(selector).format());
};

export interface DecoderInput {
    // a unique id per input node
    id: string;

    // data that should be available for all callers (eth_getTransaction)
    type: 'call' | 'staticcall' | 'callcode' | 'delegatecall' | 'create' | 'create2' | 'selfdestruct';
    from: string;
    to: string;
    value: BigNumber;
    calldata: BytesLike;

    // data that is available from a receipt (eth_getReceipt)
    failed?: boolean;
    logs?: Array<Log>;

    // data that is available from a trace (debug_traceTransaction)
    returndata?: BytesLike;
    children?: Array<DecoderInput>;

    // optional data to inform the order of logs and calls
    childOrder?: Array<['log' | 'call', number]>;

    // optional: attach an abi to this node if you like
    abi?: ethers.utils.Interface;
}

export type BaseAction = {
    type: string;
};

export type DecoderOutput = {
    node: DecoderInput | Log;
    results: BaseAction[];
    children: DecoderOutput[];
};

export type MetadataRequest = {
    tokens: Set<string>;
};

export const isDecoderInput = (node: DecoderInput | Log): node is DecoderInput => {
    return (node as DecoderInput).id !== undefined;
};

export const getNodeId = (node: DecoderInput | Log) => {
    if (isDecoderInput(node)) {
        return 'node:' + node.id;
    } else {
        return 'log:' + node.transactionHash + '.' + node.logIndex;
    }
};

export class DecoderState {
    consumed: Set<string>;

    requestedMetadata: MetadataRequest;

    constructor() {
        this.consumed = new Set<string>();
        this.requestedMetadata = {
            tokens: new Set<string>(),
        };
    }

    requestTokenMetadata(token: string) {
        this.requestedMetadata.tokens.add(token.toLowerCase());
    }

    // check if a node is consumed - most decoders should ignore consumed nodes
    isConsumed(node: DecoderInput | Log) {
        return this.consumed.has(getNodeId(node));
    }

    // mark the node as consumed
    consume(node: DecoderInput | Log) {
        this.consumed.add(getNodeId(node));
    }

    // consume the node and all logs in it
    consumeAll(node: DecoderInput) {
        this.consume(node);

        node.logs?.forEach(this.consume.bind(this));
    }

    // consume the node and all logs in it, including all child calls
    consumeAllRecursively(node: DecoderInput) {
        this.consumeAll(node);

        node.children?.forEach(this.consumeAllRecursively.bind(this));
    }

    // assuming the input node is a call with `transfer`-like semantics (i.e. it causes a transfer from the caller
    // to an address specified in the calldata), consume the node and any Transfer events which correspond to the
    // transfer
    consumeTransfer(node: DecoderInput, params?: Array<ParamType>) {
        if (!params) {
            params = [ParamType.from('address to'), ParamType.from('uint256 amount')];
        }

        let inputs = defaultAbiCoder.decode(params, ethers.utils.arrayify(node.calldata).slice(4));

        this.consumeTransferCommon(node, ethers.utils.getAddress(node.from), inputs['to']);
    }

    // assuming the input node is a call with `transferFrom`-like semantics (i.e. it causes a transfer from one address
    // to another address specified in the calldata), consume the node and any Transfer events which correspond to the
    // transfer
    consumeTransferFrom(node: DecoderInput, params?: Array<ParamType>) {
        if (!params) {
            params = [ParamType.from('address from'), ParamType.from('address to'), ParamType.from('uint256 amount')];
        }

        let inputs = defaultAbiCoder.decode(params, ethers.utils.arrayify(node.calldata).slice(4));

        this.consumeTransferCommon(node, inputs['from'], inputs['to']);
    }

    consumeTransferCommon(node: DecoderInput, from: string, to: string) {
        // consume the current node
        this.consume(node);

        const visit = (node: DecoderInput) => {
            // handle any transfer events we might find, must be a match on from and to, because it might take fees
            node.logs
                ?.filter(
                    (v) =>
                        v.topics.length > 0 &&
                        v.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                )
                .forEach((v) => {
                    let abi = node.abi;
                    if (!abi) {
                        abi = new ethers.utils.Interface([
                            EventFragment.from('Transfer(address indexed from, address indexed to, uint amount)'),
                        ]);
                    }

                    try {
                        let values = abi.parseLog(v);
                        if (values.args[0] === from && values.args[1] === to) {
                            this.consume(v);
                        }
                    } catch {}
                });

            // if we have a delegatecall, we need to recurse because it will emit the log in the context of the
            // current contract
            node.children?.filter((v) => v.type === 'delegatecall').forEach(visit);
        };
        visit(node);
    }
}

export type DecodeFormatOpts = {
    timestamp: number;
    chain: string;
    prices: PriceMetadata;
    tokens: TokenMetadata;
};

export abstract class Decoder<T extends BaseAction> {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    decodeCall(state: DecoderState, node: DecoderInput): T | T[] | null {
        return null;
    }

    decodeLog(state: DecoderState, node: DecoderInput, log: Log): T | T[] | null {
        return null;
    }

    abstract format(result: T, opts: DecodeFormatOpts): JSX.Element;

    decodeFunctionWithFragment(node: DecoderInput, functionFragment: FunctionFragment): [Result, Result | null] {
        return [
            defaultAbiCoder.decode(functionFragment.inputs, ethers.utils.arrayify(node.calldata).slice(4)),
            node.returndata && functionFragment.outputs
                ? defaultAbiCoder.decode(functionFragment.outputs, ethers.utils.arrayify(node.returndata))
                : null,
        ];
    }

    formatAddress(addr: string): JSX.Element {
        return <DataRenderer preferredType={'address'} data={addr} />;
    }

    formatTokenAmount(opts: DecodeFormatOpts, token: string, amount: BigNumberish): JSX.Element {
        token = token.toLowerCase();
        if (token === NATIVE_TOKEN) {
            token = getChain(opts.chain)?.nativeTokenAddress || '';
        }

        let amountFormatted = amount.toString();
        let address = <DataRenderer chain={opts.chain} preferredType={'address'} data={token} />;
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

        let historicalPrice = opts.prices.prices[token]?.historicalPrice;
        let currentPrice = opts.prices.prices[token]?.currentPrice;
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
