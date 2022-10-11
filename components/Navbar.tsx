import Head from 'next/head';
import styles from '../styles/Home.module.css';
import * as React from 'react';

import { ThemeProvider } from '@mui/material';
import { Box } from '@mui/system';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { theme } from '../components/helpers';
import { SupportedChains } from '../components/Chains';
import { DarkMode, GitHub, LightMode, Twitter } from '@mui/icons-material';

function Navbar() {
    const router = useRouter();
    // sets the default chain to ethereum.
    const [chain, setChain] = React.useState('ethereum');
    const [txhash, setTxhash] = React.useState('');

    //Dark Mode Logic
    const [darkMode, setDarkMode] = React.useState(false);

    React.useEffect(() => {
        var _element = document.documentElement;
        if (darkMode) {
            _element.classList.add('dark');
            _element.style.background = '#12181f';
        } else {
            _element.classList.remove('dark');
            _element.style.background = '#FFFFFF';
        }
    }, [darkMode]);
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
            <div className="max-w-[900px] mx-auto text-[#19232D] dark:text-white relative px-5">
                <Box className="flex flex-col" justifyContent="left">
                    <div className="flex my-5">
                        <div className="md:w-5 w-4 my-auto mr-3 flex hover:opacity-60 cursor-pointer dark:invert">
                            <Link href={'/'}>
                                <Image src="/favicon.png" width={'512'} height={'512'} layout="intrinsic" />
                            </Link>
                        </div>
                        <h1 className="md:text-xl text-sm -tracking-wider font-inter">Ethereum Transaction Viewer</h1>
                        <a
                            className="md:w-5 w-4 my-auto mr-4 flex ml-auto hover:opacity-60"
                            href="https://github.com/samczsun/ethereum-transaction-viewer-frontend"
                            target={'_blank'}
                            rel={'noreferrer noopener'}
                        >
                            <GitHub />
                        </a>
                        <a
                            className="md:w-5 w-4 my-auto mr-4 flex hover:opacity-60"
                            href="https://twitter.com/samczsun"
                            target={'_blank'}
                            rel={'noreferrer noopener'}
                        >
                            <Twitter />
                        </a>
                        <button
                            className="md:w-5 w-4 my-auto mr-4 flex hover:opacity-60"
                            onClick={() => setDarkMode(!darkMode)}
                        >
                            {darkMode ? <LightMode /> : <DarkMode />}
                        </button>
                    </div>

                    <div className="h-[1px] w-full bg-[#0000002d] dark:bg-[#ffffff61]"></div>
                </Box>
                <div className="flex flex-row w-full place-content-center">
                    <div
                        className="flex-row flex place-content-center relative w-full my-5 text-[#606161]"
                        style={{ fontFamily: 'RiformaLL' }}
                    >
                        <select
                            className="outline-1 outline outline-[#0000002d] py-2 px-3 mr-[1px]"
                            onChange={(event) => setChain(event.target.value)}
                        >
                            {SupportedChains.map((v) => {
                                return (
                                    <option key={v.id} value={v.id}>
                                        {v.displayName}
                                    </option>
                                );
                            })}
                        </select>
                        <input
                            id="search"
                            type="text"
                            placeholder="Enter txhash..."
                            value={txhash}
                            onChange={(event) => setTxhash(event.target.value)}
                            onKeyUp={(event) => {
                                if (event.key === 'Enter') {
                                    router.push(`/${chain}/${txhash}`);
                                }
                            }}
                            className="w-full outline-1 outline outline-[#0000002d] py-2 px-3"
                        />
                        <button
                            className="my-auto flex hover:bg-[#cbffcb] bg-white h-full outline-1 outline outline-[#0000002d] rounded-none text-lg py-2 px-3 z-10 ml-[1px] hover:text-black"
                            onClick={() => {
                                txhash ? router.push(`/${chain}/${txhash}`) : console.log('No hash entered.');
                            }}
                        >
                            <h1 className="my-auto">View</h1>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Navbar;
