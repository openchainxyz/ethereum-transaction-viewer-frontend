import * as React from "react";
import {Dialog, DialogContent, DialogTitle, Paper, PaperProps} from "@mui/material";
import Draggable, {DraggableData, DraggableEvent, DraggableEventHandler} from "react-draggable";

const DraggablePaperContext = React.createContext({
    position: {x: 0, y: 0},
    onStop: undefined as (DraggableEventHandler | undefined),
});

const DraggablePaper = (props: PaperProps) => {
    const {
        position,
        onStop,
    } = React.useContext(DraggablePaperContext);

    const nodeRef = React.useRef(null);

    return (
        <Draggable
            nodeRef={nodeRef}
            handle="#draggable-dialog-title"
            cancel={'[class*="MuiDialogContent-root"]'}
            onStop={onStop}
            position={position}
        >
            <Paper ref={nodeRef} {...props} />
        </Draggable>
    );
}

type TraceTreeDialogProps = {
    title: JSX.Element,
    content: JSX.Element,

    open: boolean,
    setOpen: React.Dispatch<React.SetStateAction<boolean>>,
}

export const TraceTreeDialog = (props: TraceTreeDialogProps) => {
    const {
        title,
        content,
        open,
        setOpen,
    } = props;

    const [position, setPosition] = React.useState({x: 0, y: 0});

    return <DraggablePaperContext.Provider value={{
        position: position,
        onStop: (event: DraggableEvent, dragElement: DraggableData) => {
            setPosition({x: dragElement.x, y: dragElement.y});
        },
    }}>
        <Dialog
            open={open}
            onClose={() => {
            }}
            PaperComponent={DraggablePaper}
            PaperProps={{
                sx: {
                    pointerEvents: 'all',
                },
            }}
            hideBackdrop={true}
            disableScrollLock={true}
            disableEnforceFocus={true}
            maxWidth={"lg"}
        >
            <DialogTitle>
                <span style={{display: 'block', whiteSpace: 'nowrap', fontFamily: 'monospace'}}>
                    <span style={{cursor: 'move', float: 'left'}} id="draggable-dialog-title">{title}</span>
                    <span style={{float: 'right', cursor: 'pointer'}} onClick={() => setOpen(false)}>[X]</span>
                </span>
            </DialogTitle>
            <DialogContent>
                {content}
            </DialogContent>
        </Dialog>
    </DraggablePaperContext.Provider>;
}