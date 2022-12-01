import { BigNumber } from 'ethers';

export const NATIVE_TOKEN = 'native_token';

export type BaseAction = {
    type: string;
};

export interface TransferAction {
    type: 'transfer';

    operator: string;

    from: string;
    to: string;

    token: string;
    amount: BigNumber;
}

export type SwapAction = {
    type: 'swap';

    operator: string;

    recipient: string;

    tokenIn: string;
    tokenOut: string;

    amountIn?: BigNumber;
    amountInMax?: BigNumber;
    amountOut?: BigNumber;
    amountOutMin?: BigNumber;
};

export type ENSRegisterAction = {
    type: 'ens-register';

    operator: string;

    owner: string;
    name: string;
    duration: number;
    cost: bigint;

    resolver?: string;
    addr?: string;
};

export type SupplyAction = {
    type: 'supply';

    operator: string;

    supplier: string;

    supplyToken: string;

    amount: BigNumber;
}

export type WrapNativeTokenAction = {
    type: 'wrap-native-token';

    token: string;

    operator: string;
    amount: bigint;
};

export type UnwrapNativeTokenAction = {
    type: 'unwrap-native-token';

    token: string;

    operator: string;
    amount: bigint;
};

// TODO: Adapt for ERC1155 batch purchases
export type BuyNFTAction = {
    type: 'buy-nft';

    operator: string;
    buyer: string;

    collection: string;
    tokenId: string;
};

export type Action =
    TransferAction
    | SwapAction
    | ENSRegisterAction
    | WrapNativeTokenAction
    | UnwrapNativeTokenAction
    | SupplyAction
    | BuyNFTAction
    ;
