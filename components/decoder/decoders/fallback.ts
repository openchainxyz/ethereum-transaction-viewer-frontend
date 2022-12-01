import { Log } from '@ethersproject/abstract-provider';
import { BurnERC20Action, MintERC20Action, NATIVE_TOKEN, TransferAction } from '../sdk/actions';
import { Decoder, DecoderInput, DecoderState } from '../sdk/types';
import { hasTopic } from '../sdk/utils';

export class TransferDecoder extends Decoder<TransferAction | BurnERC20Action | MintERC20Action> {
    async decodeCall(state: DecoderState, node: DecoderInput): Promise<TransferAction | null> {
        if (state.isConsumed(node)) return null;

        if (node.value.isZero()) return null;

        return {
            type: 'transfer',
            operator: node.from,
            from: node.from,
            to: node.to,
            token: NATIVE_TOKEN,
            amount: node.value.toBigInt(),
        };
    }

    async decodeLog(state: DecoderState, node: DecoderInput, log: Log): Promise<MintERC20Action | BurnERC20Action | TransferAction | null> {
        if (state.isConsumed(log)) return null;

        if (!hasTopic(log, `Transfer(address,address,uint256)`)) return null;

        if (node.abi) {
            const decodedEvent = node.abi.parseLog(log);

            state.requestTokenMetadata(log.address);

            if (decodedEvent.args[0] === '0x0000000000000000000000000000000000000000') {
                return {
                    type: 'mint-erc20',
                    operator: node.from,
                    token: log.address,
                    to: decodedEvent.args[1],
                    amount: decodedEvent.args[2].toBigInt(),
                }
            } else if (decodedEvent.args[1] === "0x0000000000000000000000000000000000000000") {
                return {
                    type: 'burn-erc20',
                    operator: node.from,
                    token: log.address,
                    from: decodedEvent.args[0],
                    amount: decodedEvent.args[2].toBigInt(),
                }
            }

            return {
                type: 'transfer',
                operator: node.from,
                token: log.address,
                from: decodedEvent.args[0],
                to: decodedEvent.args[1],
                amount: decodedEvent.args[2].toBigInt(),
            };
        }

        return null;
    }
}
