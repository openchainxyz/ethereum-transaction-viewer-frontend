import {TraceEntryCallable, TraceEntryLog, TraceMetadata, TraceResult} from "../types";
import * as React from "react";
import {EventFragment, Fragment, ParamType} from "@ethersproject/abi";
import {ParamFlatView} from "../ParamFlatView";
import {DataRenderer} from "../DataRenderer";
import {Grid, TextField} from "@mui/material";
import WithSeparator from "react-with-separator";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import {ParamTreeView} from "../ParamViewTree";
import {TraceTreeItem, TraceTreeNodeLabel} from "../TraceTreeItem";
import {TraceTreeDialog} from "../TraceTreeDialog";
import {chunkString} from "../helpers";
import {SpanIconButton} from "../SpanIconButton";

type LogTraceTreeItemProps = {
    traceResult: TraceResult,
    traceMetadata: TraceMetadata,
    node: TraceEntryLog,
    onClick?: () => void,
    showAddress?: boolean,

    children?: JSX.Element[],
};

export const LogTraceTreeItem = (props: LogTraceTreeItemProps) => {
    const {
        traceResult,
        traceMetadata,
        node,
        children,
    } = props;

    const [open, setOpen] = React.useState(false);

    let parentId = node.id.split(".");
    parentId.pop();
    let parentNode = traceMetadata.nodesById[parentId.join(".")] as TraceEntryCallable;

    const [fragment, setFragment] = React.useState(() => {
        if (node.topics.length > 0) {
            try {
                return traceMetadata.abis[parentNode.to][parentNode.codehash].getEvent(node.topics[0]);
            } catch (e) {
            }
        } else {
            return Object.values(traceMetadata.abis[parentNode.to][parentNode.codehash].events).find(event => event.anonymous);
        }

        return null;
    });
    const [fragmentEdit, setFragmentEdit] = React.useState(() => {
        if (fragment) return fragment.format('full');

        return `event Event()`;
    });
    const [nodeData, setNodeData] = React.useState(node.data);

    let dialogTitle: JSX.Element;
    let dialogContent: JSX.Element;

    let fakeParams = [...node.topics.map((v, i) => {
        return ParamType.from(`bytes32 topic_${i}`)
    }), ParamType.from(`bytes data`)];
    let fakeValues = [...node.topics, node.data];


    let eventName;
    let eventParams = <ParamFlatView traceMetadata={traceMetadata} params={fakeParams} values={fakeValues}/>;
    if (node.topics.length > 0) {
        eventName = <>{node.topics[0]}</>;
    } else {
        eventName = <>Anonymous Event</>;
    }

    let parsedEvent;
    if (fragment) {
        eventName = <span style={{color: '#7b9726'}}>{fragment.name}</span>;

        try {
            let abi = traceMetadata.abis[parentNode.to][parentNode.codehash];
            let mangledTopics;
            if (!fragment.anonymous) {
                mangledTopics = [abi.getEventTopic(fragment), ...node.topics.slice(1)];
            } else {
                mangledTopics = node.topics;
            }
            parsedEvent = abi.decodeEventLog(fragment, node.data, mangledTopics);
            parsedEvent.forEach(v => v.toString())
            if (parsedEvent) {
                eventParams =
                    <ParamFlatView traceMetadata={traceMetadata} params={fragment.inputs} values={parsedEvent}/>;
            }
        } catch (e) {
            parsedEvent = null;
        }
    }

    dialogTitle = <>{<DataRenderer meta={traceMetadata} data={parentNode.to} preferredType={"address"}
                                   makeLink={false}/>}.<span style={{color: '#7b9726'}}>{eventName}</span></>;
    dialogContent = <>
        <Grid container direction={"column"}>
            <Grid item>Trace Path: <code>{node.id}</code></Grid>
            <Grid item>Event Topics: <br/><code><WithSeparator
                separator={<br/>}>{node.topics}</WithSeparator></code></Grid>
            <Grid item>
                Event Data&nbsp;<SpanIconButton icon={FormatClearIcon} onClick={() => {
                setNodeData(node.data.replace(/\n/g, ''))
            }}/>&nbsp;<SpanIconButton icon={FormatAlignJustifyIcon} onClick={() => {
                let data = node.data.substring(2);
                setNodeData(chunkString(data, 64).map((v, i) => "0x" + (i * 32).toString(16).padStart(4, "0") + ": " + v).join("\n"));
            }}/>:<br/><TextField size={"small"} inputProps={{style: {fontFamily: 'monospace', resize: 'vertical'}}}
                                 maxRows={12}
                                 value={nodeData} onChange={(e) => setNodeData(e.target.value)} multiline
                                 fullWidth></TextField>
            </Grid>
            <Grid item>
                Event: <TextField size={"small"} inputProps={{style: {fontFamily: 'monospace', resize: 'vertical'}}}
                                  fullWidth value={fragmentEdit} onChange={(e) => {
                setFragmentEdit(e.target.value);


                try {
                    let fragment = Fragment.from(e.target.value);
                    if (fragment instanceof EventFragment) {
                        setFragment(fragment);
                    }
                } catch (e) {
                }
            }}></TextField>
            </Grid>
            <Grid item>
                Decoded Data:
            </Grid>
            <Grid item>
                {fragment && parsedEvent ?
                    <ParamTreeView traceMetadata={traceMetadata} path={node.id + ".input"} params={fragment.inputs}
                                   values={parsedEvent}/> :
                    <ParamTreeView traceMetadata={traceMetadata} path={node.id + ".input"} params={fakeParams}
                                   values={fakeValues}/>}
            </Grid>
        </Grid>
    </>;

    let treeContent = <>
        <TraceTreeNodeLabel
            nodeType={"log"}
            nodeColor={"#c38418"}
            onNodeClick={props.onClick || (() => setOpen(true))}
        />
        &nbsp;
        {props.showAddress ? <>
            <DataRenderer meta={traceMetadata} preferredType={"address"} data={parentNode.to}/>.
        </> : null}
        {eventName}({eventParams})
    </>;

    return <>
        <TraceTreeDialog title={dialogTitle} content={dialogContent} open={open} setOpen={setOpen}/>
        <TraceTreeItem
            nodeId={node.id}
            treeContent={treeContent}
        >
            {children}
        </TraceTreeItem>
    </>;
};
