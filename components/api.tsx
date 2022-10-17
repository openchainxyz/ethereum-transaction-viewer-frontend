import { JsonFragment } from '@ethersproject/abi';

export type AddressInfo = {
    label: string;
    functions: Record<string, JsonFragment>;
    events: Record<string, JsonFragment>;
    errors: Record<string, JsonFragment>;
};
export type TraceEntryCall = {
    path: string;
    type: 'call';
    variant: 'call' | 'callcode' | 'staticcall' | 'delegatecall' | 'create' | 'create2' | 'selfdestruct';
    gas: number;
    isPrecompile: boolean;
    from: string;
    to: string;
    input: string;
    output: string;
    gasUsed: number;
    value: string;
    status: number;

    codehash: string;

    children: TraceEntry[];
};
export type TraceEntryLog = {
    path: string;
    type: 'log';
    topics: string[];
    data: string;
};
export type TraceEntrySload = {
    path: string;
    type: 'sload';
    slot: string;
    value: string;
};
export type TraceEntrySstore = {
    path: string;
    type: 'sstore';
    slot: string;
    oldValue: string;
    newValue: string;
};
export type TraceEntry = TraceEntryCall | TraceEntryLog | TraceEntrySload | TraceEntrySstore;
export type TraceResponse = {
    chain: string;
    txhash: string;
    preimages: Record<string, string>;
    addresses: Record<string, Record<string, AddressInfo>>;
    entrypoint: TraceEntryCall;
};

export type StorageResponse = {
    allStructs: any[];
    arrays: any[];
    structs: any[];
    slots: Record<string, any>;
};

export function apiEndpoint() {
    return process.env.NEXT_PUBLIC_API_HOST || 'https://tx.eth.samczsun.com';
}

export type APIResponseError = {
    ok: false;
    error: string;
};
export type APIResponseSuccess<T> = {
    ok: true;
    result: T;
};
export type APIResponse<T> = APIResponseError | APIResponseSuccess<T>;
export const doApiRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    return fetch(`${apiEndpoint()}${path}`, init)
        .then((res) => res.json())
        .then((json) => json as APIResponse<T>)
        .then((resp) => {
            if (!resp.ok) {
                throw new Error(resp.error);
            }
            return resp.result;
        });
};
