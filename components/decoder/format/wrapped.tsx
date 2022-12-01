import { DataRenderer } from "../../DataRenderer";
import { TransferAction, UnwrapNativeTokenAction, WrapNativeTokenAction } from "../actions";
import { DecodeFormatOpts, Formatter } from "./types";

export class WrappedNativeTokenFormatter extends Formatter<WrapNativeTokenAction | UnwrapNativeTokenAction> {
    format(result: WrapNativeTokenAction | UnwrapNativeTokenAction, opts: DecodeFormatOpts): JSX.Element {
        if (result.type === 'wrap-native-token') {
            return this.renderResult(
                'wrap',
                '#392b58',
                [opts.tokens.tokens[result.token.toLowerCase()]?.isNft ? 'id' : 'amount', 'operator'],
                [
                    this.formatTokenAmount(opts, result.token, result.amount),
                    <DataRenderer preferredType={'address'} data={result.operator} />,
                ],
            );
        } else {
            return this.renderResult(
                'unwrap',
                '#392b58',
                [opts.tokens.tokens[result.token.toLowerCase()]?.isNft ? 'id' : 'amount', 'operator'],
                [
                    this.formatTokenAmount(opts, result.token, result.amount),
                    <DataRenderer preferredType={'address'} data={result.operator} />,
                ],
            );
        }
    }
}