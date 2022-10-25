import React from 'react';

export type PreimageMetadata = {
    updater: React.Dispatch<React.SetStateAction<PreimageMetadata>>;
    preimages: Record<string, string>;
};

export const defaultPreimageMetadata = (): PreimageMetadata => {
    return {
        updater: () => {},
        preimages: {},
    };
};

export const PreimageMetadataContext = React.createContext(defaultPreimageMetadata());
