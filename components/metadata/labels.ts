import React from 'react';

export type LabelMetadata = {
    updater: React.Dispatch<React.SetStateAction<LabelMetadata>>;
    labels: Record<string, string>;
    customLabels: Record<string, Record<string, string>>;
};

export const defaultLabelMetadata = (): LabelMetadata => {
    return {
        updater: () => {},
        labels: {},
        customLabels: {},
    };
};

export const LabelMetadataContext = React.createContext(defaultLabelMetadata());
