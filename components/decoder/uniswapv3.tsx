import { DecodeFormatOpts, Decoder, DecoderInput, DecoderState, hasSelector, hasTopic } from './types';
import { EventFragment, FunctionFragment } from '@ethersproject/abi/lib';
import humanizeDuration from 'humanize-duration';
import { NATIVE_TOKEN, SwapAction } from './actions';
import { ethers } from 'ethers';
import { DateTime } from 'luxon';
import { Tooltip } from '@mui/material';
import {Log} from "@ethersproject/abstract-provider";
import {ENSRegisterAction} from "./ens";

export type UniswapV3SwapAction = SwapAction & {
};

export class UniswapV3PoolSwapDecoder extends Decoder<UniswapV3SwapAction> {
    functions = {
        'register(string name, address owner, uint256 duration, bytes32 secret)': {
            hasResolver: false,
        },
        'registerWithConfig(string name, address owner, uint256 duration, bytes32 secret, address resolver, address addr)':
            {
                hasResolver: true,
            },
    };

    constructor() {
        super('uniswap-v3-pool-swap');
    }

    decodeCall(state: DecoderState, node: DecoderInput): UniswapV3SwapAction | null {
        if (state.isConsumed(node)) return null;

        return null;
    }

    decodeLog(state: DecoderState, node: DecoderInput, log: Log): UniswapV3SwapAction | null {
        const swapEvent = EventFragment.from(`Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)`);

        if (state.isConsumed(log)) return null;

        if (!hasTopic(log, swapEvent)) return null;

        const decoded = this.decodeEventWithFragment(log, swapEvent);

        return {
            type: this.name,
            operator: node.from,
            recipient: decoded.args['recipient'],
            tokenIn: path[0],
            tokenOut: path[path.length - 1],
        }
    }

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
