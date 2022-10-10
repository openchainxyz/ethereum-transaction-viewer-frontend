import * as React from 'react';
import { Alert, AlertColor, Collapse, IconButton, ThemeProvider, Typography } from '@mui/material';
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

export default function TransactionViewer() {
    const router = useRouter();
    const { chain, txhash } = router.query;

    const [query, setQuery] = React.useState('');

    React.useEffect(() => {
        if (!chain || Array.isArray(chain)) return;
        if (!txhash || Array.isArray(txhash)) return;

        setQuery(txhash);
        doSearch(chain, txhash);
    }, [chain, txhash]);

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
    const [tokenMetadata, setTokenMetadata] = React.useState<TokenMetadata>({
        tokens: {
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': {
                symbol: 'ETH',
                decimals: 18,
            },
        },
    });

    const [expanded, setExpanded] = React.useState<string[]>([]);

    const doSearch = (chain: string, txhash: string) => {
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

                fetch(`https://coins.llama.fi/prices/current/coingecko:ethereum`)
                    .then((resp) => resp.json())
                    .then((resp) => {
                        setPriceMetadata((prevState) => {
                            let newState = { ...prevState };
                            newState.currentPrices['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = BigNumber.from(
                                (resp.coins['coingecko:ethereum'].price * 10000) | 1,
                            );
                            return newState;
                        });
                    });

                fetch(`https://coins.llama.fi/prices/historical/${resp.metadata.timestamp}/coingecko:ethereum`)
                    .then((resp) => resp.json())
                    .then((resp) => {
                        setPriceMetadata((prevState) => {
                            let newState = { ...prevState };
                            newState.historicalPrices['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = BigNumber.from(
                                (resp.coins['coingecko:ethereum'].price * 10000) | 1,
                            );
                            return newState;
                        });
                    });
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
                    labels: {},
                    abis: {},
                    nodesById: {},
                };

                for (let address of Object.keys(precompiles)) {
                    metadata.labels[address] = 'Precompile';
                }
                metadata.labels['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = 'Ethereum';

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
        let batchProvider = new JsonRpcBatchProvider('https://rpc.ankr.com/eth');

        let allTokens = Array.from(decodedActions.requestedMetadata.tokens)
            .map((token) => `ethereum:${token}`)
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
                    let priceId = `ethereum:${token}`;

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

    let transactionInfoGrid;
    if (transactionResponse) {
        transactionInfoGrid = (
            <TransactionInfo transactionResponse={transactionResponse} priceMetadata={priceMetadata} />
        );
    }

    let transactionActions;
    if (decodedActions) {
        transactionActions = (
            <DecodeTree
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
                <Head>
                    <title>Ethereum Transaction Viewer</title>
                    <meta name="description" content="View and trace Ethereum transactions" />
                    <meta property="og:type" content="website" />
                    <meta property="og:title" content="Ethereum Transaction Viewer" />
                    <meta property="og:description" content="View and trace Ethereum transactions" />
                    <meta property="og:image" content="https://tx.eth.samczsun.com/favicon.png" />
                    <meta property="twitter:card" content="summary" />
                    <meta property="twitter:title" content="Ethereum Transaction Viewer" />
                    <meta property="twitter:description" content="View and trace Ethereum transactions" />
                    <meta property="twitter:url" content="https://tx.eth.samczsun.com" />
                    <meta property="twitter:image" content="https://tx.eth.samczsun.com/favicon.png" />
                    <meta property="twitter:site" content="@samczsun" />
                    <link rel="icon" href="/favicon.png" />
                </Head>
                <div className="max-w-[900px] mx-auto text-[#19232D] relative">
                    <Box className="flex flex-col" justifyContent="left">
                        <div className="flex my-5">
                            <div className={'md:w-5 w-4 my-auto mr-3 flex hover:opacity-60'}>
                                <Link href={'/'}>
                                    <Image src="/favicon.png" width={'512'} height={'512'} layout="intrinsic" />
                                </Link>
                            </div>
                            <h1 className="md:text-xl text-sm -tracking-wider font-inter">
                                Ethereum Transaction Viewer
                            </h1>
                            <a
                                className="md:w-5 w-4 my-auto mr-4 flex ml-auto hover:opacity-60"
                                href="https://github.com/samczsun/ethereum-transaction-viewer-frontend"
                                target={'_blank'}
                                rel={'noreferrer noopener'}
                            >
                                <Image src="/images/github.png" width={'512'} height={'512'} layout="intrinsic" />
                            </a>
                            <a
                                className="md:w-5 w-4 my-auto mr-4 flex hover:opacity-60"
                                href="https://twitter.com/samczsun"
                                target={'_blank'}
                                rel={'noreferrer noopener'}
                            >
                                <Image src="/images/twitter.png" width={'512'} height={'512'} layout="intrinsic" />
                            </a>
                        </div>

                        <div className="h-[1px] w-full bg-[#0000002d]"></div>
                    </Box>
                    <div className="flex flex-row w-full place-content-center">
                        <div
                            className="flex-row flex place-content-center relative w-4/5 my-5 text-[#606161]"
                            style={{ fontFamily: 'RiformaLL' }}
                        >
                            <input
                                id="search"
                                type="text"
                                placeholder="Enter txhash..."
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyUp={(event) => {
                                    if (event.key === 'Enter') {
                                        router.push(`/ethereum/${query}`);
                                    }
                                }}
                                className="w-full outline-1 outline outline-[#0000002d] py-2 px-3"
                            />
                            <button
                                className="my-auto flex  hover:bg-[#00e1003a] h-full outline-1 outline outline-[#0000002d] rounded-none text-lg py-2 px-3 z-10 ml-[1px] hover:text-black"
                                onClick={() => {
                                    router.push(`/ethereum/${query}`);
                                }}
                                disabled={isSearching}
                            >
                                <h1 className="my-auto">View</h1>
                            </button>
                        </div>
                    </div>
                    <Collapse in={!alertData.dismissed}>
                        <div className="mx-auto flex place-content-center">
                            <Alert
                                severity={alertData.severity}
                                action={
                                    <IconButton
                                        aria-label="close"
                                        color="inherit"
                                        size="small"
                                        onClick={() => {
                                            setAlertData((prevState) => ({
                                                ...prevState,
                                                dismissed: true,
                                            }));
                                        }}
                                    >
                                        <CloseIcon fontSize="inherit" />
                                    </IconButton>
                                }
                                sx={{ mb: 2 }}
                            >
                                {alertData.message}
                            </Alert>
                        </div>
                    </Collapse>
                </div>

                <Typography variant={'h6'}>Transaction Info</Typography>
                {transactionInfoGrid || <Typography variant={'body1'}>Loading...</Typography>}

                <Typography variant={'h6'}>Decoded Actions</Typography>
                {transactionActions || <Typography variant={'body1'}>Loading...</Typography>}

                <Typography variant={'h6'}>Call Trace</Typography>
                {traceTree || <Typography variant={'body1'}>Loading...</Typography>}
            </div>
        </ThemeProvider>
    );
}
