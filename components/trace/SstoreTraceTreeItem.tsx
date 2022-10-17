import { StorageMetadata, TraceMetadata } from '../types';
import * as React from 'react';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { renderSlotTree } from './SlotTree';
import { DataRenderer } from '../DataRenderer';
import TreeItem from '@mui/lab/TreeItem';
import { findAffectedContract, TreeItemContentSpan } from '../helpers';
import WithSeparator from 'react-with-separator';
import { Grid } from '@mui/material';
import { TraceTreeItem, TraceTreeNodeLabel } from './TraceTreeItem';
import { TraceTreeDialog } from './TraceTreeDialog';
import { TraceEntrySstore, TraceResponse } from '../api';

type SstoreTraceTreeItemProps = {
    traceResult: TraceResponse;
    traceMetadata: TraceMetadata;
    storageMetadata: StorageMetadata;
    node: TraceEntrySstore;

    children?: JSX.Element[];
};

export const SstoreTraceTreeItem = (props: SstoreTraceTreeItemProps) => {
    const { traceResult, traceMetadata, storageMetadata, node, children } = props;

    const [open, setOpen] = React.useState(false);

    let [affectedCall] = findAffectedContract(traceMetadata, node);

    let ourSlots = storageMetadata.slots[affectedCall.to][affectedCall.codehash];

    let variablesSorted = Object.entries(ourSlots[node.slot].variables)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .map(([offset, variableInfo]) => {
            let start = parseInt(offset);
            let end = start + variableInfo.bits;
            return {
                name: variableInfo.fullName,
                start: start,
                end: end,
                type: variableInfo.typeName.typeDescriptions.typeString,
            };
        });

    if (!variablesSorted.length) {
        variablesSorted = [
            {
                name: node.slot,
                start: 0,
                end: 256,
                type: 'bytes32',
            },
        ];
    }

    let vars = variablesSorted.map((v, i) => {
        let start = node.oldValue.length - v.end / 4;
        let end = node.oldValue.length - v.start / 4;
        return {
            name: v.name,
            oldValue: node.oldValue.substring(start, end),
            newValue: node.newValue.substring(start, end),
            type: v.type,
        };
    });

    let dialogSlotTree = (
        <TreeView
            aria-label="rich object"
            defaultCollapseIcon={<ExpandMoreIcon />}
            defaultExpandIcon={<ChevronRightIcon />}
        >
            {renderSlotTree(ourSlots, node.slot, 'root')}
        </TreeView>
    );

    let dialogValues = (
        <TreeView
            aria-label="rich object"
            defaultCollapseIcon={<ExpandMoreIcon />}
            defaultExpandIcon={<ChevronRightIcon />}
        >
            {vars.map((v, i) => {
                let oldDataRenderer = <DataRenderer data={v.oldValue} preferredType={v.type} />;
                let newDataRenderer = <DataRenderer data={v.newValue} preferredType={v.type} />;

                return (
                    <TreeItem
                        key={i}
                        nodeId={traceResult.txhash + '.' + node.path + '.trace.' + i}
                        label={
                            <TreeItemContentSpan>
                                {v.name}:&nbsp;{oldDataRenderer}&nbsp;→&nbsp;
                                {newDataRenderer}
                            </TreeItemContentSpan>
                        }
                    />
                );
            })}
        </TreeView>
    );

    let dialogTitle = (
        <>
            sstore&nbsp;
            <WithSeparator separator={<>,&nbsp;</>}>
                {variablesSorted.map((v) => {
                    return <React.Fragment key={v.start}>{v.name}</React.Fragment>;
                })}
            </WithSeparator>
        </>
    );

    let dialogContent = (
        <>
            <Grid container direction={'column'}>
                <Grid item>
                    Trace Path: <code>{node.path}</code>
                </Grid>
                <Grid item>
                    Slot: <code>{node.slot}</code>
                </Grid>
                <Grid item>
                    Old Value: <code>{node.oldValue}</code>
                </Grid>
                <Grid item>
                    New Value: <code>{node.newValue}</code>
                </Grid>
                <Grid item>Decoded slot trace: {dialogSlotTree}</Grid>
                <Grid item>Decoded values: {dialogValues}</Grid>
            </Grid>
        </>
    );

    let treeContent = (
        <>
            <TraceTreeNodeLabel nodeType={'sstore'} nodeColor={'#c33ff3'} onNodeClick={() => setOpen(true)} />
            &nbsp;
            <WithSeparator separator={<>,&nbsp;</>}>
                {vars.map((v, i) => {
                    let oldDataRenderer = <DataRenderer data={v.oldValue} preferredType={v.type} />;
                    let newDataRenderer = <DataRenderer data={v.newValue} preferredType={v.type} />;
                    if (v.oldValue === v.newValue) {
                        return (
                            <span
                                key={i}
                                style={{
                                    color: '#a8a19f',
                                }}
                            >
                                {v.name}:&nbsp;{oldDataRenderer}
                                &nbsp;→&nbsp;(unchanged)
                            </span>
                        );
                    } else {
                        return (
                            <React.Fragment key={i}>
                                {v.name}:&nbsp;{oldDataRenderer}&nbsp;→&nbsp;
                                {newDataRenderer}
                            </React.Fragment>
                        );
                    }
                })}
            </WithSeparator>
        </>
    );

    return (
        <>
            <TraceTreeDialog title={dialogTitle} content={dialogContent} open={open} setOpen={setOpen} />
            <TraceTreeItem nodeId={node.path} treeContent={treeContent}>
                {children}
            </TraceTreeItem>
        </>
    );
};
