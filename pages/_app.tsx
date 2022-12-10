import '../styles/globals.css';
import Navbar from '../components/Navbar';
import { CssBaseline, useMediaQuery } from '@mui/material';
import * as React from 'react';
// noinspection ES6UnusedImports
import { } from '@mui/lab/themeAugmentation';
import { ThemeProvider } from '@mui/material';

import { createTheme } from '@mui/material';

import { useLocalStorageValue } from '@react-hookz/web';

function MyApp({ Component, pageProps }: { Component: any; pageProps: any }) {
    const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
    const { value: darkMode, set: setDarkMode } = useLocalStorageValue<boolean>('pref:dark', {
        initializeWithValue: false,
    });

    const shouldUseDarkMode = darkMode === undefined ? prefersDarkMode : darkMode;

    React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', shouldUseDarkMode ? 'dark' : 'light');
    }, [shouldUseDarkMode]);

    const theme = React.useMemo(() => {
        return createTheme({
            palette: {
                mode: shouldUseDarkMode ? 'dark' : 'light',
            },
            components: {
                MuiDialogTitle: {
                    styleOverrides: {
                        root: {
                            paddingBottom: '6px',
                        },
                    },
                },
                MuiDialogContent: {
                    styleOverrides: {
                        root: {
                            paddingTop: '6px',
                        },
                    },
                },
                MuiTreeView: {
                    styleOverrides: {
                        root: {
                            // disabling this for now - if the tree is responsive then the scrollbar is at the bottom of the trace
                            // this makes it really annoying to scroll left/right if the trace is super long, because you have to go
                            // all the way down to the scrollbar
                            // overflow: 'auto',
                            // paddingBottom: '15px', // so the scrollbar doesn't cover the last trace item
                        },
                    },
                },
                MuiTreeItem: {
                    styleOverrides: {
                        content: {
                            cursor: 'initial',
                        },
                        label: {
                            fontSize: 'initial',
                        },
                        iconContainer: {
                            cursor: 'pointer',
                        },
                    },
                },
                MuiDialog: {
                    styleOverrides: {
                        root: {
                            pointerEvents: 'none',
                        },
                    },
                },
                MuiTypography: {
                    styleOverrides: {
                        h5: {
                            fontFamily: 'monospace',
                            fontSize: 'initial',
                            whiteSpace: 'nowrap',
                        },
                        h6: {
                            fontFamily: 'NBInter',
                        },
                        body1: {
                            fontFamily: 'monospace',
                            wordWrap: 'break-word',
                            whiteSpace: 'break-spaces',
                        },
                        body2: {
                            fontFamily: 'monospace',
                            letterSpacing: 'initial',
                        },
                    },
                },
                MuiTableCell: {
                    styleOverrides: {
                        root: {
                            padding: '0px 16px',
                            fontFamily: 'monospace',
                            letterSpacing: 'initial',
                            fontSize: '13px',
                        },
                        // head: {
                        //     fontFamily: 'monospace',
                        //     letterSpacing: 'initial',
                        // },
                        // body: {
                        // },
                    },
                },
            },
        });
    }, [shouldUseDarkMode]);

    return (
        <>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Navbar useDarkMode={shouldUseDarkMode} onSetUseDarkMode={(v) => setDarkMode(v)} />
                <Component {...pageProps} />
            </ThemeProvider>
        </>
    );
}

export default MyApp;
