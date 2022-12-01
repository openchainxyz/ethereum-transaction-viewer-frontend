import { Log } from '@ethersproject/abstract-provider';
import { Action } from './actions';
import { ENSDecoder } from './ens';
import { TransferDecoder } from './fallback';
import {
    Decoder,
    DecoderChainAccess,
    DecoderInput,
    DecoderOutput,
    DecoderState,
    hasReceiptExt,
    hasTraceExt,
    MetadataRequest
} from './types';
import { UniswapV2PairSwapDecoder, UniswapV2RouterSwapDecoder } from './uniswapv2';
import { CometSupplyDecoder } from './comet';
import { WrappedNativeTokenDecoder } from './wrapped';
import { CurveSwapDecoder } from './curve';
import { UniswapV3RouterSwapDecoder } from './uniswapv3';

const allDecodersArray: Decoder<any>[] = [];

export const registerDecoder = (decoder: Decoder<any>) => {
    allDecodersArray.push(decoder);
};

registerDecoder(new UniswapV2RouterSwapDecoder());
registerDecoder(new UniswapV2PairSwapDecoder());
registerDecoder(new ENSDecoder());
registerDecoder(new CometSupplyDecoder());
registerDecoder(new WrappedNativeTokenDecoder());
registerDecoder(new CurveSwapDecoder());
registerDecoder(new UniswapV3RouterSwapDecoder());

// must come last!
registerDecoder(new TransferDecoder());

export const decode = async (input: DecoderInput, access: DecoderChainAccess): Promise<[DecoderOutput, MetadataRequest]> => {
    const state = new DecoderState(input, access);

    const visit = async (node: DecoderInput): Promise<DecoderOutput> => {
        if (hasReceiptExt(node) && node.failed) {
            // we don't decode anything that failed, because there should be no reason
            // to care about something that had no effect
            return state.getOutputFor(node);
        }

        const decodeLog = async (child: DecoderInput, log: Log): Promise<DecoderOutput> => {
            const output: DecoderOutput = state.getOutputFor(log);

            await Promise.all(allDecodersArray.map(async (v) => {
                try {
                    const results = await v.decodeLog(state, node, log);
                    if (!results) return;

                    if (Array.isArray(results)) {
                        output.results.push(...results);
                    } else {
                        output.results.push(results);
                    }
                } catch (e) {
                    console.log('decoder failed to decode log', v, node, log, e);
                }
            }));

            return output;
        };

        const output = state.getOutputFor(node);

        for (const decoder of allDecodersArray) {
            try {
                const result = await decoder.decodeCall(state, node);
                if (result) {
                    output.results.push(result);
                }
            } catch (e) {
                console.log('decoder failed to decode call', decoder, node, e);
            }
        }

        if (hasTraceExt(node)) {
            for (let child of node.childOrder) {
                let result;
                if (child[0] === 'log') {
                    result = await decodeLog(node, node.logs[child[1]]);
                } else {
                    result = await visit(node.children[child[1]]);
                }

                output.children.push(result);

            }
        } else if (hasReceiptExt(node)) {
            if (node.logs) {
                for (let log of node.logs) {
                    output.children.push(await decodeLog(node, log));
                }
            }
        }

        return output;
    };

    return [await visit(input), state.requestedMetadata];
};
