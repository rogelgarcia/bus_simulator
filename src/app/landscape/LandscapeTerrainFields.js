// Defines the additive landscape-terrain-fields v1 contract: channel map, encoding, strict sidecar validation, staleness and exact sampling.
// @ts-check
// Terrain fields are derived, offline global analyses of one exact terrain revision (not measured data). Pages share the chunk IDs,
// sample grid and two-sample halo of the categorical mask pages and pack sixteen UNORM8 channels into four RGBA8 layers. Linear GPU
// filtering interpolates encoded bytes, so every consumer decodes after filtering; this module is the JavaScript mirror of the GLSL
// decode in chunks/landscape/terrain_fields.glsl. A changed native height or land-cover channel makes exactly that native chunk stale.
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';
import { validateLandscapeManifest } from './LandscapeManifest.js';

export const LANDSCAPE_TERRAIN_FIELDS_FORMAT = 'landscape-terrain-fields';
export const LANDSCAPE_TERRAIN_FIELDS_ALGORITHM = 'landscape-terrain-fields-v1';
export const LANDSCAPE_TERRAIN_FIELDS_LIMIT = 256 * 1024;
export const LANDSCAPE_TERRAIN_FIELDS_PAGE_LIMIT = 2 * 1024 * 1024;
export const LANDSCAPE_TERRAIN_FIELDS_STALE_GRID = 8;
export const LANDSCAPE_TERRAIN_FIELDS_LAYOUT = Object.freeze({ layers: 4, halo: 2, encoding: 'rgba8', filter: 'linear', rowOrder: 'north-first' });
export const LANDSCAPE_TERRAIN_FIELDS_HORIZON = Object.freeze({
    azimuthsDegrees: Object.freeze([0, 45, 90, 135, 180, 225, 270, 315]),
    convention: 'counterclockwise-from-east-toward-north', encoding: 'sqrt-sine', interpolation: 'linear-sine-between-adjacent-azimuths',
    solarRadiusDegrees: .265, beyondLandscape: 'no-terrain'
});
// footprints between one and two page sample spacings hand the field to the next coarser resident page, like the coverage ancestors
export const LANDSCAPE_TERRAIN_FIELDS_FILTER = Object.freeze({ coarserStartCells: 1, coarserEndCells: 2, arrivalSeconds: .3 });

const channel = (name, layer, component, curve, scale, unit) => Object.freeze({ name, layer, component, curve, scale, unit });
export const LANDSCAPE_TERRAIN_FIELD_CHANNELS = Object.freeze([
    channel('wetness', 0, 'r', 'linear', 1, 'normalized topographic wetness index (1 below sea level)'),
    channel('flow', 0, 'g', 'linear', 1, 'normalized log specific catchment area'),
    channel('deposition', 0, 'b', 'linear', 1, 'normalized sediment deposition proxy'),
    channel('rockExposure', 0, 'a', 'linear', 1, 'normalized restrained rock exposure'),
    channel('skyView', 1, 'r', 'linear', 1, 'fraction of isotropic sky irradiance received by the facet'),
    channel('shoreDistance', 1, 'g', 'signed-square', 256, 'signed meters to the sea-level shoreline, land positive'),
    channel('convexity', 1, 'b', 'signed-linear', 1, 'normalized multi-scale convexity, ridges positive'),
    channel('slope', 1, 'a', 'linear', 90, 'degrees'),
    ...LANDSCAPE_TERRAIN_FIELDS_HORIZON.azimuthsDegrees.map((azimuth, i) => channel(`horizon${String(azimuth).padStart(3, '0')}`, 2 + (i >> 2), 'rgba'[i & 3], 'sqrt-sine', 1,
        `sine of the terrain horizon elevation toward azimuth ${azimuth} degrees, clamped to the horizontal`))
]);
export const LANDSCAPE_TERRAIN_FIELD_CURVES = Object.freeze(['linear', 'signed-linear', 'signed-square', 'sqrt-sine']);

