import { Grid, Tooltip, Typography } from '@mui/material';
import * as React from 'react';
import { DateTime } from 'luxon';
import humanizeDuration from 'humanize-duration';
import { formatUnits } from 'ethers/lib/utils';
import { formatUnitsSmartly, formatUsd } from '../helpers';
import { DataRenderer } from '../DataRenderer';
import { PriceMetadata, TransactionInfoResponse } from '../types';
import { getChain } from '../Chains';

type TransactionAttributeGridProps = {
    children?: JSX.Element[];
};

export const TransactionAttributeGrid = (props: TransactionAttributeGridProps) => {
    return (
        <Grid container direction={'column'}>
            {props.children}
        </Grid>
    );
};

type TransactionAttributeRowProps = {
    children?: JSX.Element[];
};

export const TransactionAttributeRow = (props: TransactionAttributeRowProps) => {
    return (
        <Grid item container direction={'row'} columnSpacing={4} justifyContent={'flex-start'}>
            {props.children}
        </Grid>
    );
};

type TransactionAttributeProps = {
    name: string;

    children?: React.ReactNode | React.ReactNode[];
};

export const TransactionAttribute = (props: TransactionAttributeProps) => {
    return (
        <Grid item>
            <span style={{ color: '#a8a19f' }}>{props.name}:</span>&nbsp;{props.children}
        </Grid>
    );
};

type TransactionInfoProps = {
    transactionResponse: TransactionInfoResponse;
    priceMetadata: PriceMetadata;
    chain: string;
};

export const TransactionInfo = (props: TransactionInfoProps) => {
    const { transactionResponse, priceMetadata, chain } = props;

    const chainInfo = getChain(chain);
    if (!chainInfo) throw new Error('weird');

    let blockTimestamp = DateTime.fromSeconds(transactionResponse.metadata.timestamp);

    // use swedish locale to get yyyy-mm-dd lol
    let localTime = blockTimestamp.toFormat('yyyy-MM-dd hh:mm:ss ZZZZ');
    let utcTime = blockTimestamp.toUTC().toFormat('yyyy-MM-dd hh:mm:ss ZZZZ');
    let timeSince = humanizeDuration(DateTime.now().toMillis() - blockTimestamp.toMillis(), {
        largest: 2,
    });

    let gasPriceInfo;
    if (transactionResponse.transaction.type === 2) {
        gasPriceInfo = (
            <>
                <TransactionAttribute name={'Gas Price'}>
                    {formatUnits(transactionResponse.receipt.effectiveGasPrice, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
                <TransactionAttribute name={'Max Priority Fee'}>
                    {formatUnits(transactionResponse.transaction.maxPriorityFeePerGas!, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
                <TransactionAttribute name={'Max Fee'}>
                    {formatUnits(transactionResponse.transaction.maxFeePerGas!, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
            </>
        );
    } else {
        gasPriceInfo = (
            <>
                <TransactionAttribute name={'Gas Price'}>
                    {formatUnits(transactionResponse.transaction.gasPrice!, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
            </>
        );
    }

    let transactionStatus;
    if (transactionResponse.receipt.status === 0) {
        transactionStatus = 'Failed';
    } else if (transactionResponse.receipt.status === 1) {
        transactionStatus = 'Succeeded';
    } else {
        transactionStatus = 'Unknown';
    }

    let historicalEthPrice = priceMetadata.historicalPrices[chainInfo.nativeTokenAddress];
    let currentEthPrice = priceMetadata.currentPrices[chainInfo.nativeTokenAddress];

    let transactionValue = transactionResponse.transaction.value;
    let transactionFee = transactionResponse.receipt.gasUsed.mul(
        transactionResponse.receipt.effectiveGasPrice || transactionResponse.transaction.gasPrice,
    );

    let transactionValueStr = formatUnitsSmartly(transactionValue, chainInfo.nativeSymbol);
    let transactionFeeStr = formatUnitsSmartly(transactionFee, chainInfo.nativeSymbol);

    let transactionValueUSD;
    let transactionFeeUSD;
    if (historicalEthPrice) {
        transactionValueUSD = (
            <>
                &nbsp;(
                <Tooltip
                    title={
                        currentEthPrice
                            ? formatUsd(transactionValue.mul(currentEthPrice)) + ' today'
                            : 'Current price unknown'
                    }
                >
                    <span>{formatUsd(transactionValue.mul(historicalEthPrice))}</span>
                </Tooltip>
                )
            </>
        );
        transactionFeeUSD = (
            <>
                &nbsp;(
                <Tooltip
                    title={
                        currentEthPrice
                            ? formatUsd(transactionFee.mul(currentEthPrice)) + ' today'
                            : 'Current price unknown'
                    }
                >
                    <span>{formatUsd(transactionFee.mul(historicalEthPrice))}</span>
                </Tooltip>
                )
            </>
        );
    }

    return (
        <>
            <Typography variant={'body1'} component={'div'}>
                <TransactionAttributeGrid>
                    <TransactionAttributeRow>
                        <TransactionAttribute name={'Status'}>{transactionStatus}</TransactionAttribute>
                        <TransactionAttribute name={'Timestamp'}>
                            <Tooltip title={utcTime}>
                                <span>{localTime}</span>
                            </Tooltip>
                            &nbsp;({timeSince} ago)
                        </TransactionAttribute>
                        <TransactionAttribute name={'Block'}>
                            <a
                                href={`${chainInfo.blockexplorerUrl}/block/${transactionResponse.receipt.blockNumber}`}
                                target={'_blank'}
                                rel={'noreferrer noopener'}
                            >
                                {transactionResponse.receipt.blockNumber}
                            </a>
                        </TransactionAttribute>
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        <TransactionAttribute name={'From'}>
                            <DataRenderer
                                chain={chain}
                                showCopy={true}
                                labels={transactionResponse.metadata.labels}
                                preferredType={'address'}
                                data={transactionResponse.transaction.from}
                            />
                        </TransactionAttribute>
                        <TransactionAttribute name={transactionResponse.transaction.to ? 'To' : 'Created'}>
                            <DataRenderer
                                chain={chain}
                                showCopy={true}
                                labels={transactionResponse.metadata.labels}
                                preferredType={'address'}
                                data={transactionResponse.transaction.to || transactionResponse.receipt.contractAddress}
                            />
                        </TransactionAttribute>
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        <TransactionAttribute name={'Value'}>
                            {transactionValueStr}
                            {transactionValueUSD}
                        </TransactionAttribute>
                        <TransactionAttribute name={'Transaction Fee'}>
                            {transactionFeeStr}
                            {transactionFeeUSD}
                        </TransactionAttribute>
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        <TransactionAttribute name={'Gas Used'}>
                            {transactionResponse.receipt.gasUsed.toString()}/
                            {transactionResponse.transaction.gasLimit.toString()}
                        </TransactionAttribute>
                        {gasPriceInfo}
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        <TransactionAttribute name={'Nonce'}>
                            {transactionResponse.transaction.nonce}
                        </TransactionAttribute>
                        <TransactionAttribute name={'Index'}>
                            {transactionResponse.receipt.transactionIndex}
                        </TransactionAttribute>
                        <TransactionAttribute name={'Type'}>
                            {transactionResponse.transaction.type === 2
                                ? 'EIP-1559'
                                : transactionResponse.transaction.type === 1
                                ? 'Access List'
                                : 'Legacy'}
                        </TransactionAttribute>
                    </TransactionAttributeRow>
                </TransactionAttributeGrid>
            </Typography>
        </>
    );
};
