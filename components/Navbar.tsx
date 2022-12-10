import Head from 'next/head';
import * as React from 'react';

import { DarkMode, GitHub, LightMode, Twitter } from '@mui/icons-material';
import {
    Button,
    Container,
    Divider,
    FormControl,
    IconButton,
    Input,
    InputBase,
    InputLabel,
    MenuItem,
    NativeSelect,
    Paper,
    Select,
    Typography,
} from '@mui/material';
import Grid2 from '@mui/material/Unstable_Grid2';
import { Box } from '@mui/system';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { SupportedChains } from './Chains';
import SearchIcon from '@mui/icons-material/Search';
import TextField from '@mui/material/TextField';

export type NavbarProps = {
    useDarkMode: boolean;
    onSetUseDarkMode: (v: boolean) => void;
};

function Navbar(props: NavbarProps) {
    const router = useRouter();
    const { chain: queryChain, txhash: queryTxhash } = router.query;

    // sets the default chain to ethereum.
    const [chain, setChain] = React.useState('ethereum');
    const [txhash, setTxhash] = React.useState('');

    React.useEffect(() => {
        if (!queryChain || Array.isArray(queryChain)) return;
        if (!queryTxhash || Array.isArray(queryTxhash)) return;

        setChain(queryChain);
        setTxhash(queryTxhash);
    }, [queryChain, queryTxhash]);

    const doSearch = () => {
        if (/0x[0-9a-fA-F]{64}/g.test(txhash)) {
            router.push(`/${chain}/${txhash}`);
        }
    };

    return (
        <div>
            <Head>
                <title>Ethereum Transaction Viewer</title>
                <meta name="description" content="View and trace Ethereum transactions" />
                <meta property="og:type" content="website" />
                <meta property="og:title" content="Ethereum Transaction Viewer" />
                <meta property="og:description" content="View and trace Ethereum transactions" />
                <meta property="og:image" content="https://tx.eth.samczsun.com/favicon.png" />
                <meta property="twitter:card" content="summary" />
                <meta property="twitter:title" content="Ethereum Transaction Viewer" />
                <meta property="twitter:description" content="View and trace Ethereum transactions" />
                <meta property="twitter:url" content="https://tx.eth.samczsun.com" />
                <meta property="twitter:image" content="https://tx.eth.samczsun.com/favicon.png" />
                <meta property="twitter:site" content="@samczsun" />
                <link rel="icon" href="/favicon.png" />
            </Head>

            <Container maxWidth={'md'}>
                <Grid2 container justifyContent="center" alignContent="center" p={2} spacing={1}>
                    <Grid2 style={{ cursor: 'pointer' }}>
                        <Link href={'/'}>
                            <Box>
                                <Image src="/favicon.png" width="24" height="24" alt="logo" />
                            </Box>
                        </Link>
                    </Grid2>
                    <Grid2 sx={{ display: { xs: 'none', md: 'initial' } }}>
                        <Typography fontFamily="NBInter">Ethereum Transaction Viewer</Typography>
                    </Grid2>
                    <Grid2 xs></Grid2>
                    <Grid2>
                        <a href="https://twitter.com/samczsun" target={'_blank'} rel={'noreferrer noopener'}>
                            <GitHub />
                        </a>
                    </Grid2>
                    <Grid2>
                        <a
                            href="https://github.com/samczsun/ethereum-transaction-viewer-frontend"
                            target={'_blank'}
                            rel={'noreferrer noopener'}
                        >
                            <Twitter />
                        </a>
                    </Grid2>
                    <Grid2 onClick={() => props.onSetUseDarkMode(!props.useDarkMode)}>
                        {props.useDarkMode ? <LightMode /> : <DarkMode />}
                    </Grid2>
                </Grid2>
                <Divider></Divider>
                <Grid2 container p={2}>
                    <Grid2>
                        <TextField
                            onChange={(event) => setChain(event.target.value)}
                            value={chain}
                            variant="standard"
                            select
                            margin="dense"
                            fullWidth
                            SelectProps={{
                                style: {
                                    fontFamily: 'RiformaLL',
                                },
                            }}
                        >
                            {SupportedChains.map((v) => {
                                return (
                                    <MenuItem key={v.id} value={v.id} style={{ fontFamily: 'RiformaLL' }}>
                                        {v.displayName}
                                    </MenuItem>
                                );
                            })}
                            {!SupportedChains.find((sChain) => sChain.id === chain) ? (
                                <MenuItem key={chain} value={chain} style={{ fontFamily: 'RiformaLL' }}>
                                    {queryChain}
                                </MenuItem>
                            ) : null}
                        </TextField>
                    </Grid2>
                    <Grid2 xs>
                        <TextField
                            variant="standard"
                            placeholder="Enter txhash..."
                            fullWidth
                            margin="dense"
                            onChange={(event) => setTxhash(event.target.value)}
                            value={txhash}
                            onKeyUp={(event) => {
                                if (event.key === 'Enter') {
                                    doSearch();
                                }
                            }}
                            inputProps={{
                                style: {
                                    fontFamily: 'RiformaLL',
                                },
                            }}
                            InputProps={{
                                endAdornment: (
                                    <Button
                                        variant="text"
                                        size="small"
                                        onClick={() => doSearch()}
                                        style={{
                                            fontFamily: 'RiformaLL',
                                        }}
                                    >
                                        View
                                    </Button>
                                ),
                            }}
                        ></TextField>
                    </Grid2>
                </Grid2>
            </Container>
        </div>
    );
}

export default Navbar;