const BOUNDS_FIELDS = ['minX', 'maxX', 'minZ', 'maxZ'];
const GRID_FIELDS = ['columns', 'rows', 'spacingX', 'spacingZ', 'chunkIntervals', 'maxLevel'];
const KEYS = Object.freeze({
    sidecar: 'channels,format,horizon,landscapeId,layout,pages,provenance,revision,schemaVersion,statistics,terrain',
    terrain: 'bounds,chunks,grid,manifestSha256,revision,seaLevel,sourceSha256',
    chunk: 'height,id,landCover',
    layout: 'encoding,filter,halo,height,layerBytes,layers,naturalSoil,pageBytes,rowOrder,samples,width',
    naturalSoil: 'byteLength,encoding,halo,rowOrder,samples',
    channel: 'component,curve,layer,name,scale,unit',
    horizon: 'azimuthsDegrees,beyondLandscape,convention,encoding,interpolation,solarRadiusDegrees',
    page: 'column,contentKey,fields,id,level,naturalSoil,row',
    payload: 'byteLength,sha256,url',
    provenance: 'algorithm,derivedFrom,imports,measured,recipe,recipeSha256,rights',
    importEntry: 'byteLength,encoding,field,id,mode,provenance,sha256,weight',
    statistics: 'channels,curvature,flood,horizon,land,naturalSoil,shore'
});

