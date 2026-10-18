// Loads the optional geology sidecar and its authenticated field and categorical pages; a missing sidecar means the geology is absent.
// @ts-check
import { requireCondition, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';
import { readBoundedResponse, verifyLandscapeHash, resolveLandscapeUrl } from './internal/LandscapePayloadIO.js';
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { LANDSCAPE_GEOLOGY_LIMIT, LANDSCAPE_GEOLOGY_PAGE_LIMIT, validateLandscapeGeology } from './LandscapeGeology.js';

/**
 * Resolves to null only for HTTP 404. Network failures, oversized or corrupt metadata and cancellation fail explicitly; a valid sidecar of
 * another landscape, spatial frame or sea level throws LandscapeGeologyBindingError. A different terrain revision is returned and left
 * to landscapeGeologyStaleness.
 * @param {string|URL} url @param {{landscape:any,fetchImpl?:typeof fetch,signal?:AbortSignal}} options @returns {Promise<any|null>}
 */
export async function loadLandscapeGeology(url, { landscape, fetchImpl = globalThis.fetch, signal } = /** @type {any} */ ({})) {
    requireCondition(!!landscape, 'geology loading requires the landscape manifest it is bound to');
    const expected = validateLandscapeManifest(landscape);
    signal?.throwIfAborted();
    const response = await fetchImpl(resolveLandscapeUrl(url), { signal, cache: 'no-store' });
    if (response.status === 404) {
        await response.body?.cancel().catch(() => {});
        return null;
    }
    const bytes = await readBoundedResponse(response, LANDSCAPE_GEOLOGY_LIMIT, false, 'geology');
    signal?.throwIfAborted();
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (error) { throw new Error(`[Landscape] geology is not valid UTF-8 JSON: ${error.message}`); }
    const result = await validateLandscapeGeology(value, expected);
    signal?.throwIfAborted();
    return result;
}

/**
 * Fetches one field or categorical page and authenticates its exact size and SHA-256 before use.
 * @param {{url:string,byteLength:number,sha256:string}} entry @param {{manifestUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal,maxDecodedBytes?:number}} options
 */
export async function loadLandscapeGeologyPage(entry, { manifestUrl, fetchImpl = globalThis.fetch, signal, maxDecodedBytes = LANDSCAPE_GEOLOGY_PAGE_LIMIT }) {
    requireCondition(!!entry && typeof entry === 'object', 'geology page descriptor is required');
    requireRelativeUrl(entry.url, 'geology page url'); requireSha256(entry.sha256, 'geology page sha256');
    requireCondition(Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0 && entry.byteLength <= LANDSCAPE_GEOLOGY_PAGE_LIMIT, 'geology page size is out of bounds');
    requireCondition(Number.isFinite(maxDecodedBytes) && entry.byteLength <= maxDecodedBytes, `geology page needs ${entry.byteLength} bytes; budget ${maxDecodedBytes}`);
    signal?.throwIfAborted();
    const response = await fetchImpl(new URL(entry.url, resolveLandscapeUrl(manifestUrl)).href, { signal });
    const bytes = await readBoundedResponse(response, entry.byteLength, true, 'geology page');
    await verifyLandscapeHash(bytes, entry.sha256, 'geology page'); signal?.throwIfAborted();
    return bytes;
}
