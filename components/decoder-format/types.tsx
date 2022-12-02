import Tooltip from "@mui/material/Tooltip";
import { NATIVE_TOKEN } from '@samczsun/transaction-decoder/lib/sdk/actions';
import { BigNumber, BigNumberish, ethers } from "ethers";
import React from "react";
import WithSeparator from "react-with-separator";
import { ChainConfig } from "../Chains";
import { DataRenderer } from "../DataRenderer";
import { formatUsd } from "../helpers";
import { PriceMetadata } from "../metadata/prices";
import { TokenMetadata } from "../metadata/tokens";
import { TraceTreeNodeLabel } from "../trace/TraceTreeItem";

export type DecodeFormatOpts = {
    timestamp: number;
    chain: ChainConfig;
    prices: PriceMetadata;
    tokens: TokenMetadata;
};

export abstract class Formatter<T> {
    abstract format(result: T, opts: DecodeFormatOpts): JSX.Element;


    formatAddress(addr: string): JSX.Element {
        return <DataRenderer preferredType={'address'} data={addr} />;
    }

    formatTokenAmount(opts: DecodeFormatOpts, token: string, amount: BigNumberish): JSX.Element {
        token = token.toLowerCase();
        if (token === NATIVE_TOKEN) {
            token = opts.chain.nativeTokenAddress || '';
        }

        let amountFormatted = amount.toString();
        let address = <DataRenderer preferredType={'address'} data={token} />;
        let price;

        let tokenInfo = opts.tokens.tokens[token];
        if (tokenInfo !== undefined) {
            if (tokenInfo.decimals !== undefined) {
                amountFormatted = ethers.utils.formatUnits(amount, tokenInfo.decimals);
            }
            if (tokenInfo.symbol !== undefined) {
                address = (
                    <DataRenderer
                        labels={{ [token]: tokenInfo.symbol }}
                        preferredType={'address'}
                        data={token}
                    />
                );
            }
        }

        let historicalPrice = opts.prices.prices[token]?.historicalPrice;
        let currentPrice = opts.prices.prices[token]?.currentPrice;
        if (historicalPrice !== undefined && currentPrice !== undefined) {
            price = (
                <>
                    &nbsp;(
                    <Tooltip
                        title={currentPrice ? formatUsd(BigNumber.from(amount).mul(currentPrice)) + ' today' : 'Current price unknown'}
                    >
                        <span>{formatUsd(BigNumber.from(amount).mul(historicalPrice))}</span>
                    </Tooltip>
                    )
                </>
            );
        }

        return (
            <>
                {amountFormatted}&nbsp;<span style={{ color: '#7b9726' }}>{address}</span>
                {price}
            </>
        );
    }

    renderResult(nodeType: string, nodeColor: string, keys: string[], values: any[]) {
        return (
            <>
                <TraceTreeNodeLabel nodeType={nodeType} nodeColor={nodeColor} />
                &nbsp;
                <WithSeparator separator={<>,&nbsp;</>}>
                    {keys.map((key, idx) => {
                        return (
                            <React.Fragment key={`param_${idx}`}>
                                <span style={{ color: '#a8a19f' }}>{key}</span>={values[idx]}
                            </React.Fragment>
                        );
                    })}
                </WithSeparator>
            </>
        );
    }
}