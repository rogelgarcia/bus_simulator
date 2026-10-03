// Encodes, validates, and independently loads bounded landscape channels.
// @ts-check
import { LANDSCAPE_MAX_CHUNK_SAMPLES, validateLandscapeManifest } from './LandscapeManifest.js';
import { requireCondition, requireFinite } from './internal/LandscapeValidation.js';

export const LANDSCAPE_MANIFEST_BYTE_LIMIT = 1024 * 1024;
export const LANDSCAPE_CHUNK_BYTE_LIMIT = 1024 * 1024;

/** @typedef {{descriptor:import('./LandscapeManifest.js').LandscapeChunkDescriptor,heights:Float32Array,landCover:Uint8Array}} LandscapeChunk */
/** @typedef {{fetchImpl?:typeof fetch,signal?:AbortSignal,maxDecodedBytes?:number}} LandscapeLoadOptions */

/** @param {ArrayLike<number>} values @param {'float32-le'|'uint8'} encoding @returns {Uint8Array} */
export function encodeLandscapeChannel(values, encoding) {
    requireCondition(encoding === 'float32-le' || encoding === 'uint8', `unsupported channel encoding ${encoding}`);
    requireCondition(values && Number.isSafeInteger(values.length) && values.length > 0 && values.length <= LANDSCAPE_MAX_CHUNK_SAMPLES, 'channel must contain a bounded nonempty sample array');
    const bytes = new Uint8Array(values.length * (encoding === 'float32-le' ? 4 : 1));
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        requireFinite(value, `sample ${i}`);
        if (encoding === 'float32-le') {
            requireCondition(Number.isFinite(Math.fround(value)), `sample ${i} exceeds finite float32 range`);
            view.setFloat32(i * 4, value, true);
        } else {
            requireCondition(Number.isInteger(value) && value >= 0 && value <= 255, `categorical sample ${i} must be uint8`);
            bytes[i] = value;
        }
    }
    return bytes;
}

/** @param {ArrayBuffer|Uint8Array} input @param {import('./LandscapeManifest.js').LandscapeChannel} channel @param {{minHeight?:number,maxHeight?:number,allowedIds?:ReadonlySet<number>}} [options] @returns {Float32Array|Uint8Array} */
export function decodeLandscapeChannel(input, channel, { minHeight = -Infinity, maxHeight = Infinity, allowedIds } = {}) {
    requireCondition(input instanceof ArrayBuffer || input instanceof Uint8Array, 'payload must be ArrayBuffer or Uint8Array');
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    requireCondition(channel.encoding === 'float32-le' || channel.encoding === 'uint8', `unsupported encoding ${channel.encoding}`);
    const count = channel.byteLength / (channel.encoding === 'float32-le' ? 4 : 1);
    requireCondition(Number.isSafeInteger(count) && count > 0 && count <= LANDSCAPE_MAX_CHUNK_SAMPLES, 'payload sample count exceeds chunk limit');
    requireCondition(bytes.byteLength === channel.byteLength && channel.decodedByteLength === channel.byteLength, `payload byte count ${bytes.byteLength} does not match declared ${channel.byteLength}`);
    if (channel.encoding === 'uint8') {
        if (allowedIds) for (const value of bytes) requireCondition(allowedIds.has(value), `unknown land-cover ID ${value}`);
        return bytes.slice();
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const value = view.getFloat32(i * 4, true);
        requireCondition(Number.isFinite(value) && value >= minHeight && value <= maxHeight, `height sample ${i} is nonfinite or outside declared bounds`);
        heights[i] = value;
    }
    return heights;
}

async function readBoundedResponse(response, limit, exact, label) {
    requireCondition(response.ok, `${label} HTTP ${response.status}`);
    const declared = response.headers?.get('content-length');
    if (declared !== null && declared !== undefined) requireCondition(Number(declared) <= limit, `${label} Content-Length exceeds ${limit} bytes`);
    requireCondition(response.body && typeof response.body.getReader === 'function', `${label} requires a bounded streaming response`);
    const reader = response.body.getReader();
    const output = new Uint8Array(limit);
    let offset = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            requireCondition(value instanceof Uint8Array, `${label} returned a non-byte response`);
            requireCondition(offset + value.length <= limit, `${label} exceeds ${limit} bytes`);
            output.set(value, offset);
            offset += value.length;
        }
        requireCondition(!exact || offset === limit, `${label} is truncated: ${offset}/${limit} bytes`);
        return output.subarray(0, offset);
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
}

