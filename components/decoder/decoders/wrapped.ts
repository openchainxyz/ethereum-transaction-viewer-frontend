import { Result } from '@ethersproject/abi';
import { NATIVE_TOKEN, UnwrapNativeTokenAction, WrapNativeTokenAction } from '../sdk/actions';
import { CallDecoder, DecoderInput, DecoderState } from '../sdk/types';
import { hasTraceExt, isEqualAddress } from '../sdk/utils';

const wrappedNativeTokens = {
    ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};

export class WrappedNativeTokenDecoder extends CallDecoder<WrapNativeTokenAction | UnwrapNativeTokenAction> {
    constructor() {
        super();

        this.functions[''] = this.decodeWrap;
        this.functions['deposit()'] = this.decodeWrap;
        this.functions['withdraw(uint256 amount)'] = this.decodeUnwrap;
    }

    async isTargetContract(state: DecoderState, address: string): Promise<boolean> {
        return isEqualAddress(wrappedNativeTokens['ethereum'], address);
    }

    async decodeWrap(state: DecoderState, node: DecoderInput, input: Result, output: Result | null): Promise<WrapNativeTokenAction> {
        if (hasTraceExt(node)) {
            state.consumeAll(node);
        }

        state.requestTokenMetadata(node.to);

        return {
            type: 'wrap-native-token',
            token: NATIVE_TOKEN,
            operator: node.from,
            amount: node.value.toBigInt(),
        };
    }

    async decodeUnwrap(state: DecoderState, node: DecoderInput, input: Result, output: Result | null): Promise<UnwrapNativeTokenAction> {
        if (hasTraceExt(node)) {
            state.consumeAllRecursively(node);
        }

        state.requestTokenMetadata(node.to);

        return {
            type: 'unwrap-native-token',
            token: NATIVE_TOKEN,
            operator: node.from,
            amount: input['amount'].toBigInt(),
        };
    }
}
