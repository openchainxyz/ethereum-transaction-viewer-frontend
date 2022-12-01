import { EventFragment, FunctionFragment } from '@ethersproject/abi/lib';
import { ethers } from 'ethers';
import { ENSRegisterAction } from '../sdk/actions';
import { Decoder, DecoderInput, DecoderState } from '../sdk/types';
import { hasReceiptExt, hasSelector, hasTopic } from '../sdk/utils';

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

    async decodeCall(state: DecoderState, node: DecoderInput): Promise<ENSRegisterAction | null> {
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

        if (hasReceiptExt(node)) {
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
            type: 'ens-register',
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
}
