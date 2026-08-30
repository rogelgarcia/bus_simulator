// Computes domain-separated SHA-256 identities through browser WebCrypto.
// @ts-check

import { canonicalJsonBytes } from './CanonicalJson.js';
import { bytesToHex, concatBytes, copyBytes } from './internal/ByteArrays.js';

export const BAKE_SOURCE_SHA256_PROTOCOL = 'bus-simulator/illumination/bake-source/sha256-framing/v1';

const PROTOCOL_BYTES = new TextEncoder().encode(BAKE_SOURCE_SHA256_PROTOCOL);
const UINT32_MAX = 0xffffffff;

/**
 * @param {string} domain
 * @param {unknown} value
 * @returns {Promise<Uint8Array>}
 */
export function hashCanonicalJsonDigest(domain, value) {
    return sha256Digest(domain, canonicalJsonBytes(value));
}

/**
 * @param {string} domain
 * @param {unknown} value
 * @returns {Promise<string>}
 */
export async function hashCanonicalJsonSha256(domain, value) {
    return bytesToHex(await hashCanonicalJsonDigest(domain, value));
}

/**
 * @param {string} domain
 * @param {ArrayBuffer | ArrayBufferView} value
 * @returns {Promise<string>}
 */
export async function sha256Hex(domain, value) {
    return bytesToHex(await sha256Digest(domain, value));
}

/**
 * @param {string} domain
 * @param {ArrayBuffer | ArrayBufferView} value
 * @returns {Promise<Uint8Array>}
 */
export async function sha256Digest(domain, value) {
    if (typeof domain !== 'string' || domain.length === 0) {
        throw new TypeError('SHA-256 domain must be a non-empty string');
    }
    const domainBytes = new TextEncoder().encode(domain);
    const valueBytes = copyBytes(value, 'SHA-256 input');
    if (domainBytes.byteLength > UINT32_MAX || valueBytes.byteLength > UINT32_MAX) {
        throw new RangeError('SHA-256 framed domain or input exceeds the uint32 byte-length limit');
    }
    const lengths = new Uint8Array(8);
    const view = new DataView(lengths.buffer);
    view.setUint32(0, domainBytes.byteLength, true);
    view.setUint32(4, valueBytes.byteLength, true);
    const framed = concatBytes([PROTOCOL_BYTES, lengths, domainBytes, valueBytes]);
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('WebCrypto SubtleCrypto is required for illumination bake-source hashing');
    return new Uint8Array(await subtle.digest('SHA-256', framed));
}
