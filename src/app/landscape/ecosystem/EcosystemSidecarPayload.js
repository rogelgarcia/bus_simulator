// Loads the optional ecosystem sidecar, its layer tile indexes and its authenticated tile payloads; a missing sidecar means the ecosystem is absent.
// @ts-check
// Every url is relative to the file that lists it: the manifest names its indexes (`layers/<layerId>.<sha256>.json`), an index names its payloads
// (`tiles/<sha256>.bin`, so they live under `layers/tiles/`), which is the convention the landscape cache bundle verifier and installer assume.
import { requireCondition, requireRelativeUrl, requireSha256 } from '../internal/LandscapeValidation.js';
import { readBoundedResponse, resolveLandscapeUrl, verifyLandscapeHash } from '../internal/LandscapePayloadIO.js';
import { validateLandscapeManifest } from '../LandscapeManifest.js';
import { LANDSCAPE_ECOSYSTEM_LIMIT, LANDSCAPE_ECOSYSTEM_TILES_LIMIT, LANDSCAPE_ECOSYSTEM_TILE_LIMIT, validateLandscapeEcosystem, validateLandscapeEcosystemTiles } from './EcosystemSidecar.js';
import { ECOSYSTEM_TILE_BYTES_PER_INSTANCE, decodeEcosystemTile } from './EcosystemTiles.js';

function parseJson(bytes, label) {
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (error) { throw new Error(`[Landscape] ${label} is not valid UTF-8 JSON: ${error.message}`); }
}

/**
 * Resolves to null only for HTTP 404. Network failures, oversized or corrupt metadata and cancellation fail explicitly; a valid sidecar of another
 * landscape, spatial frame or sea level throws LandscapeEcosystemBindingError. A different terrain revision is returned and left to staleness.
 * @param {string|URL} url @param {{landscape:any,fetchImpl?:typeof fetch,signal?:AbortSignal}} options @returns {Promise<any|null>}
 */
export async function loadLandscapeEcosystem(url, { landscape, fetchImpl = globalThis.fetch, signal } = /** @type {any} */ ({})) {
    requireCondition(!!landscape, 'ecosystem loading requires the landscape manifest it is bound to');
    const expected = validateLandscapeManifest(landscape);
    signal?.throwIfAborted();
    const response = await fetchImpl(resolveLandscapeUrl(url), { signal, cache: 'no-store' });
    if (response.status === 404) { await response.body?.cancel().catch(() => {}); return null; }
    const bytes = await readBoundedResponse(response, LANDSCAPE_ECOSYSTEM_LIMIT, false, 'ecosystem');
    signal?.throwIfAborted();
    const result = await validateLandscapeEcosystem(parseJson(bytes, 'ecosystem'), expected);
    signal?.throwIfAborted();
    return result;
}

async function fetchExact(entry, limit, label, { manifestUrl, fetchImpl, signal }) {
    requireCondition(!!entry && typeof entry === 'object', `${label} descriptor is required`);
    requireRelativeUrl(entry.url, `${label} url`); requireSha256(entry.sha256, `${label} sha256`);
    requireCondition(Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0 && entry.byteLength <= limit, `${label} size is out of bounds`);
    signal?.throwIfAborted();
    const response = await fetchImpl(new URL(entry.url, resolveLandscapeUrl(manifestUrl)).href, { signal });
    const bytes = await readBoundedResponse(response, entry.byteLength, true, label);
    await verifyLandscapeHash(bytes, entry.sha256, label); signal?.throwIfAborted();
    return bytes;
}

/**
 * Fetches and validates one layer's tile index (`sidecar.layers[i].tiles`), authenticating its exact size and SHA-256 before parsing.
 * @param {{url:string,byteLength:number,sha256:string}} entry @param {{manifestUrl:string|URL,sidecar?:any,layerId?:string,fetchImpl?:typeof fetch,signal?:AbortSignal}} options
 */
export async function loadLandscapeEcosystemTiles(entry, { manifestUrl, sidecar = null, layerId = null, fetchImpl = globalThis.fetch, signal }) {
    const bytes = await fetchExact(entry, LANDSCAPE_ECOSYSTEM_TILES_LIMIT, 'ecosystem tile index', { manifestUrl, fetchImpl, signal });
    return validateLandscapeEcosystemTiles(parseJson(bytes, 'ecosystem tile index'), { sidecar, layerId });
}

/**
 * Fetches one tile payload (its url is relative to the index that lists it), authenticates its exact size and SHA-256 and decodes it (count checked against the index entry).
 * @param {{id:string,count:number,payload:{url:string,byteLength:number,sha256:string}}} tile @param {{indexUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal}} options indexUrl: the absolute URL of the layer's tile index
 */
export async function loadLandscapeEcosystemTile(tile, { indexUrl, fetchImpl = globalThis.fetch, signal }) {
    requireCondition(!!tile && Number.isSafeInteger(tile.count) && tile.count >= 1, 'ecosystem tile entry is required');
    const bytes = await fetchExact(tile.payload, LANDSCAPE_ECOSYSTEM_TILE_LIMIT, `ecosystem tile ${tile.id}`, { manifestUrl: indexUrl, fetchImpl, signal });
    requireCondition(bytes.byteLength === tile.count * ECOSYSTEM_TILE_BYTES_PER_INSTANCE, `ecosystem tile ${tile.id} payload does not hold ${tile.count} instances`);
    return decodeEcosystemTile(bytes);
}
