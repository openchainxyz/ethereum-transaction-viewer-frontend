import * as React from 'react';
import {ThemeProvider, Typography} from '@mui/material';
import {
    SlotInfo,
    StorageMetadata,
    TraceEntry,
    TraceEntrySload,
    TraceEntrySstore,
    TraceMetadata,
    TraceResult,
    TransactionInfoResponse,
} from '../../components/types';
import {apiEndpoint, findAffectedContract, theme} from '../../components/helpers';
import {precompiles} from '../../components/precompiles';
import {ethers} from 'ethers';
import {knownSlots} from '../../components/knownSlots';
import BN from 'bn.js';
import styles from '../../styles/Home.module.css';
import {useRouter} from 'next/router';
import {Formatter, JsonRpcBatchProvider, JsonRpcProvider} from '@ethersproject/providers';
import {TransactionInfo} from '../../components/transactioninfo/TransactionInfo';
import {decode, DecoderOutput} from '../../components/decoder/decoder';
import {DecodeTree} from '../../components/decoder/DecodeTree';
import {getChain} from '../../components/Chains';
import Home from '../index';
import {ValueChange} from '../../components/value-change/ValueChange';
import {
    defaultPriceMetadata,
    fetchDefiLlamaPrices,
    PriceMetadata,
    PriceMetadataContext,
} from '../../components/metadata/prices';
import {
    defaultTokenMetadata,
    fetchTokenMetadata,
    TokenMetadata,
    TokenMetadataContext,
} from '../../components/metadata/tokens';
import {TraceTree} from '../../components/trace/TraceTree';
import {defaultLabelMetadata, LabelMetadata, LabelMetadataContext} from "../../components/metadata/labels";

type APIResponseError = {
    ok: false;
    error: string;
};

type APIResponseSuccess<T> = {
    ok: true;
    result: T;
};

type APIResponse<T> = APIResponseError | APIResponseSuccess<T>;

