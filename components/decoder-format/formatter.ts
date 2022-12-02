import { Action } from '@samczsun/transaction-decoder/lib/sdk/actions';
import { ENSFormatter } from './ens';
import { SwapFormatter } from './swap';
import { TransferFormatter } from './transfer';
import { DecodeFormatOpts, Formatter } from './types';
import { WrappedNativeTokenFormatter } from './wrapped';

const allFormatters: Record<Action['type'], Formatter<any>> = {
    swap: new SwapFormatter(),
    'ens-register': new ENSFormatter(),
    'mint-erc20': new TransferFormatter(),
    'burn-erc20': new TransferFormatter(),
    transfer: new TransferFormatter(),
    'wrap-native-token': new WrappedNativeTokenFormatter(),
    'unwrap-native-token': new WrappedNativeTokenFormatter(),
};

export const format = (result: Action, opts: DecodeFormatOpts): JSX.Element => {
    return allFormatters[result.type].format(result, opts);
};
