import { JsonRpcProvider } from '@ethersproject/providers';

import { DecoderInput, DecoderState, ProviderDecoderChainAccess } from "../sdk/types"

export const transformDecoderInput = (jsonInput: any) => {
    const keys = Object.keys(jsonInput);

    keys.forEach(key => {
        if (key === 'children') {
            jsonInput[key].forEach((child: any) => {
                transformDecoderInput(child);
            });
        } else if (key === 'calldata' || key === 'returndata') {
            jsonInput[key] = Object.values(jsonInput[key]);
        }
    })
}

export const getInput = (rawInputJson: any): DecoderInput => {
    const input = rawInputJson as any as DecoderInput;
    transformDecoderInput(input);
    return input;
}

export const getDummyDecoderState = (input: DecoderInput): DecoderState => {
    return new DecoderState(input, new ProviderDecoderChainAccess(new JsonRpcProvider("")));
}
