import { TraceMetadata } from './types';
import { ParamType, Result } from '@ethersproject/abi/lib';
import { TreeItemContentSpan } from './helpers';
import { DataRenderer } from './DataRenderer';
import TreeItem from '@mui/lab/TreeItem';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import * as React from 'react';

type ParamTreeViewProps = {
    traceMetadata: TraceMetadata;
    path: string;
    params: ParamType[];
    values: Result;
};

export const ParamTreeView = (props: ParamTreeViewProps) => {
    let recursivelyRenderParams = (path: string, params: ParamType[], values: Result): JSX.Element[] => {
        return params.map((param, idx) => {
            let paramName = param.name || `var_${idx}`;

            let nodeId = path + '.' + idx;
            let value = values[idx];

            let label: JSX.Element;
            let children: JSX.Element[];
            if (param.baseType === 'tuple') {
                label = <>{paramName}</>;
                children = value.map((childValue: any, childIdx: number) => {
                    return recursivelyRenderParams(nodeId + '.' + childIdx, [param.components[childIdx]], [childValue]);
                });
            } else if (param.baseType === 'array') {
                label = <>{paramName}</>;
                children = value.map((childValue: any, childIdx: number) => {
                    let paramJson = JSON.parse(param.arrayChildren.format('json'));
                    paramJson.name = paramName + `[${childIdx}]`;
                    return recursivelyRenderParams(nodeId + '.' + childIdx, [ParamType.from(paramJson)], [childValue]);
                });
            } else {
                label = (
                    <>
                        {paramName}:&nbsp;
                        <DataRenderer decodedData={value} preferredType={param}></DataRenderer>
                    </>
                );
                children = [];
            }

            return (
                <TreeItem key={nodeId} nodeId={nodeId} label={<TreeItemContentSpan>{label}</TreeItemContentSpan>}>
                    {children}
                </TreeItem>
            );
        });
    };

    return (
        <TreeView
            aria-label="rich object"
            defaultCollapseIcon={<ExpandMoreIcon />}
            defaultExpanded={['root']}
            defaultExpandIcon={<ChevronRightIcon />}
            sx={{
                paddingBottom: '20px',
            }}
        >
            {recursivelyRenderParams(props.path + '.root', props.params, props.values)}
        </TreeView>
    );
};
