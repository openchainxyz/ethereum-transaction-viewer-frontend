import * as React from 'react';
import {
    Alert,
    AlertColor,
    Button,
    Collapse,
    FormControl,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    Select,
    TextField,
    ThemeProvider,
    Typography,
} from '@mui/material';
import {
    PriceMetadata,
    SlotInfo,
    StorageMetadata,
    TokenMetadata,
    TraceEntry,
    TraceEntrySload,
    TraceEntrySstore,
    TraceMetadata,
    TraceResult,
    TransactionInfoResponse,
} from '../../components/types';
import { apiEndpoint, findAffectedContract, theme } from '../../components/helpers';
import { precompiles } from '../../components/precompiles';
import { BigNumber, ethers } from 'ethers';
import { knownSlots } from '../../components/knownSlots';
import BN from 'bn.js';
import styles from '../../styles/Home.module.css';
import Head from 'next/head';
import { Box } from '@mui/system';
import Image from 'next/image';
import CloseIcon from '@mui/icons-material/Close';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Formatter, JsonRpcBatchProvider } from '@ethersproject/providers';
import { TransactionInfo } from '../../components/transactioninfo/TransactionInfo';
import { decode, DecodeNode } from '../../components/decoder/decoder';
import { TraceTree } from '../../components/trace/TraceTree';
import { DecodeTree } from '../../components/decoder/DecodeTree';
import { DecodeResult } from '../../components/decoder/types';
import { defaultAbiCoder } from '@ethersproject/abi';
import { ParamType } from 'ethers/lib/utils';
import { getChain, SupportedChains } from '../../components/Chains';
import { LoadingButton } from '@mui/lab';
import SearchIcon from '@mui/icons-material/Search';
import Home from '../index';

type APIResponseError = {
    ok: false;
    error: string;
};

type APIResponseSuccess<T> = {
    ok: true;
    result: T;
};

type APIResponse<T> = APIResponseError | APIResponseSuccess<T>;

const doApiRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
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

const defaultTokenMetadata = (): TokenMetadata => {
    return {
        tokens: SupportedChains.reduce((o, chain) => {
            return { ...o, [chain.nativeTokenAddress]: { symbol: chain.nativeSymbol, decimals: 18 } };
        }, {}),
    };
};

const fetchCoingeckoPrices = (ids: string[], when: number): Promise<[any, any]> => {
    return Promise.all([
        fetch(`https://coins.llama.fi/prices/current/${ids.join(',')}`)
            .then((resp) => resp.json())
            .then((resp) => resp.coins),
        fetch(`https://coins.llama.fi/prices/historical/${when}/${ids.join(',')}`)
            .then((resp) => resp.json())
            .then((resp) => resp.coins),
    ]);
};

