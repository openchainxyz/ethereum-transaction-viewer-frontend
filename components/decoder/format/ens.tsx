import Tooltip from "@mui/material/Tooltip";
import humanizeDuration from "humanize-duration";
import { DateTime } from "luxon";
import { ENSRegisterAction, NATIVE_TOKEN } from "../actions";
import { DecodeFormatOpts, Formatter } from "./types";

export class ENSFormatter extends Formatter<ENSRegisterAction> {
    format(result: ENSRegisterAction, opts: DecodeFormatOpts): JSX.Element {
        const keys = ['name', 'owner', 'expiry', 'cost'];
        const vals = [
            result.name,
            this.formatAddress(result.owner),
            <Tooltip title={humanizeDuration(result.duration * 1000)}>
                <span>
                    {DateTime.fromSeconds(opts.timestamp + result.duration).toFormat('yyyy-MM-dd hh:mm:ss ZZZZ')}
                </span>
            </Tooltip>,
            this.formatTokenAmount(opts, NATIVE_TOKEN, result.cost),
        ];

        if (result.resolver !== undefined && result.resolver !== '0x0000000000000000000000000000000000000000') {
            keys.push('resolver');
            vals.push(this.formatAddress(result.resolver));
        }

        if (result.addr !== undefined && result.addr !== '0x0000000000000000000000000000000000000000') {
            keys.push('addr');
            vals.push(this.formatAddress(result.addr));
        }

        keys.push('operator');
        vals.push(this.formatAddress(result.operator));

        return this.renderResult('register ens', 'ffffff', keys, vals);
    }
}