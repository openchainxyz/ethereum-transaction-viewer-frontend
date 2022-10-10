type KnownSlot = {
    name: string;
    bits: number;
    type: string;
};

export const knownSlots: Record<string, KnownSlot> = {
    '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103': {
        name: 'proxyAdmin',
        type: 'address',
        bits: 160,
    },
    '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc': {
        name: 'proxyImplementation',
        type: 'address',
        bits: 160,
    },
    '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50': {
        name: 'proxyBeacon',
        type: 'address',
        bits: 160,
    },
    '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8': {
        name: 'guard',
        type: 'address',
        bits: 160,
    },
};
