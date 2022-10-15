import { EventFragment, FunctionFragment, JsonFragment } from '@ethersproject/abi/lib';
import { ethers, Transaction } from 'ethers';
import { TransactionReceipt } from '@ethersproject/abstract-provider';

export type AddressInfo = {
    label: string;
    functions: Record<string, JsonFragment>;
    events: Record<string, JsonFragment>;
    errors: Record<string, JsonFragment>;
    abi: ethers.utils.Interface;
    functionFragments: Record<string, FunctionFragment>;
    eventFragments: Record<string, EventFragment>;
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

export type TraceResult = {
    chain: string;
    txhash: string;
    preimages: Record<string, string>;
    addresses: Record<string, Record<string, AddressInfo>>;
    entrypoint: TraceEntryCall;

    abi: ethers.utils.Interface;
};

export type TypeDescriptions = {
    typeIdentifier: string;
    typeString: string;
};

export type TypeName = {
    nodeType: string;
    typeDescriptions: TypeDescriptions;
    keyType: TypeName;
    valueType: TypeName;
};

export type VariableInfo = {
    name: string;
    fullName: string | JSX.Element;
    typeName: TypeName;
    bits: number;
};

export type BaseSlotInfo = {
    resolved: boolean;
    // map of offset => variable
    variables: Record<number, VariableInfo>;
};

export type RawSlotInfo = BaseSlotInfo & {
    type: 'raw';
};

export type DynamicSlotInfo = BaseSlotInfo & {
    type: 'dynamic';

    baseSlot: string;
    key: string;
    offset: number;
};

export type MappingSlotInfo = BaseSlotInfo & {
    type: 'mapping';

    baseSlot: string;

    mappingKey: string;

    offset: number;
};

export type ArraySlotInfo = BaseSlotInfo & {
    type: 'array';

    baseSlot: string;

    offset: number;
};

export type StructSlotInfo = BaseSlotInfo & {
    type: 'struct';
    offset: number;
};

export type SlotInfo = RawSlotInfo | DynamicSlotInfo | MappingSlotInfo | ArraySlotInfo | StructSlotInfo;

export type TraceMetadata = {
    chain: string;

    // map of address => codehash => abi
    abis: Record<string, Record<string, ethers.utils.Interface>>;

    nodesByPath: Record<string, TraceEntry>;
};

export type StorageMetadata = {
    fetched: Record<string, Record<string, Record<string, boolean>>>;

    slots: Record<string, Record<string, Record<string, SlotInfo>>>;
};

export type TransactionMetadata = {
    chain: string;
    rawTransaction: string;
    from: string;
    labels: Record<string, string>;
    timestamp: number;
};

export type TransactionInfoResponse = {
    metadata: TransactionMetadata;
    transaction: Transaction;
    receipt: TransactionReceipt;
};
