import { TraceEntryCallable, TraceMetadata } from '../types';
import * as React from 'react';
import { ParamType } from '@ethersproject/abi';
import { ParamFlatView } from '../ParamFlatView';
import { DataRenderer } from '../DataRenderer';
import { Grid, List, ListItem } from '@mui/material';
import { ParamTreeView } from '../ParamTreeView';
import { TraceTreeItem, TraceTreeNodeLabel } from './TraceTreeItem';
import { TraceTreeDialog } from './TraceTreeDialog';
import { EncodedABITextField } from '../EncodedABITextField';
import { FragmentTextField } from '../FragmentTextField';
import { useEventFragment } from '../hooks/useFragment';
import { TraceEntryLog, TraceResponse } from '../api';

type LogTraceTreeItemProps = {
    traceResult: TraceResponse;
    traceMetadata: TraceMetadata;
    node: TraceEntryLog;
    onClick?: () => void;
    showAddress?: boolean;

    children?: JSX.Element[];
};

export const LogTraceTreeItem = (props: LogTraceTreeItemProps) => {
    const { traceResult, traceMetadata, node, children } = props;

    const [open, setOpen] = React.useState(false);

    let parentId = node.path.split('.');
    parentId.pop();
    let parentNode = traceMetadata.nodesByPath[parentId.join('.')] as TraceEntryCallable;

    const [eventFragment, setEventFragment, parsedEventFragment] = useEventFragment(
        (() => {
            if (node.topics.length > 0) {
                try {
                    return traceMetadata.abis[parentNode.to][parentNode.codehash].getEvent(node.topics[0]);
                } catch (e) {}
            } else {
                return (
                    Object.values(traceMetadata.abis[parentNode.to][parentNode.codehash].events).find(
                        (event) => event.anonymous,
                    ) || null
                );
            }

            return null;
        })(),
        `event Event()`,
    );

    const [nodeData, setNodeData] = React.useState(node.data);

    let dialogTitle: JSX.Element;
    let dialogContent: JSX.Element;

    let fakeParams = [
        ...node.topics.map((v, i) => {
            return ParamType.from(`bytes32 topic_${i}`);
        }),
        ParamType.from(`bytes data`),
    ];
    let fakeValues = [...node.topics, node.data];

    let eventName;
    let eventParams = <ParamFlatView traceMetadata={traceMetadata} params={fakeParams} values={fakeValues} />;
    if (node.topics.length > 0) {
        eventName = <>{node.topics[0]}</>;
    } else {
        eventName = <>Anonymous Event</>;
    }

    let parsedEvent;
    if (parsedEventFragment) {
        eventName = <span style={{ color: '#7b9726' }}>{parsedEventFragment.name}</span>;

        try {
            let abi = traceMetadata.abis[parentNode.to][parentNode.codehash];
            let mangledTopics;
            if (!parsedEventFragment.anonymous) {
                mangledTopics = [abi.getEventTopic(parsedEventFragment), ...node.topics.slice(1)];
            } else {
                mangledTopics = node.topics;
            }
            parsedEvent = abi.decodeEventLog(parsedEventFragment, node.data, mangledTopics);
            parsedEvent.forEach((v) => v.toString());
            if (parsedEvent) {
                eventParams = (
                    <ParamFlatView
                        traceMetadata={traceMetadata}
                        params={parsedEventFragment.inputs}
                        values={parsedEvent}
                    />
                );
            }
        } catch (e) {
            parsedEvent = null;
        }
    }

    dialogTitle = (
        <>
            {<DataRenderer data={parentNode.to} preferredType={'address'} makeLink={false} />}.
            <span style={{ color: '#7b9726' }}>{eventName}</span>
        </>
    );
    dialogContent = (
        <>
            <Grid container direction={'column'}>
                <Grid item>
                    Trace Path: <code>{node.path}</code>
                </Grid>
                <Grid item>
                    Event Topics: <br />
                    <List dense={true}>
                        {node.topics.map((v, i) => (
                            <ListItem key={i} dense={true} sx={{ paddingTop: '0px', paddingBottom: '0px' }}>
                                {v}
                            </ListItem>
                        ))}
                    </List>
                </Grid>
                <Grid item>
                    <EncodedABITextField
                        name={'Event Data'}
                        hasSelector={false}
                        initialValue={node.data}
                        value={nodeData}
                        setter={setNodeData}
                    />
                </Grid>
                <Grid item>
                    <FragmentTextField name={'Event'} value={eventFragment} onChange={setEventFragment} />
                </Grid>
                <Grid item>Decoded Data:</Grid>
                <Grid item>
                    {parsedEventFragment && parsedEvent ? (
                        <ParamTreeView
                            traceMetadata={traceMetadata}
                            path={node.path + '.input'}
                            params={parsedEventFragment.inputs}
                            values={parsedEvent}
                        />
                    ) : (
                        <ParamTreeView
                            traceMetadata={traceMetadata}
                            path={node.path + '.input'}
                            params={fakeParams}
                            values={fakeValues}
                        />
                    )}
                </Grid>
            </Grid>
        </>
    );

    let treeContent = (
        <>
            <TraceTreeNodeLabel
                nodeType={'log'}
                nodeColor={'#c38418'}
                onNodeClick={props.onClick || (() => setOpen(true))}
            />
            &nbsp;
            {props.showAddress ? (
                <>
                    <DataRenderer preferredType={'address'} data={parentNode.to} />.
                </>
            ) : null}
            {eventName}({eventParams})
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
