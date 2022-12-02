import { defaultAbiCoder, ParamType } from '@ethersproject/abi';
import { BaseProvider } from '@ethersproject/providers';
import { ethers } from 'ethers';
import React from 'react';
import { SupportedChains } from '../Chains';
const NATIVE_TOKEN = 'native_token';

export type TokenInfo = {
    symbol?: string;
    decimals?: number;
    isNft?: boolean;
};

export type TokenMetadata = {
    updater: React.Dispatch<React.SetStateAction<TokenMetadata>>;
    status: Record<string, 'pending' | 'fetched'>;
    tokens: Record<string, TokenInfo>;
};

export const defaultTokenMetadata = (): TokenMetadata => {
    return {
        updater: () => { },
        status: SupportedChains.reduce((o, chain) => {
            return {
                ...o,
                [chain.nativeTokenAddress]: 'fetched',
            };
        }, {}),
        tokens: SupportedChains.reduce((o, chain) => {
            return {
                ...o,
                [chain.nativeTokenAddress]: {
                    symbol: chain.nativeSymbol,
                    decimals: 18,
                    isNft: false,
                },
            };
        }, {}),
    };
};

export const TokenMetadataContext = React.createContext(defaultTokenMetadata());

export const fetchTokenMetadata = (
    setMetadata: React.Dispatch<React.SetStateAction<TokenMetadata>>,
    provider: BaseProvider,
    tokens: Array<string>,
) => {
    return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
            setMetadata((prevState) => {
                const filteredTokens = tokens.filter(
                    (token) => prevState.status[token] === undefined && token != NATIVE_TOKEN,
                );

                if (filteredTokens.length === 0) {
                    resolve();
                    return prevState;
                }

                const newState = { ...prevState };
                filteredTokens.forEach((token) => (newState.status[token] = 'pending'));

                Promise.all(
                    filteredTokens
                        .map((token) => {
                            return [
                                provider
                                    .call({
                                        to: token,
                                        data: ethers.utils.id('decimals()').substring(0, 10),
                                    })
                                    .then((decimalsHex) => {
                                        const decimals = BigInt(decimalsHex);

                                        if (decimals > 255n) {
                                            throw new Error(
                                                `tried to fetch decimals for token ${token} but got illegal value ${decimalsHex}`,
                                            );
                                        }

                                        return {
                                            token: token,
                                            type: 'decimals',
                                            decimals: Number(decimals),
                                        } as { token: string; type: 'decimals'; decimals: number };
                                    })
                                    .catch(console.error),
                                provider
                                    .call({
                                        to: token,
                                        data: ethers.utils.id('symbol()').substring(0, 10),
                                    })
                                    .then((symbolHex) => {
                                        let symbol;

                                        if (symbolHex.length === 66) {
                                            symbol = ethers.utils.toUtf8String(symbolHex.replace(/(00)+$/g, ''));
                                        } else {
                                            try {
                                                let results = defaultAbiCoder.decode(
                                                    [ParamType.from('string')],
                                                    symbolHex,
                                                );
                                                symbol = results[0].toString();
                                            } catch (e) {
                                                throw new Error(
                                                    `tried to fetch symbol for token ${token} but got illegal value ${symbolHex}`,
                                                );
                                            }
                                        }

                                        return {
                                            token: token,
                                            type: 'symbol',
                                            symbol: symbol,
                                        } as { token: string; type: 'symbol'; symbol: string };
                                    })
                                    .catch(console.error),
                                provider
                                    .call({
                                        to: token,
                                        data:
                                            ethers.utils.id('supportsInterface(bytes4)').substring(0, 10) +
                                            defaultAbiCoder.encode(['bytes4'], ['0x80ac58cd']).substring(2),
                                    })
                                    .then((isNftHex) => {
                                        const isNft = isNftHex.length > 2 ? BigInt(isNftHex) == 1n : false;

                                        return {
                                            token: token,
                                            type: 'isNft',
                                            isNft: isNft,
                                        } as { token: string; type: 'isNft'; isNft: boolean };
                                    })
                                    .catch(console.error),
                            ];
                        })
                        .flatMap((x) => x),
                )
                    .then((results) => {
                        resolve();

                        setMetadata((prevState) => {
                            const newState = { ...prevState };
                            filteredTokens.forEach((token) => {
                                newState.status[token] = 'fetched';
                                newState.tokens[token] = {};
                            });

                            results.forEach((result) => {
                                if (!result) return;

                                if (result.type === 'decimals') {
                                    newState.tokens[result.token].decimals = result.decimals;
                                } else if (result.type === 'symbol') {
                                    newState.tokens[result.token].symbol = result.symbol;
                                } else if (result.type === 'isNft') {
                                    newState.tokens[result.token].isNft = result.isNft;
                                }
                            });

                            return newState;
                        });
                    })
                    .catch(reject);

                return newState;
            });
        });
    });
};
