import { JsonRpcProvider } from '@ethersproject/providers';

import { DecoderInput, DecoderState, ProviderDecoderChainAccess } from "../components/decoder/types"
import { transformDecoderInput } from "../testdata/utils";

export const getInput = (rawInputJson: any): DecoderInput => {
    const input = rawInputJson as any as DecoderInput;
    transformDecoderInput(input);
    return input;
}

export const getDummyDecoderState = (input: DecoderInput): DecoderState => {
    return new DecoderState(input, new ProviderDecoderChainAccess(new JsonRpcProvider("")));
}
