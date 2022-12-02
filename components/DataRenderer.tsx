import { ParamType } from '@ethersproject/abi/lib';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { styled, Tooltip, tooltipClasses, TooltipProps } from '@mui/material';
import { BigNumber, ethers } from 'ethers';
import { useContext } from 'react';
import { ChainConfig, ChainConfigContext } from './Chains';
import { LabelMetadataContext } from './metadata/labels';
import { PreimageMetadataContext } from './metadata/preimages';
import { SpanIconButton } from './SpanIconButton';

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
    chainConfig: ChainConfig,
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
                    href={`${chainConfig.blockexplorerUrl}/address/${address}`}
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
    labels?: Record<string, string>;
    data?: string;
    decodedData?: any;
    showCopy?: boolean;
    makeLink?: boolean;
    preferredType: string | ParamType | null;
    truncate?: boolean;
};

const NoMaxWidthTooltip = styled(({ className, ...props }: TooltipProps) => (
    <Tooltip {...props} classes={{ popper: className }} />
))({
    [`& .${tooltipClasses.tooltip}`]: {
        maxWidth: 'none',
    },
});

export const DataRenderer = (props: DataRendererProps) => {
    const chainConfig = useContext(ChainConfigContext);
    const labelMetadata = useContext(LabelMetadataContext);
    const preimageMetadata = useContext(PreimageMetadataContext);

    const abiCoder = ethers.utils.defaultAbiCoder;

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

        let hasPreimage = false;
        let wasIndexed = false;
        // console.log(paramType, decodedData, preimageMetadata.preimages);
        const want = paramType.indexed && paramType.baseType !== 'bytes32' ? decodedData.hash : decodedData;
        if ((paramType.type === 'bytes32' || paramType.indexed) && preimageMetadata.preimages[want] !== undefined) {
            decodedData = preimageMetadata.preimages[want];
            hasPreimage = true;
            wasIndexed = paramType.type !== 'bytes32' && paramType.indexed;
            paramType = ParamType.from('bytes');
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
            chainConfig,
            stringified,
            truncate || false,
            makeLink,
            props.labels || labelMetadata.labels,
        );

        if (paramType.baseType === 'address') {
            rendered = (
                <Tooltip
                    arrow
                    placement={'top'}
                    title={
                        <span
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                                const address = stringified.toLowerCase();

                                let newLabel = prompt(
                                    'Enter a new label',
                                    (props.labels || labelMetadata.labels)[address] || address,
                                );
                                if (newLabel !== null && newLabel !== address) {
                                    labelMetadata.updater((prevState) => {
                                        const newState = { ...prevState };

                                        if (!(chainConfig.id in newState.customLabels)) {
                                            newState.customLabels[chainConfig.id] = {};
                                        }
                                        newState.labels[address] = newLabel || newState.labels[address];
                                        newState.customLabels[chainConfig.id][address] = newLabel || '';
                                        localStorage.setItem('pref:labels', JSON.stringify(newState.customLabels));

                                        if (chainConfig.id === 'ethereum') {
                                            fetch(`https://tags.eth.samczsun.com/api/v1/address/${address}`, {
                                                method: 'POST',
                                                body: JSON.stringify({
                                                    label: newLabel,
                                                }),
                                            })
                                                .then(console.log)
                                                .catch(console.log);
                                        }

                                        return newState;
                                    });
                                }
                            }}
                        >
                            [Edit Label]
                        </span>
                    }
                >
                    {rendered}
                </Tooltip>
            );
        } else if (paramType.baseType === 'bytes' && hasPreimage && !wasIndexed) {
            rendered = (
                <NoMaxWidthTooltip arrow placement={'top'} title={<span>{ethers.utils.keccak256(decodedData)}</span>}>
                    <span>keccak256({rendered})</span>
                </NoMaxWidthTooltip>
            );
        }

        // console.log(paramType, decodedData, rendered);

        return (
            <>
                {copyButton}
                {rendered}
                {suffix}
            </>
        );
    } catch (e) {
        console.log('failed to render', props, e);
        return <>{props.data}</>;
    }
};
