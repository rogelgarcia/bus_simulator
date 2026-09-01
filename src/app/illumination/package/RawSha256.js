// Computes conventional raw SHA-256 hashes for artifact integrity.
// @ts-check

import { bytesToHex, copyBytes, hexToBytes } from './internal/ByteArrays.js';

/**
 * @param {ArrayBuffer | ArrayBufferView} value
 * @returns {Promise<Uint8Array>}
 */
export async function rawSha256Digest(value) {
    return rawSha256OwnedDigest(copyBytes(value, 'SHA-256 input'));
}

/**
 * @param {ArrayBuffer | ArrayBufferView} value
 * @returns {Promise<string>}
 */
export async function rawSha256Hex(value) {
    return bytesToHex(await rawSha256Digest(value));
}

/**
 * Hashes a caller-owned immutable snapshot without allocating another full byte copy.
 * Only package code that has already closed its mutable-input trust boundary may use this helper.
 * @param {Uint8Array} value
 * @returns {Promise<Uint8Array>}
 */
export async function rawSha256OwnedDigest(value) {
    if (!(value instanceof Uint8Array)) throw new TypeError('Owned SHA-256 input must be a Uint8Array');
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('WebCrypto SubtleCrypto is required for illumination artifact integrity');
    return new Uint8Array(await subtle.digest('SHA-256', value));
}

/** @param {Uint8Array} value */
export async function rawSha256OwnedHex(value) {
    return bytesToHex(await rawSha256OwnedDigest(value));
}

const SHA256_INITIAL_STATE = Object.freeze([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);
const SHA256_ROUND_CONSTANTS = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/**
 * Hashes an ordered set of caller-owned immutable views without assembling them.
 * This is reserved for already authenticated internal package subviews.
 * @param {readonly Uint8Array[]} segments
 */
export async function rawSha256OwnedSegmentsHex(segments) {
    if (!Array.isArray(segments) || segments.length < 1
        || segments.some((segment) => !(segment instanceof Uint8Array))) {
        throw new TypeError('Owned SHA-256 segments must be a non-empty Uint8Array array');
    }
    const state = Uint32Array.from(SHA256_INITIAL_STATE);
    const schedule = new Uint32Array(64);
    const tail = new Uint8Array(64);
    let tailLength = 0;
    let totalByteLength = 0;
    for (const segment of segments) {
        totalByteLength += segment.byteLength;
        if (!Number.isSafeInteger(totalByteLength)) {
            throw new RangeError('Owned SHA-256 segment length exceeds safe integer range');
        }
        let offset = 0;
        if (tailLength > 0) {
            const copied = Math.min(64 - tailLength, segment.byteLength);
            tail.set(segment.subarray(0, copied), tailLength);
            tailLength += copied;
            offset = copied;
            if (tailLength === 64) {
                compressSha256Block(state, schedule, tail, 0);
                tailLength = 0;
            }
        }
        while (offset + 64 <= segment.byteLength) {
            compressSha256Block(state, schedule, segment, offset);
            offset += 64;
        }
        if (offset < segment.byteLength) {
            tail.set(segment.subarray(offset), 0);
            tailLength = segment.byteLength - offset;
        }
    }
    tail[tailLength] = 0x80;
    tail.fill(0, tailLength + 1);
    if (tailLength >= 56) {
        compressSha256Block(state, schedule, tail, 0);
        tail.fill(0);
    }
    const bitLength = totalByteLength * 8;
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    writeUint32BigEndian(tail, 56, high);
    writeUint32BigEndian(tail, 60, low);
    compressSha256Block(state, schedule, tail, 0);
    const digest = new Uint8Array(32);
    for (let index = 0; index < state.length; index += 1) {
        writeUint32BigEndian(digest, index * 4, state[index]);
    }
    return bytesToHex(digest);
}

/** @param {number} value @param {number} bits */
function rotateRight(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
}

/** @param {Uint8Array} target @param {number} offset @param {number} value */
function writeUint32BigEndian(target, offset, value) {
    target[offset] = value >>> 24;
    target[offset + 1] = value >>> 16;
    target[offset + 2] = value >>> 8;
    target[offset + 3] = value;
}

/** @param {Uint32Array} state @param {Uint32Array} schedule @param {Uint8Array} bytes @param {number} offset */
function compressSha256Block(state, schedule, bytes, offset) {
    for (let index = 0; index < 16; index += 1) {
        const wordOffset = offset + index * 4;
        schedule[index] = (
            (bytes[wordOffset] << 24)
            | (bytes[wordOffset + 1] << 16)
            | (bytes[wordOffset + 2] << 8)
            | bytes[wordOffset + 3]
        ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
        const prior15 = schedule[index - 15];
        const prior2 = schedule[index - 2];
        const sigma0 = rotateRight(prior15, 7) ^ rotateRight(prior15, 18) ^ (prior15 >>> 3);
        const sigma1 = rotateRight(prior2, 17) ^ rotateRight(prior2, 19) ^ (prior2 >>> 10);
        schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
    }
    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];
    for (let index = 0; index < 64; index += 1) {
        const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        const choice = (e & f) ^ (~e & g);
        const temporary1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index] + schedule[index]) >>> 0;
        const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temporary2 = (sum0 + majority) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temporary1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
}

/** @param {string} value */
export function sha256HexToBytes(value) {
    if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError('SHA-256 must be 64 lowercase hexadecimal characters');
    return hexToBytes(value);
}
