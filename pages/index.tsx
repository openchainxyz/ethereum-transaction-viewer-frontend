import Head from 'next/head'
import styles from '../styles/Home.module.css'
import * as React from 'react';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import TreeItem from '@mui/lab/TreeItem';
import Typography from '@mui/material/Typography';
// noinspection ES6UnusedImports
import {} from '@mui/lab/themeAugmentation';

import {
    Alert,
    AlertColor,
    Button,
    Collapse,
    createTheme,
    Grid,
    IconButton,
    TextField,
    ThemeProvider
} from "@mui/material";
import {Box} from "@mui/system";
import {apiEndpoint, findAffectedContract} from "../components/helpers";
import {ethers} from "ethers";
import {ParamType} from "@ethersproject/abi";

import BN from "bn.js";
import {precompiles} from "../components/precompiles";
import {knownSlots} from '../components/knownSlots';
import {
    SlotInfo,
    StorageMetadata,
    TraceEntry,
    TraceEntryCallable,
    TraceEntrySload,
    TraceEntrySstore,
    TraceMetadata,
    TraceResult
} from "../components/types";
import {DataRenderer} from '../components/DataRenderer';
import {SstoreTraceTreeItem} from "../components/trace/SstoreTraceTreeItem";
import {LogTraceTreeItem} from "../components/trace/LogTraceTreeItem";
import {SloadTraceTreeItem} from "../components/trace/SloadTraceTreeItem";
import {CreateTraceTreeItem} from "../components/trace/CreateTraceTreeItem";
import {CallTraceTreeItem} from "../components/trace/CallTraceTreeItem";


const useHash = (): [string, (hash: string) => void] => {
    const [hash, setHash] = React.useState(() => typeof window !== 'undefined' ? window.location.hash : '');

    const hashChangeHandler = React.useCallback(() => {
        setHash(window.location.hash);
    }, []);

    React.useEffect(() => {
        window.addEventListener('hashchange', hashChangeHandler);
        return () => {
            window.removeEventListener('hashchange', hashChangeHandler);
        };
    }, []);

    const updateHash = React.useCallback((newHash: string) => {
        if (newHash !== hash) window.location.hash = newHash;
    }, [hash]);

    return [hash, updateHash];
};

const theme = createTheme({
    components: {
        MuiTreeItem: {
            styleOverrides: {
                content: {
                    cursor: 'initial',
                },
                label: {
                    fontSize: 'initial',
                },
                iconContainer: {
                    cursor: 'pointer',
                }
            }
        },
        MuiDialog: {
            styleOverrides: {
                root: {
                    pointerEvents: 'none',
                },
            }
        },
    },
});

