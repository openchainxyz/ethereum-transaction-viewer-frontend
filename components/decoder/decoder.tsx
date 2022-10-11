import { TraceEntry, TraceMetadata, TraceResult } from '../types';
import { DecodeFormatOpts, DecodeNode, Decoder, DecodeResult, DecodeResultCommon, DecodeState } from './types';
import {
    UniswapV2AddLiquidityEth,
    UniswapV2ExactEthForTokensDecoder,
    UniswapV2ExactTokensForEthSupportingFeeOnTransferTokens,
    UniswapV2ExactTokensForTokens,
    UniswapV2RouterAddLiquidityDecoder,
    UniswapV2RouterRemoveLiquidityDecoder,
    UniswapV2RouterSwapDecoder,
} from './uniswap';
import { ERC20Decoder, ValueTransferDecoder } from './fallback';

const allDecoders: Record<string, Decoder<any>> = {};
const decodeOrder: Decoder<any>[] = [];

export const registerDecoder = (decoder: Decoder<any>) => {
    decodeOrder.push(decoder);
    allDecoders[decoder.name] = decoder;
};

registerDecoder(new UniswapV2RouterSwapDecoder());
registerDecoder(new UniswapV2RouterAddLiquidityDecoder());
registerDecoder(new UniswapV2RouterRemoveLiquidityDecoder());

// must come last!
registerDecoder(new ValueTransferDecoder());
registerDecoder(new ERC20Decoder());

export const decode = (trace: TraceResult, metadata: TraceMetadata): DecodeResult => {
    const requestedMetadata = {
        tokens: new Set<string>(),
    };
    const state: DecodeState = {
        trace: trace,
        metadata: metadata,
        requestedMetadata: requestedMetadata,
        handled: {},
    };

    const visit = (node: TraceEntry): DecodeNode => {
        metadata.nodesById[node.id] = node;

        let results: DecodeResultCommon[] = decodeOrder
            .map((v) => v.decode(node, state))
            .filter((v): v is DecodeResultCommon => v !== null);
        let children: DecodeNode[] = [];
        if (node.type === 'call' || node.type === 'create') {
            children = node.children.map(visit);
        }

        return {
            node: node,
            results: results,
            children: children,
        };
    };

    return {
        root: visit(trace.trace),
        requestedMetadata: requestedMetadata,
    };
};

export const format = (result: DecodeResultCommon, opts: DecodeFormatOpts): JSX.Element => {
    return allDecoders[result.type].format(result, opts);
};
