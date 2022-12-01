import assert from "assert";
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber, ethers } from 'ethers';

import { CometSupplyDecoder } from "../decoders/comet";
import { isEqualAddress } from "../sdk/utils";
import { getInput, getDummyDecoderState } from "./utils";
import decoderInputJson from "./testdata/comet_supply_decoder_input.json";


describe("CometSupplyDecoder", () => {
    describe("decodeCall", () => {
        it("should decode to valid SupplyAction", async () => {
            const input = getInput(decoderInputJson);
            const state = getDummyDecoderState(input);
            const decoder = new CometSupplyDecoder();
            const supplyAction = await decoder.decodeCall(state, input);
            assert.strictEqual(supplyAction!.type, "supply");
            assert(isEqualAddress(supplyAction!.operator, '0x89E9e55d4ddC6492cdB13afeF3Eaf44863EEDf44'));
            assert(isEqualAddress(supplyAction!.supplier, '0x89E9e55d4ddC6492cdB13afeF3Eaf44863EEDf44'));
            assert(isEqualAddress(supplyAction!.supplyToken, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'));
            assert(BigNumber.from(10000000).eq(supplyAction!.amount));
        })
    })
})
