import { DataRenderer } from "../../DataRenderer";
import { TransferAction } from "../actions";
import { DecodeFormatOpts, Formatter } from "./types";

export class TransferFormatter extends Formatter<TransferAction> {
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