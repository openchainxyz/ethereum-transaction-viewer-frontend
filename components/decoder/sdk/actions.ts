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
    amount: bigint;
}

export interface MintERC20Action {
    type: 'mint-erc20';

    operator: string;

    to: string;

    token: string;
    amount: bigint;
}

export interface BurnERC20Action {
    type: 'burn-erc20';

    operator: string;

    from: string;

    token: string;
    amount: bigint;
}

export type SwapAction = {
    type: 'swap';

    exchange: string;

    operator: string;

    recipient: string;

    tokenIn: string;
    tokenOut: string;

    amountIn?: bigint;
    amountInMax?: bigint;
    amountOut?: bigint;
    amountOutMin?: bigint;
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

    amount: bigint;
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

// TODO: Add support for batch minting a la ERC1155
export type MintNFTAction = {
    type: 'nft-mint';

    operator: string;
    recipient: string;

    collection: string;
    tokenId?: bigint;

    buyToken?: string;
    buyAmount?: bigint;
}


export type Action =
    MintERC20Action
    | BurnERC20Action
    | TransferAction
    | SwapAction
    | ENSRegisterAction
    | WrapNativeTokenAction
    | UnwrapNativeTokenAction
    | SupplyAction
    | MintNFTAction
    ;
