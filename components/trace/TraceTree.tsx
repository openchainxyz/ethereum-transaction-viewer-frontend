import { SlotInfo, StorageMetadata, TraceMetadata } from '../types';
import { findAffectedContract, toHash } from '../helpers';
import { ParamType } from '@ethersproject/abi';
import { DataRenderer } from '../DataRenderer';
import { CallTraceTreeItem } from './CallTraceTreeItem';
import { SloadTraceTreeItem } from './SloadTraceTreeItem';
import { SstoreTraceTreeItem } from './SstoreTraceTreeItem';
import { LogTraceTreeItem } from './LogTraceTreeItem';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import * as React from 'react';
import { knownSlots } from '../knownSlots';
import BN from 'bn.js';
import { ethers } from 'ethers';
import {
    apiEndpoint,
    doApiRequest,
    StorageResponse,
    TraceEntry,
    TraceEntryCall,
    TraceEntrySload,
    TraceEntrySstore,
    TraceResponse,
} from '../api';

type TraceTreeProps = {
    traceResult: TraceResponse;
    traceMetadata: TraceMetadata;
};

const defaultStorageMetadata = (): StorageMetadata => {
    return {
        fetched: {},
        slots: {},
    };
};

export const TraceTree = (props: TraceTreeProps) => {
    console.time('render trace tree');
    const { traceResult, traceMetadata } = props;

    const [storageMetadata, setStorageMetadata] = React.useState<StorageMetadata>(defaultStorageMetadata());
    const [showStorageChanges, setShowStorageChanges] = React.useState<Set<string>>(new Set());
    const [expanded, setExpanded] = React.useState<string[]>([]);

    React.useMemo(() => {
        let defaultExpanded: string[] = [];
        let allStorageOps: Array<TraceEntrySload | TraceEntrySstore> = [];
        let preprocess = (node: TraceEntry) => {
            traceMetadata.nodesByPath[node.path] = node;

            if (node.type === 'sstore' || node.type === 'sload') {
                allStorageOps.push(node);
            }

            if (node.type === 'call') {
                if (node.variant !== 'staticcall' && (node.gasUsed > 32000 || node.path.split('.').length <= 4)) {
                    defaultExpanded.push(node.path);
                }

                node.children.forEach(preprocess);
            }
        };
        preprocess(traceResult.entrypoint);

        let maxLength = 3;
        while (true) {
            const visibleNodes = defaultExpanded
                .map((path) => {
                    const node = traceMetadata.nodesByPath[path];
                    if (node.type === 'call')
                        return (
                            node.children.filter((child) => child.type !== 'sstore' && child.type !== 'sload').length +
                            1
                        );
                    return 1;
                })
                .reduce((v, a) => v + a, 0);

            if (visibleNodes < 32) {
                break;
            }

            defaultExpanded = defaultExpanded.filter((v) => v.split('.').length <= maxLength);
            maxLength--;
        }

        // first, augment our preimages by hashing each potential storage slot
        // this is because solidity inlines the offset at which a dynamic array will be placed
        // so we don't know what it is from the trace
        allStorageOps.forEach((node) => {
            traceResult.preimages[ethers.utils.keccak256(node.slot)] = node.slot;
        });

        let newStorageMetadata: StorageMetadata = {
            fetched: {},
            slots: {},
        };

        let updateSlotInfo = (address: string, codehash: string, slot: string, info: SlotInfo) => {
            if (!(address in newStorageMetadata.slots)) newStorageMetadata.slots[address] = {};
            if (!(codehash in newStorageMetadata.slots[address])) newStorageMetadata.slots[address][codehash] = {};

            let knownSlot = knownSlots[slot];
            if (knownSlot) {
                info.resolved = true;
                info.variables[0] = {
                    name: knownSlot.name,
                    fullName: knownSlot.name,
                    typeName: {
                        typeDescriptions: {
                            typeString: knownSlot.type,
                            typeIdentifier: knownSlot.type,
                        },
                    },
                    bits: knownSlot.bits,
                };
            }

            newStorageMetadata.slots[address][codehash][slot] = info;
        };

        let zero = new BN(0);
        let max = new BN(2 ** 32);

        let preimageSlotCache = {} as Record<string, BN>;
        Object.keys(traceResult.preimages).forEach((hash) => {
            preimageSlotCache[hash] = new BN(hash.substring(2), 16);
        });
        console.log('warmed cache');

        allStorageOps.forEach((node) => {
            let slot = node.slot;
            let [parentNode] = findAffectedContract(traceMetadata, node);

            while (true) {
                let preimage = traceResult.preimages[slot];
                let preimageOffset = 0;
                if (!preimage) {
                    let potentialPreimages = Object.keys(traceResult.preimages)
                        .filter((hash) => {
                            if (!preimageSlotCache.hasOwnProperty(slot)) {
                                preimageSlotCache[slot] = new BN(slot.substring(2), 16);
                            }
                            let offset = preimageSlotCache[slot].sub(preimageSlotCache[hash]);
                            return offset.gt(zero) && offset.lt(max);
                        })
                        .map((hash) => {
                            return {
                                hash: hash,
                                preimage: traceResult.preimages[hash],
                                offset: preimageSlotCache[slot].sub(preimageSlotCache[hash]).toNumber(),
                            };
                        });
                    if (potentialPreimages.length !== 1) {
                        if (potentialPreimages.length > 1) {
                            console.warn('found more than one potential preimage match', potentialPreimages);
                        }
                        updateSlotInfo(parentNode.to, parentNode.codehash, slot, {
                            type: 'raw',
                            resolved: false,
                            variables: {},
                        });
                        break;
                    }

                    preimage = potentialPreimages[0].preimage;
                    preimageOffset = potentialPreimages[0].offset;
                }

                if (preimage.startsWith('0x')) {
                    preimage = preimage.substring(2);
                }
                let baseSlot = '0x' + preimage.substring(preimage.length - 64).padStart(64, '0');
                updateSlotInfo(parentNode.to, parentNode.codehash, slot, {
                    type: 'dynamic',
                    resolved: false,
                    variables: {},

                    offset: preimageOffset,
                    baseSlot: baseSlot,
                    key: '0x' + preimage.substring(2, preimage.length - 64),
                });

                slot = baseSlot;
            }
        });

        setExpanded(defaultExpanded);
        setStorageMetadata(newStorageMetadata);
    }, [traceResult, traceMetadata]);

    let expandToNode = (nodeId: string) => {
        let newExpanded = expanded.slice(0);

        Object.keys(traceMetadata.nodesByPath)
            .filter((x) => nodeId.startsWith(x))
            .forEach((x) => newExpanded.push(x));

        setExpanded(newExpanded);
    };

    let setShowStorageChangesForNode = (nodeId: string, show: boolean) => {
        const newShowStorageChanges = new Set(showStorageChanges);

        if (show) {
            newShowStorageChanges.add(nodeId);
            expandToNode(nodeId);
        } else {
            newShowStorageChanges.delete(nodeId);
        }

        setShowStorageChanges(newShowStorageChanges);
    };

    let requestStorageMetadata = (chain: string, affectedNode: TraceEntryCall, actualNode: TraceEntryCall) => {
        doApiRequest<StorageResponse>(`/api/v1/storage/${chain}/${actualNode.to}/${actualNode.codehash}`).then(
            (res) => {
                setStorageMetadata((prevMetadata: StorageMetadata) => {
                    let newMetadata = { ...prevMetadata };

                    let { slots: allSlots, allStructs, arrays } = res;

                    Object.entries(allSlots as Record<string, SlotInfo>).forEach(([ourSlot, slotData]) => {
                        let curAddrSlots = newMetadata.slots[affectedNode.to][affectedNode.codehash];

                        let changed = true;
                        while (changed) {
                            changed = false;

                            for (let [slot, slotInfo] of Object.entries(curAddrSlots)) {
                                if (slotInfo.resolved) continue;

                                if (slotInfo.type === 'raw' && slot === ourSlot) {
                                    changed = true;
                                    slotInfo.resolved = true;

                                    slotInfo.variables = slotData;
                                } else {
                                    if (slotInfo.type === 'dynamic' && curAddrSlots[slotInfo.baseSlot].resolved) {
                                        if (
                                            curAddrSlots[slotInfo.baseSlot].variables[0].typeName.nodeType === 'Mapping'
                                        ) {
                                            slotInfo.type = 'mapping';
                                            slotInfo.mappingKey = slotInfo.key;
                                        } else {
                                            slotInfo.type = 'array';
                                        }
                                    }

                                    if (slotInfo.type === 'mapping' && curAddrSlots[slotInfo.baseSlot].resolved) {
                                        changed = true;
                                        slotInfo.resolved = true;

                                        let baseSlotInfo = curAddrSlots[slotInfo.baseSlot].variables[0];
                                        let valueType = baseSlotInfo.typeName.valueType;
                                        if (valueType.nodeType === 'UserDefinedTypeName') {
                                            let paramType = ParamType.from(valueType.typeDescriptions.typeString);
                                            if (paramType.type === 'struct') {
                                                let structName = paramType.name;
                                                let structLayout = allStructs[structName].slots;

                                                for (let [offset, structInfo] of Object.entries(
                                                    structLayout[toHash(slotInfo.offset)],
                                                )) {
                                                    slotInfo.variables[parseInt(offset)] = {
                                                        fullName: (
                                                            <>
                                                                {baseSlotInfo.fullName}[
                                                                <DataRenderer
                                                                    data={slotInfo.mappingKey}
                                                                    preferredType={
                                                                        baseSlotInfo.typeName.keyType.typeDescriptions
                                                                            .typeString
                                                                    }
                                                                ></DataRenderer>
                                                                ].
                                                                {structInfo.fullName}
                                                            </>
                                                        ),
                                                        typeName: structInfo.typeName,
                                                        bits: structInfo.bits,
                                                    };
                                                }
                                            } else if (paramType.type === 'contract') {
                                                slotInfo.variables[0] = {
                                                    fullName: (
                                                        <>
                                                            {baseSlotInfo.fullName}[
                                                            <DataRenderer
                                                                data={slotInfo.mappingKey}
                                                                preferredType={
                                                                    baseSlotInfo.typeName.keyType.typeDescriptions
                                                                        .typeString
                                                                }
                                                            ></DataRenderer>
                                                            ]
                                                        </>
                                                    ),
                                                    typeName: valueType,
                                                };
                                            }
                                        } else {
                                            slotInfo.variables[0] = {
                                                fullName: (
                                                    <>
                                                        {baseSlotInfo.fullName}[
                                                        <DataRenderer
                                                            data={slotInfo.mappingKey}
                                                            preferredType={
                                                                baseSlotInfo.typeName.keyType.typeDescriptions
                                                                    .typeString === 'string'
                                                                    ? 'ascii'
                                                                    : baseSlotInfo.typeName.keyType.typeDescriptions
                                                                          .typeString
                                                            }
                                                        ></DataRenderer>
                                                        ]
                                                    </>
                                                ),
                                                typeName: valueType,
                                            };
                                        }
                                    } else if (slotInfo.type === 'array' && curAddrSlots[slotInfo.baseSlot].resolved) {
                                        changed = true;
                                        slotInfo.resolved = true;

                                        if (slotInfo.baseSlot in arrays) {
                                            let baseSlotInfo = arrays[slotInfo.baseSlot];

                                            if (baseSlotInfo.typeName.nodeType === 'ArrayTypeName') {
                                                let baseType = baseSlotInfo.typeName.baseType;

                                                if (baseType.nodeType === 'UserDefinedTypeName') {
                                                    let paramType = ParamType.from(
                                                        baseType.typeDescriptions.typeString,
                                                    );
                                                    if (paramType.type === 'struct') {
                                                        let structName = paramType.name;
                                                        let structLayout = allStructs[structName].slots;

                                                        let structSize = Object.entries(structLayout).length;
                                                        for (let [offset, structInfo] of Object.entries(
                                                            structLayout[toHash(slotInfo.offset % structSize)],
                                                        )) {
                                                            slotInfo.variables[parseInt(offset)] = {
                                                                fullName: (
                                                                    <>
                                                                        {baseSlotInfo.fullName}[
                                                                        {Math.floor(slotInfo.offset / structSize)}
                                                                        ].
                                                                        {structInfo.fullName}
                                                                    </>
                                                                ),
                                                                typeName: structInfo.typeName,
                                                                bits: structInfo.bits,
                                                            };
                                                        }
                                                    } else if (paramType.type === 'contract') {
                                                        slotInfo.variables[0] = {
                                                            fullName: <>{baseSlotInfo.fullName}</>,
                                                            typeName: baseType,
                                                        };
                                                    }
                                                } else {
                                                    slotInfo.variables[0] = {
                                                        fullName: (
                                                            <>
                                                                {baseSlotInfo.fullName}[{slotInfo.offset}]
                                                            </>
                                                        ),
                                                        typeName: baseType,
                                                    };
                                                }
                                            } else {
                                                // not an array, must be a string or bytes
                                                let baseType = curAddrSlots[slotInfo.baseSlot];

                                                slotInfo.variables[0] = {
                                                    fullName: <>{baseType.variables[0].fullName}</>,
                                                    typeName: {
                                                        typeDescriptions: {
                                                            typeString: 'ascii',
                                                            typeIdentifier: 't_ascii',
                                                        },
                                                    },
                                                };
                                            }
                                        } else {
                                            // not an array, must be a string or bytes
                                            let baseType = curAddrSlots[slotInfo.baseSlot];

                                            slotInfo.variables[0] = {
                                                fullName: <>{baseType.variables[0].fullName}</>,
                                                typeName: {
                                                    typeDescriptions: {
                                                        typeString: 'ascii',
                                                        typeIdentifier: 't_ascii',
                                                    },
                                                },
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    });

                    return newMetadata;
                });
            },
        );
    };

    let recursivelyGenerateTree = (node: TraceEntry): JSX.Element => {
        let children: JSX.Element[] = [];

        if (node.type === 'call') {
            children = node.children
                .filter((v) => showStorageChanges.has(node.path) || (v.type !== 'sload' && v.type !== 'sstore'))
                .map(recursivelyGenerateTree);
        }

        let commonProps = {
            key: traceResult.txhash + '.' + node.path,
            traceResult: traceResult,
            traceMetadata: traceMetadata,
            storageMetadata: storageMetadata,
            showStorageChanges: showStorageChanges,
            children: children,
        };

        if (node.type === 'call') {
            return (
                <CallTraceTreeItem
                    {...commonProps}
                    expandTo={expandToNode}
                    requestStorageMetadata={requestStorageMetadata}
                    showStorageChanges={showStorageChanges.has(node.path)}
                    setShowStorageChanges={(show) => setShowStorageChangesForNode(node.path, show)}
                    node={node}
                />
            );
        } else if (node.type === 'sload') {
            return <SloadTraceTreeItem {...commonProps} node={node} />;
        } else if (node.type === 'sstore') {
            return <SstoreTraceTreeItem {...commonProps} node={node} />;
        } else if (node.type === 'log') {
            return <LogTraceTreeItem {...commonProps} node={node} />;
        } else {
            throw new Error('unexpected trace node', node);
        }
    };

    const treeItems = React.useMemo(() => {
        return recursivelyGenerateTree(traceResult.entrypoint);
    }, [showStorageChanges, traceResult, storageMetadata]);
    const l = (
        <>
            <TreeView
                aria-label="rich object"
                defaultCollapseIcon={<ExpandMoreIcon />}
                defaultExpandIcon={<ChevronRightIcon />}
                sx={{
                    paddingBottom: '30vh',
                }}
                expanded={expanded}
                onNodeToggle={(event: React.SyntheticEvent, nodeIds: string[]) => {
                    if (event.type === 'click') {
                        let newExpanded = nodeIds.filter((v) => !expanded.includes(v));
                        let newCollapsed = expanded.filter((v) => !nodeIds.includes(v));
                        // how do i get typescript to give me access to this lol
                        if (event.shiftKey) {
                            newExpanded.forEach((v) => {
                                Object.keys(traceMetadata.nodesByPath)
                                    .filter((x) => x.startsWith(v))
                                    .forEach((x) => {
                                        nodeIds.push(x);
                                    });
                            });
                            newCollapsed.forEach((v) => {
                                nodeIds = nodeIds.filter((x) => !x.startsWith(v));
                            });
                        }
                    }
                    setExpanded(nodeIds);
                }}
            >
                {treeItems}
            </TreeView>
        </>
    );
    console.timeEnd('render trace tree');
    return l;
};