export default function Home() {
    const [hash, setHash] = useHash();
    const [query, setQuery] = React.useState('');
    const [isSearching, setIsSearching] = React.useState(false);
    const [alertData, setAlertData] = React.useState({
        dismissed: true,
        severity: 'success' as AlertColor,
        message: '',
    });

    const [traceResult, setTraceResult] = React.useState(null as (TraceResult | null));
    const [traceMetadata, setTraceMetadata] = React.useState(null as (TraceMetadata | null));
    const [showStorageChanges, setShowStorageChanges] = React.useState(new Set());
    const [storageMetadata, setStorageMetadata] = React.useState(null as (StorageMetadata | null));

    const [expanded, setExpanded] = React.useState<string[]>([]);

    React.useEffect(() => {
        const hashQuery = new URLSearchParams(hash ? hash.substring(1) : '').get("txhash");
        if (!hashQuery) return;

        setQuery(hashQuery);
        doSearch(hashQuery);
    }, [hash]);

    const doSearch = (query: string) => {
        setHash(`#txhash=${encodeURIComponent(query)}`);
        setIsSearching(true);
        setAlertData((prevState) => ({
            ...prevState,
            dismissed: true,
        }));
        fetch(`${apiEndpoint()}/api/v1/trace/${query}`)
            .then(res => res.json())
            .then(json => {
                if (json['ok'] === false) {
                    throw new Error(json['error']);
                }

                setIsSearching(false);

                let result: TraceResult = json['result'];
                console.log("loaded trace result", result);

                let metadata: TraceMetadata = {
                    labels: {},
                    abis: {},
                    nodesById: {},
                };

                for (let address of Object.keys(precompiles)) {
                    metadata.labels[address] = 'Precompile';
                }

                for (let [address, entries] of Object.entries(result.addresses)) {
                    metadata.abis[address] = {};
                    for (let [codehash, info] of Object.entries(entries)) {
                        metadata.labels[address] = metadata.labels[address] || info.label;

                        metadata.abis[address][codehash] = new ethers.utils.Interface([...Object.values(info.functions), ...Object.values(info.events)]);
                    }
                }

                for (let address of Object.keys(metadata.labels)) {
                    if (metadata.labels[address] === 'Vyper_contract') {
                        metadata.labels[address] = `Vyper_contract (0x${address.substring(2, 6)}..${address.substring(38, 42)})`;
                    }
                }
                console.log("loaded abis");

                let defaultExpanded: string[] = [];
                let allStorageSlots = [] as (TraceEntrySload | TraceEntrySstore)[];
                let preprocess = (node: TraceEntry) => {
                    metadata.nodesById[node.id] = node;

                    if (node.type === 'call' || node.type === 'create') {
                        if (node.gasUsed > 32000 || node.id.split(".").length <= 4) {
                            defaultExpanded.push(node.id);
                        }
                    }

                    if (node.type === 'call' || node.type === 'create') {
                        node.children.forEach(preprocess);
                    } else if (node.type === 'sload' || node.type === 'sstore') {
                        allStorageSlots.push(node);
                    }
                };
                preprocess(result.trace);
                console.log("preprocessed nodes");

                // first, augment our preimages by hashing each potential storage slot
                // this is because solidity inlines the offset at which a dynamic array will be placed
                // so we don't know what it is from the trace
                allStorageSlots.forEach(node => {
                    result.preimages[ethers.utils.keccak256(node.slot)] = node.slot;
                });
                console.log("computed preimages");

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
                                }
                            },
                            bits: knownSlot.bits,
                        };
                    }

                    newStorageMetadata.slots[address][codehash][slot] = info;
                };

                let zero = new BN(0);
                let max = new BN(2 ** 32);

                let preimageSlotCache = {} as Record<string, BN>;
                Object.keys(result.preimages).forEach(hash => {
                    preimageSlotCache[hash] = new BN(hash.substring(2), 16);
                })
                console.log("warmed cache");

                allStorageSlots.forEach(node => {
                    let slot = node.slot;
                    let [parentNode,] = findAffectedContract(metadata, node);

                    while (true) {
                        let preimage = result.preimages[slot];
                        let preimageOffset = 0;
                        if (!preimage) {
                            let potentialPreimages = Object.keys(result.preimages).filter(hash => {
                                if (!preimageSlotCache.hasOwnProperty(slot)) {
                                    preimageSlotCache[slot] = new BN(slot.substring(2), 16);
                                }
                                let offset = (preimageSlotCache[slot]).sub(preimageSlotCache[hash]);
                                return offset.gt(zero) && offset.lt(max);
                            }).map(hash => {
                                return {
                                    hash: hash,
                                    preimage: result.preimages[hash],
                                    offset: (preimageSlotCache[slot]).sub(preimageSlotCache[hash]).toNumber(),
                                };
                            });
                            if (potentialPreimages.length !== 1) {
                                if (potentialPreimages.length > 1) {
                                    console.warn("found more than one potential preimage match", potentialPreimages)
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

                        if (preimage.length === 2 + 64 + 64) {
                            // mapping
                            updateSlotInfo(parentNode.to, parentNode.codehash, slot, {
                                type: 'mapping',
                                resolved: false,
                                variables: {},

                                offset: preimageOffset,
                                baseSlot: "0x" + preimage.substring(2 + 64, 2 + 64 + 64),
                                mappingKey: "0x" + preimage.substring(2, 2 + 64),
                            });
                            slot = "0x" + preimage.substring(2 + 64, 2 + 64 + 64);
                        } else if (preimage.length === 2 + 64) {
                            updateSlotInfo(parentNode.to, parentNode.codehash, slot, {
                                type: 'array',
                                resolved: false,
                                variables: {},

                                offset: preimageOffset,
                                baseSlot: "0x" + preimage.substring(2, 2 + 64),
                            });

                            slot = "0x" + preimage.substring(2, 2 + 64);
                        } else {
                            break;
                        }
                    }
                });
                console.log("done");

                setTraceResult(result);
                setTraceMetadata(metadata);
                setStorageMetadata(newStorageMetadata);
                setShowStorageChanges(new Set());
                setExpanded(defaultExpanded);
            })
            .catch(e => {
                console.log(e);
                setIsSearching(false);
                setAlertData({
                    dismissed: false,
                    severity: 'error',
                    message: `An error occurred: ${e.message}`
                });
            });
    };

    let traceTree;
    if (traceResult && traceMetadata && storageMetadata) {
        let expandToNode = (nodeId: string) => {
            let newExpanded = expanded.slice(0);

            Object.keys(traceMetadata.nodesById)
                .filter(x => nodeId.startsWith(x))
                .forEach(x => newExpanded.push(x));

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

        let requestStorageMetadata = (affectedNode: TraceEntryCallable, actualNode: TraceEntryCallable) => {
            fetch(`${apiEndpoint()}/api/v1/storage/${actualNode.to}/${actualNode.codehash}`)
                .then(res => res.json())
                .then(res => {
                    if (res["ok"]) {
                        setStorageMetadata((prevMetadata: StorageMetadata) => {
                            let newMetadata = {...prevMetadata};

                            let {
                                slots: allSlots,
                                allStructs,
                                arrays,
                            } = res["result"];

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
                                        } else if (slotInfo.type === 'mapping' && curAddrSlots[slotInfo.baseSlot].resolved) {
                                            changed = true;
                                            slotInfo.resolved = true;

                                            let baseSlotInfo = curAddrSlots[slotInfo.baseSlot].variables[0];
                                            let valueType = baseSlotInfo.typeName.valueType;
                                            if (valueType.nodeType === 'UserDefinedTypeName') {
                                                let paramType = ParamType.from(valueType.typeDescriptions.typeString);
                                                if (paramType.type === 'struct') {
                                                    let structName = paramType.name;
                                                    let structLayout = allStructs[structName].slots;

                                                    for (let [offset, structInfo] of Object.entries(structLayout[toHash(slotInfo.offset)])) {
                                                        slotInfo.variables[parseInt(offset)] = {
                                                            fullName: <>{baseSlotInfo.fullName}[
                                                                <DataRenderer
                                                                    meta={traceMetadata}
                                                                    data={slotInfo.mappingKey}
                                                                    preferredType={baseSlotInfo.typeName.keyType.typeDescriptions.typeString}></DataRenderer>
                                                                ].{structInfo.fullName}
                                                            </>,
                                                            typeName: structInfo.typeName,
                                                        };
                                                    }
                                                } else if (paramType.type === 'contract') {
                                                    slotInfo.variables[0] = {
                                                        fullName: <>{baseSlotInfo.fullName}[
                                                            <DataRenderer
                                                                meta={traceMetadata}
                                                                data={slotInfo.mappingKey}
                                                                preferredType={baseSlotInfo.typeName.keyType.typeDescriptions.typeString}></DataRenderer>
                                                            ]
                                                        </>,
                                                        typeName: valueType,
                                                    };
                                                }
                                            } else {
                                                slotInfo.variables[0] = {
                                                    fullName: <>{baseSlotInfo.fullName}[
                                                        <DataRenderer
                                                            meta={traceMetadata}
                                                            data={slotInfo.mappingKey}
                                                            preferredType={baseSlotInfo.typeName.keyType.typeDescriptions.typeString}></DataRenderer>]
                                                    </>,
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
                                                        let paramType = ParamType.from(baseType.typeDescriptions.typeString);
                                                        if (paramType.type === 'struct') {
                                                            let structName = paramType.name;
                                                            let structLayout = allStructs[structName].slots;

                                                            let structSize = Object.entries(structLayout).length;
                                                            for (let [offset, structInfo] of Object.entries(structLayout[toHash(slotInfo.offset % structSize)])) {
                                                                slotInfo.variables[parseInt(offset)] = {
                                                                    fullName: <>{baseSlotInfo.fullName}[{Math.floor(slotInfo.offset / structSize)}].{structInfo.fullName}</>,
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
                                                            fullName: <>{baseSlotInfo.fullName}[{slotInfo.offset}]</>,
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
                                                            }
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
                                                        }
                                                    },
                                                };
                                            }
                                        }
                                    }
                                }
                            })

                            return newMetadata;
                        })
                    }
                })
        }

        let recursivelyGenerateTree = (node: TraceEntry): JSX.Element => {
            let children: JSX.Element[] = [];

            if (node.type === 'call' || node.type === 'create') {
                children = node.children
                    .filter(v => showStorageChanges.has(node.id) || (v.type !== 'sload' && v.type !== 'sstore'))
                    .map(recursivelyGenerateTree);
            }

            let commonProps = {
                key: node.id,
                traceResult: traceResult,
                traceMetadata: traceMetadata,
                storageMetadata: storageMetadata,
                showStorageChanges: showStorageChanges,
                children: children,
            };

            if (node.type === 'call') {
                return <CallTraceTreeItem
                    {...commonProps}
                    expandTo={expandToNode}
                    requestStorageMetadata={requestStorageMetadata}
                    showStorageChanges={showStorageChanges.has(node.id)}
                    setShowStorageChanges={show => setShowStorageChangesForNode(node.id, show)}
                    node={node}/>
            } else if (node.type === 'create') {
                return <CreateTraceTreeItem
                    {...commonProps}
                    expandTo={expandToNode}
                    requestStorageMetadata={requestStorageMetadata}
                    showStorageChanges={showStorageChanges.has(node.id)}
                    setShowStorageChanges={show => setShowStorageChangesForNode(node.id, show)}
                    node={node}/>
            } else if (node.type === 'sload') {
                return <SloadTraceTreeItem {...commonProps} node={node}/>;
            } else if (node.type === 'sstore') {
                return <SstoreTraceTreeItem {...commonProps} node={node}/>;
            } else if (node.type === 'log') {
                return <LogTraceTreeItem {...commonProps} node={node}/>;
            } else {
                return <TreeItem key={node.id} nodeId={node.id} label={`unsupported node type ${node.type}`}>
                    {children}
                </TreeItem>;
            }
        }


        traceTree = <TreeView
            aria-label="rich object"
            defaultCollapseIcon={<ExpandMoreIcon/>}
            defaultExpandIcon={<ChevronRightIcon/>}
            expanded={expanded}
            onNodeToggle={(event: React.SyntheticEvent, nodeIds: string[]) => {
                if (event.type === 'click') {
                    let newExpanded = nodeIds.filter(v => !expanded.includes(v));
                    let newCollapsed = expanded.filter(v => !nodeIds.includes(v));
                    // how do i get typescript to give me access to this lol
                    if (event.shiftKey) {
                        newExpanded.forEach(v => {
                            Object.keys(traceMetadata.nodesById)
                                .filter(x => x.startsWith(v))
                                .forEach(x => {
                                    nodeIds.push(x);
                                });
                        });
                        newCollapsed.forEach(v => {
                            nodeIds = nodeIds.filter(x => !x.startsWith(v));
                        })
                    }
                }
                setExpanded(nodeIds);
            }}
        >
            {recursivelyGenerateTree(traceResult.trace)}
        </TreeView>;
    }

    return (
        <ThemeProvider theme={theme}>
            <div className={styles.container}>
                <Head>
                    <title>Ethereum Transaction Viewer</title>
                    <meta name="description" content="View and trace an Ethereum transaction"/>
                    <meta property="og:type" content="website"/>
                    <meta property="og:title" content="Ethereum Transaction Viewer"/>
                    <meta property="og:description" content="View and trace an Ethereum transaction"/>
                    <meta property="og:image" content="https://tx.eth.samczsun.com/favicon.png"/>
                    <meta property="twitter:card" content="summary"/>
                    <meta property="twitter:title" content="Ethereum Transaction Viewer"/>
                    <meta property="twitter:description" content="View and trace an Ethereum transaction"/>
                    <meta property="twitter:url" content="https://tx.eth.samczsun.com"/>
                    <meta property="twitter:image" content="https://tx.eth.samczsun.com/favicon.png"/>
                    <meta property="twitter:site" content="@samczsun"/>
                    <link rel="icon" href="/favicon.png"/>
                </Head>

                <Grid
                    container
                    rowSpacing={2}
                    alignItems="center"
                    justifyContent="center"
                    sx={{mt: "5vh", mb: "10vh"}}
                >
                    <Grid item xs={12}>
                        <Box display="flex" justifyContent="center">
                            <Typography
                                variant="h1"
                                align="center"
                                fontSize={{
                                    xs: '2rem',
                                    sm: '3rem',
                                    md: '4rem',
                                    lg: '5rem',
                                }}
                            >
                                Ethereum Transaction Viewer
                            </Typography>
                        </Box>
                    </Grid>

                    <Grid item xs={12}>
                        <Collapse in={!alertData.dismissed}>
                            <Box display="flex" justifyContent="center">
                                <Alert
                                    severity={alertData.severity}
                                    action={
                                        <IconButton
                                            aria-label="close"
                                            color="inherit"
                                            size="small"
                                            onClick={() => {
                                                setAlertData(prevState => ({
                                                    ...prevState,
                                                    dismissed: true,
                                                }))
                                            }}
                                        >
                                            <CloseIcon fontSize="inherit"/>
                                        </IconButton>
                                    }
                                    sx={{mb: 2}}
                                >
                                    {alertData.message}
                                </Alert>
                            </Box>
                        </Collapse>
                    </Grid>

                    <Grid item xs={8} md={7} lg={6}>
                        <Box display="flex" justifyContent="center">
                            <TextField id="search" type="text" placeholder="Enter tx hash to view..."
                                       fullWidth
                                       value={query}
                                       onChange={(event) => setQuery(event.target.value)}
                                       onKeyUp={(event) => {
                                           if (event.key === 'Enter') {
                                               doSearch(query);
                                           }
                                       }}
                                       autoFocus={true}
                            />
                        </Box>
                    </Grid>

                    <Grid item xs={12}>
                        <Box display="flex" justifyContent="center">
                            <Button variant="contained" onClick={() => doSearch(query)}
                                    disabled={isSearching}>View</Button>
                        </Box>
                    </Grid>

                    {traceTree ?
                        <Grid item xs={12} md={12} lg={12}>
                            <Box display="flex" justifyContent="left">
                                {traceTree}
                            </Box>
                        </Grid> : null}
                </Grid>
            </div>
        </ThemeProvider>
    )
}