const doApiRequest = async <T, >(path: string, init?: RequestInit): Promise<T> => {
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

const defaultStorageMetadata = (): StorageMetadata => {
    return {
        fetched: {},
        slots: {},
    };
};

export default function TransactionViewer() {
    const router = useRouter();
    const {chain, txhash} = router.query;

    const [fetchTransactionError, setFetchTransactionError] = React.useState<Error | null>(null);
    const [fetchTraceError, setFetchTraceError] = React.useState<Error | null>(null);
    const [decodeTransactionError, setDecodeTransactionError] = React.useState<Error | null>(null);

    const [transactionResponse, setTransactionResponse] = React.useState<TransactionInfoResponse | null>(null);
    const [decodedActions, setDecodedActions] = React.useState<DecoderOutput | null>(null);
    const [traceResult, setTraceResult] = React.useState(null as TraceResult | null);
    const [traceMetadata, setTraceMetadata] = React.useState(null as TraceMetadata | null);
    const [showStorageChanges, setShowStorageChanges] = React.useState<Set<string>>(new Set());

    const [labelMetadata, setLabelMetadata] = React.useState<LabelMetadata>(defaultLabelMetadata());
    const [storageMetadata, setStorageMetadata] = React.useState<StorageMetadata>(defaultStorageMetadata());
    const [priceMetadata, setPriceMetadata] = React.useState<PriceMetadata>(defaultPriceMetadata());
    const [tokenMetadata, setTokenMetadata] = React.useState<TokenMetadata>(defaultTokenMetadata());

    const [expanded, setExpanded] = React.useState<string[]>([]);

    const [provider, setProvider] = React.useState(null);

    React.useMemo(() => {
        if (!chain) return;

        console.log('setting provider to', chain, getChain(chain)?.rpcUrl);
        setProvider(new JsonRpcProvider(getChain(chain)?.rpcUrl));
    }, [chain]);

    const doSearch = (chain: string, txhash: string) => {
        const chainConfig = getChain(chain);
        if (!chainConfig) return;

        setTokenMetadata(defaultTokenMetadata());
        setPriceMetadata(defaultPriceMetadata());
        setStorageMetadata(defaultStorageMetadata());

        setTransactionResponse(null);
        setDecodedActions(null);
        setTraceResult(null);
        setTraceMetadata(null);
        setShowStorageChanges(new Set());

        setFetchTransactionError(null);
        setFetchTraceError(null);
        setDecodedActions(null);

        doApiRequest<TransactionInfoResponse>(`/api/v1/tx/${chain}/${txhash}`)
            .then((resp) => {
                let formatter = new Formatter();

                if (resp.receipt.root === '0x') resp.receipt.root = undefined;
                resp.receipt = formatter.receipt(resp.receipt);

                resp.transaction = formatter.transaction(resp.metadata.rawTransaction);

                setTransactionResponse(resp);

                fetchDefiLlamaPrices(setPriceMetadata, [chainConfig.coingeckoId], resp.metadata.timestamp).catch(
                    (e) => {
                        console.log('failed to fetch price', e);
                    },
                );
            })
            .catch((e) => {
                setFetchTransactionError(e);
                console.log('failed to fetch transaction', e);
            });

        doApiRequest<TraceResult>(`/api/v1/trace/${chain}/${txhash}`)
            .then((resp) => {
                console.log('loaded trace result', resp);

                let labels: Record<string, string> = {};
                let customLabels: Record<string, Record<string, string>> = {};
                try {
                    customLabels = JSON.parse(localStorage.getItem("pref:labels") || '{}');
                } catch {
                }
                if (!(chain in customLabels)) {
                    customLabels[chain] = {};
                }

                let metadata: TraceMetadata = {
                    chain: resp.chain,
                    abis: {},
                    nodesByPath: {},
                };

                for (let address of Object.keys(precompiles)) {
                    labels[address] = 'Precompile';
                }

                for (let [address, entries] of Object.entries(resp.addresses)) {
                    metadata.abis[address] = {};
                    for (let [codehash, info] of Object.entries(entries)) {
                        labels[address] = labels[address] || info.label;

                        metadata.abis[address][codehash] = new ethers.utils.Interface([
                            ...Object.values(info.functions),
                            ...Object.values(info.events),
                            ...Object.values(info.errors).filter(
                                (v) =>
                                    !(
                                        // lmao wtf ethers
                                        (
                                            (v.name === 'Error' &&
                                                v.inputs &&
                                                v.inputs.length === 1 &&
                                                v.inputs[0].type === 'string') ||
                                            (v.name === 'Panic' &&
                                                v.inputs &&
                                                v.inputs.length === 1 &&
                                                v.inputs[0].type === 'uint256')
                                        )
                                    ),
                            ),
                        ]);
                    }
                }

                for (let address of Object.keys(labels)) {
                    if (labels[address] === 'Vyper_contract') {
                        labels[address] = `Vyper_contract (0x${address.substring(2, 6)}..${address.substring(
                            38,
                            42,
                        )})`;
                    }
                }
                console.log('loaded abis');

                let defaultExpanded: string[] = [];
                let allStorageOps: Array<TraceEntrySload | TraceEntrySstore> = [];
                let preprocess = (node: TraceEntry) => {
                    metadata.nodesByPath[node.path] = node;

                    if (node.type === 'sstore' || node.type === 'sload') {
                        allStorageOps.push(node);
                    }

                    if (node.type === 'call') {
                        if (
                            node.variant !== 'staticcall' &&
                            (node.gasUsed > 32000 || node.path.split('.').length <= 4)
                        ) {
                            defaultExpanded.push(node.path);
                        }

                        node.children.forEach(preprocess);
                    }
                };
                preprocess(resp.entrypoint);
                console.log('preprocessed nodes');

                let maxLength = 3;
                while (true) {
                    const visibleNodes = defaultExpanded.map(path => {
                        const node = metadata.nodesByPath[path];
                        if (node.type === 'call') return node.children.length + 1;
                        return 1;
                    }).reduce((v, a) => v + a, 0);

                    if (visibleNodes < 32) {
                        break;
                    }

                    defaultExpanded = defaultExpanded.filter(v => v.split(".").length <= maxLength);
                    maxLength--;
                }

                // first, augment our preimages by hashing each potential storage slot
                // this is because solidity inlines the offset at which a dynamic array will be placed
                // so we don't know what it is from the trace
                allStorageOps.forEach((node) => {
                    resp.preimages[ethers.utils.keccak256(node.slot)] = node.slot;
                });
                console.log('computed preimages');

                let newStorageMetadata: StorageMetadata = {
                    fetched: {},
                    slots: {},
                };

                let updateSlotInfo = (address: string, codehash: string, slot: string, info: SlotInfo) => {
                    if (!(address in newStorageMetadata.slots)) newStorageMetadata.slots[address] = {};
                    if (!(codehash in newStorageMetadata.slots[address]))
                        newStorageMetadata.slots[address][codehash] = {};

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
                Object.keys(resp.preimages).forEach((hash) => {
                    preimageSlotCache[hash] = new BN(hash.substring(2), 16);
                });
                console.log('warmed cache');

                allStorageOps.forEach((node) => {
                    let slot = node.slot;
                    let [parentNode] = findAffectedContract(metadata, node);

                    while (true) {
                        let preimage = resp.preimages[slot];
                        let preimageOffset = 0;
                        if (!preimage) {
                            let potentialPreimages = Object.keys(resp.preimages)
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
                                        preimage: resp.preimages[hash],
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
                console.log('done');

                Object.keys(labels).forEach(addr => delete customLabels[chain][addr]);
                localStorage.setItem('pref:labels', JSON.stringify(customLabels));

                console.log(customLabels)

                setTraceResult(resp);
                setTraceMetadata(metadata);
                setStorageMetadata(newStorageMetadata);
                setLabelMetadata({
                    updater: setLabelMetadata,
                    labels: labels,
                    customLabels: customLabels,
                })
                setShowStorageChanges(new Set());
                setExpanded(defaultExpanded);
            })
            .catch((e) => {
                setFetchTraceError(e);
                console.log('failed to fetch trace', e);
            });
    };

    React.useEffect(() => {
        if (!chain || Array.isArray(chain)) return;
        if (!txhash || Array.isArray(txhash)) return;

        doSearch(chain, txhash);
    }, [chain, txhash]);

    React.useEffect(() => {
        if (!traceResult || !traceMetadata || !transactionResponse) return;

        try {
            let [output, requestedMetadata] = decode(traceResult, traceMetadata);
            console.log('decoded', output);
            console.log('requested metadata for ', requestedMetadata);
            setDecodedActions(output);

            fetchDefiLlamaPrices(
                setPriceMetadata,
                Array.from(requestedMetadata.tokens).map(
                    (token) => `${getChain(traceMetadata.chain)?.defillamaPrefix}:${token}`,
                ),
                transactionResponse.metadata.timestamp,
            );

            fetchTokenMetadata(setTokenMetadata, provider, Array.from(requestedMetadata.tokens));
        } catch (e) {
            setDecodeTransactionError(e);
            console.log('failed to decode actions', e);
        }
    }, [chain, transactionResponse, traceResult, traceMetadata]);

    let transactionInfoGrid;
    if (transactionResponse) {
        transactionInfoGrid = (
            <LabelMetadataContext.Provider value={labelMetadata}>
                <PriceMetadataContext.Provider value={priceMetadata}>
                    <TransactionInfo
                        transactionResponse={transactionResponse}
                        chainInfo={getChain(transactionResponse.metadata.chain)}
                    />
                </PriceMetadataContext.Provider>
            </LabelMetadataContext.Provider>
        );
    }

    let valueChanges;
    if (transactionResponse && traceResult && traceMetadata) {
        valueChanges = (
            <LabelMetadataContext.Provider value={labelMetadata}>
                <PriceMetadataContext.Provider value={priceMetadata}>
                    <TokenMetadataContext.Provider value={tokenMetadata}>
                        <ValueChange
                            traceResult={traceResult}
                            traceMetadata={traceMetadata}
                            requestMetadata={(tokens) => {
                                fetchDefiLlamaPrices(
                                    setPriceMetadata,
                                    tokens.map((token) => `${getChain(traceMetadata.chain)?.defillamaPrefix}:${token}`),
                                    transactionResponse.metadata.timestamp,
                                );
                                fetchTokenMetadata(setTokenMetadata, provider, tokens);
                            }}
                        />
                    </TokenMetadataContext.Provider>
                </PriceMetadataContext.Provider>
            </LabelMetadataContext.Provider>
        );
    }

    let transactionActions;
    if (decodedActions && transactionResponse) {
        transactionActions = (
            <LabelMetadataContext.Provider value={labelMetadata}>
                <PriceMetadataContext.Provider value={priceMetadata}>
                    <TokenMetadataContext.Provider value={tokenMetadata}>
                        <DecodeTree
                            chain={traceMetadata ? traceMetadata.chain : ''}
                            timestamp={transactionResponse.metadata.timestamp}
                            decoded={decodedActions}
                        />
                    </TokenMetadataContext.Provider>
                </PriceMetadataContext.Provider>
            </LabelMetadataContext.Provider>
        );
    }

    let traceTree;
    if (traceResult && traceMetadata && storageMetadata) {
        traceTree = (
            <LabelMetadataContext.Provider value={labelMetadata}>
                <TraceTree
                    traceResult={traceResult}
                    traceMetadata={traceMetadata}
                    showStorageChanges={showStorageChanges}
                    setShowStorageChanges={setShowStorageChanges}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    storageMetadata={storageMetadata}
                    setStorageMetadata={setStorageMetadata}
                />
            </LabelMetadataContext.Provider>
        );
    }

    return (
        <ThemeProvider theme={theme}>
            <div className={styles.container}>
                <Home/>

                <Typography variant={'h6'} className="dark:invert">
                    Transaction Info
                </Typography>
                {transactionInfoGrid ? (
                    <span className="dark:invert">{transactionInfoGrid}</span>
                ) : (
                    <Typography variant={'body1'} className="dark:invert">
                        {fetchTransactionError
                            ? `Failed to fetch transaction: ${fetchTransactionError.message}`
                            : 'Loading...'}
                    </Typography>
                )}

                <Typography variant={'h6'} className="dark:invert">
                    Value Changes
                </Typography>
                {valueChanges ? (
                    <span className="dark:invert">{valueChanges}</span>
                ) : (
                    <Typography variant={'body1'} className="dark:invert">
                        Loading...
                    </Typography>
                )}

                <Typography variant={'h6'} className="dark:invert">
                    Decoded Actions
                </Typography>
                {transactionActions ? (
                    <span className="dark:invert">{transactionActions}</span>
                ) : (
                    <Typography variant={'body1'} className="dark:invert">
                        {decodeTransactionError
                            ? `Failed to decode transaction: ${decodeTransactionError.message}`
                            : 'Loading...'}
                    </Typography>
                )}

                <Typography variant={'h6'} className="dark:invert">
                    Call Trace
                </Typography>
                {traceTree ? (
                    <span className="dark:invert">{traceTree}</span>
                ) : (
                    <Typography variant={'body1'} className="dark:invert">
                        {fetchTraceError ? `Failed to fetch trace: ${fetchTraceError.message}` : 'Loading...'}
                    </Typography>
                )}
            </div>
        </ThemeProvider>
    );
}
