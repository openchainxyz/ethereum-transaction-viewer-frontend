import React from 'react';

export type MetadataContext<T> = T & { setMetadata: React.Dispatch<React.SetStateAction<T>> };

export const defaultContext = <T>(defaultValue: T): MetadataContext<T> => {
    return {
        ...defaultValue,
        setMetadata: () => {},
    };
};
