import * as React from 'react';
import { ThemeProvider, Typography } from '@mui/material';
import { Result, TraceMetadata } from '../../components/types';
import { theme } from '../../components/helpers';
import { precompiles } from '../../components/precompiles';
import { ethers } from 'ethers';
import styles from '../../styles/Home.module.css';
import { useRouter } from 'next/router';
import { BaseProvider, JsonRpcProvider } from '@ethersproject/providers';
import { TransactionInfo } from '../../components/transaction-info/TransactionInfo';
import { DecodeTree } from '../../components/decoder/DecodeTree';
import { ChainConfig, ChainConfigContext, defaultChainConfig, getChain } from '../../components/Chains';
import Home from '../index';
import { ValueChange } from '../../components/value-change/ValueChange';
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
import { TraceTree } from '../../components/trace/TraceTree';
import { defaultLabelMetadata, LabelMetadata, LabelMetadataContext } from '../../components/metadata/labels';
import { TransactionMetadata, TransactionMetadataContext } from '../../components/metadata/transaction';
import { doApiRequest, TraceEntry, TraceResponse } from '../../components/api';

export default function TransactionViewer() {
    console.log('rendering main view');

    const router = useRouter();
    const { chain, txhash } = router.query;

    const [chainConfig, setChainConfig] = React.useState<ChainConfig>(defaultChainConfig());
    const [provider, setProvider] = React.useState<BaseProvider>();

    const [transactionMetadata, setTransactionMetadata] = React.useState<Result<TransactionMetadata>>();

    const [traceResponse, setTraceResponse] = React.useState<Result<TraceResponse>>();

    const [labelMetadata, setLabelMetadata] = React.useState<LabelMetadata>(defaultLabelMetadata());
    const [priceMetadata, setPriceMetadata] = React.useState<PriceMetadata>(defaultPriceMetadata());
    const [tokenMetadata, setTokenMetadata] = React.useState<TokenMetadata>(defaultTokenMetadata());

    const [traceResult, setTraceResult] = React.useState<TraceResponse>();
    const [traceMetadata, setTraceMetadata] = React.useState<TraceMetadata>();

    React.useMemo(() => {
        if (!chain || Array.isArray(chain)) return;
        if (!txhash || Array.isArray(txhash)) return;

        const chainConfig = getChain(chain);
        if (!chainConfig) return;

        setChainConfig(chainConfig);

        const provider = new JsonRpcProvider(chainConfig.rpcUrl);
        setProvider(provider);

        setTokenMetadata({
            ...defaultTokenMetadata(),
            updater: setTokenMetadata,
        });
        setPriceMetadata({
            ...defaultPriceMetadata(),
            updater: setPriceMetadata,
        });
        setTraceResult(undefined);
        setTransactionMetadata(undefined);

        Promise.all([provider.getTransaction(txhash), provider.getTransactionReceipt(txhash)])
            .then(([transaction, receipt]) => {
                provider.getBlock(receipt.blockHash).then((block) => {
                    console.log('loaded transaction metadata', transaction, receipt, block);
                    setTransactionMetadata({
                        ok: true,
                        result: {
                            block: block,
                            transaction: transaction,
                            receipt: receipt,
                        },
                    });

                    fetchDefiLlamaPrices(setPriceMetadata, [chainConfig.coingeckoId], block.timestamp).catch((e) => {
                        console.log('failed to fetch price', e);
                    });
                });
            })
            .catch((e) => {
                setTransactionMetadata({
                    ok: false,
                    error: e,
                });
                console.log('failed to fetch transaction', e);
            });

        doApiRequest<TraceResponse>(`/api/v1/trace/${chain}/${txhash}`)
            .then((traceResponse) => {
                console.log('loaded trace', traceResponse);

                let labels: Record<string, string> = {};
                let customLabels: Record<string, Record<string, string>> = {};
                try {
                    customLabels = JSON.parse(localStorage.getItem('pref:labels') || '{}');
                } catch {}
                if (!(chain in customLabels)) {
                    customLabels[chain] = {};
                }

                for (let address of Object.keys(precompiles)) {
                    labels[address] = 'Precompile';
                }

                let metadata: TraceMetadata = {
                    abis: {},
                    nodesByPath: {},
                };

                let preprocess = (node: TraceEntry) => {
                    metadata.nodesByPath[node.path] = node;

                    if (node.type === 'call') {
                        node.children.forEach(preprocess);
                    }
                };
                preprocess(traceResponse.entrypoint);

                for (let [address, entries] of Object.entries(traceResponse.addresses)) {
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
                        labels[address] = `Vyper_contract (0x${address.substring(2, 6)}..${address.substring(38, 42)})`;
                    }
                }

                Object.keys(labels).forEach((addr) => delete customLabels[chain][addr]);
                localStorage.setItem('pref:labels', JSON.stringify(customLabels));

                setTraceResult(traceResponse);
                setTraceMetadata(metadata);
                setLabelMetadata({
                    updater: setLabelMetadata,
                    labels: labels,
                    customLabels: customLabels,
                });
                setTraceResponse({
                    ok: true,
                    result: traceResponse,
                });
            })
            .catch((e) => {
                setTraceResponse({
                    ok: false,
                    error: e,
                });
                console.log('failed to fetch trace', e);
            });
    }, [chain, txhash]);

    let transactionInfoGrid;
    if (transactionMetadata) {
        if (transactionMetadata.ok) {
            transactionInfoGrid = (
                <TransactionMetadataContext.Provider value={transactionMetadata.result}>
                    <ChainConfigContext.Provider value={chainConfig}>
                        <LabelMetadataContext.Provider value={labelMetadata}>
                            <PriceMetadataContext.Provider value={priceMetadata}>
                                <TransactionInfo />
                            </PriceMetadataContext.Provider>
                        </LabelMetadataContext.Provider>
                    </ChainConfigContext.Provider>
                </TransactionMetadataContext.Provider>
            );
        } else {
            transactionInfoGrid = <>Failed to fetch transaction: {transactionMetadata.error}</>;
        }
    }

    let valueChanges;
    if (transactionMetadata && traceResult && traceMetadata && provider) {
        if (transactionMetadata.ok) {
            valueChanges = (
                <TransactionMetadataContext.Provider value={transactionMetadata.result}>
                    <ChainConfigContext.Provider value={chainConfig}>
                        <LabelMetadataContext.Provider value={labelMetadata}>
                            <PriceMetadataContext.Provider value={priceMetadata}>
                                <TokenMetadataContext.Provider value={tokenMetadata}>
                                    <ValueChange
                                        traceResult={traceResult}
                                        traceMetadata={traceMetadata}
                                        provider={provider}
                                    />
                                </TokenMetadataContext.Provider>
                            </PriceMetadataContext.Provider>
                        </LabelMetadataContext.Provider>
                    </ChainConfigContext.Provider>
                </TransactionMetadataContext.Provider>
            );
        } else {
            transactionInfoGrid = <>Failed to fetch transaction or trace</>;
        }
    }

    let transactionActions;
    if (transactionMetadata && traceResult && traceMetadata && provider) {
        if (transactionMetadata.ok) {
            transactionActions = (
                <TransactionMetadataContext.Provider value={transactionMetadata.result}>
                    <ChainConfigContext.Provider value={chainConfig}>
                        <LabelMetadataContext.Provider value={labelMetadata}>
                            <PriceMetadataContext.Provider value={priceMetadata}>
                                <TokenMetadataContext.Provider value={tokenMetadata}>
                                    <DecodeTree
                                        traceResult={traceResult}
                                        traceMetadata={traceMetadata}
                                        provider={provider}
                                    />
                                </TokenMetadataContext.Provider>
                            </PriceMetadataContext.Provider>
                        </LabelMetadataContext.Provider>
                    </ChainConfigContext.Provider>
                </TransactionMetadataContext.Provider>
            );
        } else {
            transactionActions = <>Failed to fetch transaction</>;
        }
    }

    let traceTree;
    if (traceResult && traceMetadata) {
        traceTree = (
            <ChainConfigContext.Provider value={chainConfig}>
                <LabelMetadataContext.Provider value={labelMetadata}>
                    <TraceTree traceResult={traceResult} traceMetadata={traceMetadata} />
                </LabelMetadataContext.Provider>
            </ChainConfigContext.Provider>
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
