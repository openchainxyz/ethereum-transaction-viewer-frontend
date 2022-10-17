import React from 'react';
import { BigNumber, BigNumberish, ethers } from 'ethers';
import { TraceMetadata } from './types';
import { formatUnits, ParamType } from 'ethers/lib/utils';
import { createTheme } from '@mui/material';
// noinspection ES6UnusedImports
import {} from '@mui/lab/themeAugmentation';
import { TraceEntry, TraceEntryCall } from './api';

type TreeItemContentProps = {
    children: React.ReactNode;
};

export const theme = createTheme({
    components: {
        MuiDialogTitle: {
            styleOverrides: {
                root: {
                    paddingBottom: '6px',
                },
            },
        },
        MuiDialogContent: {
            styleOverrides: {
                root: {
                    paddingTop: '6px',
                },
            },
        },
        MuiTreeView: {
            styleOverrides: {
                root: {
                    // disabling this for now - if the tree is responsive then the scrollbar is at the bottom of the trace
                    // this makes it really annoying to scroll left/right if the trace is super long, because you have to go
                    // all the way down to the scrollbar
                    // overflow: 'auto',
                    // paddingBottom: '15px', // so the scrollbar doesn't cover the last trace item
                },
            },
        },
        MuiTreeItem: {
            styleOverrides: {
                content: {
                    cursor: 'initial',
                },
                label: {
                    fontSize: 'initial',
                },
                iconContainer: {
                    cursor: 'pointer',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                root: {
                    pointerEvents: 'none',
                },
            },
        },
        MuiTypography: {
            styleOverrides: {
                h5: {
                    fontFamily: 'monospace',
                    fontSize: 'initial',
                    whiteSpace: 'nowrap',
                },
                h6: {
                    fontFamily: 'NBInter',
                },
                body1: {
                    fontFamily: 'monospace',
                    wordWrap: 'break-word',
                    whiteSpace: 'break-spaces',
                },
                body2: {
                    fontFamily: 'monospace',
                    letterSpacing: 'initial',
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    padding: '0px 16px',
                    fontFamily: 'monospace',
                    letterSpacing: 'initial',
                    fontSize: '13px',
                },
                // head: {
                //     fontFamily: 'monospace',
                //     letterSpacing: 'initial',
                // },
                // body: {
                // },
            },
        },
    },
});

// lmao ethers wtf
export const BuiltinErrors: Record<
    string,
    { signature: string; inputs: Array<ParamType>; name: string; reason?: boolean }
> = {
    '0x08c379a0': {
        signature: 'Error(string)',
        name: 'Error',
        inputs: [ParamType.from('string message')],
        reason: true,
    },
    '0x4e487b71': { signature: 'Panic(uint256)', name: 'Panic', inputs: [ParamType.from('uint256 code')] },
};

export const TreeItemContentSpan = (props: TreeItemContentProps) => {
    return (
        <span
            tabIndex={0}
            onFocus={(event) => {
                // we don't want the tree to focus onto the root element when a user is trying
                // to select text
                //
                // this has the side effect of preventing users from using arrow keys to navigate
                // see: https://github.com/mui/material-ui/issues/29518

                event.stopPropagation();
            }}
            onClick={(event) => {
                // we don't want the tree item to expand when the user clicks on the context
                //
                // this has the side effect of disabling the ability to select the treeitem itself
                // but by now our tree is so fucked that it's fine
                event.stopPropagation();
            }}
            style={{
                display: 'flex',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
                letterSpacing: 'initial',
            }}
        >
            {props.children}
        </span>
    );
};

export const toHash = (value: ethers.BigNumberish): string => {
    return '0x' + BigNumber.from(value).toHexString().substring(2).padStart(64, '0');
};

export const chunkString = (str: string, len: number): string[] => {
    const size = Math.ceil(str.length / len);
    const r = Array(size);
    let offset = 0;

    for (let i = 0; i < size; i++) {
        r[i] = str.substring(offset, offset + len);
        offset += len;
    }

    return r;
};

export const findAffectedContract = (metadata: TraceMetadata, node: TraceEntry): [TraceEntryCall, TraceEntryCall[]] => {
    let path: TraceEntryCall[] = [];

    let parents = node.path.split('.');

    while (parents.length > 0) {
        parents.pop();

        let parentNode = metadata.nodesByPath[parents.join('.')];
        if (parentNode.type === 'call') {
            path.push(parentNode);

            if (parentNode.variant !== 'delegatecall') {
                path.reverse();

                return [parentNode, path];
            }
        }
    }

    throw new Error("strange, didn't find parent node");
};

export const formatUnitsSmartly = (value: BigNumberish, nativeUnit?: string): string => {
    nativeUnit = (nativeUnit || 'eth').toUpperCase();

    value = BigNumber.from(value);
    if (value.isZero()) {
        return `0 ${nativeUnit}`;
    }

    let chosenUnit;
    if (value.gte(BigNumber.from(100000000000000))) {
        chosenUnit = 'ether';
    } else if (value.gte(BigNumber.from(100000))) {
        chosenUnit = 'gwei';
    } else {
        chosenUnit = 'wei';
    }

    let formattedValue = formatUnits(value, chosenUnit);

    if (chosenUnit === 'ether') {
        chosenUnit = nativeUnit;
    }

    return `${formattedValue} ${chosenUnit}`;
};

export const formatUsd = (val: BigNumberish): string => {
    val = BigNumber.from(val);
    let formatted = formatUnits(val, 22);
    let [left, right] = formatted.split('.');

    // we want at least 4 decimal places on the right
    right = right.substring(0, 4).padEnd(4, '0');

    const isNegative = left.startsWith('-');
    if (isNegative) {
        left = left.substring(1);
    }

    // we want comma delimited triplets on the left
    if (left.length > 3) {
        let parts = [];
        if (left.length % 3 !== 0) {
            parts.push(left.substring(0, left.length % 3));
            left = left.substring(left.length % 3);
        }
        parts.push(chunkString(left, 3));

        left = parts.join(',');
    }

    return `${isNegative ? '-' : ''}${left}.${right.substring(0, 4)} USD`;
};
