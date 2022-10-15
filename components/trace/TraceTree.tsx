import {SlotInfo, StorageMetadata, TraceEntry, TraceEntryCallable, TraceMetadata, TraceResult} from '../types';
import {apiEndpoint, toHash} from '../helpers';
import {ParamType} from '@ethersproject/abi';
import {DataRenderer} from '../DataRenderer';
import {CallTraceTreeItem} from './CallTraceTreeItem';
import {SloadTraceTreeItem} from './SloadTraceTreeItem';
import {SstoreTraceTreeItem} from './SstoreTraceTreeItem';
import {LogTraceTreeItem} from './LogTraceTreeItem';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import * as React from 'react';

type TraceTreeProps = {
    traceResult: TraceResult;
    traceMetadata: TraceMetadata;
    showStorageChanges: Set<string>;
    setShowStorageChanges: React.Dispatch<React.SetStateAction<Set<string>>>;
    expanded: string[];
    setExpanded: React.Dispatch<React.SetStateAction<string[]>>;
    storageMetadata: StorageMetadata;
    setStorageMetadata: React.Dispatch<React.SetStateAction<StorageMetadata>>;
};

export const TraceTree = (props: TraceTreeProps) => {
    const {
        traceResult,
        traceMetadata,
        showStorageChanges,
        setShowStorageChanges,
        expanded,
        setExpanded,
        storageMetadata,
        setStorageMetadata,
    } = props;

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

    let requestStorageMetadata = (chain: string, affectedNode: TraceEntryCallable, actualNode: TraceEntryCallable) => {
        fetch(`${apiEndpoint()}/api/v1/storage/${chain}/${actualNode.to}/${actualNode.codehash}`)
            .then((res) => res.json())
            .then((res) => {
                if (res['ok']) {
                    setStorageMetadata((prevMetadata: StorageMetadata) => {
                        let newMetadata = { ...prevMetadata };

                        let { slots: allSlots, allStructs, arrays } = res['result'];

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
                                                curAddrSlots[slotInfo.baseSlot].variables[0].typeName.nodeType ===
                                                'Mapping'
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
                                                                        chain={traceMetadata.chain}
                                                                        data={slotInfo.mappingKey}
                                                                        preferredType={
                                                                            baseSlotInfo.typeName.keyType
                                                                                .typeDescriptions.typeString
                                                                        }
                                                                    ></DataRenderer>
                                                                    ].
                                                                    {structInfo.fullName}
                                                                </>
                                                            ),
                                                            typeName: structInfo.typeName,
                                                        };
                                                    }
                                                } else if (paramType.type === 'contract') {
                                                    slotInfo.variables[0] = {
                                                        fullName: (
                                                            <>
                                                                {baseSlotInfo.fullName}[
                                                                <DataRenderer
                                                                    chain={traceMetadata.chain}
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
                                                                chain={traceMetadata.chain}
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
                                        } else if (
                                            slotInfo.type === 'array' &&
                                            curAddrSlots[slotInfo.baseSlot].resolved
                                        ) {
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
                }
            });
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

    return (
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
                {recursivelyGenerateTree(traceResult.entrypoint)}
            </TreeView>
        </>
    );
};
