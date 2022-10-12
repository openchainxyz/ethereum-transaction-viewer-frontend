import {
    StorageMetadata,
    TraceEntryCall,
    TraceEntryCallable,
    TraceEntryLog,
    TraceEntrySload,
    TraceEntrySstore,
    TraceMetadata,
    TraceResult,
} from '../types';
import * as React from 'react';
import { defaultAbiCoder, ParamType, Result } from '@ethersproject/abi';
import { precompiles } from '../precompiles';
import { BigNumber, ethers } from 'ethers';
import { ParamFlatView } from '../ParamFlatView';
import { ParamTreeView } from '../ParamTreeView';
import { DataRenderer } from '../DataRenderer';
import { Grid, Typography } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { formatEther } from 'ethers/lib/utils';
import { TraceTreeItem, TraceTreeNodeLabel } from '../TraceTreeItem';
import { TraceTreeDialog } from '../TraceTreeDialog';
import { BuiltinErrors, findAffectedContract } from '../helpers';
import { LogTraceTreeItem } from './LogTraceTreeItem';
import { SpanIconButton } from '../SpanIconButton';
import { useErrorFragment, useFunctionFragment } from '../hooks/useFragment';
import { EncodedABITextField } from '../EncodedABITextField';
import { FragmentTextField } from '../FragmentTextField';
import { getChain } from '../Chains';

const callColor = {
    call: '#2c2421',
    staticcall: '#00ad9c',
    callcode: '#df5320',
    delegatecall: '#f22c40',
};

type CallTraceTreeItemProps = {
    traceResult: TraceResult;
    traceMetadata: TraceMetadata;
    storageMetadata: StorageMetadata;
    requestStorageMetadata: (chain: string, affectedCall: TraceEntryCallable, actualCall: TraceEntryCallable) => void;
    showStorageChanges: boolean;
    setShowStorageChanges: (show: boolean) => void;
    expandTo: (id: string) => void;

    node: TraceEntryCall;

    children?: JSX.Element[];
};

