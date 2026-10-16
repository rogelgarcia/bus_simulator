// Defines landscape-surface-overrides v1: data-only region pins and multipliers applied after the procedural pass, their identity, the root-grid override layer and its samplers.
// @ts-check
// Regions (circle, rectangle or polygon) pin a substrate and/or a cover class, scale the cover fraction and offset the wetness; later regions win
// per field. The GPU reads one RGBA8 root-grid layer rasterized from the document (R substrate pin or 255, G cover pin or 255, B cover-fraction
// scale as byte / 127, A wetness offset as (byte - 128) / 127, so the neutral texel [255, 255, 127, 128] is exact): pins nearest, scales bilinear,
// which the JavaScript sampler mirrors. A disturbance pin is data for D5 (applied by the document path; the layer has no channel for it).
import { landscapeRegionContains, validateLandscapeRegion } from '../LandscapeRegions.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId } from '../internal/LandscapeValidation.js';
import { readBoundedResponse, resolveLandscapeUrl } from '../internal/LandscapePayloadIO.js';
import { LANDSCAPE_SURFACE_COVERS, LANDSCAPE_SURFACE_MODEL, LANDSCAPE_SURFACE_SUBSTRATES, canonicalLandscapeSurfaceJson, landscapeSurfaceSha256 } from './SurfaceModel.js';

export const LANDSCAPE_SURFACE_OVERRIDE_LAYER = Object.freeze({
    id: 'landscape-surface-override-layer-v1', placement: 'root-grid layer of the terrain-field array before the appearance layer, present while an overrides document is bound',
    channels: Object.freeze({ r: 'substrate pin index, 255 none (nearest)', g: 'cover pin index, 255 none (nearest)', b: 'cover fraction scale 0..2 as byte / 127 (bilinear)', a: 'wetness offset -1..1 as (byte - 128) / 127 (bilinear)' }),
    none: 255, scaleUnit: 127, offsetZero: 128, neutral: Object.freeze([255, 255, 127, 128])
});

