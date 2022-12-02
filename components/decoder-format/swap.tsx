import { DataRenderer } from '../DataRenderer';
import { SwapAction } from '@samczsun/transaction-decoder/lib/sdk/actions';
import { DecodeFormatOpts, Formatter } from './types';

export class SwapFormatter extends Formatter<SwapAction> {
    format(result: SwapAction, opts: DecodeFormatOpts): JSX.Element {
        const keys = [];
        const values = [];

        keys.push('exchange');
        values.push(result.exchange);

        if (result.amountIn !== undefined) {
            keys.push('tokenIn');
            values.push(this.formatTokenAmount(opts, result.tokenIn, result.amountIn));
        } else if (result.amountInMax !== undefined) {
            keys.push('tokenInMax');
            values.push(this.formatTokenAmount(opts, result.tokenIn, result.amountInMax));
        }

        if (result.amountOut !== undefined) {
            keys.push('amountOut');
            values.push(this.formatTokenAmount(opts, result.tokenOut, result.amountOut));
        } else if (result.amountOutMin !== undefined) {
            keys.push('amountOutMin');
            values.push(this.formatTokenAmount(opts, result.tokenOut, result.amountOutMin));
        }

        keys.push('recipient');
        values.push(<DataRenderer preferredType={'address'} data={result.recipient} />);

        keys.push('actor');
        values.push(<DataRenderer preferredType={'address'} data={result.operator} />);

        return this.renderResult('swap', '#645e9d', keys, values);
    }
}
