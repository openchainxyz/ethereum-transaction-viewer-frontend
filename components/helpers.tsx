import React from "react";
import {BigNumber, ethers} from "ethers";
import {TraceEntryCallable, TraceEntrySload, TraceEntrySstore, TraceMetadata} from "./types";

export function apiEndpoint() {
    return process.env.NEXT_PUBLIC_API_HOST || 'https://tx.eth.samczsun.com';
}

type TreeItemContentProps = {
    children: React.ReactNode,
}

export const TreeItemContentSpan = (props: TreeItemContentProps) => {
    return <span tabIndex={0} onFocus={event => {
        // we don't want the tree to focus onto the root element when a user is trying
        // to select text
        //
        // this has the side effect of preventing users from using arrow keys to navigate
        // see: https://github.com/mui/material-ui/issues/29518

        event.stopPropagation();
    }} onClick={event => {
        // we don't want the tree item to expand when the user clicks on the context
        //
        // this has the side effect of disabling the ability to select the treeitem itself
        // but by now our tree is so fucked that it's fine
        event.stopPropagation();
    }} style={{
        display: 'flex',
        whiteSpace: 'nowrap',
        fontFamily: 'monospace',
    }}>{props.children}</span>
};

export const toHash = (value: ethers.BigNumberish): string => {
    return "0x" + BigNumber.from(value).toHexString().substring(2).padStart(64, "0");
}

export const chunkString = (str: string, len: number): string[] => {
    const size = Math.ceil(str.length / len)
    const r = Array(size)
    let offset = 0

    for (let i = 0; i < size; i++) {
        r[i] = str.substring(offset, offset + len)
        offset += len
    }

    return r
}

export const findAffectedContract = (metadata: TraceMetadata, node: TraceEntrySload | TraceEntrySstore): [TraceEntryCallable, TraceEntryCallable[]] => {
    let path: TraceEntryCallable[] = [];

    let parents = node.id.split(".");

    while (parents.length > 0) {
        parents.pop();

        let parentNode = metadata.nodesById[parents.join(".")];
        if (parentNode.type === 'call' || parentNode.type === 'create') {
            path.push(parentNode);

            if ((parentNode.type === 'call' && parentNode.variant !== 'delegatecall') || (parentNode.type === 'create')) {
                path.reverse();

                return [parentNode, path];
            }
        }
    }

    throw new Error("strange, didn't find parent node");
};
