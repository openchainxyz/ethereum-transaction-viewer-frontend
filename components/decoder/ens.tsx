import { DecodeFormatOpts, Decoder, DecoderInput, DecoderState, hasSelector, hasTopic } from './types';
import { EventFragment, FunctionFragment } from '@ethersproject/abi/lib';
import humanizeDuration from 'humanize-duration';
import { NATIVE_TOKEN } from './actions';
import { ethers } from 'ethers';
import { DateTime } from 'luxon';
import { Tooltip } from '@mui/material';

export type ENSRegisterAction = {
    type: string;

    operator: string;

    owner: string;
    name: string;
    duration: number;
    cost: bigint;

    resolver?: string;
    addr?: string;
};

export class ENSDecoder extends Decoder<ENSRegisterAction> {
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
        super('ens');
    }

    decodeCall(state: DecoderState, node: DecoderInput): ENSRegisterAction | null {
        if (state.isConsumed(node)) return null;

        if (node.to.toLowerCase() !== '0x283Af0B28c62C092C9727F1Ee09c02CA627EB7F5'.toLowerCase()) return null;

        const functionInfo = Object.entries(this.functions).find(([name, func]) => {
            return hasSelector(node.calldata, name);
        });

        if (!functionInfo) return null;

        // todo: don't consume if we have a resolver set because that makes an external call
        state.consumeAllRecursively(node);

        const [inputs] = this.decodeFunctionWithFragment(node, FunctionFragment.from(functionInfo[0]));

        const functionMetadata = functionInfo[1];

        let cost = node.value.toBigInt();

        if (node.logs) {
            const registeredFragment = EventFragment.from(
                `NameRegistered(string name, bytes32 indexed label, address indexed owner, uint cost, uint expires)`,
            );

            const lastLog = node.logs.reverse().find((log) => hasTopic(log, registeredFragment));
            if (lastLog) {
                const abi = new ethers.utils.Interface([registeredFragment]);
                const parsedEvent = abi.parseLog(lastLog);

                cost = parsedEvent.args['cost'].toBigInt();
            }
        }

        const result: ENSRegisterAction = {
            type: this.name,
            operator: node.from,
            owner: inputs['owner'],
            name: inputs['name'] + '.eth',
            duration: inputs['duration'].toNumber(),
            cost: cost,
        };

        if (functionMetadata.hasResolver) {
            result.resolver = inputs['resolver'];
            result.addr = inputs['addr'];
        }

        return result;
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
