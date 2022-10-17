import { SlotInfo } from '../types';
import WithSeparator from 'react-with-separator';
import * as React from 'react';
import TreeItem from '@mui/lab/TreeItem';
import { TreeItemContentSpan } from '../helpers';

type SlotTreeItemContentProps = {
    slot: string;
    slotInfo: SlotInfo;
};

const SlotTreeItemContent = (props: SlotTreeItemContentProps) => {
    const { slot, slotInfo } = props;

    let content;

    if (slotInfo.resolved) {
        content = (
            <>
                {`name=`}
                <WithSeparator separator={<>,&nbsp;</>}>
                    {Object.values(slotInfo.variables).map((v) => v.fullName)}
                </WithSeparator>
                &nbsp;{`slot=${slot}`}
            </>
        );
    } else {
        content = (
            <>
                {`slot=${slot}` +
                    (slotInfo.type === 'mapping' || slotInfo.type === 'array' ? ` offset=${slotInfo.offset}` : '') +
                    ` type=${slotInfo.type}`}
            </>
        );
    }

    return content;
};

export const renderSlotTree = (resolvedStorageSlots: Record<string, SlotInfo>, slot: string, path: string) => {
    let children = [];
    let slotInfo = resolvedStorageSlots[slot];
    if (slotInfo.type === 'mapping') {
        children.push(renderSlotTree(resolvedStorageSlots, slotInfo.baseSlot, path + '.slot'));
        children.push(
            <TreeItem
                key={path}
                nodeId={path + '.key'}
                label={<TreeItemContentSpan>key={slotInfo.mappingKey}</TreeItemContentSpan>}
            />,
        );
    } else if (slotInfo.type === 'array') {
        children.push(renderSlotTree(resolvedStorageSlots, slotInfo.baseSlot, path + '.slot'));
    }

    return (
        <TreeItem
            key={path}
            nodeId={path}
            TransitionProps={{
                mountOnEnter: true,
                unmountOnExit: false,
            }}
            label={
                <TreeItemContentSpan>
                    <SlotTreeItemContent slot={slot} slotInfo={resolvedStorageSlots[slot]} />
                </TreeItemContentSpan>
            }
        >
            {children}
        </TreeItem>
    );
};
