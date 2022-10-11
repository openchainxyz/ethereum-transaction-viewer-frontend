import { TextField } from '@mui/material';
import * as React from 'react';

type FragmentTextFieldProps = {
    name: string;
    value: string;
    onChange: React.Dispatch<React.SetStateAction<string>>;
};

export const FragmentTextField = (props: FragmentTextFieldProps) => {
    const { name, value, onChange } = props;

    return (
        <>
            {name}:<br />
            <TextField
                size={'small'}
                inputProps={{
                    style: {
                        fontFamily: 'monospace',
                        fontSize: 'initial',
                        resize: 'both',
                        letterSpacing: 'initial',
                        lineHeight: 'initial',
                    },
                    wrap: 'on',
                }}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                fullWidth
            ></TextField>
        </>
    );
};
