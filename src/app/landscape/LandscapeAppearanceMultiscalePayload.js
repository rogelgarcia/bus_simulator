// Loads the optional multiscale appearance companion and its authenticated pages; a missing companion keeps schema-1 behavior.
// @ts-check
import { requireCondition } from './internal/LandscapeValidation.js';
import { readBoundedResponse, verifyLandscapeHash, resolveLandscapeUrl } from './internal/LandscapePayloadIO.js';
import { validateLandscapeAppearanceManifest } from './LandscapeAppearanceManifest.js';
import { LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT, LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT, validateLandscapeAppearanceMultiscale, validateLandscapeAppearanceMultiscalePage } from './LandscapeAppearanceMultiscale.js';

/**
 * Resolves to null only when the companion does not exist (HTTP 404). Network failures, oversized or corrupt metadata
 * and cancellation fail explicitly; data for another appearance throws LandscapeAppearanceMultiscaleBindingError.
 * @param {string|URL} url @param {{appearance:any,fetchImpl?:typeof fetch,signal?:AbortSignal}} options
 * @returns {Promise<any|null>}
 */
export async function loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl = globalThis.fetch, signal } = /** @type {any} */ ({})) {
    requireCondition(!!appearance, 'appearance multiscale loading requires the schema-1 appearance it extends');
    const expected = validateLandscapeAppearanceManifest(appearance);
    signal?.throwIfAborted();
    const response = await fetchImpl(resolveLandscapeUrl(url), { signal, cache: 'no-store' });
    if (response.status === 404) {
        await response.body?.cancel().catch(() => {});
        return null;
    }
    const bytes = await readBoundedResponse(response, LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT, false, 'appearance multiscale');
    signal?.throwIfAborted();
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (error) { throw new Error(`[Landscape] appearance multiscale is not valid UTF-8 JSON: ${error.message}`); }
    const result = await validateLandscapeAppearanceMultiscale(value, expected);
    signal?.throwIfAborted();
    return result;
}

/** @param {any} input @param {{manifestUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal,maxDecodedBytes?:number}} options */
export async function loadLandscapeAppearanceMultiscalePage(input, { manifestUrl, fetchImpl = globalThis.fetch, signal, maxDecodedBytes = LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT }) {
    const page = validateLandscapeAppearanceMultiscalePage(input);
    requireCondition(Number.isFinite(maxDecodedBytes) && page.byteLength <= maxDecodedBytes, `multiscale page needs ${page.byteLength} bytes; budget ${maxDecodedBytes}`);
    signal?.throwIfAborted();
    const response = await fetchImpl(new URL(page.url, resolveLandscapeUrl(manifestUrl)).href, { signal });
    const bytes = await readBoundedResponse(response, page.byteLength, true, 'multiscale page');
    await verifyLandscapeHash(bytes, page.sha256, 'multiscale page'); signal?.throwIfAborted();
    return bytes;
}
