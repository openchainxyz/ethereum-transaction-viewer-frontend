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


export type Action = TransferAction | SwapAction | ENSRegisterAction;