import * as React from 'react';
import { defaultPriceMetadata } from './prices';
import { defaultContext } from './types';

export type SearchMetadata = {
    chain: string;
    txhash: string;
};

export const defaultSearchMetadata = () => {
    return {
        chain: 'ethereum',
        txhash: '',
    };
};

export const SearchMetadataContext = React.createContext(defaultContext(defaultSearchMetadata()));
