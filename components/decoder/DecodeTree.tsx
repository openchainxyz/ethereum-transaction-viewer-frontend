import { format } from './decoder';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import * as React from 'react';
import { TraceTreeItem } from '../TraceTreeItem';
import {DecoderOutput, getNodeId} from './types';
import {PriceMetadata, PriceMetadataContext} from '../metadata/prices';
import {TokenMetadata, TokenMetadataContext} from '../metadata/tokens';
import {LabelMetadataContext} from "../metadata/labels";
import {useContext} from "react";

export type DecodeTreeProps = {
    decoded: DecoderOutput;
    chain: string;
    timestamp: number;
};

export const DecodeTree = (props: DecodeTreeProps) => {
    const priceMetadata = useContext(PriceMetadataContext);
    const tokenMetadata = useContext(TokenMetadataContext);
    const labelMetadata = useContext(LabelMetadataContext);

    const recursivelyGenerateTree = (node: DecoderOutput): JSX.Element[] => {
        let results: JSX.Element[] = [];
        if (node.children) {
            for (let child of node.children) {
                results.push(...recursivelyGenerateTree(child));
            }
        }
        if (node.results.length === 0) {
            return results;
        }

        return node.results.map((v, i) => {
            let id = getNodeId(node.node) + '.result_' + i;
            return (
                <TraceTreeItem
                    key={id}
                    nodeId={id}
                    treeContent={format(v, {
                        timestamp: props.timestamp,
                        chain: props.chain,
                        prices: priceMetadata,
                        tokens: tokenMetadata,
                    })}
                >
                    {results}
                </TraceTreeItem>
            );
        });
    };

    let children;
    try {
        children = recursivelyGenerateTree(props.decoded);
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
