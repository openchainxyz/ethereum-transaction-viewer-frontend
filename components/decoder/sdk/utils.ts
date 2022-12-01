import { ethers, BytesLike } from "ethers";
import { EventFragment, FunctionFragment } from '@ethersproject/abi/lib';
import { Log } from '@ethersproject/abstract-provider';

import { DecoderInput, DecoderInputReceiptExt, DecoderInputTraceExt } from '../sdk/types';

export const hasSelector = (calldata: BytesLike, selector: string | FunctionFragment) => {
    return (
        ethers.utils.hexlify(ethers.utils.arrayify(calldata).slice(0, 4)) ===
        ethers.utils.id(FunctionFragment.from(selector).format()).substring(0, 10)
    );
};

export const hasTopic = (log: Log, selector: string | EventFragment) => {
    return log.topics.length > 0 && log.topics[0] == ethers.utils.id(EventFragment.from(selector).format());
};

export const isEqualAddress = (a: string, b: string): boolean => {
    return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

export const hasReceiptExt = (node: DecoderInput): node is DecoderInputReceiptExt => {
    return (node as DecoderInputReceiptExt).logs !== undefined;
}

export const hasTraceExt = (node: DecoderInput): node is DecoderInputTraceExt => {
    return (node as DecoderInputTraceExt).returndata !== undefined;
}

export const getCalls = (node: DecoderInputTraceExt): DecoderInputTraceExt[] => {
    return node.children.filter(node => node.type === 'call');
}

export const flattenLogs = (node: DecoderInputReceiptExt): Log[] => {
    if (!hasTraceExt(node)) {
        return node.logs;
    }
    const result: Log[] = [];

    const visit = (node: DecoderInputTraceExt) => {
        node.childOrder.forEach(([type, val]) => {
            if (type === 'log') {
                result.push(node.logs[val]);
            } else {
                visit(node.children[val]);
            }
        });
    };

    visit(node);

    return result;
}

export const isDecoderInput = (node: DecoderInput | Log): node is DecoderInput => {
    return (node as DecoderInput).id !== undefined;
};

export const getNodeId = (node: DecoderInput | Log) => {
    if (isDecoderInput(node)) {
        return 'node:' + node.id;
    } else {
        return 'log:' + node.transactionHash + '.' + node.logIndex;
    }
};
