import * as React from 'react';
import { Dialog, DialogContent, DialogTitle, Grid, Paper, PaperProps, Typography } from '@mui/material';
import Draggable, { DraggableData, DraggableEvent, DraggableEventHandler } from 'react-draggable';

const DraggablePaperContext = React.createContext({
    position: { x: 0, y: 0 },
    onStop: undefined as DraggableEventHandler | undefined,
});

const DraggablePaper = (props: PaperProps) => {
    const { position, onStop } = React.useContext(DraggablePaperContext);

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
};

type TraceTreeDialogProps = {
    title: JSX.Element;
    content: JSX.Element;

    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const TraceTreeDialog = (props: TraceTreeDialogProps) => {
    const { title, content, open, setOpen } = props;

    const [position, setPosition] = React.useState({ x: 0, y: 0 });

    return (
        <DraggablePaperContext.Provider
            value={{
                position: position,
                onStop: (event: DraggableEvent, dragElement: DraggableData) => {
                    setPosition({ x: dragElement.x, y: dragElement.y });
                },
            }}
        >
            <Dialog
                open={open}
                onClose={() => {}}
                PaperComponent={DraggablePaper}
                PaperProps={{
                    sx: {
                        pointerEvents: 'all',
                    },
                }}
                hideBackdrop={true}
                disableScrollLock={true}
                disableEnforceFocus={true}
                maxWidth={'md'}
            >
                <DialogTitle>
                    <Typography variant={'h5'} component={'div'}>
                        <Grid container>
                            <Grid item xs={11}>
                                <span style={{ cursor: 'move' }} id="draggable-dialog-title">
                                    {title}
                                </span>
                            </Grid>
                            <Grid item xs={1}>
                                <span style={{ cursor: 'pointer', float: 'right' }} onClick={() => setOpen(false)}>
                                    [X]
                                </span>
                            </Grid>
                        </Grid>
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    <Typography variant={'body2'} component={'div'}>
                        {content}
                    </Typography>
                </DialogContent>
            </Dialog>
        </DraggablePaperContext.Provider>
    );
};
