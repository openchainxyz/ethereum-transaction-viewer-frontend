import {
    StorageMetadata,
    TraceEntryCallable,
    TraceEntryCreate,
    TraceEntryLog,
    TraceMetadata,
    TraceResult
} from "../types";
import * as React from "react";
import {DataRenderer} from "../DataRenderer";
import {BigNumber, ethers} from "ethers";
import {ParamFlatView} from "../ParamFlatView";
import {Grid, TextField} from "@mui/material";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import {ConstructorFragment, Fragment} from "@ethersproject/abi";
import {ParamTreeView} from "../ParamViewTree";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {formatEther} from "ethers/lib/utils";
import {TraceTreeItem, TraceTreeNodeLabel} from "../TraceTreeItem";
import {TraceTreeDialog} from "../TraceTreeDialog";
import {chunkString, findAffectedContract} from "../helpers";
import {LogTraceTreeItem} from "./LogTraceTreeItem";
import {SpanIconButton} from "../SpanIconButton";

type CreateTraceTreeItemProps = {
    traceResult: TraceResult,
    traceMetadata: TraceMetadata,
    storageMetadata: StorageMetadata,
    requestStorageMetadata: (affectedCall: TraceEntryCallable, actualCall: TraceEntryCallable) => void,
    showStorageChanges: boolean,
    setShowStorageChanges: (show: boolean) => void,
    expandTo: (id: string) => void,

    node: TraceEntryCreate,

    children?: JSX.Element[],
};

export const CreateTraceTreeItem = (props: CreateTraceTreeItemProps) => {
    const {
        traceResult,
        traceMetadata,
        node,
        showStorageChanges,
        setShowStorageChanges,

        children,
    } = props;

    const [open, setOpen] = React.useState(false);

    const [fragment, setFragment] = React.useState(() => {
        return traceMetadata.abis[node.to][node.codehash].deploy;
    });
    const [fragmentEdit, setFragmentEdit] = React.useState(() => {
        if (fragment) return fragment.format('full');

        return 'constructor()';
    });
    const [nodeInput, setNodeInput] = React.useState(node.input);
    const [nodeOutput, setNodeOutput] = React.useState(node.output);

    let dialogTitle: JSX.Element;
    let dialogContent: JSX.Element;


    let addressContent = <DataRenderer meta={traceMetadata} data={node.to} preferredType={"address"}/>;

    let functionParams = null;

    let parsedInput = null;
    if (fragment) {
        let abi = traceMetadata.abis[node.to][node.codehash];

        let end = node.input.length;
        while (true) {
            try {
                let index = node.input.lastIndexOf("0033", end);
                if (index === -1) break;
                end = index - 1;

                parsedInput = abi._decodeParams(fragment.inputs, ethers.utils.arrayify("0x" + node.input.substring(index + 4)));
                if (parsedInput) {
                    functionParams = <ParamFlatView traceMetadata={traceMetadata} params={fragment.inputs}
                                                    values={parsedInput}/>;
                }
            } catch (err) {
            }
        }
    }

    dialogTitle = <>new {<DataRenderer meta={traceMetadata} data={node.to} preferredType={"address"}
                                       makeLink={false}/>}</>;
    dialogContent = <>
        <Grid container direction={"column"}>
            <Grid item>Trace Path: <code>{node.id}</code></Grid>
            <Grid item>
                Call Type: <code>{node.variant}</code>
            </Grid>
            <Grid item>
                Gas Used: <code>{node.gasUsed}</code>
            </Grid>
            <Grid item>
                Input Data&nbsp;<SpanIconButton icon={FormatClearIcon} onClick={() => {
                setNodeInput(node.input.replace(/\n/g, ''))
            }}/>&nbsp;<SpanIconButton icon={FormatAlignJustifyIcon} onClick={() => {
                let selector = node.input.substring(0, 10);
                let data = node.input.substring(10);
                setNodeInput(selector + "\n" + chunkString(data, 64).map((v, i) => "0x" + (i * 32).toString(16).padStart(4, "0") + ": " + v).join("\n"));
            }}/>:<br/><TextField size={"small"} inputProps={{style: {fontFamily: 'monospace', resize: 'vertical'}}}
                                 maxRows={12}
                                 value={nodeInput} onChange={(e) => setNodeInput(e.target.value)} multiline
                                 fullWidth></TextField>
            </Grid>
            <Grid item>
                Output Data&nbsp;<SpanIconButton icon={FormatClearIcon} onClick={() => {
                setNodeOutput(node.output.replace(/\n/g, ''))
            }}/>&nbsp;<SpanIconButton icon={FormatAlignJustifyIcon} onClick={() => {
                let data = node.output.substring(2);
                setNodeOutput(chunkString(data, 64).map((v, i) => "0x" + (i * 32).toString(16).padStart(4, "0") + ": " + v).join("\n"));
            }}/>:<br/><TextField size={"small"} inputProps={{style: {fontFamily: 'monospace', resize: 'vertical'}}}
                                 maxRows={12}
                                 value={nodeOutput} onChange={(e) => setNodeOutput(e.target.value)} multiline
                                 fullWidth></TextField>
            </Grid>
            <Grid item>
                Function: <TextField size={"small"} inputProps={{style: {fontFamily: 'monospace', resize: 'vertical'}}}
                                     fullWidth value={fragmentEdit} onChange={(e) => {
                setFragmentEdit(e.target.value);


                try {
                    let fragment = Fragment.from(e.target.value);
                    if (fragment instanceof ConstructorFragment) {
                        setFragment(fragment);
                    }
                } catch (e) {
                }
            }}></TextField>
            </Grid>
            <Grid item>
                Decoded Inputs:
            </Grid>
            <Grid item>
                {fragment && parsedInput ?
                    <ParamTreeView traceMetadata={traceMetadata} path={node.id + ".input"} params={fragment.inputs}
                                   values={parsedInput}/> : null}
            </Grid>
            <Grid item>Subcall Logs:</Grid>
            <Grid item>{
                Object.values(traceMetadata.nodesById)
                    .filter((v): v is TraceEntryLog => v.type === 'log')
                    .filter(v => v.id.startsWith(node.id))
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map(node => {
                        return <LogTraceTreeItem
                            key={node.id}
                            onClick={() => {
                                props.expandTo(node.id);
                            }}
                            showAddress={true}
                            traceResult={traceResult}
                            traceMetadata={traceMetadata}
                            node={node}/>;
                    })
            }</Grid>
        </Grid>
    </>;

    let storageToggle = null;

    let storageNode = node.children.find(v => v.type === 'sload' || v.type === 'sstore');
    if (storageNode) {
        storageToggle = <SpanIconButton icon={showStorageChanges ? VisibilityIcon : VisibilityOffIcon} onClick={() => {
            if (!showStorageChanges) {
                props.requestStorageMetadata(node, node);
            }

            setShowStorageChanges(!showStorageChanges);
        }}/>;
    }

    let address;
    if (node.status === 0) {
        address = <s>{addressContent}</s>;
    } else {
        address = addressContent;
    }
    let valueNode;

    let value = BigNumber.from(node.value);
    if (value.gt(0)) {
        valueNode = <span style={{color: '#c94922'}}>{`[${formatEther(value)} ETH]`}</span>;
    }

    let treeContent = <>
        <TraceTreeNodeLabel
            nodeType={node.variant}
            nodeColor={"#2c2421"}
            onNodeClick={() => setOpen(true)}
        />
        <span style={{color: '#9c9491'}}>{`[${node.gasUsed}]`}</span>
        {storageToggle}
        &nbsp;
        new&nbsp;{address}{valueNode}({functionParams})
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