/** Identifies a structurally valid sidecar that was prepared for another landscape, spatial frame or sea level. */
export class LandscapeTerrainFieldsBindingError extends Error {
    constructor(message) { super(`[Landscape] ${message}`); this.name = 'LandscapeTerrainFieldsBindingError'; }
}

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields`);
}

const clamp = (value, low, high) => value < low ? low : value > high ? high : value;

/**
 * Encodes one decoded channel value into its UNORM8 byte.
 * @param {{curve:string,scale:number}} definition @param {number} value
 */
export function encodeLandscapeTerrainField(definition, value) {
    requireCondition(typeof value === 'number' && !Number.isNaN(value), `terrain field ${definition?.curve} value must be a number`);
    const scaled = value / definition.scale;
    let unit;
    if (definition.curve === 'linear') unit = clamp(scaled, 0, 1);
    else if (definition.curve === 'signed-linear') unit = .5 + .5 * clamp(scaled, -1, 1);
    else if (definition.curve === 'signed-square') {
        // the sign is exact: negative values (including -0) encode to 0..127, non-negative values to 128..255
        const negative = scaled < 0 || Object.is(scaled, -0), byte = Math.round((.5 + .5 * (negative ? -1 : 1) * Math.sqrt(Math.min(1, Math.abs(scaled)))) * 255);
        return negative ? Math.min(127, byte) : Math.max(128, byte);
    } else if (definition.curve === 'sqrt-sine') unit = Math.sqrt(clamp(scaled, 0, 1));
    else throw new Error(`[Landscape] Unknown terrain field curve ${definition.curve}`);
    return Math.round(unit * 255);
}

/**
 * Decodes a (possibly linearly filtered) unit value v = byte / 255 exactly as the GLSL chunk does.
 * @param {{curve:string,scale:number}} definition @param {number} unit
 */
export function decodeLandscapeTerrainField(definition, unit) {
    if (definition.curve === 'linear') return unit * definition.scale;
    if (definition.curve === 'signed-linear') return (unit * 2 - 1) * definition.scale;
    if (definition.curve === 'signed-square') { const s = unit * 2 - 1; return Math.sign(s) * s * s * definition.scale; }
    if (definition.curve === 'sqrt-sine') return unit * unit * definition.scale;
    throw new Error(`[Landscape] Unknown terrain field curve ${definition.curve}`);
}

/** @param {number} samples page samples per axis (chunkIntervals + 1) */
export function landscapeTerrainFieldsLayout(samples) {
    requireInteger(samples, 2, 4097, 'terrain field samples');
    const { layers, halo, encoding, filter, rowOrder } = LANDSCAPE_TERRAIN_FIELDS_LAYOUT, width = samples + halo * 2, layerBytes = width * width * 4;
    return Object.freeze({ samples, halo, width, height: width, layers, encoding, filter, rowOrder, layerBytes, pageBytes: layerBytes * layers,
        naturalSoil: Object.freeze({ encoding: 'uint8', samples, halo: 0, rowOrder: 'north-first', byteLength: samples * samples }) });
}

/** Native chunks whose area lies inside a chunk of any level, in row-major order. @param {any} grid @param {{level:number,column:number,row:number}} chunk */
export function landscapeTerrainFieldNativeIds(grid, chunk) {
    const span = 2 ** (grid.maxLevel - chunk.level), ids = [];
    for (let row = chunk.row * span; row < (chunk.row + 1) * span; row++) for (let column = chunk.column * span; column < (chunk.column + 1) * span; column++) {
        ids.push(`l${grid.maxLevel}/c${column}/r${row}`);
    }
    return ids;
}

/** Canonical JSON of the native channel identities a page was computed from (hashed into its contentKey). @param {any} terrain @param {any} chunk */
export function landscapeTerrainFieldContentInput(terrain, chunk) {
    const byId = new Map(terrain.chunks.map(entry => [entry.id, entry]));
    return JSON.stringify({ algorithm: LANDSCAPE_TERRAIN_FIELDS_ALGORITHM, page: chunk.id, natives: landscapeTerrainFieldNativeIds(terrain.grid, chunk).map(id => {
        const entry = byId.get(id);
        requireCondition(!!entry, `terrain fields lack native chunk ${id}`);
        return [id, entry.height, entry.landCover];
    }) });
}

async function sha256Text(text) {
    requireCondition(!!globalThis.crypto?.subtle, 'Terrain field identity requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** @param {any} terrain @param {any} chunk @returns {Promise<string>} */
export function landscapeTerrainFieldContentKey(terrain, chunk) { return sha256Text(landscapeTerrainFieldContentInput(terrain, chunk)); }

function validatePayload(value, label, byteLength) {
    requireKeys(value, KEYS.payload, label);
    requireRelativeUrl(value.url, `${label}.url`); requireSha256(value.sha256, `${label}.sha256`);
    requireCondition(value.byteLength === byteLength && value.byteLength <= LANDSCAPE_TERRAIN_FIELDS_PAGE_LIMIT, `${label} must be exactly ${byteLength} bytes`);
}

function validateTerrain(terrain) {
    requireKeys(terrain, KEYS.terrain, 'terrain fields terrain binding');
    requireId(terrain.revision, 'terrain fields terrain.revision'); requireSha256(terrain.manifestSha256, 'terrain fields terrain.manifestSha256');
    requireSha256(terrain.sourceSha256, 'terrain fields terrain.sourceSha256'); requireFinite(terrain.seaLevel, 'terrain fields seaLevel');
    requireKeys(terrain.bounds, BOUNDS_FIELDS.slice().sort().join(','), 'terrain fields bounds');
    for (const key of BOUNDS_FIELDS) requireFinite(terrain.bounds[key], `terrain fields bounds.${key}`);
    requireCondition(terrain.bounds.maxX > terrain.bounds.minX && terrain.bounds.maxZ > terrain.bounds.minZ, 'terrain fields bounds must have positive area');
    requireKeys(terrain.grid, GRID_FIELDS.slice().sort().join(','), 'terrain fields grid');
    requireInteger(terrain.grid.maxLevel, 0, 12, 'terrain fields grid.maxLevel'); requireInteger(terrain.grid.chunkIntervals, 1, 4096, 'terrain fields grid.chunkIntervals');
    const dimension = terrain.grid.chunkIntervals * 2 ** terrain.grid.maxLevel + 1;
    requireCondition(terrain.grid.columns === dimension && terrain.grid.rows === dimension, 'terrain fields grid must match its dyadic chunk hierarchy');
    for (const key of ['spacingX', 'spacingZ']) { requireFinite(terrain.grid[key], `terrain fields grid.${key}`); requireCondition(terrain.grid[key] > 0, 'terrain fields spacing must be positive'); }
    requireCondition(terrain.grid.spacingX === terrain.grid.spacingZ, 'terrain fields v1 requires square native spacing (its diagonal horizons lie at 45 degrees)');
    const count = 4 ** terrain.grid.maxLevel;
    requireCondition(Array.isArray(terrain.chunks) && terrain.chunks.length === count, `terrain fields must bind all ${count} native chunks`);
    const ids = new Set();
    terrain.chunks.forEach(entry => {
        requireKeys(entry, KEYS.chunk, 'terrain fields native chunk');
        requireCondition(/^l\d+\/c\d+\/r\d+$/.test(entry.id) && entry.id.startsWith(`l${terrain.grid.maxLevel}/`) && !ids.has(entry.id), `terrain fields native chunk ${entry.id} is invalid or repeated`);
        ids.add(entry.id); requireSha256(entry.height, `${entry.id}.height`); requireSha256(entry.landCover, `${entry.id}.landCover`);
    });
}

function validateChannels(channels) {
    requireCondition(Array.isArray(channels) && channels.length === LANDSCAPE_TERRAIN_FIELD_CHANNELS.length, 'terrain fields must declare the sixteen v1 channels');
    channels.forEach((entry, i) => {
        requireKeys(entry, KEYS.channel, `terrain field channel ${i}`);
        const expected = LANDSCAPE_TERRAIN_FIELD_CHANNELS[i];
        requireCondition(Object.keys(expected).every(key => entry[key] === expected[key]), `terrain field channel ${i} must be ${expected.name} (${expected.curve}, layer ${expected.layer}${expected.component})`);
    });
}

function validateStatistics(statistics) {
    requireKeys(statistics, KEYS.statistics, 'terrain fields statistics');
    for (const [key, value] of Object.entries(statistics)) requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `terrain fields statistics.${key} must be an object`);
}

function validateProvenance(provenance) {
    requireKeys(provenance, KEYS.provenance, 'terrain fields provenance');
    requireCondition(provenance.algorithm === LANDSCAPE_TERRAIN_FIELDS_ALGORITHM && provenance.measured === false, 'terrain fields provenance must declare the v1 derived (unmeasured) algorithm');
    requireCondition(!!provenance.recipe && typeof provenance.recipe === 'object' && !Array.isArray(provenance.recipe) && provenance.recipe.id === LANDSCAPE_TERRAIN_FIELDS_ALGORITHM, 'terrain fields provenance requires its recipe');
    requireSha256(provenance.recipeSha256, 'terrain fields recipeSha256');
    requireCondition(typeof provenance.rights === 'string' && provenance.rights.length > 0 && typeof provenance.derivedFrom === 'string' && provenance.derivedFrom.length > 0, 'terrain fields provenance requires rights and derivation');
    requireCondition(Array.isArray(provenance.imports) && provenance.imports.length <= 8, 'terrain fields allow at most eight retained imports');
    for (const entry of provenance.imports) {
        requireKeys(entry, KEYS.importEntry, 'terrain field import');
        requireId(entry.id, 'terrain field import id'); requireSha256(entry.sha256, 'terrain field import sha256');
        requireCondition(['flow', 'deposition', 'wetness', 'rockExposure'].includes(entry.field) && ['replace', 'max', 'blend'].includes(entry.mode)
            && ['png-gray8', 'png-gray16'].includes(entry.encoding), 'terrain field import has an unsupported field, mode or encoding');
        requireFinite(entry.weight, 'terrain field import weight'); requireCondition(entry.weight > 0 && entry.weight <= 1, 'terrain field import weight must be in (0, 1]');
        requireInteger(entry.byteLength, 1, 256 * 1024 * 1024, 'terrain field import bytes');
        requireCondition(!!entry.provenance && typeof entry.provenance === 'object' && typeof entry.provenance.tool === 'string' && entry.provenance.tool.length > 0, 'terrain field import requires tool provenance');
    }
}

/**
 * Strictly validates a sidecar (key-order independent; unknown fields rejected). With a landscape, a different landscape ID, spatial
 * frame or sea level throws LandscapeTerrainFieldsBindingError; a different terrain revision is not an error (see staleness).
 * @param {any} input @param {any} [landscapeInput] @returns {Promise<any>} Frozen clone.
 */
export async function validateLandscapeTerrainFields(input, landscapeInput) {
    const value = clonePlainData(input, 'terrain fields');
    requireKeys(value, KEYS.sidecar, 'terrain fields');
    requireCondition(value.format === LANDSCAPE_TERRAIN_FIELDS_FORMAT && value.schemaVersion === 1, 'unsupported terrain fields schema');
    requireId(value.landscapeId, 'terrain fields landscapeId'); requireId(value.revision, 'terrain fields revision');
    requireCondition(/^terrain-fields-[a-f0-9]{24}$/.test(value.revision), 'terrain fields revision must be content derived');
    validateTerrain(value.terrain);
    const layout = landscapeTerrainFieldsLayout(value.terrain.grid.chunkIntervals + 1);
    requireKeys(value.layout, KEYS.layout, 'terrain fields layout'); requireKeys(value.layout.naturalSoil, KEYS.naturalSoil, 'terrain fields natural soil layout');
    requireCondition(Object.entries(layout).every(([key, expected]) => key === 'naturalSoil' ? Object.entries(expected).every(([inner, v]) => value.layout.naturalSoil[inner] === v) : value.layout[key] === expected),
        'terrain fields layout must match the v1 page layout for this grid');
    validateChannels(value.channels);
    requireKeys(value.horizon, KEYS.horizon, 'terrain fields horizon');
    requireCondition(Object.entries(LANDSCAPE_TERRAIN_FIELDS_HORIZON).every(([key, expected]) => Array.isArray(expected) ? value.horizon[key]?.join(',') === expected.join(',') : value.horizon[key] === expected),
        'terrain fields horizon must match the v1 azimuths, convention and encoding');
    validateStatistics(value.statistics);
    validateProvenance(value.provenance);
    const grid = value.terrain.grid, expectedPages = Array.from({ length: grid.maxLevel + 1 }, (_, level) => 4 ** level).reduce((sum, count) => sum + count, 0);
    requireCondition(Array.isArray(value.pages) && value.pages.length <= expectedPages && value.pages.length > 0, `terrain fields require 1..${expectedPages} pages`);
    const ids = new Set();
    for (const page of value.pages) {
        requireKeys(page, KEYS.page, 'terrain field page');
        requireInteger(page.level, 0, grid.maxLevel, 'terrain field page level');
        requireInteger(page.column, 0, 2 ** page.level - 1, 'terrain field page column'); requireInteger(page.row, 0, 2 ** page.level - 1, 'terrain field page row');
        requireCondition(page.id === `l${page.level}/c${page.column}/r${page.row}` && !ids.has(page.id), `terrain field page ${page.id} has an inconsistent or repeated identity`);
        ids.add(page.id);
        requireSha256(page.contentKey, `${page.id}.contentKey`);
        requireCondition(page.contentKey === await landscapeTerrainFieldContentKey(value.terrain, page), `${page.id} contentKey does not match its native channel identities`);
        validatePayload(page.fields, `${page.id}.fields`, layout.pageBytes);
        if (page.naturalSoil !== null) validatePayload(page.naturalSoil, `${page.id}.naturalSoil`, layout.naturalSoil.byteLength);
    }
    if (landscapeInput !== undefined) {
        const landscape = validateLandscapeManifest(landscapeInput);
        if (value.landscapeId !== landscape.id) throw new LandscapeTerrainFieldsBindingError(`terrain fields belong to landscape ${value.landscapeId}, not ${landscape.id}`);
        if (!BOUNDS_FIELDS.every(key => value.terrain.bounds[key] === landscape.bounds[key]) || !GRID_FIELDS.every(key => value.terrain.grid[key] === landscape.grid[key])) {
            throw new LandscapeTerrainFieldsBindingError('terrain fields spatial frame does not match the landscape');
        }
        if (value.terrain.seaLevel !== landscape.coordinates.seaLevel) throw new LandscapeTerrainFieldsBindingError('terrain fields were prepared for a different sea level');
        for (const page of value.pages) requireCondition(landscape.chunks.some(chunk => chunk.id === page.id), `terrain field page ${page.id} has no landscape chunk`);
    }
    return freezeData(value);
}

/**
 * Compares the bound native channel identities with a (possibly edited) landscape. A native chunk is stale when its height or
 * land-cover hash changed; a page is stale when all of its native chunks are stale and partial when some are. Stale fragments are
 * also flagged on an 8 x 8 grid over the landscape bounds (bit index row * 8 + column, row 0 north) for per-fragment fallback.
 * @param {any} fields validated sidecar @param {any} landscape validated landscape manifest
 */
export function landscapeTerrainFieldsStaleness(fields, landscape) {
    const current = new Map(landscape.chunks.filter(chunk => chunk.level === landscape.grid.maxLevel).map(chunk => [chunk.id, chunk]));
    const staleChunks = fields.terrain.chunks.filter(entry => {
        const chunk = current.get(entry.id);
        return !chunk || chunk.channels.height.sha256 !== entry.height || chunk.channels.landCover.sha256 !== entry.landCover;
    }).map(entry => entry.id);
    const stale = new Set(staleChunks), pages = {};
    for (const page of fields.pages) {
        const natives = landscapeTerrainFieldNativeIds(fields.terrain.grid, page), count = natives.filter(id => stale.has(id)).length;
        pages[page.id] = count === 0 ? 'fresh' : count === natives.length ? 'stale' : 'partial';
    }
    const cells = new Uint32Array(2), grid = LANDSCAPE_TERRAIN_FIELDS_STALE_GRID, side = 2 ** fields.terrain.grid.maxLevel;
    for (const id of staleChunks) {
        const [, column, row] = /^l\d+\/c(\d+)\/r(\d+)$/.exec(id).map(Number);
        const first = cell => Math.floor(cell * grid / side), last = cell => Math.max(first(cell), Math.ceil((cell + 1) * grid / side) - 1);
        for (let r = first(row); r <= last(row); r++) for (let c = first(column); c <= last(column); c++) {
            const bit = r * grid + c;
            cells[bit >> 5] = (cells[bit >> 5] | (1 << (bit & 31))) >>> 0;
        }
    }
    return Object.freeze({ bound: fields.terrain.revision === landscape.revision, terrainRevision: fields.terrain.revision, currentRevision: landscape.revision,
        staleChunks: Object.freeze(staleChunks), pages: Object.freeze(pages), staleCells: Object.freeze([cells[0], cells[1]]) });
}

/** Whether a world position falls in a stale 8 x 8 cell. @param {readonly number[]} staleCells @param {any} bounds @param {number} x @param {number} z */
export function landscapeTerrainFieldStaleAt(staleCells, bounds, x, z) {
    const grid = LANDSCAPE_TERRAIN_FIELDS_STALE_GRID;
    const column = clamp(Math.floor((x - bounds.minX) / (bounds.maxX - bounds.minX) * grid), 0, grid - 1);
    const row = clamp(Math.floor((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * grid), 0, grid - 1);
    const bit = row * grid + column;
    return ((staleCells[bit >> 5] >>> (bit & 31)) & 1) === 1;
}

/**
 * Bilinear (GPU linear filtering at texel centers) unit values of all sixteen channels of one page at a world position.
 * @param {Uint8Array} pixels page bytes (four layers) or a texture array @param {number} offset byte offset of layer 0
 * @param {{width:number,halo:number,layerBytes:number,samples:number}} layout @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 * @param {number} x @param {number} z @param {Float64Array} [out]
 */
export function sampleLandscapeTerrainFieldPage(pixels, offset, layout, bounds, x, z, out = new Float64Array(16)) {
    const intervals = layout.samples - 1;
    const gx = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * intervals, 0, intervals), gz = clamp((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * intervals, 0, intervals);
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, width = layout.width;
    const base = (iz + layout.halo) * width + ix + layout.halo;
    for (let layer = 0; layer < 4; layer++) {
        const at = offset + layer * layout.layerBytes + base * 4, below = at + width * 4;
        for (let component = 0; component < 4; component++) {
            const a = pixels[at + component], b = pixels[at + 4 + component], c = pixels[below + component], d = pixels[below + 4 + component];
            out[layer * 4 + component] = ((a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz) / 255;
        }
    }
    return out;
}

/**
 * Natural display soil index of the aligned sample nearest to a world position in one natural-soil page (a chunk of any level holds the
 * native labels at its aligned samples, so every level reads identical labels at shared positions). Categorical: never interpolated.
 * @param {Uint8Array} labels natural-soil page (samples x samples, row 0 north) @param {{bounds:{minX:number,maxX:number,minZ:number,maxZ:number},columns:number,rows:number}} chunk
 * @param {number} x @param {number} z
 */
export function sampleLandscapeTerrainNaturalSoil(labels, chunk, x, z) {
    requireCondition(labels instanceof Uint8Array && labels.length === chunk.columns * chunk.rows, 'natural soil page does not match its chunk');
    const b = chunk.bounds, column = clamp(Math.round((x - b.minX) / (b.maxX - b.minX) * (chunk.columns - 1)), 0, chunk.columns - 1);
    const row = clamp(Math.round((b.maxZ - z) / (b.maxZ - b.minZ) * (chunk.rows - 1)), 0, chunk.rows - 1);
    return labels[row * chunk.columns + column];
}

/** Decodes the sixteen (filtered) unit values in channel order. @param {ArrayLike<number>} units */
export function decodeLandscapeTerrainFields(units) {
    const values = LANDSCAPE_TERRAIN_FIELD_CHANNELS.map((definition, i) => decodeLandscapeTerrainField(definition, units[i]));
    return {
        wetness: values[0], flow: values[1], deposition: values[2], rockExposure: values[3], skyView: values[4], shoreDistance: values[5],
        convexity: values[6], slopeDegrees: values[7], horizonSine: values.slice(8, 16)
    };
}

/** Linear interpolation of the stored horizon sines at an azimuth (radians, counterclockwise from +X toward +Z). @param {readonly number[]} horizonSine @param {number} azimuth */
export function landscapeTerrainHorizonSine(horizonSine, azimuth) {
    const turns = ((azimuth / (Math.PI / 4)) % 8 + 8) % 8, index = Math.floor(turns), fraction = turns - index;
    return horizonSine[index] * (1 - fraction) + horizonSine[(index + 1) % 8] * fraction;
}

/**
 * Visible fraction of the solar disc (radius 0.265 degrees) above a horizon line: the circular-segment area 0.5 + (d sqrt(1-d^2) + asin d)/pi
 * for d = (sunElevation - horizonElevation) / radius clamped to [-1, 1].
 * @param {number} sunElevation radians @param {number} horizonElevation radians @param {number} [radius] radians
 */
export function landscapeSolarDiscVisibility(sunElevation, horizonElevation, radius = LANDSCAPE_TERRAIN_FIELDS_HORIZON.solarRadiusDegrees * Math.PI / 180) {
    const d = clamp((sunElevation - horizonElevation) / radius, -1, 1);
    return .5 + (d * Math.sqrt(1 - d * d) + Math.asin(d)) / Math.PI;
}

/** Terrain-horizon sun visibility for a world direction toward the sun (any length; +Y up, +Z north). @param {readonly number[]} horizonSine @param {{x:number,y:number,z:number}} direction */
export function landscapeTerrainSunVisibility(horizonSine, direction) {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    requireCondition(length > 0, 'sun direction must be nonzero');
    const elevation = Math.asin(clamp(direction.y / length, -1, 1)), azimuth = Math.atan2(direction.z, direction.x);
    return landscapeSolarDiscVisibility(elevation, Math.asin(clamp(landscapeTerrainHorizonSine(horizonSine, azimuth), 0, 1)));
}

/**
 * Terrain sky occlusion relative to the unobstructed facet, blended to 1 by missing availability (mirror of landscapeTerrainFieldsSkyVisibility).
 * @param {number} skyView decoded facet sky-view factor @param {{x:number,y:number,z:number}} normal @param {number} [availability]
 */
export function landscapeTerrainSkyVisibility(skyView, normal, availability = 1) {
    const length = Math.hypot(normal.x, normal.y, normal.z);
    requireCondition(length > 0, 'normal must be nonzero');
    return 1 - availability + availability * clamp(skyView / Math.max(.5 + .5 * normal.y / length, 1e-3), 0, 1);
}

/**
 * Exact JavaScript mirror of landscapeTerrainFieldsAt in terrain_fields.glsl: from the finest active native slot containing the
 * position, walks resident ancestors; each contributes its arrival progress times (1 - coarser), where coarser rises from one to two
 * page sample spacings of footprint; stale 8 x 8 cells and inactive fields return availability 0 (analytic fallback).
 * @param {{slots:{bounds:{minX:number,maxX:number,minZ:number,maxZ:number},level:number,parent:number,fieldProgress:number,native:boolean,active:boolean}[],
 *   rootBounds:any,staleCells:readonly number[],active:boolean,samples:number,fetch:(slot:number,x:number,z:number,out:Float64Array)=>Float64Array}} source
 * @param {number} x @param {number} z @param {{dx?:number[],dy?:number[]}} [footprint]
 */
export function sampleLandscapeTerrainFieldSlots(source, x, z, { dx = [0, 0], dy = [0, 0] } = {}) {
    const units = new Float64Array(16), scratch = new Float64Array(16), contributions = [];
    let slot = -1, level = -1;
    source.slots.forEach((entry, index) => {
        const b = entry.bounds;
        if (entry.active && entry.native && entry.level > level && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) { slot = index; level = entry.level; }
    });
    let remaining = 1;
    if (source.active && slot >= 0 && !landscapeTerrainFieldStaleAt(source.staleCells, source.rootBounds, x, z)) {
        for (let depth = 0; depth < source.slots.length && slot >= 0; depth++) {
            const entry = source.slots[slot], b = entry.bounds, parent = entry.parent;
            const spacing = Math.max((b.maxX - b.minX), (b.maxZ - b.minZ)) / (source.samples - 1);
            const extent = Math.max(Math.abs(dx[0]) + Math.abs(dy[0]), Math.abs(dx[1]) + Math.abs(dy[1])) / spacing;
            const coarser = parent === slot ? 0 : smoothstep(LANDSCAPE_TERRAIN_FIELDS_FILTER.coarserStartCells, LANDSCAPE_TERRAIN_FIELDS_FILTER.coarserEndCells, extent);
            const weight = entry.fieldProgress * (1 - coarser);
            if (weight > 0) {
                source.fetch(slot, x, z, scratch);
                for (let i = 0; i < 16; i++) units[i] += scratch[i] * weight * remaining;
                contributions.push({ slot, level: entry.level, weight: weight * remaining });
            }
            remaining *= 1 - weight;
            if (remaining <= 0 || parent === slot) break;
            slot = parent;
        }
    }
    const availability = 1 - remaining;
    if (availability > 0) for (let i = 0; i < 16; i++) units[i] /= availability;
    return { availability, units, contributions, fields: availability > 0 ? decodeLandscapeTerrainFields(units) : null };
}

function smoothstep(edge0, edge1, value) { const t = clamp((value - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }
