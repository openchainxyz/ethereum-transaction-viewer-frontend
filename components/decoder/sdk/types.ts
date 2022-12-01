import { defaultAbiCoder, EventFragment, Fragment, FunctionFragment, Interface, Result } from '@ethersproject/abi/lib';
import { Log, Provider, TransactionRequest } from '@ethersproject/abstract-provider';
import { BigNumber, BytesLike, ethers } from 'ethers';
import { LogDescription, ParamType } from 'ethers/lib/utils';
import { Action, BaseAction } from './actions';

import { getNodeId, hasSelector, hasReceiptExt, hasTraceExt } from './utils';

export interface DecoderChainAccess {
    getStorageAt(address: string, slot: string): Promise<string>;

    call(tx: TransactionRequest): Promise<string>;
}

export interface DecoderInput {
    // a unique id per input node
    id: string;

    // optional: attach an abi to this node if you like
    abi?: ethers.utils.Interface;

    type: 'call' | 'staticcall' | 'callcode' | 'delegatecall' | 'create' | 'create2' | 'selfdestruct';
    from: string;
    to: string;
    value: BigNumber;
    calldata: BytesLike;
}

export interface DecoderInputReceiptExt extends DecoderInput {
    failed: boolean;
    logs: Array<Log>;
}

export interface DecoderInputTraceExt extends DecoderInputReceiptExt {
    returndata: BytesLike;
    children: Array<DecoderInputTraceExt>;
    childOrder: Array<['log' | 'call', number]>;
}

export type DecoderOutput = {
    node: DecoderInput | Log;
    results: Action[];
    children: DecoderOutput[];
};

export type MetadataRequest = {
    tokens: Set<string>;
};

export class ProviderDecoderChainAccess implements DecoderChainAccess {
    private provider: Provider;
    private cache: Record<string, Record<string, string>>

    constructor(provider: Provider) {
        this.provider = provider;
        this.cache = {};
    }

    async call(transaction: TransactionRequest): Promise<string> {
        return await this.provider.call(transaction);
    }


    async getStorageAt(address: string, slot: string): Promise<string> {
        if (!this.cache[address]) {
            this.cache[address] = {};
        }
        if (!this.cache[address][slot]) {
            this.cache[address][slot] = await this.provider.getStorageAt(address, slot);
        }
        return this.cache[address][slot];
    }
}

export class DecoderState {
    access: DecoderChainAccess;

    consumed: Set<string>;

    root: DecoderInput;
    decoded: Map<DecoderInput | Log, DecoderOutput>;
    decodeOrder: DecoderOutput[];

    requestedMetadata: MetadataRequest;

    constructor(root: DecoderInput, access: DecoderChainAccess) {
        this.root = root;
        this.access = access;
        this.consumed = new Set<string>();
        this.decoded = new Map<DecoderInput, DecoderOutput>();
        this.decodeOrder = [];
        this.requestedMetadata = {
            tokens: new Set<string>(),
        };
    }

    public getOutputFor(input: DecoderInput | Log): DecoderOutput {
        if (!this.decoded.has(input)) {
            this.decoded.set(input, {
                node: input,
                results: [],
                children: [],
            });
            this.decodeOrder.push(this.decoded.get(input)!);
        }

        return this.decoded.get(input)!;
    }

    public async call(signature: string, address: string, args: any[]): Promise<Result> {
        const fragment = Fragment.from(signature);
        const intf = new Interface([
            fragment,
        ]);

        return intf.decodeFunctionResult(fragment.name, await this.access.call({
            to: address,
            data: intf.encodeFunctionData(fragment.name, args),
        }));
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

        if (hasReceiptExt(node)) {
            node.logs.forEach(this.consume.bind(this));
        }
    }

    // consume the node and all logs in it, including all child calls
    consumeAllRecursively(node: DecoderInput) {
        this.consumeAll(node);

        if (hasTraceExt(node)) {
            node.children?.forEach(this.consumeAllRecursively.bind(this));
        }
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

        if (!hasTraceExt(node)) return;

        const visit = (node: DecoderInputTraceExt) => {
            // handle any transfer events we might find, must be a match on from and to, because it might take fees
            node.logs
                .filter(
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
                    } catch { }
                });

            // if we have a delegatecall, we need to recurse because it will emit the log in the context of the
            // current contract
            node.children.filter((v) => v.type === 'delegatecall').forEach(visit);
        };
        visit(node);
    }
}

export abstract class Decoder<T extends BaseAction> {
    async decodeCall(state: DecoderState, node: DecoderInput): Promise<T | null> {
        return null;
    }

    async decodeLog(state: DecoderState, node: DecoderInput, log: Log): Promise<T | null> {
        return null;
    }

    decodeFunctionWithFragment(node: DecoderInput, functionFragment: FunctionFragment): [Result, Result | null] {
        return [
            defaultAbiCoder.decode(functionFragment.inputs, ethers.utils.arrayify(node.calldata).slice(4)),
            hasTraceExt(node) && functionFragment.outputs
                ? defaultAbiCoder.decode(functionFragment.outputs, ethers.utils.arrayify(node.returndata))
                : null,
        ];
    }

    decodeEventWithFragment(log: Log, eventFragment: string | EventFragment): LogDescription {
        const abi = new ethers.utils.Interface([eventFragment]);
        return abi.parseLog(log);
    }
}

export abstract class CallDecoder<T extends BaseAction> extends Decoder<T> {
    functions: Record<string, (state: DecoderState, node: DecoderInput, inputs: Result, outputs: Result | null) => Promise<T>>;

    constructor() {
        super();
        this.functions = {};
    }

    async decodeCall(state: DecoderState, node: DecoderInput): Promise<T | null> {
        if (state.isConsumed(node)) return null;

        if (node.type !== 'call') return null;

        const functionInfo = Object.entries(this.functions).find(([name, func]) => {
            return (name === '' && node.calldata.length === 0) || (name !== '' && hasSelector(node.calldata, name));
        });

        if (!functionInfo) return null;

        if (!await this.isTargetContract(state, node.to)) return null;

        state.consume(node);

        const [inputs, outputs] = this.decodeFunctionWithFragment(node, FunctionFragment.from(functionInfo[0]));

        const functionMetadata = functionInfo[1];

        return functionMetadata.bind(this)(state, node, inputs, outputs);
    }

    abstract isTargetContract(state: DecoderState, address: string): Promise<boolean>;
}