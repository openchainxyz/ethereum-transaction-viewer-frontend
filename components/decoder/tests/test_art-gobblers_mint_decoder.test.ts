import assert from "assert";

import { getInput, getDummyDecoderState } from "./utils";
import decoderInputJson from "./testdata/art-gobblers_mint_decoder_input.json";
import { ArtGobblersMintDecoder } from "../decoders/art-gobblers";
import { isEqualAddress } from "../sdk/utils";
import { BigNumber } from "ethers";


describe("CometSupplyDecoder", () => {
    describe("decodeCall", () => {
        it("should decode to valid MintNFTAction", async () => {
            const input = getInput(decoderInputJson);
            const state = getDummyDecoderState(input);
            const decoder = new ArtGobblersMintDecoder();
            const mintAction = await decoder.decodeCall(state, input);
            assert.strictEqual(mintAction!.type, "nft-mint");
            assert(isEqualAddress(mintAction!.operator, '0x3d11e2d2a0e44061236b4F54980AC763E0Abd6f7'));
            assert(isEqualAddress(mintAction!.recipient, '0x3d11e2d2a0e44061236b4F54980AC763E0Abd6f7'));
            assert(isEqualAddress(mintAction!.collection, '0x60bb1e2AA1c9ACAfB4d34F71585D7e959f387769'));
            assert.strictEqual(mintAction!.tokenId, BigNumber.from(2260n).toBigInt());
            assert(isEqualAddress(mintAction!.buyToken!, '0x600000000a36F3cD48407e35eB7C5c910dc1f7a8'));
            assert.strictEqual(mintAction!.buyAmount, BigNumber.from(3580931783591734677959n).toBigInt());
        })
    })
})
