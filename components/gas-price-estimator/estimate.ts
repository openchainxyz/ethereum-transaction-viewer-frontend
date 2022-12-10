import { BlockWithTransactions, TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider';
import { JsonRpcProvider } from '@ethersproject/providers';

// https://stackoverflow.com/questions/20811131/javascript-remove-outlier-from-an-array
function filterOutliers(someArray: number[]) {
    // Copy the values, rather than operating on references to existing values
    var values = someArray.concat();

    // Then sort
    values.sort(function (a, b) {
        return a - b;
    });

    /* Then find a generous IQR. This is generous because if (values.length / 4)
     * is not an int, then really you should average the two elements on either
     * side to find q1.
     */
    var q1 = values[Math.floor(values.length / 4)];
    // Likewise for q3.
    var q3 = values[Math.ceil(values.length * (3 / 4))];
    var iqr = q3 - q1;

    // Then find min and max values
    var maxValue = q3 + iqr * 1.5;
    var minValue = q1 - iqr * 1.5;

    // Then filter anything beyond or beneath these values.
    var filteredValues = values.filter(function (x) {
        return x <= maxValue && x >= minValue;
    });

    // Then return
    return filteredValues;
}

// https://github.com/ethereum/go-ethereum/blob/6d55908347cac7463dd6a2cb236f30ec26c9a121/consensus/misc/eip1559.go#L55
const calculateNextBaseFee = (gasUsed: number, gasLimit: number, baseFee: number): number => {
    const gasTarget = Math.floor(gasLimit / 2);

    if (gasUsed > gasTarget) {
        return baseFee + Math.max(1, ((gasUsed - gasTarget) * baseFee) / gasTarget / 8);
    } else if (gasUsed < gasTarget) {
        return Math.max(0, baseFee - ((gasTarget - gasUsed) * baseFee) / gasTarget / 8);
    } else {
        return baseFee;
    }
};

type BlockAnalysis = {
    blockNumber: number;
    baseFee: bigint | undefined;
    acceptedGasPrices: number[];
};

export class GasPriceEstimator {
    private provider: JsonRpcProvider;
    private listener: (blockNumber: number) => void;

    private lastBaseFee: [number, number] | null = null;
    private analysis: BlockAnalysis[] = [];

    private tick: () => void = () => {};

    private state: boolean = false;

    private useFeeHistory: boolean = false;

    private feeInfos: FeeInfo[] = [];

    constructor(provider: JsonRpcProvider) {
        this.provider = provider;
        this.listener = this.onNewBlock.bind(this);
    }

    private processBlock(block: BlockWithTransactions) {
        if (block.baseFeePerGas) {
            if (!this.lastBaseFee || block.number > this.lastBaseFee[0]) {
                this.lastBaseFee = [block.number, block.baseFeePerGas?.toNumber()];
            }
        }

        if (block.transactions.length === 0) return;

        const transactionsByHash: Record<string, TransactionResponse> = block.transactions.reduce(
            (v, tx) => ({ ...v, [tx.hash]: tx }),
            {},
        );

        Promise.allSettled(block.transactions.map((tx) => this.provider.getTransactionReceipt(tx.hash)))
            .then((results) =>
                results
                    .filter(
                        (result): result is PromiseFulfilledResult<TransactionReceipt> => result.status === 'fulfilled',
                    )
                    .map((result) => result.value)
                    .filter((result) => result),
            )
            .then((receipts) => {
                const prices = receipts
                    .map((receipt) =>
                        (receipt.effectiveGasPrice || transactionsByHash[receipt.transactionHash].gasPrice!).toNumber(),
                    )
                    .sort((a, b) => b - a);

                this.analysis.push({
                    blockNumber: block.number,
                    baseFee: block.baseFeePerGas?.toBigInt(),
                    acceptedGasPrices: prices,
                });

                this.analysis.sort((a, b) => a.blockNumber - b.blockNumber);
                this.analysis = this.analysis.slice(0, 64);

                this.tick();
            });
    }

    public estimate(transaction: TransactionResponse): ['below_base_fee' | 'below_worst_tx' | null, number] {
        console.log('fee infos', this.feeInfos);

        const newestFeeInfo = this.feeInfos[0];

        let maxGasPrice: number = 0;
        if (newestFeeInfo.baseFee) {
            if (transaction.maxPriorityFeePerGas && transaction.maxFeePerGas) {
                maxGasPrice = Math.min(
                    transaction.maxFeePerGas.toNumber(),
                    newestFeeInfo.baseFee + transaction.maxPriorityFeePerGas.toNumber(),
                );
            }
        }
        if (!maxGasPrice && transaction.gasPrice) {
            maxGasPrice = transaction.gasPrice.toNumber();
        }

        if (newestFeeInfo.baseFee && maxGasPrice < newestFeeInfo.baseFee) {
            return ['below_base_fee', -1];
        }

        const total = this.feeInfos
            .map((feeInfo) => {
                // const weight = this.analysis.length - idx;

                // if (maxGasPrice > analysis.acceptedGasPrices[0]) {
                //     return [weight, weight];
                // }

                // const noOutliers = filterOutliers(analysis.acceptedGasPrices).sort((a, b) => b - a);

                // const highestPrice = noOutliers[0];
                // const lowestPrice = noOutliers[noOutliers.length - 1];

                // const positionInBlock = (maxGasPrice - lowestPrice) / (highestPrice - lowestPrice);
                // console.log("params are", Number(maxGasPrice) / 1e9, Number(lowestPrice) / 1e9, Number(highestPrice) / 1e9, positionInBlock);

                // let probability = positionInBlock / 0.7;
                // if (probability < 0) probability = 0;
                // if (probability > 1) probability = 1;

                // return [probability * weight, weight];

                if (maxGasPrice < feeInfo.rewards[0]) {
                    return 0;
                } else if (maxGasPrice > feeInfo.rewards[2]) {
                    return 1;
                }

                if (maxGasPrice < feeInfo.rewards[1]) {
                    return ((maxGasPrice - feeInfo.rewards[0]) / (feeInfo.rewards[1] - feeInfo.rewards[0])) * 0.7;
                } else {
                    return 0.7 + ((maxGasPrice - feeInfo.rewards[1]) / (feeInfo.rewards[2] - feeInfo.rewards[1])) * 0.3;
                }
            })
            .reduce((p, v) => p + v, 0);

        if (total === 0) {
            return ['below_worst_tx', -1];
        }

        console.log('total is', total);
        const probability = total / this.feeInfos.length;

        return [null, 1 / probability];
    }

    public start(tick: () => void) {
        this.tick = tick;

        if (this.state) return;
        this.state = true;

        console.log('starting estimator');

        this.fetchFeeHistory()
            .then(() => {
                this.useFeeHistory = true;
                console.log('we can use fee history!');
            })
            .catch((e) => {
                this.useFeeHistory = false;
                console.log("we can't use fee history!", e);

                this.fetchBlockHistory();
            });

        this.provider.addListener('block', this.listener);
    }

    public stop() {
        if (!this.state) return;
        this.state = false;

        this.tick = () => {};
        this.provider.removeListener('block', this.listener);
    }

    private onNewBlock(blockNumber: number) {
        if (this.useFeeHistory) {
            this.fetchFeeHistory();
        } else {
            this.provider
                .getBlockWithTransactions(blockNumber)
                .then((result) => this.handleBlocks([result]))
                .catch(() => {});
        }
    }

    private async fetchFeeHistory(): Promise<void> {
        const feeHistory: FeeHistoryResponseRaw = await this.provider.send('eth_feeHistory', [
            16,
            'latest',
            [1, 50, 99],
        ]);

        const response: FeeInfo[] = [];
        const oldestBlock = parseInt(feeHistory.oldestBlock, 16);
        for (let i = 0; i < 16; i++) {
            response.push({
                blockNumber: oldestBlock + i,
                baseFee: parseInt(feeHistory.baseFeePerGas[i], 16),
                gasUsedRatio: feeHistory.gasUsedRatio[i],
                rewards: feeHistory.reward[i].map((v) => parseInt(v, 16)),
            });
        }

        this.processFeeInfos(response, true);
    }

    private async fetchBlockHistory(): Promise<void> {
        const blockNumber = await this.provider.getBlockNumber();

        const promises: Promise<BlockWithTransactions>[] = [];
        for (let i = 0; i < 16; i++) {
            promises.push(this.provider.getBlockWithTransactions(blockNumber - i));
        }

        const promiseResults = await Promise.allSettled(promises);

        const blocks = promiseResults
            .filter((result): result is PromiseFulfilledResult<BlockWithTransactions> => result.status === 'fulfilled')
            .map((result) => result.value);

        this.handleBlocks(blocks);
    }

    private async handleBlocks(blocks: BlockWithTransactions[]) {
        const receiptPromises: Promise<TransactionReceipt>[][] = [];
        for (const block of blocks) {
            receiptPromises.push(block.transactions.map((tx) => this.provider.getTransactionReceipt(tx.hash)));
        }

        const feeInfos: FeeInfo[] = [];
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const receiptResults = await Promise.allSettled(receiptPromises[i]);

            const receipts = receiptResults
                .filter((result): result is PromiseFulfilledResult<TransactionReceipt> => result.status === 'fulfilled')
                .map((result) => result.value);

            feeInfos.push(this.blockHistoryToFeeInfo(block, receipts));
        }

        this.processFeeInfos(feeInfos, false);
    }

    private blockHistoryToFeeInfo(block: BlockWithTransactions, receipts: TransactionReceipt[]): FeeInfo {
        const transactionsByHash: Record<string, TransactionResponse> = block.transactions.reduce(
            (v, tx) => ({ ...v, [tx.hash]: tx }),
            {},
        );

        const getGasPrice = (receipt: TransactionReceipt): number => {
            if (receipt.effectiveGasPrice) {
                return receipt.effectiveGasPrice.toNumber();
            }

            const gasPrice = transactionsByHash[receipt.transactionHash].gasPrice;
            if (gasPrice) {
                return gasPrice.toNumber();
            }

            return 0;
        };

        const getPercentile = (values: number[], percentile: number): number => {
            const pos = ((values.length - 1) * percentile) / 100;
            const base = Math.floor(pos);
            const rest = pos - base;
            if (base + 1 < values.length) {
                return values[base] + rest * (values[base + 1] - values[base]);
            } else {
                return values[base];
            }
        };

        const effectiveGasPrices = receipts.map(getGasPrice).sort((a, b) => a - b);
        const percentiles = [1, 50, 99];

        return {
            blockNumber: block.number,
            baseFee: block.baseFeePerGas?.toNumber(),
            gasUsedRatio: block.gasUsed.toNumber() / block.gasLimit.toNumber(),
            rewards: percentiles.map((percentile) => getPercentile(effectiveGasPrices, percentile)),
        };
    }

    private processFeeInfos(feeInfos: FeeInfo[], reset: boolean) {
        if (reset) {
            this.feeInfos = [];
        }

        this.feeInfos.push(...feeInfos);
        this.feeInfos.sort((a, b) => b.blockNumber - a.blockNumber);
        this.tick();
    }
}

type FeeHistoryResponseRaw = {
    baseFeePerGas: string[];
    gasUsedRatio: number[];
    oldestBlock: string;
    reward: string[][];
};

type FeeInfo = {
    blockNumber: number;
    baseFee: number | undefined;
    gasUsedRatio: number;
    rewards: number[];
};
