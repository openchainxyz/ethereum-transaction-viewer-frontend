import { ParamType } from '@ethersproject/abi/lib.esm';
import { BigNumber, ethers } from 'ethers';
import * as React from 'react';
import { SpanIconButton } from './SpanIconButton';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { getChain } from './Chains';

const stringifyValue = (paramType: ParamType, value: any): string => {
    if (paramType.indexed && value.hash) {
        return value.hash;
    }

    if (paramType.baseType === 'address') {
        return ethers.utils.getAddress(value.toString());
    }

    return value.toString();
};

let formatValueWithParamType = (
    paramType: ParamType,
    chain: string,
    value: string,
    truncate: boolean,
    makeLink: boolean,
    labels?: Record<string, string>,
): JSX.Element => {
    if (paramType.baseType === 'address') {
        let address = value;
        let label = address;
        if (labels && labels[address.toLowerCase()]) {
            label = `[${labels[address.toLowerCase()]}]`;
        }

        if (makeLink) {
            return (
                <a
                    href={`${getChain(chain)?.blockexplorerUrl}/address/${address}`}
                    target={'_blank'}
                    rel={'noopener noreferrer'}
                >
                    {label}
                </a>
            );
        } else {
            return <>{label}</>;
        }
    }

    let encoded = value;
    if (encoded.length > 96 && truncate) {
        encoded = encoded.substring(0, 8) + '...' + encoded.substring(encoded.length - 8);
    }
    return <>{encoded}</>;
};

type DataRendererProps = {
    chain?: string;
    labels: Record<string, string>;
    data?: string;
    decodedData?: any;
    showCopy?: boolean;
    makeLink?: boolean;
    preferredType: string | null;
    truncate?: boolean;
};

export const DataRenderer = (props: DataRendererProps) => {
    const abiCoder = ethers.utils.defaultAbiCoder;

    let chain = props.chain || 'ethereum';
    let preferredType = props.preferredType || 'bytes32';
    let decodedData = props.decodedData;
    let data = props.data;
    let makeLink = props.makeLink === undefined ? true : props.makeLink;
    let truncate = props.truncate;

    let suffix = null;
    if (data) {
        if (data.startsWith('0x')) data = data.substring(2);
        data = '0x' + data.padStart(64, '0');
    }

    if (preferredType === 'stringHeader' && data) {
        if (BigNumber.from(data).isZero()) {
            preferredType = 'uint256';
            decodedData = BigNumber.from(0);
            suffix = <>&nbsp;(length)</>;
        } else {
            let lowestBit = parseInt(data.substring(data.length - 2)) & 0x01;
            if (lowestBit) {
                preferredType = 'uint256';
                decodedData = BigNumber.from(data).sub(BigNumber.from(1));
                suffix = <>&nbsp;(length)</>;
            } else {
                preferredType = 'ascii';
                data = data.substring(0, data.length - 2) + '00';
            }
        }
    }

    if (preferredType === 'ascii' && data) {
        data = data.replace(/(00)+$/g, '');
        return <>&apos;{ethers.utils.toUtf8String(data)}&apos;</>;
    }

    let paramType = ParamType.from(preferredType);
    if (paramType.type === 'contract') {
        paramType = ParamType.from('address');
    }

    try {
        if (decodedData === undefined && data) {
            decodedData = abiCoder.decode([paramType], data);
        }

        let stringified = stringifyValue(paramType, decodedData);

        let copyButton;
        if (props.showCopy) {
            copyButton = (
                <>
                    <SpanIconButton
                        icon={ContentCopyIcon}
                        onClick={() => {
                            navigator.clipboard.writeText(stringified);
                        }}
                    />
                    &nbsp;
                </>
            );
        }

        let rendered = formatValueWithParamType(
            paramType,
            chain,
            stringified,
            truncate || false,
            makeLink,
            props.labels,
        );
        return (
            <>
                {copyButton}
                {rendered}
                {suffix}
            </>
        );
    } catch (e) {
        return <>{props.data}</>;
    }
};
