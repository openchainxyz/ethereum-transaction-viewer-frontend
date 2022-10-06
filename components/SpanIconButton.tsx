import {SvgIcon, SvgIconProps} from "@mui/material";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import * as React from "react";

type SpanIconButtonProps = {
    icon: React.JSXElementConstructor<SvgIconProps>,
    onClick: React.MouseEventHandler<HTMLSpanElement>,
}

export const SpanIconButton = (props: SpanIconButtonProps) => {
    return <>[<span onClick={props.onClick}>
        <props.icon sx={{verticalAlign: 'middle', cursor: 'pointer'}} fontSize="inherit"/>
    </span>]</>;
}