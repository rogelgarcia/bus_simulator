// Loads the optional layers appearance companion and its authenticated pages; a missing companion leaves the surface classes without materials.
// @ts-check
import { requireCondition } from './internal/LandscapeValidation.js';
import { readBoundedResponse, resolveLandscapeUrl } from './internal/LandscapePayloadIO.js';
import { LANDSCAPE_APPEARANCE_TIERS, validateLandscapeAppearanceManifest } from './LandscapeAppearanceManifest.js';
import { loadLandscapeAppearancePage } from './LandscapeAppearancePayload.js';
import { loadLandscapeAppearanceMultiscalePage } from './LandscapeAppearanceMultiscalePayload.js';
import { LANDSCAPE_APPEARANCE_LAYERS_LIMIT, LANDSCAPE_APPEARANCE_LAYERS_PAGE_LIMIT, validateLandscapeAppearanceLayers } from './LandscapeAppearanceLayers.js';
import { validateLandscapeSurfaceRecipe } from './surface/SurfaceModel.js';

/**
 * Resolves to null only when the companion does not exist (HTTP 404). Network failures, oversized or corrupt metadata and cancellation fail
 * explicitly; data for another appearance or material table throws LandscapeAppearanceLayersBindingError.
 * @param {string|URL} url @param {{appearance:any,recipe:any,fetchImpl?:typeof fetch,signal?:AbortSignal}} options
 * @returns {Promise<any|null>}
 */
export async function loadLandscapeAppearanceLayers(url, { appearance, recipe, fetchImpl = globalThis.fetch, signal } = /** @type {any} */ ({})) {
    requireCondition(!!appearance && !!recipe, 'appearance layers loading requires the schema-1 appearance they extend and the surface recipe');
    const expected = validateLandscapeAppearanceManifest(appearance), expectedRecipe = validateLandscapeSurfaceRecipe(recipe);
    signal?.throwIfAborted();
    const response = await fetchImpl(resolveLandscapeUrl(url), { signal, cache: 'no-store' });
    if (response.status === 404) {
        await response.body?.cancel().catch(() => {});
        return null;
    }
    const bytes = await readBoundedResponse(response, LANDSCAPE_APPEARANCE_LAYERS_LIMIT, false, 'appearance layers');
    signal?.throwIfAborted();
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (error) { throw new Error(`[Landscape] appearance layers are not valid UTF-8 JSON: ${error.message}`); }
    const result = await validateLandscapeAppearanceLayers(value, expected, expectedRecipe);
    signal?.throwIfAborted();
    return result;
}

/**
 * Loads one companion page: the schema-1 page loader serves the 32/128/512 tiers and the multiscale page loader the 1024 tier, so every page of
 * a layer material is authenticated by the loader of its resolution.
 * @param {any} input @param {{manifestUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal,maxDecodedBytes?:number}} options
 */
export async function loadLandscapeAppearanceLayersPage(input, { manifestUrl, fetchImpl = globalThis.fetch, signal, maxDecodedBytes = LANDSCAPE_APPEARANCE_LAYERS_PAGE_LIMIT }) {
    requireCondition(!!input && typeof input === 'object', 'appearance layers page descriptor is required');
    if (LANDSCAPE_APPEARANCE_TIERS.includes(input.width)) return loadLandscapeAppearancePage(input, { manifestUrl, fetchImpl, signal, maxDecodedBytes: Math.min(maxDecodedBytes, 512 * 512 * 4) });
    return loadLandscapeAppearanceMultiscalePage(input, { manifestUrl, fetchImpl, signal, maxDecodedBytes });
}
