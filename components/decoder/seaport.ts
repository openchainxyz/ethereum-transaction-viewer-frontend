import { ethers } from 'ethers';
import { BuyNFTAction } from "./actions";
import { Decoder, DecoderInput, DecoderState } from "./types";

export class SeaportBuyNFTDecoder extends Decoder<BuyNFTAction> {

    async decodeCall(state: DecoderState, node: DecoderInput): Promise<BuyNFTAction | null> {
        if (state.isConsumed(node)) return null;
        if (node.type !== 'call') return null;


    }

    // async decodeLog(state: DecoderState, node: DecoderInput, log: Log): Promise<BuyNFTAction | null> {
    //     if (state.isConsumed(log)) return null;

    // }
}
