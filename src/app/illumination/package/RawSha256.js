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

/** @param {string} value */
export function sha256HexToBytes(value) {
    if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError('SHA-256 must be 64 lowercase hexadecimal characters');
    return hexToBytes(value);
}
