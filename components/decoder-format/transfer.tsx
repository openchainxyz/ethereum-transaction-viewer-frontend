import { DataRenderer } from '../DataRenderer';
import { BurnERC20Action, MintERC20Action, TransferAction } from '@samczsun/transaction-decoder/lib/sdk/actions';
import { DecodeFormatOpts, Formatter } from './types';

export class TransferFormatter extends Formatter<MintERC20Action | BurnERC20Action | TransferAction> {
    format(result: MintERC20Action | BurnERC20Action | TransferAction, opts: DecodeFormatOpts): JSX.Element {
        switch (result.type) {
            case 'mint-erc20':
                return this.renderResult(
                    'mint',
                    '#392b58',
                    [opts.tokens.tokens[result.token.toLowerCase()]?.isNft ? 'id' : 'amount', 'to', 'operator'],
                    [
                        this.formatTokenAmount(opts, result.token, result.amount),
                        <DataRenderer preferredType={'address'} data={result.to} />,
                        <DataRenderer preferredType={'address'} data={result.operator} />,
                    ],
                );
            case 'burn-erc20':
                return this.renderResult(
                    'burn',
                    '#392b58',
                    [opts.tokens.tokens[result.token.toLowerCase()]?.isNft ? 'id' : 'amount', 'from', 'operator'],
                    [
                        this.formatTokenAmount(opts, result.token, result.amount),
                        <DataRenderer preferredType={'address'} data={result.from} />,
                        <DataRenderer preferredType={'address'} data={result.operator} />,
                    ],
                );
            case 'transfer':
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
}
