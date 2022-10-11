import { DecodeNode, format } from './decoder';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import * as React from 'react';
import { Typography } from '@mui/material';
import { TraceTreeItem } from '../TraceTreeItem';
import { DecodeResult } from './types';
import { PriceMetadata, TokenMetadata } from '../types';

export type DecodeTreeProps = {
    decoded: DecodeResult;
    chain: string;
    labels: Record<string, string>;
    prices: PriceMetadata;
    tokens: TokenMetadata;
};

export const DecodeTree = (props: DecodeTreeProps) => {
    const recursivelyGenerateTree = (node: DecodeNode): JSX.Element[] => {
        let results: JSX.Element[] = [];
        for (let child of node.children) {
            results.push(...recursivelyGenerateTree(child));
        }
        if (node.results.length === 0) {
            return results;
        }

        return node.results.map((v, i) => {
            let id = node.node.id + '.result_' + i;
            return (
                <TraceTreeItem
                    key={id}
                    nodeId={id}
                    treeContent={format(v, {
                        chain: props.chain,
                        labels: props.labels,
                        prices: props.prices,
                        tokens: props.tokens,
                    })}
                >
                    {results}
                </TraceTreeItem>
            );
        });
    };

    let children;
    try {
        children = recursivelyGenerateTree(props.decoded.root);
    } catch (e) {
        console.log('failed to generate decoded tree!', e);
    }

    return (
        <>
            <TreeView
                aria-label="rich object"
                defaultCollapseIcon={<ExpandMoreIcon />}
                defaultExpandIcon={<ChevronRightIcon />}
            >
                {children}
            </TreeView>
        </>
    );
};
