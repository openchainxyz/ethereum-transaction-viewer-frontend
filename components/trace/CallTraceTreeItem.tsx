import {
    StorageMetadata,
    TraceEntryCall,
    TraceEntryCallable,
    TraceEntryLog, TraceEntrySload,
    TraceEntrySstore,
    TraceMetadata,
    TraceResult
} from "../types";
import * as React from "react";
import {defaultAbiCoder, Fragment, FunctionFragment, ParamType, Result} from "@ethersproject/abi";
import {precompiles} from "../precompiles";
import {BigNumber, ethers} from "ethers";
import {ParamFlatView} from "../ParamFlatView";
import {ParamTreeView} from "../ParamViewTree";
import {DataRenderer} from "../DataRenderer";
import {Grid, TextField} from "@mui/material";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {formatEther} from "ethers/lib/utils";
import {TraceTreeItem, TraceTreeNodeLabel} from "../TraceTreeItem";
import {TraceTreeDialog} from "../TraceTreeDialog";
import {chunkString, findAffectedContract} from "../helpers";
import {LogTraceTreeItem} from "./LogTraceTreeItem";
import {SpanIconButton} from "../SpanIconButton";

const callColor = {
    'call': '#2c2421',
    'staticcall': '#00ad9c',
    'callcode': '#df5320',
    'delegatecall': '#f22c40'
};

type CallTraceTreeItemProps = {
    traceResult: TraceResult,
    traceMetadata: TraceMetadata,
    storageMetadata: StorageMetadata,
    requestStorageMetadata: (affectedCall: TraceEntryCallable, actualCall: TraceEntryCallable) => void,
    showStorageChanges: boolean,
    setShowStorageChanges: (show: boolean) => void,
    expandTo: (id: string) => void,

    node: TraceEntryCall,

    children?: JSX.Element[],
};

