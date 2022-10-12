import { BigNumber } from 'ethers';
import { DecodeFormatOpts, Decoder, DecodeState } from './types';
import { TraceEntry, TraceEntryCallable } from '../types';
import { TraceTreeNodeLabel } from '../TraceTreeItem';
import { DataRenderer } from '../DataRenderer';
import { findAffectedContract } from '../helpers';

export type ERC20DecoderResult = {
    type: string;
    from: string;
    to: string;
    actor: string;
    token: string;
    amount: BigNumber;
};

export class ERC20Decoder extends Decoder<ERC20DecoderResult> {
    constructor() {
        super('erc20');
    }

    decode(currentNode: TraceEntry, state: DecodeState): ERC20DecoderResult | null {
        if (currentNode.type !== 'log') {
            return null;
        }
        if (state.handled[currentNode.id]) {
            return null;
        }

        if (currentNode.topics[0] !== '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
            return null;
        }

        let parentId = currentNode.id.split('.');
        parentId.pop();
        let parentNode = state.metadata.nodesById[parentId.join('.')] as TraceEntryCallable;

        let abi = state.metadata.abis[parentNode.to][parentNode.codehash];
        let eventFragment = abi.getEvent(currentNode.topics[0]);

        let values = abi.decodeEventLog(eventFragment, currentNode.data, currentNode.topics);

        let [parent] = findAffectedContract(state.metadata, currentNode);

        this.requestTokenMetadata(state, parent.to);

        return {
            type: this.name,
            from: values[0].toString(),
            to: values[1].toString(),
            actor: parentNode.from,
            token: parent.to,
            amount: values[2],
        };
    }

    format(result: ERC20DecoderResult, opts: DecodeFormatOpts): JSX.Element {
        return this.renderResult(
            'transfer',
            '#392b58',
            ['amount', 'from', 'to', 'actor'],
            [
                this.formatTokenAmount(opts, result.token, result.amount),
                <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={result.from} />,
                <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={result.to} />,
                <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={result.actor} />,
            ],
        );
    }
}

export type ValueTransferDecoderResult = {
    type: string;
    from: string;
    to: string;
    amount: BigNumber;
};

export class ValueTransferDecoder extends Decoder<ValueTransferDecoderResult> {
    constructor() {
        super('value');
    }

    decode(currentNode: TraceEntry, state: DecodeState): ValueTransferDecoderResult | null {
        if (state.handled[currentNode.id]) return null;
        if (currentNode.type !== 'call') return null;

        const value = BigNumber.from(currentNode.value);
        if (value.isZero()) return null;

        return {
            type: this.name,
            from: currentNode.from,
            to: currentNode.to,
            amount: value,
        };
    }

    format(result: ValueTransferDecoderResult, opts: DecodeFormatOpts): JSX.Element {
        return this.renderResult(
            'transfer',
            '#392b58',
            ['amount', 'from', 'to'],
            [
                this.formatTokenAmount(opts, '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', result.amount),
                <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={result.from} />,
                <DataRenderer chain={opts.chain} labels={opts.labels} preferredType={'address'} data={result.to} />,
            ],
        );
    }
}
