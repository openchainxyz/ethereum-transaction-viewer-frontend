import {FunctionFragment} from "@ethersproject/abi";
import {BigNumber, ethers} from "ethers";

type Precompile = {
    name: string,
    fragment: FunctionFragment,
    parseInput: (data: string) => any[],
    parseOutput: (data: string) => any[],
}

export const precompiles: Record<string, Precompile> = {
    "0x0000000000000000000000000000000000000001": {
        name: 'ecrecover',
        fragment: FunctionFragment.from(`ecrecover(bytes32 hash, uint8 v, bytes32 r, bytes32 s) returns (address signer)`),
        parseInput: (data: string) => {
            data = data.substring(2);
            return [
                "0x" + data.substring(0, 64),
                BigNumber.from("0x" + data.substring(64, 64 * 2)),
                "0x" + data.substring(64 * 2, 64 * 3),
                "0x" + data.substring(64 * 3, 64 * 4),
            ];
        },
        parseOutput: (data: string) => {
            data = data.substring(2);
            return [
                ethers.utils.getAddress(data.substring(12 * 2)),
            ]
        }
    },
    "0x0000000000000000000000000000000000000002": {
        name: 'sha256',
        fragment: FunctionFragment.from(`sha256(bytes memory data) returns (bytes32 hash)`),
        parseInput: (data: string) => [data],
        parseOutput: (data: string) => [data],
    },
    "0x0000000000000000000000000000000000000003": {
        name: 'ripemd160',
        fragment: FunctionFragment.from(`ripemd160(bytes memory data) returns (bytes20 hash)`),
        parseInput: (data: string) => [data],
        parseOutput: (data: string) => ["0x" + data.substring(2 + 12 * 2).padEnd(64, "0")],
    },
    "0x0000000000000000000000000000000000000004": {
        name: 'identity',
        fragment: FunctionFragment.from(`identity(bytes memory data) returns (bytes memory data)`),
        parseInput: (data: string) => [data],
        parseOutput: (data: string) => [data],
    },
    "0x0000000000000000000000000000000000000005": {
        name: 'modexp',
        fragment: FunctionFragment.from(`modexp(uint baseLen, uint expLen, uint modLen, bytes memory base, bytes memory exp, bytes memory mod) returns (bytes memory data)`),
        parseInput: (data: string) => {
            data = data.substring(2);

            let baseLen = BigNumber.from("0x" + data.substring(0, 64)).toNumber();
            let expLen = BigNumber.from("0x" + data.substring(64, 64 * 2)).toNumber();
            let modLen = BigNumber.from("0x" + data.substring(64 * 2, 64 * 3)).toNumber();
            let base = "0x" + data.substring(0, baseLen * 2);
            let exp = "0x" + data.substring(baseLen * 2, baseLen * 2 + expLen * 2);
            let mod = "0x" + data.substring(baseLen * 2 + expLen * 2, baseLen * 2 + expLen * 2 + modLen * 2);
            return [
                baseLen,
                expLen,
                modLen,
                base,
                exp,
                mod,
            ]
        },
        parseOutput: (data: string) => [data],
    },
    "0x0000000000000000000000000000000000000006": {
        name: 'ecadd',
        fragment: FunctionFragment.from(`ecadd(bytes32 x1, bytes32 y1, bytes32 x2, bytes32 y2) returns (bytes32 x, bytes32 y)`),
        parseInput: (data: string) => {
            data = data.substring(2);

            return [
                "0x" + data.substring(0, 64),
                "0x" + data.substring(64, 64 * 2),
                "0x" + data.substring(64 * 2, 64 * 3),
                "0x" + data.substring(64 * 3, 64 * 4),
            ]
        },
        parseOutput: (data: string) => {
            data = data.substring(2);
            return [
                "0x" + data.substring(0, 64),
                "0x" + data.substring(64, 64 * 2),
            ];
        },
    },
    "0x0000000000000000000000000000000000000007": {
        name: 'ecmul',
        fragment: FunctionFragment.from(`ecadd(bytes32 x1, bytes32 y1, bytes32 s) returns (bytes32 x, bytes32 y)`),
        parseInput: (data: string) => {
            data = data.substring(2);

            return [
                "0x" + data.substring(0, 64),
                "0x" + data.substring(64, 64 * 2),
                "0x" + data.substring(64 * 2, 64 * 3),
            ]
        },
        parseOutput: (data: string) => {
            data = data.substring(2);
            return [
                "0x" + data.substring(0, 64),
                "0x" + data.substring(64, 64 * 2),
            ];
        },
    },
    "0x0000000000000000000000000000000000000008": {
        name: 'ecmul',
        fragment: FunctionFragment.from(`ecpairing(tuple(tuple(bytes32 x, bytes32 y) curvePoint, tuple(tuple(bytes32 x, bytes32 y) x, tuple(bytes32 x, bytes32 y) y) twistPoint)[] memory inputs) returns (bool success)`),
        parseInput: (data: string) => {
            data = data.substring(2);

            let inputs = [];
            while (data.length > 0) {
                inputs.push([
                    ["0x" + data.substring(0, 64), "0x" + data.substring(64, 64 * 2)],
                    [
                        ["0x" + data.substring(64 * 2, 64 * 3), "0x" + data.substring(64 * 3, 64 * 4)],
                        ["0x" + data.substring(64 * 4, 64 * 5), "0x" + data.substring(64 * 5, 64 * 6)],
                    ],
                ])

                data = data.substring(384);
            }

            return [inputs];
        },
        parseOutput: (data: string) => {
            data = data.substring(2);
            return [
                !BigNumber.from("0x" + data).isZero(),
            ];
        },
    },
    "0x0000000000000000000000000000000000000009": {
        name: 'blake2f',
        fragment: FunctionFragment.from(`blake2f(uint32 rounds, bytes8[8] memory h, bytes8[16] m, bytes8 t1, bytes8 t2, bool f) returns (bytes8[8] h)`),
        parseInput: (data: string) => {
            data = data.substring(2);

            let rounds = BigNumber.from(data.substring(0, 8));
            let h = [];
            for (let i = 0; i < 8; i++) {
                h.push(data.substring(8 + i * 16, 8 + (i + 1) * 16));
            }
            let m = [];
            for (let i = 0; i < 16; i++) {
                m.push(data.substring(68 + i * 16, 68 + (i + 1) * 16));
            }
            let t1 = data.substring(392, 392 + 16);
            let t2 = data.substring(392 + 16, 392 + 16 * 2);
            let f = !BigNumber.from("0x" + data.substring(424)).isZero();

            return [rounds, h, m, t1, t2, f];
        },
        parseOutput: (data: string) => {
            data = data.substring(2);
            let h = [];
            for (let i = 0; i < 8; i++) {
                h.push(data.substring(8 + i * 16, 8 + (i + 1) * 16));
            }
            return [h];
        },
    },
};