export const CallTraceTreeItem = (props: CallTraceTreeItemProps) => {
    const {
        traceResult,
        traceMetadata,
        node,
        showStorageChanges,
        setShowStorageChanges,
        children,
    } = props;

    const [fragment, setFragment] = React.useState(() => {
        if (node.input.length > 2) {
            try {
                return traceMetadata.abis[node.to][node.codehash].getFunction(node.input.substring(0, 10).toLowerCase());
            } catch (e) {
            }
        }

        return null;
    });
    const [fragmentEdit, setFragmentEdit] = React.useState(() => {
        if (fragment) return fragment.format('full');

        return `function func_${node.input.substring(2, 10).padEnd(8, "0")}()`
    });
    const [nodeInput, setNodeInput] = React.useState(node.input);
    const [nodeOutput, setNodeOutput] = React.useState(node.output);
    const [open, setOpen] = React.useState(false);

    let dialogTitle: JSX.Element | null;
    let dialogContent: JSX.Element | null;

    let functionName: string;
    let fragmentInputs: ParamType[] | undefined = undefined;
    let fragmentOutputs: ParamType[] | undefined = undefined;
    let functionParams = <>{node.input}</>;
    let functionReturns = <>{node.output}</>;
    let parsedInput: Result | null = null;
    let parsedOutput: Result | null = null;

    if (node.isPrecompile) {
        if (node.to in precompiles) {
            let precompile = precompiles[node.to];
            functionName = precompile.name;
            fragmentInputs = precompile.fragment.inputs;
            fragmentOutputs = precompile.fragment.outputs;
            parsedInput = precompile.parseInput(node.input);
            parsedOutput = precompile.parseOutput(node.output);
        } else {
            functionName = "call";
        }
    } else {
        if (fragment) {
            functionName = fragment.name;

            fragmentInputs = fragment.inputs;
            fragmentOutputs = fragment.outputs;
            functionParams = <>0x{node.input.substring(10)}</>;
            try {
                parsedInput = defaultAbiCoder.decode(fragmentInputs, ethers.utils.arrayify(node.input).slice(4));
                parsedInput.forEach(v => v.toString());
            } catch (err) {
                parsedInput = null;
            }

            if (fragmentOutputs) {
                try {
                    parsedOutput = defaultAbiCoder.decode(fragmentOutputs, ethers.utils.arrayify(node.output));
                    parsedOutput.forEach(v => v.toString());
                } catch (err) {
                    parsedOutput = null;
                }
            }
        } else if (node.input.length == 2) {
            functionName = "fallback";
            functionParams = <></>;
        } else {
            functionName = `call`;
        }
    }

    let inputParamFlatView;
    let inputParamTreeView;
    let outputParamFlatView;
    let outputParamTreeView;
    if (fragmentInputs && parsedInput) {
        inputParamFlatView =
            <ParamFlatView traceMetadata={traceMetadata} params={fragmentInputs} values={parsedInput}/>;
        inputParamTreeView =
            <ParamTreeView traceMetadata={traceMetadata} path={node.id + ".input"} params={fragmentInputs}
                           values={parsedInput}/>;
    } else {
        inputParamFlatView = functionParams;
    }
    if (fragmentOutputs && parsedOutput) {
        outputParamFlatView =
            <ParamFlatView traceMetadata={traceMetadata} params={fragmentOutputs} values={parsedOutput}/>;
        outputParamTreeView =
            <ParamTreeView traceMetadata={traceMetadata} path={node.id + ".output"} params={fragmentOutputs}
                           values={parsedOutput}/>;
    } else {
        outputParamFlatView = functionReturns;
    }

    dialogTitle = <><DataRenderer meta={traceMetadata} data={node.to} preferredType={"address"} makeLink={false}/>.<span
        style={{color: '#7b9726'}}>{functionName}</span></>;
    dialogContent = <>
        <Grid container direction={"column"}>
            <Grid item>Trace Path: <code>{node.id}</code></Grid>
            <Grid item>Call Type: <code>{node.variant}</code></Grid>
            <Grid item>Gas Used: <code>{node.gasUsed}</code></Grid>
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
                Function: <TextField size={"small"} inputProps={{style: {fontFamily: 'monospace'}}}
                                     fullWidth value={fragmentEdit} onChange={(e) => {
                setFragmentEdit(e.target.value);

                try {
                    let fragment = Fragment.from(e.target.value);
                    if (fragment instanceof FunctionFragment) {
                        setFragment(fragment);
                    }
                } catch (e) {
                }
            }}></TextField>
            </Grid>
            <Grid item>Decoded Inputs:</Grid>
            <Grid item>{inputParamTreeView}</Grid>
            <Grid item>Decoded Outputs:</Grid>
            <Grid item>{outputParamTreeView}</Grid>
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

    let addressContent = <DataRenderer meta={traceMetadata} data={node.to} preferredType={"address"}
                                       makeLink={!node.isPrecompile}/>;

    let storageToggle = null;

    let storageNode = node.children.find((v): v is (TraceEntrySstore | TraceEntrySload) => v.type === 'sload' || v.type === 'sstore');
    if (storageNode) {
        storageToggle = <SpanIconButton icon={showStorageChanges ? VisibilityIcon : VisibilityOffIcon} onClick={() => {
            if (!showStorageChanges && storageNode) {
                let [storageParent, path] = findAffectedContract(traceMetadata, storageNode);
                path.forEach(node => {
                    props.requestStorageMetadata(storageParent, node);
                });
            }

            setShowStorageChanges(!showStorageChanges)
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
            nodeColor={callColor[node.variant]}
            onNodeClick={() => setOpen(true)}
        />
        <span style={{color: '#9c9491'}}>{`[${node.gasUsed}]`}</span>
        {storageToggle}
        &nbsp;
        {address}.<span style={{color: '#7b9726'}}>{functionName}</span>{valueNode}({inputParamFlatView}) →
        ({outputParamFlatView})
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
}
