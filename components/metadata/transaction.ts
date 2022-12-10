import { TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider';
import React from 'react';

export type MinedTransaction = {
    receipt: TransactionReceipt;
    timestamp: number;
};

export type TransactionMetadata = {
    transaction: TransactionResponse;
    result: MinedTransaction | null;
};

export const TransactionMetadataContext = React.createContext<TransactionMetadata>({} as TransactionMetadata);
