import { FunctionFragment } from '@ethersproject/abi/lib';

import {
    Decoder,
    DecoderState,
    DecoderInput,
} from "../sdk/types";
import { hasSelector, hasTraceExt } from "../sdk/utils";
import { SupplyAction } from "../sdk/actions";
import { BigNumber } from 'ethers';

const cTokenAddresses = new Set([
    '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
]);

export class CometSupplyDecoder extends Decoder<SupplyAction> {
    // Have to make sure that we're only picking up supply calls for cTokens
    functions = [
        'supply(address asset,uint amount)',
        'supplyTo(address dst,address asset,uint amount)',
        'supplyFrom(address from,address dst,address asset,uint amount)',
    ];

    async decodeCall(state: DecoderState, node: DecoderInput): Promise<SupplyAction | null> {
        if (state.isConsumed(node)) return null;
        if (node.type !== 'call') return null;

        if (!cTokenAddresses.has(node.to)) return null;

        const functionName = this.functions.find((name) => {
            return hasSelector(node.calldata, name);
        });

        if (functionName === undefined) return null;

        const [inputs] = this.decodeFunctionWithFragment(node, FunctionFragment.from(functionName));

        state.consume(node);

        // Supply implies downstream transfer call, need to consume
        if (hasTraceExt(node)) {
            // We know that the first external call from cToken supply is a delegatecall to Comet supply
            const cometSupplyDelegateCall = node.children[0]!;
            const transferFromCall = cometSupplyDelegateCall.children!.filter((v) => v.type === 'call')[0];

            // First external call made from supply function is a transferFrom
            state.consumeTransferFrom(transferFromCall);

            // Consume last log from delegate call (also a transfer event)
            if (cometSupplyDelegateCall.logs) {
                state.consume(cometSupplyDelegateCall.logs[cometSupplyDelegateCall.logs!.length - 1]);
            }
        }

        const supplyResult: SupplyAction = {
            type: 'supply',
            operator: node.from,
            supplier: functionName === 'supplyFrom(address from,address dst,address asset,uint amount)'
                ? inputs['from']
                : node.from,
            supplyToken: inputs['asset'],
            amount: (inputs['amount'] as BigNumber).toBigInt(),
        };

        // Metadata for cToken
        state.requestTokenMetadata(node.to);
        // Metadata for underlying token
        state.requestTokenMetadata(supplyResult.supplyToken);

        return supplyResult;
    }
}
