import { decode, format } from './decoder';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import * as React from 'react';
import { TraceTreeItem } from '../trace/TraceTreeItem';
import { DecoderOutput, getNodeId } from './types';
import { fetchDefiLlamaPrices, PriceMetadata, PriceMetadataContext } from '../metadata/prices';
import { fetchTokenMetadata, TokenMetadata, TokenMetadataContext } from '../metadata/tokens';
import { LabelMetadataContext } from '../metadata/labels';
import { useContext } from 'react';
import { TraceResponse } from '../api';
import { TraceMetadata } from '../types';
import { ChainConfigContext } from '../Chains';
import { TransactionMetadataContext } from '../metadata/transaction';
import { BaseProvider } from '@ethersproject/providers';

export type DecodeTreeProps = {
    provider: BaseProvider;
    traceResult: TraceResponse;
    traceMetadata: TraceMetadata;
};

export const DecodeTree = (props: DecodeTreeProps) => {
    const priceMetadata = useContext(PriceMetadataContext);
    const tokenMetadata = useContext(TokenMetadataContext);
    const transactionMetadata = useContext(TransactionMetadataContext);
    const chainConfig = useContext(ChainConfigContext);

    const [decodedActions, requestedMetadata] = React.useMemo(() => {
        return decode(props.traceResult, props.traceMetadata);
    }, [props.traceResult, props.traceMetadata]);

    fetchDefiLlamaPrices(
        priceMetadata.updater,
        Array.from(requestedMetadata.tokens).map((token) => `${chainConfig.defillamaPrefix}:${token}`),
        transactionMetadata.block.timestamp,
    );

    fetchTokenMetadata(tokenMetadata.updater, props.provider, Array.from(requestedMetadata.tokens));

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
                        timestamp: transactionMetadata.block.timestamp,
                        chain: chainConfig.id,
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
        children = recursivelyGenerateTree(decodedActions);
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
