import { Result } from '@ethersproject/abi/lib';
import { BigNumber, ethers } from 'ethers';

import { MintNFTAction } from "../sdk/actions";
import { CallDecoder, DecoderInput, DecoderState } from "../sdk/types";
import { flattenLogs, hasReceiptExt, isEqualAddress } from '../sdk/utils';

const gobblerPurchasedEventSignature = 'event GobblerPurchased(address indexed user, uint256 indexed gobblerId, uint256 price)';

export class ArtGobblersMintDecoder extends CallDecoder<MintNFTAction> {
    constructor() {
        super();

        this.functions['mintFromGoo(uint256 maxPrice, bool useVirtualBalance) external returns (uint256 gobblerId)'] = this.decodeMintFromGoo;
    }

    async isTargetContract(state: DecoderState, address: string): Promise<boolean> {
        return isEqualAddress(address, '0x60bb1e2AA1c9ACAfB4d34F71585D7e959f387769');
    }

    async decodeMintFromGoo(state: DecoderState, node: DecoderInput, input: Result, output: Result | null): Promise<MintNFTAction> {
        const result: MintNFTAction = {
            type: 'nft-mint',
            operator: node.from,
            recipient: node.from,
            collection: node.to,
            buyToken: ethers.utils.getAddress('0x600000000a36F3cD48407e35eB7C5c910dc1f7a8'),
            buyAmount: (input['maxPrice'] as BigNumber).toBigInt(),
        };

        // Can only get tokenId if transaction was successful...
        if (hasReceiptExt(node)) {
            const logs = flattenLogs(node);
            // Second to last log is GobblerPurchased event
            const gobblerPurchasedLog = this.decodeEventWithFragment(logs[logs.length - 2], gobblerPurchasedEventSignature);
            result.tokenId = gobblerPurchasedLog.args['gobblerId'].toBigInt();
            result.buyAmount = (gobblerPurchasedLog.args['price'] as BigNumber).toBigInt();
        }

        return result;
    }
}