export default function TransactionViewer() {
    const router = useRouter();
    const { chain: queryChain, txhash: queryTxhash } = router.query;

    const [chain, setChain] = React.useState('');
    const [txhash, setTxhash] = React.useState('');

    React.useEffect(() => {
        if (!queryChain || Array.isArray(queryChain)) return;
        if (!queryTxhash || Array.isArray(queryTxhash)) return;

        setChain(queryChain);
        setTxhash(queryTxhash);
        doSearch(queryChain, queryTxhash);
    }, [queryChain, queryTxhash]);

    const [isSearching, setIsSearching] = React.useState(false);

    const [alertData, setAlertData] = React.useState({
        dismissed: true,
        severity: 'success' as AlertColor,
        message: '',
    });

    const [transactionResponse, setTransactionResponse] = React.useState<TransactionInfoResponse | null>(null);
    const [decodedActions, setDecodedActions] = React.useState<DecodeResult | null>(null);
    const [traceResult, setTraceResult] = React.useState(null as TraceResult | null);
    const [traceMetadata, setTraceMetadata] = React.useState(null as TraceMetadata | null);
    const [showStorageChanges, setShowStorageChanges] = React.useState<Set<string>>(new Set());
    const [storageMetadata, setStorageMetadata] = React.useState(null as StorageMetadata | null);

    const [priceMetadata, setPriceMetadata] = React.useState<PriceMetadata>({
        currentPrices: {},
        historicalPrices: {},
    });
    const [tokenMetadata, setTokenMetadata] = React.useState<TokenMetadata>(defaultTokenMetadata());

    const [expanded, setExpanded] = React.useState<string[]>([]);

    const doSearch = (chain: string, txhash: string) => {
        const chainConfig = getChain(chain);
        if (!chainConfig) return;

        setIsSearching(true);
        setPriceMetadata({
            currentPrices: {},
            historicalPrices: {},
        });
        setTransactionResponse(null);
        setDecodedActions(null);
        setTraceResult(null);
        setTraceMetadata(null);
        setStorageMetadata(null);
        setShowStorageChanges(new Set());
        setTokenMetadata(defaultTokenMetadata());

        setAlertData((prevState) => ({
            ...prevState,
            dismissed: true,
        }));
        doApiRequest<TransactionInfoResponse>(`/api/v1/tx/${chain}/${txhash}`)
            .then((resp) => {
                let formatter = new Formatter();

                if (resp.receipt.root === '0x') resp.receipt.root = undefined;
                resp.receipt = formatter.receipt(resp.receipt);

                resp.transaction = formatter.transaction(resp.metadata.rawTransaction);

                setTransactionResponse(resp);

                fetchCoingeckoPrices([chainConfig.coingeckoId], resp.metadata.timestamp).then(
                    ([current, historical]) => {
                        setPriceMetadata((prevState) => {
                            let newState = { ...prevState };
                            if (current[chainConfig.coingeckoId]) {
                                newState.currentPrices[chainConfig.nativeTokenAddress] = BigNumber.from(
                                    (current[chainConfig.coingeckoId].price * 10000) | 1,
                                );
                            }
                            if (historical[chainConfig.coingeckoId]) {
                                newState.historicalPrices[chainConfig.nativeTokenAddress] = BigNumber.from(
                                    (historical[chainConfig.coingeckoId].price * 10000) | 1,
                                );
                            }
                            return newState;
                        });
                    },
                );
            })
            .catch((e) => {
                setIsSearching(false);
                setAlertData({
                    dismissed: false,
                    severity: 'error',
                    message: `An error occurred: ${e.message}`,
                });
                console.log(e);
            });

        doApiRequest<TraceResult>(`/api/v1/trace/${chain}/${txhash}`)
            .then((resp) => {
                setIsSearching(false);

                console.log('loaded trace result', resp);

                let metadata: TraceMetadata = {
                    chain: resp.chain,
                    labels: {},
                    abis: {},
                    nodesById: {},
                };

                for (let address of Object.keys(precompiles)) {
                    metadata.labels[address] = 'Precompile';
                }

                for (let [address, entries] of Object.entries(resp.addresses)) {
                    metadata.abis[address] = {};
                    for (let [codehash, info] of Object.entries(entries)) {
                        metadata.labels[address] = metadata.labels[address] || info.label;

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

                for (let address of Object.keys(metadata.labels)) {
                    if (metadata.labels[address] === 'Vyper_contract') {
                        metadata.labels[address] = `Vyper_contract (0x${address.substring(2, 6)}..${address.substring(
                            38,
                            42,
                        )})`;
                    }
                }
                console.log('loaded abis');

                let defaultExpanded: string[] = [];
                let allStorageSlots = [] as (TraceEntrySload | TraceEntrySstore)[];
                let preprocess = (node: TraceEntry) => {
                    metadata.nodesById[node.id] = node;

                    if (node.type === 'call' || node.type === 'create') {
                        if (node.gasUsed > 32000 || node.id.split('.').length <= 4) {
                            defaultExpanded.push(node.id);
                        }
                    }

                    if (node.type === 'call' || node.type === 'create') {
                        node.children.forEach(preprocess);
                    } else if (node.type === 'sload' || node.type === 'sstore') {
                        allStorageSlots.push(node);
                    }
                };
                preprocess(resp.trace);
                console.log('preprocessed nodes');

                // first, augment our preimages by hashing each potential storage slot
                // this is because solidity inlines the offset at which a dynamic array will be placed
                // so we don't know what it is from the trace
                allStorageSlots.forEach((node) => {
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

                allStorageSlots.forEach((node) => {
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

                        if (preimage.length === 2 + 64 + 64) {
                            // mapping
                            updateSlotInfo(parentNode.to, parentNode.codehash, slot, {
                                type: 'mapping',
                                resolved: false,
                                variables: {},

                                offset: preimageOffset,
                                baseSlot: '0x' + preimage.substring(2 + 64, 2 + 64 + 64),
                                mappingKey: '0x' + preimage.substring(2, 2 + 64),
                            });
                            slot = '0x' + preimage.substring(2 + 64, 2 + 64 + 64);
                        } else if (preimage.length === 2 + 64) {
                            updateSlotInfo(parentNode.to, parentNode.codehash, slot, {
                                type: 'array',
                                resolved: false,
                                variables: {},

                                offset: preimageOffset,
                                baseSlot: '0x' + preimage.substring(2, 2 + 64),
                            });

                            slot = '0x' + preimage.substring(2, 2 + 64);
                        } else {
                            break;
                        }
                    }
                });
                console.log('done');

                setTraceResult(resp);
                setTraceMetadata(metadata);
                setStorageMetadata(newStorageMetadata);
                setShowStorageChanges(new Set());
                setExpanded(defaultExpanded);

                try {
                    let decoded = decode(resp, metadata);
                    console.log('requested metadata for ', decoded.requestedMetadata);
                    setDecodedActions(decoded);
                } catch (e) {
                    console.log('failed to decode actions', e);
                }
            })
            .catch((e) => {
                setIsSearching(false);
                setAlertData({
                    dismissed: false,
                    severity: 'error',
                    message: `An error occurred: ${e.message}`,
                });
                console.log(e);
            });
    };

    React.useEffect(() => {
        if (!transactionResponse || !decodedActions) return;

        let provider = new ethers.providers.AnkrProvider();
        let batchProvider = new JsonRpcBatchProvider(getChain(chain)?.rpcUrl);

        let allTokens = Array.from(decodedActions.requestedMetadata.tokens)
            .map((token) => `${getChain(chain)?.defillamaPrefix}:${token}`)
            .join(',');
        Promise.all([
            fetch(`https://coins.llama.fi/prices/current/${allTokens}`)
                .then((resp) => resp.json())
                .then((resp) => resp.coins),
            fetch(`https://coins.llama.fi/prices/historical/${transactionResponse.metadata.timestamp}/${allTokens}`)
                .then((resp) => resp.json())
                .then((resp) => resp.coins),
        ])
            .then(([currentPrices, historicalPrices]) => {
                decodedActions.requestedMetadata.tokens.forEach((token) => {
                    let priceId = `${getChain(chain)?.defillamaPrefix}:${token}`;

                    let historicalPrice = historicalPrices[priceId]?.price;
                    let currentPrice = currentPrices[priceId]?.price;

                    if (historicalPrice) {
                        setPriceMetadata((prevState) => {
                            let newState = { ...prevState };
                            newState.currentPrices[token] = BigNumber.from((currentPrice * 10000) | 1);
                            return newState;
                        });
                    }
                    if (historicalPrice) {
                        setPriceMetadata((prevState) => {
                            let newState = { ...prevState };
                            newState.historicalPrices[token] = BigNumber.from((historicalPrice * 10000) | 1);
                            return newState;
                        });
                    }
                });
            })
            .catch((e) => {
                console.log('failed to get prices', e);
            });

        decodedActions.requestedMetadata.tokens.forEach((token) => {
            Promise.all([
                batchProvider
                    .call({
                        to: token,
                        data: ethers.utils.id('decimals()'),
                    })
                    .catch(console.log),
                batchProvider
                    .call({
                        to: token,
                        data: ethers.utils.id('symbol()'),
                    })
                    .catch(console.log),
            ])
                .then(([decimals, symbol]) => {
                    let newMeta = {};
                    if (decimals) {
                        let bigDecimals = BigNumber.from(decimals);
                        if (bigDecimals.lt(BigNumber.from(255))) {
                            newMeta.decimals = bigDecimals.toNumber();
                        }
                    }

                    let parsedSymbol;
                    if (symbol) {
                        if (symbol.length === 66) {
                            parsedSymbol = ethers.utils.toUtf8String(symbol.replace(/(00)+$/g, ''));
                        } else {
                            try {
                                let results = defaultAbiCoder.decode([ParamType.from('string')], symbol);
                                parsedSymbol = results[0].toString();
                            } catch {}
                        }
                    }

                    if (parsedSymbol) {
                        newMeta.symbol = parsedSymbol;
                    }
                    setTokenMetadata((prevState) => {
                        let newState = { ...prevState };
                        newState.tokens[token] = { ...newState.tokens[token], ...newMeta };
                        return newState;
                    });
                })
                .catch((e) => {
                    console.log('failed to fetch metadata for', token);
                });
        });
    }, [transactionResponse, decodedActions]);

    let transactionInfoGrid = React.useMemo(() => {
        if (!transactionResponse) return null;

        return (
            <TransactionInfo
                transactionResponse={transactionResponse}
                priceMetadata={priceMetadata}
                chain={transactionResponse.metadata.chain}
            />
        );
    }, [transactionResponse, priceMetadata, chain]);

    let transactionActions;
    if (decodedActions) {
        transactionActions = (
            <DecodeTree
                chain={traceMetadata ? traceMetadata.chain : ''}
                decoded={decodedActions}
                labels={traceMetadata ? traceMetadata.labels : {}}
                prices={priceMetadata}
                tokens={tokenMetadata}
            />
        );
    }

    let traceTree;
    if (traceResult && traceMetadata && storageMetadata) {
        traceTree = (
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
        );
    }

    return (
        <ThemeProvider theme={theme}>
            <div className={styles.container}>
                <Home />

                <Typography variant={'h6'} className="dark:invert">
                    Transaction Info
                </Typography>
                {transactionInfoGrid ? (
                    <span className="dark:invert">{transactionInfoGrid}</span>
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
                        Loading...
                    </Typography>
                )}

                <Typography variant={'h6'} className="dark:invert">
                    Call Trace
                </Typography>
                {traceTree ? (
                    <span className="dark:invert">{traceTree}</span>
                ) : (
                    <Typography variant={'body1'} className="dark:invert">
                        Loading...
                    </Typography>
                )}
            </div>
        </ThemeProvider>
    );
}
