import {Grid, TextField, Tooltip, Typography} from '@mui/material';
import * as React from 'react';
import {useContext} from 'react';
import {DateTime} from 'luxon';
import humanizeDuration from 'humanize-duration';
import {formatUnits} from 'ethers/lib/utils';
import {formatUnitsSmartly, formatUsd} from '../helpers';
import {DataRenderer} from '../DataRenderer';
import {TransactionInfoResponse} from '../types';
import {ChainConfig} from '../Chains';
import {PriceMetadataContext} from '../metadata/prices';
import {ethers} from "ethers";

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
    children?: JSX.Element | JSX.Element[];
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
            <span style={{color: '#a8a19f'}}>{props.name}:</span>&nbsp;{props.children}
        </Grid>
    );
};

type TransactionInfoProps = {
    transactionResponse: TransactionInfoResponse;
    chainInfo: ChainConfig;
};

export const TransactionInfo = (props: TransactionInfoProps) => {
    const {transactionResponse, chainInfo} = props;
    const priceMetadata = useContext(PriceMetadataContext);

    let blockTimestamp = DateTime.fromSeconds(transactionResponse.metadata.timestamp);

    let localTime = blockTimestamp.toFormat('yyyy-MM-dd hh:mm:ss ZZZZ');
    let utcTime = blockTimestamp.toUTC().toFormat('yyyy-MM-dd hh:mm:ss ZZZZ');
    let timeSince = humanizeDuration(
        DateTime.now().toMillis() - blockTimestamp.toMillis(),
        {largest: 2},
    );

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

    let historicalEthPrice = priceMetadata.prices[chainInfo.coingeckoId]?.historicalPrice;
    let currentEthPrice = priceMetadata.prices[chainInfo.coingeckoId]?.currentPrice;

    let transactionValue = transactionResponse.transaction.value.toBigInt();
    let transactionFee =
        transactionResponse.receipt.gasUsed.toBigInt() *
        (transactionResponse.receipt.effectiveGasPrice.toBigInt() ||
            transactionResponse.transaction.gasPrice?.toBigInt());

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
                            ? formatUsd(transactionValue * currentEthPrice) + ' today'
                            : 'Current price unknown'
                    }
                >
                    <span>{formatUsd(transactionValue * historicalEthPrice)}</span>
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
                            ? formatUsd(transactionFee * currentEthPrice) + ' today'
                            : 'Current price unknown'
                    }
                >
                    <span>{formatUsd(transactionFee * historicalEthPrice)}</span>
                </Tooltip>
                )
            </>
        );
    }

    let calldataAsUtf8;
    {
        try {
            const data = transactionResponse.transaction.data.replace(/(00)+$/g, '');
            const utf8Str = ethers.utils.toUtf8String(data);
            if (!/[\x00-\x09\x0E-\x1F]/.test(utf8Str)) {
                calldataAsUtf8 = <TransactionAttributeRow>
                    <TransactionAttribute name={'Message'}>
                        <br/>
                        {utf8Str}
                    </TransactionAttribute>
                </TransactionAttributeRow>
            }
        } catch {
        }
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
                                chain={chainInfo.id}
                                showCopy={true}
                                preferredType={'address'}
                                data={transactionResponse.transaction.from}
                            />
                        </TransactionAttribute>
                        <TransactionAttribute name={transactionResponse.transaction.to ? 'To' : 'Created'}>
                            <DataRenderer
                                chain={chainInfo.id}
                                showCopy={true}
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
                    {calldataAsUtf8}
                </TransactionAttributeGrid>
            </Typography>
        </>
    );
};