const KEYS = Object.freeze({ document: 'format,id,recipe,regions,schemaVersion', region: 'cover,coverFractionScale,disturbance,id,region,substrate,wetnessOffset' });
const clamp = (value, low, high) => value < low ? low : value > high ? high : value;

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields (expected ${keys})`);
}

/**
 * Validates and deep-freezes an overrides document (optional fields filled with null); with a recipe the document must target it.
 * @param {unknown} input @param {any} [recipe] validated recipe
 */
export function validateLandscapeSurfaceOverrides(input, recipe = null) {
    const value = clonePlainData(input, 'surface overrides');
    requireKeys(value, KEYS.document, 'surface overrides');
    requireCondition(value.format === LANDSCAPE_SURFACE_MODEL.overrides.format && value.schemaVersion === LANDSCAPE_SURFACE_MODEL.overrides.schemaVersion, 'unsupported surface overrides format/schemaVersion');
    requireId(value.id, 'surface overrides id'); requireId(value.recipe, 'surface overrides recipe');
    if (recipe) requireCondition(value.recipe === recipe.id, `surface overrides target recipe ${value.recipe}, not ${recipe.id}`);
    requireCondition(Array.isArray(value.regions) && value.regions.length <= LANDSCAPE_SURFACE_MODEL.limits.regions, `surface overrides regions must be an array of at most ${LANDSCAPE_SURFACE_MODEL.limits.regions}`);
    const ids = new Set(), regions = value.regions.map((entry, i) => {
        const label = `regions[${i}]`, filled = { substrate: null, cover: null, coverFractionScale: null, wetnessOffset: null, disturbance: null, ...entry };
        requireKeys(filled, KEYS.region, label); requireId(filled.id, `${label}.id`);
        requireCondition(!ids.has(filled.id), `override region ${filled.id} is repeated`); ids.add(filled.id);
        if (filled.substrate !== null) requireCondition(LANDSCAPE_SURFACE_SUBSTRATES.some(definition => definition.id === filled.substrate), `${label}.substrate is not a substrate class`);
        if (filled.cover !== null) requireCondition(LANDSCAPE_SURFACE_COVERS.some(definition => definition.id === filled.cover), `${label}.cover is not a cover class`);
        if (filled.coverFractionScale !== null) { requireFinite(filled.coverFractionScale, `${label}.coverFractionScale`); requireCondition(filled.coverFractionScale >= 0 && filled.coverFractionScale <= 2, `${label}.coverFractionScale must be in 0..2`); }
        if (filled.wetnessOffset !== null) { requireFinite(filled.wetnessOffset, `${label}.wetnessOffset`); requireCondition(filled.wetnessOffset >= -1 && filled.wetnessOffset <= 1, `${label}.wetnessOffset must be in -1..1`); }
        if (filled.disturbance !== null) { requireFinite(filled.disturbance, `${label}.disturbance`); requireCondition(filled.disturbance >= 0 && filled.disturbance <= 1, `${label}.disturbance must be in 0..1`); }
        requireCondition([filled.substrate, filled.cover, filled.coverFractionScale, filled.wetnessOffset, filled.disturbance].some(field => field !== null), `${label} overrides nothing`);
        return { id: filled.id, region: validateLandscapeRegion(filled.region, { allowPoint: false }), substrate: filled.substrate, cover: filled.cover, coverFractionScale: filled.coverFractionScale,
            wetnessOffset: filled.wetnessOffset, disturbance: filled.disturbance };
    });
    return freezeData({ format: value.format, schemaVersion: value.schemaVersion, id: value.id, recipe: value.recipe, regions });
}

/** Identity `surface-overrides-<24 hex>` of a document (SHA-256 of its canonical JSON). @param {any} overrides @returns {Promise<string>} */
export async function landscapeSurfaceOverridesIdentity(overrides) {
    return `${LANDSCAPE_SURFACE_MODEL.overrides.identityPrefix}${(await landscapeSurfaceSha256(canonicalLandscapeSurfaceJson(validateLandscapeSurfaceOverrides(overrides)))).slice(0, 24)}`;
}

/** @returns {{substrate:number,cover:number,coverFractionScale:number,wetnessOffset:number,disturbance:number}} the neutral override (no pins: -1; scale 1; offset 0; disturbance -1) */
export function createLandscapeSurfaceOverride() { return { substrate: -1, cover: -1, coverFractionScale: 1, wetnessOffset: 0, disturbance: -1 }; }

/** The merged override of a validated document at a world position (later regions win per field). @param {any} overrides @param {number} x @param {number} z @param {ReturnType<typeof createLandscapeSurfaceOverride>} [out] */
export function landscapeSurfaceOverrideAt(overrides, x, z, out = createLandscapeSurfaceOverride()) {
    out.substrate = -1; out.cover = -1; out.coverFractionScale = 1; out.wetnessOffset = 0; out.disturbance = -1;
    for (const region of overrides.regions) {
        if (!landscapeRegionContains(region.region, x, z)) continue;
        if (region.substrate !== null) out.substrate = LANDSCAPE_SURFACE_SUBSTRATES.findIndex(definition => definition.id === region.substrate);
        if (region.cover !== null) out.cover = LANDSCAPE_SURFACE_COVERS.findIndex(definition => definition.id === region.cover);
        if (region.coverFractionScale !== null) out.coverFractionScale = region.coverFractionScale;
        if (region.wetnessOffset !== null) out.wetnessOffset = region.wetnessOffset;
        if (region.disturbance !== null) out.disturbance = region.disturbance;
    }
    return out;
}

/**
 * Applies an override to a derivation result in place: pins replace the class weights with the one-hot, the scale multiplies the cover fraction, the
 * offset adds to the wetness (both clamped), a disturbance pin replaces the disturbance. The GLSL mirror applies the layer's decoded override the same way.
 * @param {{substrate:Float64Array,cover:Float64Array,coverFraction:number,wetness:number,disturbance:number}} result @param {ReturnType<typeof createLandscapeSurfaceOverride>} override
 */
export function applyLandscapeSurfaceOverride(result, override) {
    if (override.substrate >= 0) { result.substrate.fill(0); result.substrate[override.substrate] = 1; }
    if (override.cover >= 0) { result.cover.fill(0); result.cover[override.cover] = 1; }
    result.coverFraction = clamp(result.coverFraction * override.coverFractionScale, 0, 1);
    result.wetness = clamp(result.wetness + override.wetnessOffset, 0, 1);
    if (override.disturbance >= 0) result.disturbance = override.disturbance;
    return result;
}

/** Applies the document's override at a world position (the exact document path). @param {any} result @param {any} overrides @param {number} x @param {number} z */
export function applyLandscapeSurfaceOverrides(result, overrides, x, z) { return applyLandscapeSurfaceOverride(result, landscapeSurfaceOverrideAt(overrides, x, z)); }

/** The four layer bytes of an override. @param {ReturnType<typeof createLandscapeSurfaceOverride>} override @param {Uint8Array} out @param {number} offset */
export function encodeLandscapeSurfaceOverride(override, out, offset = 0) {
    const layer = LANDSCAPE_SURFACE_OVERRIDE_LAYER;
    out[offset] = override.substrate >= 0 ? override.substrate : layer.none; out[offset + 1] = override.cover >= 0 ? override.cover : layer.none;
    out[offset + 2] = Math.round(clamp(override.coverFractionScale, 0, 2) * layer.scaleUnit); out[offset + 3] = Math.round(clamp(override.wetnessOffset, -1, 1) * layer.scaleUnit) + layer.offsetZero;
    return out;
}

/**
 * Decodes an override from nearest pin bytes and (possibly filtered) scale and offset bytes, exactly as landscapeSurfaceOverrideLayer in the GLSL chunk.
 * @param {number} pinR @param {number} pinG @param {number} scaleByte 0..255, may be fractional after filtering @param {number} offsetByte @param {ReturnType<typeof createLandscapeSurfaceOverride>} [out]
 */
export function decodeLandscapeSurfaceOverride(pinR, pinG, scaleByte, offsetByte, out = createLandscapeSurfaceOverride()) {
    const layer = LANDSCAPE_SURFACE_OVERRIDE_LAYER;
    out.substrate = pinR < LANDSCAPE_SURFACE_SUBSTRATES.length ? pinR : -1; out.cover = pinG < LANDSCAPE_SURFACE_COVERS.length ? pinG : -1;
    out.coverFractionScale = scaleByte / layer.scaleUnit; out.wetnessOffset = (offsetByte - layer.offsetZero) / layer.scaleUnit; out.disturbance = -1;
    return out;
}

/**
 * Rasterizes a document into the root-grid layer (field page layout: samples x samples inside a halo ring, row 0 north, the halo edge-clamped),
 * evaluating the document at every root sample's world position. @param {any} overrides validated document
 * @param {{bounds:{minX:number,maxX:number,minZ:number,maxZ:number},samples:number,halo:number,width:number}} rootGrid
 */
export function rasterizeLandscapeSurfaceOverrideLayer(overrides, rootGrid) {
    const { bounds, samples, halo, width } = rootGrid;
    requireCondition(Number.isSafeInteger(samples) && samples >= 2 && Number.isSafeInteger(halo) && halo >= 0 && width === samples + 2 * halo, 'the override layer needs the field page layout');
    const bytes = new Uint8Array(width * width * 4), spacingX = (bounds.maxX - bounds.minX) / (samples - 1), spacingZ = (bounds.maxZ - bounds.minZ) / (samples - 1), override = createLandscapeSurfaceOverride();
    for (let row = 0; row < width; row++) for (let column = 0; column < width; column++) {
        const sampleColumn = clamp(column - halo, 0, samples - 1), sampleRow = clamp(row - halo, 0, samples - 1);
        landscapeSurfaceOverrideAt(overrides, bounds.minX + sampleColumn * spacingX, bounds.maxZ - sampleRow * spacingZ, override);
        encodeLandscapeSurfaceOverride(override, bytes, (row * width + column) * 4);
    }
    return bytes;
}

/**
 * The override the GPU reads at a world position: pins from the nearest aligned sample, scale and offset bilinear at texel centers (mirror of the GLSL read).
 * @param {Uint8Array} pixels @param {number} offset byte offset of the layer @param {{width:number,halo:number,samples:number}} layout
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {number} x @param {number} z @param {ReturnType<typeof createLandscapeSurfaceOverride>} [out]
 */
export function sampleLandscapeSurfaceOverrideLayer(pixels, offset, layout, bounds, x, z, out = createLandscapeSurfaceOverride()) {
    const intervals = layout.samples - 1, width = layout.width;
    const gx = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * intervals, 0, intervals), gz = clamp((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * intervals, 0, intervals);
    const nearest = offset + ((Math.round(gz) + layout.halo) * width + Math.round(gx) + layout.halo) * 4;
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, at = offset + ((iz + layout.halo) * width + ix + layout.halo) * 4, below = at + width * 4;
    const bilinear = component => (pixels[at + component] * (1 - fx) + pixels[at + 4 + component] * fx) * (1 - fz) + (pixels[below + component] * (1 - fx) + pixels[below + 4 + component] * fx) * fz;
    return decodeLandscapeSurfaceOverride(pixels[nearest], pixels[nearest + 1], bilinear(2), bilinear(3), out);
}

/**
 * Loads an overrides document; null only for HTTP 404. @param {string|URL} url @param {{recipe?:any,fetchImpl?:typeof fetch,signal?:AbortSignal}} [options]
 * @returns {Promise<any|null>} validated, frozen document
 */
export async function loadLandscapeSurfaceOverrides(url, { recipe = null, fetchImpl = globalThis.fetch, signal } = {}) {
    signal?.throwIfAborted();
    const response = await fetchImpl(resolveLandscapeUrl(url), { signal, cache: 'no-store' });
    if (response.status === 404) { await response.body?.cancel().catch(() => {}); return null; }
    const bytes = await readBoundedResponse(response, LANDSCAPE_SURFACE_MODEL.limits.overridesBytes, false, 'surface overrides');
    signal?.throwIfAborted();
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (error) { throw new Error(`[Landscape] surface overrides are not valid UTF-8 JSON: ${/** @type {Error} */ (error).message}`); }
    return validateLandscapeSurfaceOverrides(value, recipe);
}
