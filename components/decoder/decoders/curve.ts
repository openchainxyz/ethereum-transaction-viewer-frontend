import { Interface, Result } from '@ethersproject/abi';
import { SwapAction } from '../sdk/actions';
import { CallDecoder, DecoderInput, DecoderState } from '../sdk/types';
import { hasReceiptExt, isEqualAddress } from '../sdk/utils';

const curveContracts = {
    ethereum: [
        '0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4',
        '0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511',
    ]
}

const coinsSignature = 'function coins(uint256) returns (address coin)';
const tokenExchangeSignature = 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)';

export class CurveSwapDecoder extends CallDecoder<SwapAction> {
    constructor() {
        super();

        this.functions['exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy, bool use_eth)'] = this.decodeExchangeWithEth;
        this.functions['exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy)'] = this.decodeExchange;
    }

    async isTargetContract(state: DecoderState, address: string): Promise<boolean> {
        return !!curveContracts['ethereum'].find(addr => isEqualAddress(addr, address))
    }

    async decodeExchange(state: DecoderState, node: DecoderInput, input: Result, output: Result | null): Promise<SwapAction> {
        const i = input['i'];
        const j = input['j'];

        const [tokenIn] = await state.call(coinsSignature, node.to, [i]);
        const [tokenOut] = await state.call(coinsSignature, node.to, [i]);

        const result: SwapAction = {
            type: 'swap',

            exchange: 'curve',
            operator: node.from,
            recipient: node.from,

            tokenIn: tokenIn,
            tokenOut: tokenOut,

            amountIn: input['dx'].toBigInt(),
            amountOutMin: input['min_dy'].toBigInt(),
        };

        if (hasReceiptExt(node)) {
            const exchangeLog = this.decodeEventWithFragment(node.logs[node.logs.length - 1], tokenExchangeSignature);

            result.amountOut = exchangeLog.args['tokens_bought'].toBigInt();
        }

        return result;
    }

    async decodeExchangeWithEth(state: DecoderState, node: DecoderInput, input: Result, output: Result | null): Promise<SwapAction> {
        const i = input['i'];
        const j = input['j'];
        const useEth = input['use_eth'];

        const intf = new Interface([
            'function coins(uint256) returns (address coin)',
        ]);

        const tokenIn = intf.decodeFunctionResult(intf.getFunction('coins'), await state.access.call({
            to: node.to,
            data: intf.encodeFunctionData(intf.getFunction('coins'), [i]),
        }))['coin'];

        const tokenOut = intf.decodeFunctionResult(intf.getFunction('coins'), await state.access.call({
            to: node.to,
            data: intf.encodeFunctionData(intf.getFunction('coins'), [j]),
        }))['coin'];

        const result: SwapAction = {
            type: 'swap',

            exchange: 'curve',
            operator: node.from,
            recipient: node.from,

            tokenIn: tokenIn,
            tokenOut: tokenOut,

            amountIn: input['dx'].toBigInt(),
            amountOutMin: input['min_dy'].toBigInt(),
        };

        if (hasReceiptExt(node)) {
            const exchangeLog = this.decodeEventWithFragment(node.logs[node.logs.length - 1], 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)');

            result.amountOut = exchangeLog.args['tokens_bought'].toBigInt();
        }

        return result;
    }
}