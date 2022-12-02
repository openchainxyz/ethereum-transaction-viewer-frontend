import { Grid, Tooltip, Typography } from '@mui/material';
import * as React from 'react';
import { useContext } from 'react';
import { DateTime } from 'luxon';
import humanizeDuration from 'humanize-duration';
import { formatUnits } from 'ethers/lib/utils';
import { formatUnitsSmartly, formatUsd } from '../helpers';
import { DataRenderer } from '../DataRenderer';
import { ChainConfigContext } from '../Chains';
import { PriceMetadataContext } from '../metadata/prices';
import { BigNumber, ethers } from 'ethers';
import { TransactionMetadataContext } from '../metadata/transaction';

type TransactionAttributeGridProps = {
    children?: React.ReactNode[];
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
            <span style={{ color: '#a8a19f' }}>{props.name}:</span>&nbsp;{props.children}
        </Grid>
    );
};

type LegacyGasMetadata = {
    type: 'legacy';
};

type EIP1559GasMetadata = {
    type: 'eip1559';
};

type GasMetadata = LegacyGasMetadata | EIP1559GasMetadata;

type TransactionMetadata = {
    status: string;

    localTime: string;
    utcTime: string;
    timeSince: string;

    block: number;

    from: string;
    to: string;
    type: string;

    gasMetadata: GasMetadata;

    value: bigint;
};

type TransactionInfoProps = {};

export const TransactionInfo = (props: TransactionInfoProps) => {
    console.time('render transaction info');
    const transactionMetadata = useContext(TransactionMetadataContext);
    const chainConfig = useContext(ChainConfigContext);
    const priceMetadata = useContext(PriceMetadataContext);

    let blockTimestamp = DateTime.fromSeconds(transactionMetadata.block.timestamp);

    let localTime = blockTimestamp.toFormat('yyyy-MM-dd hh:mm:ss ZZZZ');
    let utcTime = blockTimestamp.toUTC().toFormat('yyyy-MM-dd hh:mm:ss ZZZZ');
    let timeSince = humanizeDuration(DateTime.now().toMillis() - blockTimestamp.toMillis(), { largest: 2 });

    let gasPriceInfo;
    if (transactionMetadata.transaction.type === 2) {
        gasPriceInfo = (
            <>
                <TransactionAttribute name={'Gas Price'}>
                    {formatUnits(transactionMetadata.receipt.effectiveGasPrice, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
                <TransactionAttribute name={'Max Priority Fee'}>
                    {formatUnits(transactionMetadata.transaction.maxPriorityFeePerGas!, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
                <TransactionAttribute name={'Max Fee'}>
                    {formatUnits(transactionMetadata.transaction.maxFeePerGas!, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
            </>
        );
    } else {
        if (!transactionMetadata.transaction.gasPrice) {
            transactionMetadata.transaction.gasPrice = BigNumber.from('0');
        }

        gasPriceInfo = (
            <>
                <TransactionAttribute name={'Gas Price'}>
                    {formatUnits(transactionMetadata.transaction.gasPrice!, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
            </>
        );
    }

    let transactionStatus;
    if (transactionMetadata.receipt.status === 0) {
        transactionStatus = 'Failed';
    } else if (transactionMetadata.receipt.status === 1) {
        transactionStatus = 'Succeeded';
    } else {
        transactionStatus = 'Unknown';
    }

    let historicalEthPrice = priceMetadata.prices[chainConfig.coingeckoId]?.historicalPrice;
    let currentEthPrice = priceMetadata.prices[chainConfig.coingeckoId]?.currentPrice;

    let transactionValue = transactionMetadata.transaction.value.toBigInt();
    let transactionFee =
        transactionMetadata.receipt.gasUsed.toBigInt() *
        (transactionMetadata.receipt.effectiveGasPrice?.toBigInt() ||
            transactionMetadata.transaction.gasPrice?.toBigInt());

    let transactionValueStr = formatUnitsSmartly(transactionValue, chainConfig.nativeSymbol);
    let transactionFeeStr = formatUnitsSmartly(transactionFee, chainConfig.nativeSymbol);

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
    try {
        const data = transactionMetadata.transaction.data.replace(/(00)+$/g, '');
        const utf8Str = ethers.utils.toUtf8String(data);
        if (!/[\x00-\x09\x0E-\x1F]/.test(utf8Str)) {
            calldataAsUtf8 = (
                <TransactionAttributeRow>
                    <TransactionAttribute name={'Message'}>
                        <br />
                        {utf8Str}
                    </TransactionAttribute>
                </TransactionAttributeRow>
            );
        }
    } catch {}

    const l = (
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
                                href={`${chainConfig.blockexplorerUrl}/block/${transactionMetadata.receipt.blockNumber}`}
                                target={'_blank'}
                                rel={'noreferrer noopener'}
                            >
                                {transactionMetadata.receipt.blockNumber}
                            </a>
                        </TransactionAttribute>
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        <TransactionAttribute name={'From'}>
                            <DataRenderer
                                showCopy={true}
                                preferredType={'address'}
                                data={transactionMetadata.transaction.from}
                            />
                        </TransactionAttribute>
                        <TransactionAttribute name={transactionMetadata.transaction.to ? 'To' : 'Created'}>
                            <DataRenderer
                                showCopy={true}
                                preferredType={'address'}
                                data={transactionMetadata.transaction.to || transactionMetadata.receipt.contractAddress}
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
                            {transactionMetadata.receipt.gasUsed.toString()}/
                            {transactionMetadata.transaction.gasLimit.toString()}&nbsp;(
                            {(
                                (transactionMetadata.receipt.gasUsed.toNumber() * 100) /
                                transactionMetadata.transaction.gasLimit.toNumber()
                            ).toPrecision(4)}
                            %)
                        </TransactionAttribute>
                        {gasPriceInfo}
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        <TransactionAttribute name={'Nonce'}>
                            {transactionMetadata.transaction.nonce}
                        </TransactionAttribute>
                        <TransactionAttribute name={'Index'}>
                            {transactionMetadata.receipt.transactionIndex}
                        </TransactionAttribute>
                        <TransactionAttribute name={'Type'}>
                            {transactionMetadata.transaction.type === 2
                                ? 'EIP-1559'
                                : transactionMetadata.transaction.type === 1
                                ? 'Access List'
                                : 'Legacy'}
                        </TransactionAttribute>
                    </TransactionAttributeRow>
                    {calldataAsUtf8}
                </TransactionAttributeGrid>
            </Typography>
        </>
    );
    console.timeEnd('render transaction info');
    return l;
};
