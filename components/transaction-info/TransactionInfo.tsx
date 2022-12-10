import { Provider } from '@ethersproject/providers';
import { Grid, Tooltip, Typography } from '@mui/material';
import { BigNumber, ethers } from 'ethers';
import { formatUnits, getContractAddress } from 'ethers/lib/utils';
import humanizeDuration from 'humanize-duration';
import { DateTime } from 'luxon';
import * as React from 'react';
import { useContext } from 'react';
import { ChainConfigContext } from '../Chains';
import { DataRenderer } from '../DataRenderer';
import { GasPriceEstimator } from '../gas-price-estimator/estimate';
import { formatUnitsSmartly, formatUsd } from '../helpers';
import { PriceMetadataContext } from '../metadata/prices';
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
    children?: React.ReactNode | React.ReactNode[];
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
    estimator: GasPriceEstimator;
    provider: Provider;
};

export const TransactionInfo = (props: TransactionInfoProps) => {
    console.time('render transaction info');
    const transactionMetadata = useContext(TransactionMetadataContext);
    const chainConfig = useContext(ChainConfigContext);
    const priceMetadata = useContext(PriceMetadataContext);

    const [estimatedConfirmation, setEstimatedConfirmation] =
        React.useState<['below_base_fee' | 'below_worst_tx' | 'nonce_too_high' | null, number]>();

    React.useMemo(() => {
        if (transactionMetadata.result === null) {
            props.estimator.start(() => {
                const estimationResult = props.estimator.estimate(transactionMetadata.transaction);
                console.log('estimated', estimationResult);
                if (estimationResult[0] === null) {
                    props.provider
                        .getTransactionCount(transactionMetadata.transaction.from)
                        .then((nonce) => {
                            if (transactionMetadata.transaction.nonce > nonce) {
                                setEstimatedConfirmation(['nonce_too_high', -1]);
                            } else {
                                console.log('setting confirmation to', estimationResult);
                                setEstimatedConfirmation(estimationResult);
                            }
                        })
                        .catch((e) => {
                            console.log('failed to get nonce', e);
                            setEstimatedConfirmation(estimationResult);
                        });
                } else {
                    setEstimatedConfirmation(estimationResult);
                }
            });
        } else {
            props.estimator.stop();
        }
    }, [transactionMetadata.result]);

    let transactionStatus: string;
    if (transactionMetadata.result === null) {
        transactionStatus = 'Pending';
    } else {
        if (transactionMetadata.result.receipt.status === 0) {
            transactionStatus = 'Failed';
        } else if (transactionMetadata.result.receipt.status === 1) {
            transactionStatus = 'Succeeded';
        } else {
            transactionStatus = 'Unknown';
        }
    }
    const statusAttribute = <TransactionAttribute name={'Status'}>{transactionStatus}</TransactionAttribute>;
    let timestampAttribute = null;
    let blockAttribute = null;
    let estimatedConfirmationAttribute = null;
    if (transactionMetadata.result === null) {
        let message;
        console.log('confirmation is', estimatedConfirmation);
        if (!estimatedConfirmation) {
            message = 'calculating...';
        } else {
            if (estimatedConfirmation[0] === 'below_base_fee') {
                message = 'never (max fee is below base fee)';
            } else if (estimatedConfirmation[0] === 'below_worst_tx') {
                message = 'a very long time (max fee is below cheapest txs)';
            } else if (estimatedConfirmation[0] === 'nonce_too_high') {
                message = 'unknown (blocked by a transaction with a lower nonce)';
            } else {
                const numBlocks = Math.round(estimatedConfirmation[1]);
                if (numBlocks === 0) {
                    message = 'any second now';
                } else {
                    const lowerBound = (numBlocks - 1) * 15 * 1000;
                    const upperBound = numBlocks * 15 * 1000;
                    message = 'between ' + humanizeDuration(lowerBound) + ' and ' + humanizeDuration(upperBound);
                }
            }
        }

        estimatedConfirmationAttribute = (
            <TransactionAttribute name={'Estimated Confirmation In'}>{message}</TransactionAttribute>
        );
    } else {
        let blockTimestamp = DateTime.fromSeconds(transactionMetadata.result.timestamp);

        let localTime = blockTimestamp.toFormat('yyyy-MM-dd hh:mm:ss ZZZZ');
        let utcTime = blockTimestamp.toUTC().toFormat('yyyy-MM-dd hh:mm:ss ZZZZ');
        let timeSince = humanizeDuration(DateTime.now().toMillis() - blockTimestamp.toMillis(), { largest: 2 });

        timestampAttribute = (
            <TransactionAttribute name={'Timestamp'}>
                <Tooltip title={utcTime}>
                    <span>{localTime}</span>
                </Tooltip>
                &nbsp;({timeSince} ago)
            </TransactionAttribute>
        );

        blockAttribute = (
            <TransactionAttribute name={'Block'}>
                <a
                    href={`${chainConfig.blockexplorerUrl}/block/${transactionMetadata.result.receipt.blockNumber}`}
                    target={'_blank'}
                    rel={'noreferrer noopener'}
                >
                    {transactionMetadata.result.receipt.blockNumber}
                </a>
            </TransactionAttribute>
        );
    }

    const toAddress = transactionMetadata.transaction.to || getContractAddress(transactionMetadata.transaction);

    const fromAttribute = (
        <TransactionAttribute name={'From'}>
            <DataRenderer showCopy={true} preferredType={'address'} data={transactionMetadata.transaction.from} />
        </TransactionAttribute>
    );

    const toAttribute = (
        <TransactionAttribute name={transactionMetadata.transaction.to ? 'To' : 'Created'}>
            <DataRenderer showCopy={true} preferredType={'address'} data={toAddress} />
        </TransactionAttribute>
    );

    let gasLimit = transactionMetadata.transaction.gasLimit.toBigInt();
    let gasPrice = 0n;
    if (transactionMetadata.transaction.gasPrice) {
        gasPrice = transactionMetadata.transaction.gasPrice.toBigInt();
    } else {
        if (transactionMetadata.transaction.maxFeePerGas) {
            gasPrice += transactionMetadata.transaction.maxFeePerGas.toBigInt();
        }
        if (transactionMetadata.transaction.maxPriorityFeePerGas) {
            gasPrice += transactionMetadata.transaction.maxPriorityFeePerGas.toBigInt();
        }
    }

    if (transactionMetadata.result !== null) {
        // update with actual values
        gasLimit = transactionMetadata.result.receipt.gasUsed.toBigInt();
        if (transactionMetadata.result.receipt.effectiveGasPrice) {
            gasPrice = transactionMetadata.result.receipt.effectiveGasPrice.toBigInt();
        }
    }

    const transactionValue = transactionMetadata.transaction.value.toBigInt();
    const transactionFee = gasLimit * gasPrice;

    let transactionValueStr = formatUnitsSmartly(transactionValue, chainConfig.nativeSymbol);
    let transactionFeeStr = formatUnitsSmartly(transactionFee, chainConfig.nativeSymbol);

    let transactionValueUSD;
    let transactionFeeUSD;

    const historicalEthPrice = priceMetadata.prices[chainConfig.coingeckoId]?.historicalPrice;
    const currentEthPrice = priceMetadata.prices[chainConfig.coingeckoId]?.currentPrice;
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

    const valueAttribute = (
        <TransactionAttribute name={'Value'}>
            {transactionValueStr}
            {transactionValueUSD}
        </TransactionAttribute>
    );
    const feeAttribute = (
        <TransactionAttribute
            name={transactionMetadata.result !== null ? 'Transaction Fee' : 'Maximum Transaction Fee'}
        >
            {transactionFeeStr}
            {transactionFeeUSD}
        </TransactionAttribute>
    );

    let gasUsedAttribute;
    if (transactionMetadata.result !== null) {
        gasUsedAttribute = (
            <TransactionAttribute name={'Gas Used'}>
                {transactionMetadata.result.receipt.gasUsed.toString()}/
                {transactionMetadata.transaction.gasLimit.toString()}&nbsp;(
                {(
                    (transactionMetadata.result.receipt.gasUsed.toNumber() * 100) /
                    transactionMetadata.transaction.gasLimit.toNumber()
                ).toPrecision(4)}
                %)
            </TransactionAttribute>
        );
    } else {
        gasUsedAttribute = (
            <TransactionAttribute name={'Gas Limit'}>
                {transactionMetadata.transaction.gasLimit.toString()}
            </TransactionAttribute>
        );
    }
    let gasPriceAttribute;
    if (transactionMetadata.transaction.type === 2) {
        gasPriceAttribute = (
            <>
                {transactionMetadata.result != null ? (
                    <TransactionAttribute name={'Gas Price'}>
                        {formatUnits(transactionMetadata.result.receipt.effectiveGasPrice, 'gwei')}&nbsp;gwei
                    </TransactionAttribute>
                ) : null}
                <TransactionAttribute name={'Max Priority Fee'}>
                    {formatUnits(transactionMetadata.transaction.maxPriorityFeePerGas!, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
                <TransactionAttribute name={'Max Fee'}>
                    {formatUnits(transactionMetadata.transaction.maxFeePerGas!, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
            </>
        );
    } else {
        gasPriceAttribute = (
            <>
                <TransactionAttribute name={'Gas Price'}>
                    {formatUnits(gasPrice, 'gwei')}&nbsp;gwei
                </TransactionAttribute>
            </>
        );
    }

    let calldataAsUtf8;
    try {
        const data = transactionMetadata.transaction.data.replace(/(00)+$/g, '');
        const utf8Str = ethers.utils.toUtf8String(data).trim();
        if (utf8Str.length > 0) {
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

    const result = (
        <>
            <Typography variant={'body1'} component={'div'}>
                <TransactionAttributeGrid>
                    <TransactionAttributeRow>
                        {statusAttribute}
                        {estimatedConfirmationAttribute}
                        {timestampAttribute}
                        {blockAttribute}
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        {fromAttribute}
                        {toAttribute}
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        {valueAttribute}
                        {feeAttribute}
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        {gasUsedAttribute}
                        {gasPriceAttribute}
                    </TransactionAttributeRow>
                    <TransactionAttributeRow>
                        <TransactionAttribute name={'Nonce'}>
                            {transactionMetadata.transaction.nonce}
                        </TransactionAttribute>
                        <TransactionAttribute name={'Type'}>
                            {transactionMetadata.transaction.type === 2
                                ? 'EIP-1559'
                                : transactionMetadata.transaction.type === 1
                                ? 'Access List'
                                : 'Legacy'}
                        </TransactionAttribute>
                        {transactionMetadata.result !== null ? (
                            <TransactionAttribute name={'Index'}>
                                {transactionMetadata.result.receipt.transactionIndex}
                            </TransactionAttribute>
                        ) : null}
                    </TransactionAttributeRow>
                    {calldataAsUtf8}
                </TransactionAttributeGrid>
            </Typography>
        </>
    );
    console.timeEnd('render transaction info');
    return result;
};
