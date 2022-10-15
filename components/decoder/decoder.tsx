import { TraceEntryCall, TraceEntryLog, TraceMetadata, TraceResult } from '../types';
import {
    BaseAction,
    DecodeFormatOpts,
    Decoder,
    DecoderInput,
    DecoderOutput,
    DecoderState,
    MetadataRequest,
} from './types';
import { UniswapV2RouterSwapDecoder } from './uniswap';
import { TransferDecoder } from './fallback';
import { BigNumber, ethers } from 'ethers';
import { Log } from '@ethersproject/abstract-provider';
import { Interface } from '@ethersproject/abi';
import { findAffectedContract } from '../helpers';
import {ENSDecoder} from "./ens";

const allDecoders: Record<string, Decoder<BaseAction>> = {};
const decodeOrder: Decoder<BaseAction>[] = [];

export const registerDecoder = (decoder: Decoder<BaseAction>) => {
    decodeOrder.push(decoder);
    allDecoders[decoder.name] = decoder;
};

registerDecoder(new UniswapV2RouterSwapDecoder());
registerDecoder(new ENSDecoder());
// registerDecoder(new UniswapV2RouterAddLiquidityDecoder());
// registerDecoder(new UniswapV2RouterRemoveLiquidityDecoder());

// must come last!
registerDecoder(new TransferDecoder());

export const decode = (trace: TraceResult, metadata: TraceMetadata): [DecoderOutput, MetadataRequest] => {
    let logIndex = 0;
    let indexToPath: Record<number, string> = {};

    const flattenLogs = (node: TraceEntryCall, recursive: boolean): Array<Log> => {
        const ourLogs = node.children
            .filter((node): node is TraceEntryLog => node.type === 'log')
            .map((logNode) => {
                const [affected] = findAffectedContract(metadata, logNode);
                indexToPath[logIndex] = logNode.path;
                const log: Log = {
                    address: ethers.utils.getAddress(affected.to),
                    blockHash: '',
                    blockNumber: 0,
                    data: logNode.data,
                    logIndex: logNode.path,
                    removed: false,
                    topics: logNode.topics,
                    transactionHash: trace.txhash,
                    transactionIndex: 0,
                };
                return log;
            });
        if (!recursive) {
            return ourLogs;
        }

        node.children
            .filter((node): node is TraceEntryCall => node.type === 'call')
            .forEach((v) => {
                ourLogs.push(...flattenLogs(v, true));
            });

        return ourLogs;
    };

    const remap = (node: TraceEntryCall, parentAbi?: Interface): DecoderInput => {
        let thisAbi = new Interface([
            ...metadata.abis[node.to][node.codehash].fragments,
            ...(parentAbi?.fragments || []),
        ]);

        const logs = flattenLogs(node, false);
        const children = node.children
            .filter((node): node is TraceEntryCall => node.type === 'call')
            .map((v) => {
                if (v.variant === 'delegatecall') {
                    return remap(v, thisAbi);
                } else {
                    return remap(v, undefined);
                }
            });

        return {
            id: node.path,
            type: node.variant,
            from: ethers.utils.getAddress(node.from),
            to: ethers.utils.getAddress(node.to),
            value: BigNumber.from(node.value),
            calldata: ethers.utils.arrayify(node.input),

            status: node.status == 1,
            logs: logs,

            returndata: ethers.utils.arrayify(node.output),
            children: children,

            childOrder: node.children
                .filter((node): node is TraceEntryLog | TraceEntryCall => node.type === 'log' || node.type === 'call')
                .map((v) => {
                    if (v.type === 'log') {
                        return ['log', logs.findIndex((log) => log.logIndex === v.path)];
                    } else {
                        return ['call', children.findIndex((child) => child.id === v.path)];
                    }
                }),

            abi: thisAbi,
        };
    };

    const state = new DecoderState();
    const input = remap(trace.entrypoint);

    const visit = (node: DecoderInput): DecoderOutput => {
        if (node.failed) {
            // we don't decode anything that failed, because there should be no reason
            // to care about something that had no effect
            return {
                node: node,
                results: [],
                children: [],
            };
        }

        const decodeLog = (child: DecoderInput, log: Log): DecoderOutput => {
            const output: DecoderOutput = {
                node: log,
                results: [],
                children: [],
            };

            decodeOrder.forEach((v) => {
                try {
                    const results = v.decodeLog(state, node, log);
                    if (!results) return;

                    if (Array.isArray(results)) {
                        output.results.push(...results);
                    } else {
                        output.results.push(results);
                    }
                } catch (e) {
                    console.log('decoder failed to decode log', v.name, node, log, e);
                }
            });

            return output;
        };

        let results = decodeOrder
            .map((v) => {
                try {
                    return v.decodeCall(state, node);
                } catch (e) {
                    console.log('decoder failed to decode call', v.name, node, e);
                }
            })
            .filter((v): v is BaseAction | BaseAction[] => v !== null)
            .flatMap((v) => v);

        let children = [];
        if (node.childOrder) {
            children = node.childOrder.map((child) => {
                if (child[0] === 'log') {
                    return decodeLog(node, node.logs[child[1]]);
                } else {
                    return visit(node.children[child[1]]);
                }
            });
        } else {
            if (node.children) {
                children.push(
                    ...node.children.map((child) => {
                        return visit(child);
                    }),
                );
            }
            if (node.logs) {
                children.push(
                    ...node.logs.map((log) => {
                        return decodeLog(node, log);
                    }),
                );
            }
        }

        return {
            node: node,
            results: results,
            children: children,
        };
    };

    return [visit(input), state.requestedMetadata];
};

export const format = (result: BaseAction, opts: DecodeFormatOpts): JSX.Element => {
    return allDecoders[result.type].format(result, opts);
};
