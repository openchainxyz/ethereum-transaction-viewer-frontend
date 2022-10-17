import { ethers } from 'ethers';
import { TraceEntry, TraceEntryCall } from './api';

export type TransactionTrace = {
    txhash: string;
    entrypoint: TraceEntryCall;
    nodesByPath: Record<string, TraceEntry>;
    preimages: Record<string, string>;
};

export type TraceMetadata = {
    // map of address => codehash => abi
    abis: Record<string, Record<string, ethers.utils.Interface>>;

    nodesByPath: Record<string, TraceEntry>;
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

export type StorageMetadata = {
    fetched: Record<string, Record<string, Record<string, boolean>>>;

    slots: Record<string, Record<string, Record<string, SlotInfo>>>;
};

export type ErrorResult = {
    ok: false;
    error: any;
};

export type SuccessResult<T> = {
    ok: true;
    result: T;
};

export type Result<T> = ErrorResult | SuccessResult<T>;
