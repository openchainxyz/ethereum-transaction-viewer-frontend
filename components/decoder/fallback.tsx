import { DecodeFormatOpts, Decoder, DecoderInput, DecoderState, hasTopic } from './types';
import { DataRenderer } from '../DataRenderer';
import { NATIVE_TOKEN, TransferAction } from './actions';
import { Log } from '@ethersproject/abstract-provider';

export class TransferDecoder extends Decoder<TransferAction> {
    constructor() {
        super('erc20');
    }

    async decodeCall(state: DecoderState, node: DecoderInput): Promise<TransferAction | null> {
        if (!state.isConsumed(node) && !node.value.isZero()) {
            return {
                type: this.name,
                operator: node.from,
                from: node.from,
                to: node.to,
                token: NATIVE_TOKEN,
                amount: node.value,
            };
        }
        return null;
    }

    async decodeLog(state: DecoderState, node: DecoderInput, log: Log): Promise<TransferAction | null> {
        if (state.isConsumed(log)) return null;
        if (!hasTopic(log, `Transfer(address,address,uint256)`)) return null;

        if (node.abi) {
            const decodedEvent = node.abi.parseLog(log);

            state.requestTokenMetadata(node.to);

            return {
                type: this.name,
                operator: node.from,
                token: node.to,
                from: decodedEvent.args[0],
                to: decodedEvent.args[1],
                amount: decodedEvent.args[2],
            };
        }

        return null;
    }

    format(result: TransferAction, opts: DecodeFormatOpts): JSX.Element {
        return this.renderResult(
            'transfer',
            '#392b58',
            [opts.tokens.tokens[result.token.toLowerCase()]?.isNft ? 'id' : 'amount', 'from', 'to', 'operator'],
            [
                this.formatTokenAmount(opts, result.token, result.amount),
                <DataRenderer preferredType={'address'} data={result.from} />,
                <DataRenderer preferredType={'address'} data={result.to} />,
                <DataRenderer preferredType={'address'} data={result.operator} />,
            ],
        );
    }
}
