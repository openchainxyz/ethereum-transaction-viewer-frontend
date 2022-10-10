import { SvgIconProps } from '@mui/material';
import * as React from 'react';

type SpanIconButtonProps = {
    icon: React.JSXElementConstructor<SvgIconProps>;
    onClick: React.MouseEventHandler<HTMLSpanElement>;
};

export const SpanIconButton = (props: SpanIconButtonProps) => {
    return (
        <span style={{ whiteSpace: 'nowrap' }}>
            [
            <span onClick={props.onClick}>
                <props.icon sx={{ verticalAlign: 'middle', cursor: 'pointer' }} fontSize="inherit" />
            </span>
            ]
        </span>
    );
};
