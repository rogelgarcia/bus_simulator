// Loads independent bounded appearance channels and derives revision-aware categorical soil masks.
// @ts-check
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { resolveLandscapeSoil } from './LandscapeSoil.js';
import { requireCondition } from './internal/LandscapeValidation.js';
import { readBoundedResponse, verifyLandscapeHash, resolveLandscapeUrl } from './internal/LandscapePayloadIO.js';
import { LANDSCAPE_APPEARANCE_MANIFEST_LIMIT, LANDSCAPE_APPEARANCE_PAGE_LIMIT, LandscapeAppearanceBindingError, landscapeAppearanceBindingKey, validateLandscapeAppearanceManifest, validateLandscapeAppearancePage } from './LandscapeAppearanceManifest.js';

async function readAppearanceManifest(url, { landscape, fetchImpl, signal }) {
    signal?.throwIfAborted();
    const response = await fetchImpl(resolveLandscapeUrl(url), { signal, cache: 'no-store' });
    const bytes = await readBoundedResponse(response, LANDSCAPE_APPEARANCE_MANIFEST_LIMIT, false, 'appearance manifest');
    signal?.throwIfAborted();
    return validateLandscapeAppearanceManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), landscape);
}

/** @param {string|URL} url @param {{landscape?:any,fetchImpl?:typeof fetch,signal?:AbortSignal,resolveBindingFallback?:boolean}} [options] */
export async function loadLandscapeAppearanceManifest(url, { landscape, fetchImpl = globalThis.fetch, signal, resolveBindingFallback = false } = {}) {
    requireCondition(typeof resolveBindingFallback === 'boolean' && (!resolveBindingFallback || !!landscape), 'appearance binding fallback requires an explicit landscape');
    try { return await readAppearanceManifest(url, { landscape, fetchImpl, signal }); }
    catch (error) {
        if (!resolveBindingFallback || !(error instanceof LandscapeAppearanceBindingError)) throw error;
    }
    signal?.throwIfAborted();
    const key = await landscapeAppearanceBindingKey(landscape);
    signal?.throwIfAborted();
    return readAppearanceManifest(new URL(`binding.${key}.json`, resolveLandscapeUrl(url)), { landscape, fetchImpl, signal });
}

/** @param {any} input @param {{manifestUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal,maxDecodedBytes?:number}} options */
export async function loadLandscapeAppearancePage(input, { manifestUrl, fetchImpl = globalThis.fetch, signal, maxDecodedBytes = LANDSCAPE_APPEARANCE_PAGE_LIMIT }) {
    const page = validateLandscapeAppearancePage(input);
    requireCondition(Number.isFinite(maxDecodedBytes) && page.byteLength <= maxDecodedBytes, `appearance page needs ${page.byteLength} bytes; budget ${maxDecodedBytes}`);
    signal?.throwIfAborted();
    const response = await fetchImpl(new URL(page.url, resolveLandscapeUrl(manifestUrl)).href, { signal });
    const bytes = await readBoundedResponse(response, page.byteLength, true, 'appearance page');
    await verifyLandscapeHash(bytes, page.sha256, 'appearance page'); signal?.throwIfAborted();
    return bytes;
}

/** @param {any} manifest @param {any} descriptor @param {Uint8Array} landCover @param {string[]} [soilIds] */
export function rasterizeLandscapeSoilMask(manifest, descriptor, landCover, soilIds = manifest.soil.catalog.map(soil => soil.id)) {
    requireCondition(landCover instanceof Uint8Array && landCover.length === descriptor.columns * descriptor.rows, 'appearance mask dimensions do not match descriptor');
    requireCondition(soilIds.length === manifest.soil.catalog.length && new Set(soilIds).size === soilIds.length && manifest.soil.catalog.every(soil => soilIds.includes(soil.id)), 'appearance mask soil order must contain every semantic soil');
    const soilIndex = new Map(soilIds.map((id, i) => [id, i])), allowed = new Set(manifest.landCover.catalog.map(cover => cover.id));
    const result = new Uint8Array(landCover.length);
    for (let row = 0; row < descriptor.rows; row++) for (let column = 0; column < descriptor.columns; column++) {
        const index = row * descriptor.columns + column, cover = landCover[index];
        requireCondition(allowed.has(cover), `unknown appearance land-cover ID ${cover}`);
        const x = manifest.bounds.minX + (descriptor.startColumn + column * descriptor.sampleStride) * manifest.grid.spacingX;
        const z = manifest.bounds.maxZ - (descriptor.startRow + row * descriptor.sampleStride) * manifest.grid.spacingZ;
        result[index] = soilIndex.get(resolveLandscapeSoil(manifest, x, z, cover));
    }
    return result;
}

/**
 * Authenticated raw land-cover bytes of one chunk, without soil rasterization or a height request. The manifest must be
 * the caller's already validated manifest; size and SHA-256 are verified against its descriptor.
 * @param {any} manifest @param {string} chunkId @param {{manifestUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal}} options
 */
export async function loadLandscapeCoverChannel(manifest, chunkId, { manifestUrl, fetchImpl = globalThis.fetch, signal }) {
    const descriptor = manifest?.chunks?.find(chunk => chunk.id === chunkId);
    requireCondition(!!descriptor, `unknown landscape cover ${chunkId}`);
    const channel = descriptor.channels.landCover;
    requireCondition(channel.encoding === 'uint8' && channel.byteLength === descriptor.columns * descriptor.rows && channel.decodedByteLength === channel.byteLength, `landscape cover ${chunkId} must hold one raw byte per sample`);
    signal?.throwIfAborted();
    const response = await fetchImpl(new URL(channel.url, resolveLandscapeUrl(manifestUrl)).href, { signal });
    const landCover = await readBoundedResponse(response, channel.byteLength, true, `landscape cover ${chunkId}`);
    await verifyLandscapeHash(landCover, channel.sha256, `landscape cover ${chunkId}`); signal?.throwIfAborted();
    return Object.freeze({ descriptor, landCover });
}

/** @param {any} input @param {string} chunkId @param {{manifestUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal,maxDecodedBytes?:number}} options */
export async function loadLandscapeCoverMask(input, chunkId, { manifestUrl, fetchImpl = globalThis.fetch, signal, maxDecodedBytes = 2 * 257 * 257 }) {
    const manifest = validateLandscapeManifest(input), descriptor = manifest.chunks.find(chunk => chunk.id === chunkId);
    requireCondition(!!descriptor, `unknown appearance mask ${chunkId}`);
    const channel = descriptor.channels.landCover;
    requireCondition(Number.isFinite(maxDecodedBytes) && channel.decodedByteLength * 2 <= maxDecodedBytes, `appearance mask needs ${channel.decodedByteLength * 2} decoded bytes; budget ${maxDecodedBytes}`);
    signal?.throwIfAborted();
    const response = await fetchImpl(new URL(channel.url, resolveLandscapeUrl(manifestUrl)).href, { signal });
    const landCover = await readBoundedResponse(response, channel.byteLength, true, `appearance mask ${chunkId}`);
    await verifyLandscapeHash(landCover, channel.sha256, `appearance mask ${chunkId}`); signal?.throwIfAborted();
    const soilIndices = rasterizeLandscapeSoilMask(manifest, descriptor, landCover);
    return Object.freeze({ descriptor, landCover, soilIndices, sourceRevision: manifest.revision });
}
