import assert from "assert";
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber, ethers } from 'ethers';

import { CometSupplyDecoder } from "../components/decoder/comet";
import { DecoderInput, DecoderState } from "../components/decoder/types";
import decoderInputJson from "../testdata/comet_supply_decoder_input.json";
import { ProviderDecoderChainAccess } from "../components/decoder/DecodeTree";


describe("CometSupplyDecoder", () => {
    describe("decodeCall", () => {
        it("should decode to a single SupplyAction", async () => {
            const state = new DecoderState(new ProviderDecoderChainAccess(new JsonRpcProvider("")));
            const decoder = new CometSupplyDecoder();
            const supplyAction = await decoder.decodeCall(state, decoderInputJson as any as DecoderInput);
            assert.strictEqual(supplyAction!.type, "comet-supply");
            assert.strictEqual(ethers.utils.getAddress(supplyAction!.operator), '0x89E9e55d4ddC6492cdB13afeF3Eaf44863EEDf44');
            assert.strictEqual(ethers.utils.getAddress(supplyAction!.supplier), '0x89E9e55d4ddC6492cdB13afeF3Eaf44863EEDf44');
            assert.strictEqual(ethers.utils.getAddress(supplyAction!.supplyToken), '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
            assert(BigNumber.from(10000000).eq(supplyAction!.amount));
        })
    })
})
