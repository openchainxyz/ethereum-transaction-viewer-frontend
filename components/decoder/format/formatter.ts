import { Action } from "../actions";
import { ENSFormatter } from "./ens";
import { SwapFormatter } from "./swap";
import { TransferFormatter } from "./transfer";
import { DecodeFormatOpts, Formatter } from "./types";

const allFormatters: Record<Action['type'], Formatter<any>> = {
    'swap': new SwapFormatter(),
    'ens-register': new ENSFormatter(),
    'transfer': new TransferFormatter(),
};

export const format = (result: Action, opts: DecodeFormatOpts): JSX.Element => {
    return allFormatters[result.type].format(result, opts);
};
