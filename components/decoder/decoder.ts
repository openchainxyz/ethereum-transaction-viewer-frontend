import { Log } from '@ethersproject/abstract-provider';
import { ENSDecoder } from './ens';
import { TransferDecoder } from './fallback';
import {
    BaseAction,
    DecodeFormatOpts,
    Decoder,
    DecoderChainAccess,
    DecoderInput,
    DecoderOutput,
    DecoderState,
    MetadataRequest
} from './types';
import { UniswapV2PairSwapDecoder, UniswapV2RouterSwapDecoder } from './uniswap';

const allDecoders: Record<string, Decoder<BaseAction>> = {};
const allDecodersArray: Decoder<BaseAction>[] = [];

export const registerDecoder = (decoder: Decoder<BaseAction>) => {
    allDecodersArray.push(decoder);
    allDecoders[decoder.name] = decoder;
};

registerDecoder(new UniswapV2RouterSwapDecoder());
registerDecoder(new UniswapV2PairSwapDecoder());
registerDecoder(new ENSDecoder());

// must come last!
registerDecoder(new TransferDecoder());

export const decode = async (input: DecoderInput, access: DecoderChainAccess): Promise<[DecoderOutput, MetadataRequest]> => {
    const state = new DecoderState(input, access);

    const visit = async (node: DecoderInput): Promise<DecoderOutput> => {
        if (node.failed) {
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
                    console.log('decoder failed to decode log', v.name, node, log, e);
                }
            }));

            return output;
        };

        const output = state.getOutputFor(node);

        let results = (await Promise.all(allDecodersArray
            .map(async (v) => {
                try {
                    return await v.decodeCall(state, node);
                } catch (e) {
                    console.log('decoder failed to decode call', v.name, node, e);
                }
            })))
            .filter((v): v is BaseAction | BaseAction[] => v !== null)
            .flatMap((v) => v);

        output.results.push(...results);

        if (node.childOrder) {
            for (let child of node.childOrder) {
                let result;
                if (child[0] === 'log') {
                    result = await decodeLog(node, node.logs[child[1]]);
                } else {
                    result = await visit(node.children[child[1]]);
                }

                output.children.push(result);

            }
        } else {
            if (node.children) {
                for (let child of node.children) {
                    output.children.push(await visit(child));
                }
            }
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