export const CallTraceTreeItem = (props: CallTraceTreeItemProps) => {
    const { traceResult, traceMetadata, node, showStorageChanges, setShowStorageChanges, children } = props;

    const [functionFragment, setFunctionFragment, parsedFunctionFragment] = useFunctionFragment(
        (() => {
            if (node.input.length > 2) {
                try {
                    return traceMetadata.abis[node.to][node.codehash].getFunction(
                        node.input.substring(0, 10).toLowerCase(),
                    );
                } catch (e) {}
            }

            return null;
        })(),
        `function func_${node.input.substring(2, 10).padEnd(8, '0')}()`,
    );

    const [errorFragment, setErrorFragment, parsedErrorFragment] = useErrorFragment(
        (() => {
            if (node.status === 0 && node.output.length > 2) {
                try {
                    return traceMetadata.abis[node.to][node.codehash].getError(
                        node.output.substring(0, 10).toLowerCase(),
                    );
                } catch (e) {}
            }

            return null;
        })(),
        BuiltinErrors[node.output.substring(0, 10).toLowerCase()]
            ? 'error ' + BuiltinErrors[node.output.substring(0, 10).toLowerCase()].signature
            : `error Error()`,
    );

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
            functionName = 'call';
        }
    } else {
        if (parsedFunctionFragment) {
            functionName = parsedFunctionFragment.name;

            fragmentInputs = parsedFunctionFragment.inputs;
            functionParams = <>0x{node.input.substring(10)}</>;
            try {
                parsedInput = defaultAbiCoder.decode(fragmentInputs, ethers.utils.arrayify(node.input).slice(4));
                parsedInput.forEach((v) => v.toString());
            } catch (err) {
                parsedInput = null;
            }

            if (node.status === 1) {
                fragmentOutputs = parsedFunctionFragment.outputs;
                if (fragmentOutputs) {
                    try {
                        parsedOutput = defaultAbiCoder.decode(fragmentOutputs, ethers.utils.arrayify(node.output));
                        parsedOutput.forEach((v) => v.toString());
                    } catch (err) {
                        parsedOutput = null;
                    }
                }
            }
        } else if (node.input.length == 2) {
            functionName = 'fallback';
            functionParams = <></>;
        } else {
            functionName = `call`;
        }

        if (node.status === 0) {
            if (parsedErrorFragment) {
                fragmentOutputs = parsedErrorFragment.inputs;
                try {
                    parsedOutput = defaultAbiCoder.decode(fragmentOutputs, ethers.utils.arrayify(node.output).slice(4));
                    parsedOutput.forEach((v) => v.toString());
                } catch (err) {
                    parsedOutput = null;
                }
            } else {
                if (node.output.slice(0, 10) in BuiltinErrors) {
                    fragmentOutputs = BuiltinErrors[node.output.slice(0, 10)].inputs;
                    try {
                        parsedOutput = defaultAbiCoder.decode(
                            fragmentOutputs,
                            ethers.utils.arrayify(node.output).slice(4),
                        );
                        parsedOutput.forEach((v) => v.toString());
                    } catch (err) {
                        parsedOutput = null;
                    }
                } else {
                    fragmentOutputs = [ParamType.from('string message')];
                    try {
                        parsedOutput = defaultAbiCoder.decode(fragmentOutputs, ethers.utils.arrayify(node.output));
                        parsedOutput.forEach((v) => v.toString());
                    } catch (err) {
                        parsedOutput = null;
                    }
                }
            }
        }
    }

    let inputParamFlatView;
    let inputParamTreeView;
    let outputParamFlatView;
    let outputParamTreeView;
    if (fragmentInputs && parsedInput) {
        inputParamFlatView = (
            <ParamFlatView traceMetadata={traceMetadata} params={fragmentInputs} values={parsedInput} />
        );
        inputParamTreeView = (
            <ParamTreeView
                traceMetadata={traceMetadata}
                path={node.id + '.input'}
                params={fragmentInputs}
                values={parsedInput}
            />
        );
    } else {
        inputParamFlatView = functionParams;
    }
    if (fragmentOutputs && parsedOutput) {
        outputParamFlatView = (
            <ParamFlatView traceMetadata={traceMetadata} params={fragmentOutputs} values={parsedOutput} />
        );
        outputParamTreeView = (
            <ParamTreeView
                traceMetadata={traceMetadata}
                path={node.id + '.output'}
                params={fragmentOutputs}
                values={parsedOutput}
            />
        );
    } else {
        outputParamFlatView = functionReturns;
    }

    dialogTitle = (
        <>
            <DataRenderer
                chain={props.traceMetadata.chain}
                labels={props.traceMetadata.labels}
                data={node.to}
                preferredType={'address'}
                makeLink={false}
            />
            .<span style={{ color: '#7b9726' }}>{functionName}</span>
        </>
    );
    dialogContent = (
        <>
            <Grid container direction={'column'}>
                <Grid item>
                    Trace Path: <code>{node.id}</code>
                </Grid>
                <Grid item>
                    Type: <code>{node.variant}</code>
                </Grid>
                <Grid item>
                    Gas Used: <code>{node.gasUsed}</code>
                </Grid>
                <Grid item>
                    <EncodedABITextField
                        name={'Input Data'}
                        hasSelector={true}
                        initialValue={node.input}
                        value={nodeInput}
                        setter={setNodeInput}
                    />
                </Grid>
                <Grid item>
                    <EncodedABITextField
                        name={'Output Data'}
                        hasSelector={node.status === 0}
                        initialValue={node.output}
                        value={nodeOutput}
                        setter={setNodeOutput}
                    />
                </Grid>
                <Grid item>
                    <FragmentTextField name={'Function'} value={functionFragment} onChange={setFunctionFragment} />
                </Grid>
                {node.status === 0 ? (
                    <Grid item>
                        <FragmentTextField name={'Error'} value={errorFragment} onChange={setErrorFragment} />
                    </Grid>
                ) : null}
                <Grid item>Decoded Inputs:</Grid>
                <Grid item width={'100%'} overflow={'auto'}>
                    {inputParamTreeView}
                </Grid>
                <Grid item>Decoded {node.status === 0 ? 'Errors:' : 'Outputs:'}</Grid>
                <Grid item width={'100%'} overflow={'auto'}>
                    {outputParamTreeView}
                </Grid>
                <Grid item>Subcall Logs:</Grid>
                <Grid item width={'100%'} overflow={'auto'} paddingBottom={'20px'}>
                    {Object.values(traceMetadata.nodesById)
                        .filter((v): v is TraceEntryLog => v.type === 'log')
                        .filter((v) => v.id.startsWith(node.id + '.'))
                        .sort((a, b) => a.id.localeCompare(b.id))
                        .map((node) => {
                            return (
                                <LogTraceTreeItem
                                    key={node.id}
                                    onClick={() => {
                                        props.expandTo(node.id);
                                    }}
                                    showAddress={true}
                                    traceResult={traceResult}
                                    traceMetadata={traceMetadata}
                                    node={node}
                                />
                            );
                        })}
                </Grid>
            </Grid>
        </>
    );

    let storageToggle = null;

    let storageNode = node.children.find(
        (v): v is TraceEntrySstore | TraceEntrySload => v.type === 'sload' || v.type === 'sstore',
    );
    if (storageNode) {
        storageToggle = (
            <SpanIconButton
                icon={showStorageChanges ? VisibilityIcon : VisibilityOffIcon}
                onClick={() => {
                    if (!showStorageChanges && storageNode) {
                        let [storageParent, path] = findAffectedContract(traceMetadata, storageNode);
                        path.forEach((node) => {
                            props.requestStorageMetadata(traceResult.chain, storageParent, node);
                        });
                    }

                    setShowStorageChanges(!showStorageChanges);
                }}
            />
        );
    }

    let address;
    let addressContent = (
        <DataRenderer
            chain={props.traceMetadata.chain}
            labels={props.traceMetadata.labels}
            data={node.to}
            preferredType={'address'}
            makeLink={!node.isPrecompile}
        />
    );
    if (node.status === 0) {
        address = <s>{addressContent}</s>;
    } else {
        address = addressContent;
    }
    let valueNode;

    let value = BigNumber.from(node.value);
    if (value.gt(0)) {
        valueNode = (
            <span style={{ color: '#c94922' }}>{`[${formatEther(value)} ${
                getChain(traceResult.chain)?.nativeSymbol
            }]`}</span>
        );
    }

    let treeContent = (
        <>
            <TraceTreeNodeLabel
                nodeType={node.variant}
                nodeColor={callColor[node.variant]}
                onNodeClick={() => setOpen(true)}
            />
            <span style={{ color: '#9c9491' }}>{`[${node.gasUsed}]`}</span>
            {storageToggle}
            &nbsp;
            {address}.<span style={{ color: '#7b9726' }}>{functionName}</span>
            {valueNode}({inputParamFlatView}) → ({outputParamFlatView})
        </>
    );

    return (
        <>
            <TraceTreeDialog title={dialogTitle} content={dialogContent} open={open} setOpen={setOpen} />
            <TraceTreeItem nodeId={node.id} treeContent={treeContent}>
                {children}
            </TraceTreeItem>
        </>
    );
};
