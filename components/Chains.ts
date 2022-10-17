import React from 'react';

export type ChainConfig = {
    id: string;
    displayName: string;
    nativeTokenAddress: string;
    nativeSymbol: string;
    coingeckoId: string;
    defillamaPrefix: string;
    rpcUrl: string;
    blockexplorerUrl: string;
};

export const SupportedChains = [
    {
        id: 'ethereum',
        displayName: 'Ethereum Mainnet',
        nativeTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'ETH',
        coingeckoId: 'coingecko:ethereum',
        defillamaPrefix: 'ethereum',
        rpcUrl: 'https://rpc.ankr.com/eth',
        blockexplorerUrl: 'https://etherscan.io',
    },
    {
        id: 'polygon',
        displayName: 'Polygon Mainnet',
        nativeTokenAddress: '0x0eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'MATIC',
        coingeckoId: 'coingecko:matic-network',
        defillamaPrefix: 'polygon',
        rpcUrl: 'https://rpc.ankr.com/polygon',
        blockexplorerUrl: 'https://polygonscan.com',
    },
    {
        id: 'optimism',
        displayName: 'Optimism Mainnet',
        nativeTokenAddress: '0x1eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'ETH',
        coingeckoId: 'coingecko:ethereum',
        defillamaPrefix: 'optimism',
        rpcUrl: 'https://mainnet.optimism.io',
        blockexplorerUrl: 'https://optimistic.etherscan.io',
    },
    {
        id: 'binance',
        displayName: 'Binance Mainnet',
        nativeTokenAddress: '0x2eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'BNB',
        coingeckoId: 'coingecko:binancecoin',
        defillamaPrefix: 'bsc',
        rpcUrl: 'https://rpc.ankr.com/bsc',
        blockexplorerUrl: 'https://bscscan.com',
    },
    {
        id: 'avalanche',
        displayName: 'Avalanche Mainnet',
        nativeTokenAddress: '0x3eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'AVAX',
        coingeckoId: 'coingecko:avalanche-2',
        defillamaPrefix: 'avax',
        rpcUrl: 'https://rpc.ankr.com/avalanche',
        blockexplorerUrl: 'https://snowtrace.io',
    },
    {
        id: 'arbitrum',
        displayName: 'Arbitrum Mainnet',
        nativeTokenAddress: '0x4eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'ETH',
        coingeckoId: 'coingecko:ethereum',
        defillamaPrefix: 'arbitrum',
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        blockexplorerUrl: 'https://arbiscan.io',
    },
    {
        id: 'fantom',
        displayName: 'Fantom Mainnet',
        nativeTokenAddress: '0x5eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'FTM',
        coingeckoId: 'coingecko:fantom',
        defillamaPrefix: 'fantom',
        rpcUrl: 'https://rpcapi.fantom.network',
        blockexplorerUrl: 'https://ftmscan.com',
    },
    {
        id: 'moonbeam',
        displayName: 'Moonbeam',
        nativeTokenAddress: '0x6eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'GLMR',
        coingeckoId: 'coingecko:moonbeam',
        defillamaPrefix: 'moonbeam',
        rpcUrl: 'https://rpc.api.moonbeam.network',
        blockexplorerUrl: 'https://moonscan.io',
    },
    {
        id: 'moonriver',
        displayName: 'Moonriver',
        nativeTokenAddress: '0x7eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nativeSymbol: 'MOVR',
        coingeckoId: 'coingecko:moonriver',
        defillamaPrefix: 'moonriver',
        rpcUrl: 'https://rpc.moonriver.moonbeam.network',
        blockexplorerUrl: 'https://moonriver.moonscan.io',
    },
];

export const getChain = (id: string): ChainConfig | undefined => {
    return SupportedChains.find((chain) => chain.id === id);
};

export const defaultChainConfig = (): ChainConfig => {
    return SupportedChains[0];
};

export const ChainConfigContext = React.createContext(defaultChainConfig());
