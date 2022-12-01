import { Log } from '@ethersproject/abstract-provider';
import { NATIVE_TOKEN, TransferAction } from '../sdk/actions';
import { Decoder, DecoderInput, DecoderState } from '../sdk/types';
import { hasTopic } from '../sdk/utils';

export class TransferDecoder extends Decoder<TransferAction> {
    async decodeCall(state: DecoderState, node: DecoderInput): Promise<TransferAction | null> {
        if (state.isConsumed(node)) return null;

        if (node.value.isZero()) return null;

        return {
            type: 'transfer',
            operator: node.from,
            from: node.from,
            to: node.to,
            token: NATIVE_TOKEN,
            amount: node.value,
        };
    }

    async decodeLog(state: DecoderState, node: DecoderInput, log: Log): Promise<TransferAction | null> {
        if (state.isConsumed(log)) return null;
        if (!hasTopic(log, `Transfer(address,address,uint256)`)) return null;

        if (node.abi) {
            const decodedEvent = node.abi.parseLog(log);

            state.requestTokenMetadata(log.address);

            return {
                type: 'transfer',
                operator: node.from,
                token: log.address,
                from: decodedEvent.args[0],
                to: decodedEvent.args[1],
                amount: decodedEvent.args[2],
            };
        }

        return null;
    }
}
