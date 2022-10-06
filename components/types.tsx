import {EventFragment, FunctionFragment, JsonFragment} from "@ethersproject/abi";
import {ethers} from "ethers";

export type AddressInfo = {
    label: string,
    functions: Record<string, JsonFragment>,
    events: Record<string, JsonFragment>,
    abi: ethers.utils.Interface,
    functionFragments: Record<string, FunctionFragment>,
    eventFragments: Record<string, EventFragment>,
};

export type TraceEntryCallable = {
    from: string,
    to: string,
    input: string,
    output: string,
    gasUsed: number,
    value: string,
    status: number,

    codehash: string,
}

export type TraceEntryCall = TraceEntryCallable & {
    id: string,
    type: 'call',
    variant: 'call' | 'callcode' | 'staticcall' | 'delegatecall',
    gas: number,
    isPrecompile: boolean,

    children: TraceEntry[],
};

export type TraceEntryCreate = TraceEntryCallable & {
    id: string,
    type: 'create',
    variant: 'create' | 'create2',

    children: TraceEntry[],
};

export type TraceEntrySelfdestruct = {
    id: string,
    type: 'selfdestruct',
    from: string,
    to: string,
    value: string,
};

export type TraceEntryLog = {
    id: string,
    type: 'log',
    topics: string[],
    data: string,
};

export type TraceEntrySload = {
    id: string,
    type: 'sload',
    slot: string,
    value: string,
}

export type TraceEntrySstore = {
    id: string,
    type: 'sstore',
    slot: string,
    oldValue: string,
    newValue: string,
}

export type TraceEntry =
    (TraceEntryCall
        | TraceEntryCreate
        | TraceEntryLog
        | TraceEntrySelfdestruct
        | TraceEntrySload
        | TraceEntrySstore);

export type TraceResult = {
    txhash: string,
    preimages: Record<string, string>,
    addresses: Record<string, Record<string, AddressInfo>>,
    trace: TraceEntryCall | TraceEntryCreate,

    abi: ethers.utils.Interface,
};

export type TypeDescriptions = {
    typeIdentifier: string,
    typeString: string,
}

export type TypeName = {
    nodeType: string,
    typeDescriptions: TypeDescriptions,
    keyType: TypeName,
    valueType: TypeName,
}

export type VariableInfo = {
    name: string,
    fullName: string | JSX.Element,
    typeName: TypeName,
    bits: number,
};

export type BaseSlotInfo = {
    resolved: boolean,
    // map of offset => variable
    variables: Record<number, VariableInfo>,
}

export type RawSlotInfo = BaseSlotInfo & {
    type: 'raw',
}

export type MappingSlotInfo = BaseSlotInfo & {
    type: 'mapping',

    baseSlot: string,

    mappingKey: string,

    offset: number,
};

export type ArraySlotInfo = BaseSlotInfo & {
    type: 'array',

    baseSlot: string,

    offset: number,
}

export type StructSlotInfo = BaseSlotInfo & {
    type: 'struct',
    offset: number,
}

export type SlotInfo = RawSlotInfo | MappingSlotInfo | ArraySlotInfo | StructSlotInfo;

export type TraceMetadata = {
    // map of address => label (we cant label by codehash)
    labels: Record<string, string>

    // map of address => codehash => abi
    abis: Record<string, Record<string, ethers.utils.Interface>>,

    nodesById: Record<string, TraceEntry>,
}

export type StorageMetadata = {
    fetched: Record<string, Record<string, Record<string, boolean>>>,

    slots: Record<string, Record<string, Record<string, SlotInfo>>>,
};