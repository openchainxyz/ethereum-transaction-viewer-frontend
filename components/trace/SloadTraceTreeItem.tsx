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
import { TraceEntrySload, TraceResponse } from '../api';

type SloadTraceTreeItemProps = {
    traceResult: TraceResponse;
    traceMetadata: TraceMetadata;
    storageMetadata: StorageMetadata;
    node: TraceEntrySload;

    children?: JSX.Element[];
};

export const SloadTraceTreeItem = (props: SloadTraceTreeItemProps) => {
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
        let start = node.value.length - v.end / 4;
        let end = node.value.length - v.start / 4;
        return {
            name: v.name,
            value: node.value.substring(start, end),
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
                let dataRenderer = <DataRenderer data={v.value} preferredType={v.type} />;

                return (
                    <TreeItem
                        key={i}
                        nodeId={traceResult.txhash + '.' + node.path + '.trace.' + i}
                        label={
                            <TreeItemContentSpan>
                                {v.name}:&nbsp;{dataRenderer}
                            </TreeItemContentSpan>
                        }
                    />
                );
            })}
        </TreeView>
    );

    let dialogTitle = (
        <>
            sload&nbsp;
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
                    Value: <code>{node.value}</code>
                </Grid>
                <Grid item>Decoded slot trace: {dialogSlotTree}</Grid>
                <Grid item>Decoded values: {dialogValues}</Grid>
            </Grid>
        </>
    );

    let treeContent = (
        <>
            <TraceTreeNodeLabel nodeType={'sload'} nodeColor={'#407ee7'} onNodeClick={() => setOpen(true)} />
            &nbsp;
            <WithSeparator separator={<>,&nbsp;</>}>
                {vars.map((v, i) => {
                    return (
                        <React.Fragment key={i}>
                            {v.name}:&nbsp;
                            <DataRenderer data={v.value} preferredType={v.type} />
                        </React.Fragment>
                    );
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
