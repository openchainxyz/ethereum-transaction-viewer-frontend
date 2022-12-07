import React from 'react';
import { Block, TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider';
import { Result } from '../types';

export type TransactionMetadata = {
    timestamp: number;
    transaction: TransactionResponse;
    receipt: TransactionReceipt;
};

export const TransactionMetadataContext = React.createContext<TransactionMetadata>({} as TransactionMetadata);
