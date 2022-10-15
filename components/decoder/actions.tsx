import { BigNumber } from 'ethers';

export const NATIVE_TOKEN = 'native_token';

export interface TransferAction {
    type: string;

    operator: string;

    from: string;
    to: string;

    token: string;
    amount: BigNumber;
}

export type SwapAction = {
    type: string;

    operator: string;

    recipient: string;

    tokenIn: string;
    tokenOut: string;

    amountIn?: BigNumber;
    amountInMax?: BigNumber;
    amountOut?: BigNumber;
    amountOutMin?: BigNumber;
};
