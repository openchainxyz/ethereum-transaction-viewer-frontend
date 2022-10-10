import { SpanIconButton } from './SpanIconButton';
import FormatClearIcon from '@mui/icons-material/FormatClear';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import { chunkString } from './helpers';
import { TextField } from '@mui/material';
import * as React from 'react';

type EncodedABITextFieldProps = {
    name: string;
    hasSelector: boolean;
    initialValue: string;
    value: string;
    setter: React.Dispatch<React.SetStateAction<string>>;
};

export const EncodedABITextField = (props: EncodedABITextFieldProps) => {
    const [shouldWrap, setShouldWrap] = React.useState(true);

    const { name, hasSelector, initialValue, value, setter } = props;

    return (
        <>
            {name}&nbsp;
            <SpanIconButton
                icon={FormatClearIcon}
                onClick={() => {
                    setter(initialValue.replace(/\n/g, ''));
                    setShouldWrap(true);
                }}
            />
            &nbsp;
            <SpanIconButton
                icon={FormatAlignJustifyIcon}
                onClick={() => {
                    let selector = hasSelector ? initialValue.substring(0, 10) : '';
                    let data = hasSelector ? initialValue.substring(10) : initialValue.substring(2);
                    let chunks = chunkString(data, 64);

                    let maxLen = ((chunks.length - 1) * 32).toString(16).length;
                    setter(
                        (hasSelector ? selector + '\n' : '') +
                            chunks
                                .map((v, i) => '0x' + (i * 32).toString(16).padStart(maxLen, '0') + ': ' + v)
                                .join('\n'),
                    );
                    setShouldWrap(false);
                }}
            />
            :<br />
            <TextField
                size={'small'}
                inputProps={{
                    style: {
                        fontFamily: 'monospace',
                        fontSize: 'initial',
                        letterSpacing: 'initial',
                        lineHeight: 'initial',
                    },
                    wrap: shouldWrap ? 'on' : 'off',
                }}
                maxRows={12}
                minRows={0}
                value={value}
                onChange={(e) => setter(e.target.value)}
                multiline
                fullWidth
            ></TextField>
        </>
    );
};
