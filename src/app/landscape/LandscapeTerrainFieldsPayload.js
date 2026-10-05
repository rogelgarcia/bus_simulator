// Loads the optional terrain-fields sidecar and its authenticated pages; a missing sidecar means the fields are absent.
// @ts-check
import { requireCondition, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';
import { readBoundedResponse, verifyLandscapeHash, resolveLandscapeUrl } from './internal/LandscapePayloadIO.js';
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { LANDSCAPE_TERRAIN_FIELDS_LIMIT, LANDSCAPE_TERRAIN_FIELDS_PAGE_LIMIT, validateLandscapeTerrainFields } from './LandscapeTerrainFields.js';

/**
 * Resolves to null only for HTTP 404. Network failures, oversized or corrupt metadata and cancellation fail explicitly; a valid sidecar of
 * another landscape, spatial frame or sea level throws LandscapeTerrainFieldsBindingError. A different terrain revision is returned and
 * left to landscapeTerrainFieldsStaleness.
 * @param {string|URL} url @param {{landscape:any,fetchImpl?:typeof fetch,signal?:AbortSignal}} options @returns {Promise<any|null>}
 */
export async function loadLandscapeTerrainFields(url, { landscape, fetchImpl = globalThis.fetch, signal } = /** @type {any} */ ({})) {
    requireCondition(!!landscape, 'terrain fields loading requires the landscape manifest they are bound to');
    const expected = validateLandscapeManifest(landscape);
    signal?.throwIfAborted();
    const response = await fetchImpl(resolveLandscapeUrl(url), { signal, cache: 'no-store' });
    if (response.status === 404) {
        await response.body?.cancel().catch(() => {});
        return null;
    }
    const bytes = await readBoundedResponse(response, LANDSCAPE_TERRAIN_FIELDS_LIMIT, false, 'terrain fields');
    signal?.throwIfAborted();
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (error) { throw new Error(`[Landscape] terrain fields are not valid UTF-8 JSON: ${error.message}`); }
    const result = await validateLandscapeTerrainFields(value, expected);
    signal?.throwIfAborted();
    return result;
}

/**
 * Fetches one field or natural-soil page and authenticates its exact size and SHA-256 before use.
 * @param {{url:string,byteLength:number,sha256:string}} entry @param {{manifestUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal,maxDecodedBytes?:number}} options
 */
export async function loadLandscapeTerrainFieldPage(entry, { manifestUrl, fetchImpl = globalThis.fetch, signal, maxDecodedBytes = LANDSCAPE_TERRAIN_FIELDS_PAGE_LIMIT }) {
    requireCondition(!!entry && typeof entry === 'object', 'terrain field page descriptor is required');
    requireRelativeUrl(entry.url, 'terrain field page url'); requireSha256(entry.sha256, 'terrain field page sha256');
    requireCondition(Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0 && entry.byteLength <= LANDSCAPE_TERRAIN_FIELDS_PAGE_LIMIT, 'terrain field page size is out of bounds');
    requireCondition(Number.isFinite(maxDecodedBytes) && entry.byteLength <= maxDecodedBytes, `terrain field page needs ${entry.byteLength} bytes; budget ${maxDecodedBytes}`);
    signal?.throwIfAborted();
    const response = await fetchImpl(new URL(entry.url, resolveLandscapeUrl(manifestUrl)).href, { signal });
    const bytes = await readBoundedResponse(response, entry.byteLength, true, 'terrain field page');
    await verifyLandscapeHash(bytes, entry.sha256, 'terrain field page'); signal?.throwIfAborted();
    return bytes;
}