async function verifyHash(bytes, expected, label) {
    requireCondition(!!globalThis.crypto?.subtle, 'SHA-256 verification requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    requireCondition(actual === expected, `${label} SHA-256 mismatch`);
}

function resolveManifestUrl(manifestUrl) {
    requireCondition(typeof manifestUrl === 'string' || manifestUrl instanceof URL, 'manifestUrl is required');
    const url = new URL(manifestUrl, globalThis.location?.href);
    requireCondition(url.protocol === 'http:' || url.protocol === 'https:', 'runtime landscape loading requires HTTP(S)');
    return url.href;
}

/** @param {string|URL} manifestUrl @param {LandscapeLoadOptions} [options] @returns {Promise<import('./LandscapeManifest.js').LandscapeManifest>} */
export async function loadLandscapeManifest(manifestUrl, { fetchImpl = globalThis.fetch, signal } = {}) {
    requireCondition(typeof fetchImpl === 'function', 'fetchImpl is required');
    const url = resolveManifestUrl(manifestUrl);
    const response = await fetchImpl(url, { signal, cache: 'no-store' });
    const bytes = await readBoundedResponse(response, LANDSCAPE_MANIFEST_BYTE_LIMIT, false, 'manifest');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return validateLandscapeManifest(JSON.parse(text));
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} input @param {string} chunkId @param {LandscapeLoadOptions & {manifestUrl:string|URL}} options @returns {Promise<LandscapeChunk>} */
export async function loadLandscapeChunk(input, chunkId, { manifestUrl, fetchImpl = globalThis.fetch, signal, maxDecodedBytes = LANDSCAPE_CHUNK_BYTE_LIMIT }) {
    const manifest = validateLandscapeManifest(input);
    const descriptor = manifest.chunks.find((entry) => entry.id === chunkId);
    requireCondition(!!descriptor, `unknown chunk ${chunkId}`);
    requireCondition(typeof fetchImpl === 'function', 'fetchImpl is required');
    requireFinite(maxDecodedBytes, 'maxDecodedBytes');
    const required = descriptor.channels.height.decodedByteLength + descriptor.channels.landCover.decodedByteLength;
    requireCondition(maxDecodedBytes > 0 && required <= maxDecodedBytes, `chunk ${chunkId} needs ${required} decoded bytes; budget ${maxDecodedBytes}`);
    const base = resolveManifestUrl(manifestUrl);
    const read = async (channel, options) => {
        signal?.throwIfAborted();
        const response = await fetchImpl(new URL(channel.url, base).href, { signal });
        const bytes = await readBoundedResponse(response, channel.byteLength, true, `chunk ${chunkId}`);
        await verifyHash(bytes, channel.sha256, `chunk ${chunkId}`);
        signal?.throwIfAborted();
        return decodeLandscapeChannel(bytes, channel, options);
    };
    const heights = await read(descriptor.channels.height, { minHeight: descriptor.minHeight, maxHeight: descriptor.maxHeight });
    const landCover = await read(descriptor.channels.landCover, { allowedIds: new Set(manifest.landCover.catalog.map((entry) => entry.id)) });
    return Object.freeze({ descriptor, heights, landCover });
}

/** @param {string|URL} manifestUrl @param {LandscapeLoadOptions} [options] @returns {Promise<{manifest:import('./LandscapeManifest.js').LandscapeManifest,chunk:LandscapeChunk,manifestUrl:string,encodedBytes:number,decodedBytes:number}>} */
export async function loadLandscapeOverview(manifestUrl, options = {}) {
    const url = resolveManifestUrl(manifestUrl);
    const manifest = await loadLandscapeManifest(url, options);
    const chunk = await loadLandscapeChunk(manifest, manifest.overviewId, { ...options, manifestUrl: url });
    const encodedBytes = chunk.descriptor.channels.height.byteLength + chunk.descriptor.channels.landCover.byteLength;
    const decodedBytes = chunk.heights.byteLength + chunk.landCover.byteLength;
    return Object.freeze({ manifest, chunk, manifestUrl: url, encodedBytes, decodedBytes });
}
