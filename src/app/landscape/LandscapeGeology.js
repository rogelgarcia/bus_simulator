// Defines the additive landscape-geology v1 contract: channel and category catalogs, encoding, strict sidecar validation, staleness and exact sampling.
// @ts-check
// Geology channels are the terrain synthesis engine's L0 layers published beside one exact terrain revision (derived, never measured):
// two RGBA8 field layers (bedrock offset, regolith, deposit thickness, wear, deposition, flow, wave exposure, face mask) on the
// mask-aligned page grid with the two-sample halo, decoded after linear filtering exactly as chunks/landscape/geology.glsl does, and one
// uint8 page per chunk holding four categorical labels (deposit type, lithology, drainage, coastal zone) without halo that is only ever
// read at the nearest aligned sample. The sidecar binds the terrain revision and native chunk hashes like the terrain fields and reuses
// their staleness semantics unchanged; its content keys also carry the synthesis recipe identity, because the same terrain under another
// recipe yields other channels. The codec is the terrain-field UNORM8 codec, so one decode serves both sidecars.
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { decodeLandscapeTerrainField, encodeLandscapeTerrainField, landscapeTerrainFieldNativeIds, landscapeTerrainFieldsStaleness } from './LandscapeTerrainFields.js';

export const LANDSCAPE_GEOLOGY_FORMAT = 'landscape-geology';
export const LANDSCAPE_GEOLOGY_ALGORITHM = 'landscape-geology-v1';
export const LANDSCAPE_GEOLOGY_LIMIT = 256 * 1024;
export const LANDSCAPE_GEOLOGY_PAGE_LIMIT = 2 * 1024 * 1024;
export const LANDSCAPE_GEOLOGY_LAYOUT = Object.freeze({ layers: 2, halo: 2, encoding: 'rgba8', filter: 'linear', rowOrder: 'north-first' });
export const LANDSCAPE_GEOLOGY_CATEGORICAL_LAYOUT = Object.freeze({ encoding: 'uint8', halo: 0, rowOrder: 'north-first' });

const channel = (name, layer, component, scale, unit) => Object.freeze({ name, layer, component, curve: 'linear', scale, unit });
/** Field channels in page order (layer k, component): every curve is linear, decoded value = byte / 255 * scale. */
export const LANDSCAPE_GEOLOGY_CHANNELS = Object.freeze([
    channel('bedrockOffset', 0, 'r', 32, 'meters of regolith and deposit above the bedrock surface (height - bedrock), saturating at the scale'),
    channel('regolith', 0, 'g', 8, 'meters of weathered in-place mantle'),
    channel('depositThickness', 0, 'b', 30, 'meters of the dominant loose deposit'),
    channel('wear', 0, 'a', 1, 'normalized cumulative fluvial and hydraulic erosion depth'),
    channel('deposition', 1, 'r', 1, 'normalized cumulative sediment deposition'),
    channel('flow', 1, 'g', 1, 'normalized log specific catchment area of the final surface (terrain-fields convention)'),
    channel('waveExposure', 1, 'b', 1, 'exposure of the shore to the open-sea fetch, carried inland over the surf and swash'),
    channel('faceMask', 1, 'a', 1, 'share of the slope beyond what the heightfield represents faithfully (where L3 rock faces belong)')
]);

const category = (name, layer, labels, description) => Object.freeze({ name, layer, labels: labels === null ? null : Object.freeze([...labels]), maximum: labels === null ? 255 : labels.length - 1, description });
/** Categorical labels in page order (layer k of the uint8 page): enum tables, or an open index range for the lithology. */
export const LANDSCAPE_GEOLOGY_CATEGORIES = Object.freeze([
    category('depositType', 0, ['none', 'talus', 'colluvium', 'alluvium', 'beach-sand', 'dune-sand', 'reef-rock'], 'dominant loose deposit at the surface'),
    category('lithology', 1, null, 'index of the stratum the bedrock surface lies in (0 unstratified)'),
    category('drainage', 2, ['hillslope', 'rill', 'gully', 'channel', 'flat-pond', 'sea'], 'drainage class from the contributing area, flats and the sea'),
    category('coastalZone', 3, ['inland', 'offshore', 'reef', 'bar', 'surf', 'swash', 'berm', 'backshore', 'foredune', 'platform', 'bluff-toe', 'bluff-face', 'bluff-crown'], 'coastal zone class')
]);
/** Engine layers the sidecar publishes (the preparation input), in channel-then-category order. */
export const LANDSCAPE_GEOLOGY_LAYERS = Object.freeze(['bedrock', 'regolith', 'depositType', 'depositThickness', 'lithology', 'wear', 'deposition', 'flow', 'drainage', 'faceMask', 'coastalZone', 'waveExposure']);

const BOUNDS_FIELDS = ['minX', 'maxX', 'minZ', 'maxZ'];
const GRID_FIELDS = ['columns', 'rows', 'spacingX', 'spacingZ', 'chunkIntervals', 'maxLevel'];
const RECIPE_IDENTITY = /^synthesis-[a-f0-9]{24}$/;
const REVISION = /^geology-[a-f0-9]{24}$/;
const KEYS = Object.freeze({
    sidecar: 'categories,channels,format,landscapeId,layout,pages,provenance,revision,schemaVersion,statistics,terrain',
    terrain: 'bounds,chunks,grid,manifestSha256,revision,seaLevel,sourceSha256',
    chunk: 'height,id,landCover',
    layout: 'categorical,encoding,filter,halo,height,layerBytes,layers,pageBytes,rowOrder,samples,width',
    categorical: 'byteLength,encoding,halo,layerBytes,layers,rowOrder,samples',
    channel: 'component,curve,layer,name,scale,unit',
    category: 'description,labels,layer,maximum,name',
    page: 'categorical,column,contentKey,fields,id,level,row',
    payload: 'byteLength,sha256,url',
    provenance: 'algorithm,derivedFrom,measured,recipeIdentity,recipeSha256,rights',
    statistics: 'categories,channels,invariant,land'
});

/** Identifies a structurally valid sidecar that was prepared for another landscape, spatial frame or sea level. */
export class LandscapeGeologyBindingError extends Error {
    constructor(message) { super(`[Landscape] ${message}`); this.name = 'LandscapeGeologyBindingError'; }
}

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields`);
}

const clamp = (value, low, high) => value < low ? low : value > high ? high : value;

/** Encodes one decoded channel value into its UNORM8 byte (the terrain-field codec). @param {{curve:string,scale:number}} definition @param {number} value */
export function encodeLandscapeGeologyChannel(definition, value) { return encodeLandscapeTerrainField(definition, value); }

/** Decodes a (possibly linearly filtered) unit value v = byte / 255 exactly as the GLSL chunk does. @param {{curve:string,scale:number}} definition @param {number} unit */
export function decodeLandscapeGeologyChannel(definition, unit) { return decodeLandscapeTerrainField(definition, unit); }

/** Label of a nearest-filtered UNORM8 categorical texel (mirror of landscapeGeologyCategory in geology.glsl). @param {number} unit */
export function decodeLandscapeGeologyCategory(unit) { return Math.round(unit * 255); }

/** @param {number} samples page samples per axis (chunkIntervals + 1) */
export function landscapeGeologyLayout(samples) {
    requireInteger(samples, 2, 4097, 'geology samples');
    const { layers, halo, encoding, filter, rowOrder } = LANDSCAPE_GEOLOGY_LAYOUT, width = samples + halo * 2, layerBytes = width * width * 4, labelBytes = samples * samples;
    return Object.freeze({ samples, halo, width, height: width, layers, encoding, filter, rowOrder, layerBytes, pageBytes: layerBytes * layers,
        categorical: Object.freeze({ ...LANDSCAPE_GEOLOGY_CATEGORICAL_LAYOUT, samples, layers: LANDSCAPE_GEOLOGY_CATEGORIES.length, layerBytes: labelBytes, byteLength: labelBytes * LANDSCAPE_GEOLOGY_CATEGORIES.length }) });
}

/** Canonical JSON of the identities a page was computed from: algorithm, recipe identity and the native channels inside the page. @param {any} terrain @param {any} chunk @param {string} recipeIdentity */
export function landscapeGeologyContentInput(terrain, chunk, recipeIdentity) {
    requireCondition(typeof recipeIdentity === 'string' && RECIPE_IDENTITY.test(recipeIdentity), 'geology content keys require the synthesis recipe identity');
    const byId = new Map(terrain.chunks.map(entry => [entry.id, entry]));
    return JSON.stringify({ algorithm: LANDSCAPE_GEOLOGY_ALGORITHM, recipe: recipeIdentity, page: chunk.id, natives: landscapeTerrainFieldNativeIds(terrain.grid, chunk).map(id => {
        const entry = byId.get(id);
        requireCondition(!!entry, `geology lacks native chunk ${id}`);
        return [id, entry.height, entry.landCover];
    }) });
}

async function sha256Text(text) {
    requireCondition(!!globalThis.crypto?.subtle, 'Geology identity requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** @param {any} terrain @param {any} chunk @param {string} recipeIdentity @returns {Promise<string>} */
export function landscapeGeologyContentKey(terrain, chunk, recipeIdentity) { return sha256Text(landscapeGeologyContentInput(terrain, chunk, recipeIdentity)); }

function validatePayload(value, label, byteLength) {
    requireKeys(value, KEYS.payload, label);
    requireRelativeUrl(value.url, `${label}.url`); requireSha256(value.sha256, `${label}.sha256`);
    requireCondition(value.byteLength === byteLength && value.byteLength <= LANDSCAPE_GEOLOGY_PAGE_LIMIT, `${label} must be exactly ${byteLength} bytes`);
}

function validateTerrain(terrain) {
    requireKeys(terrain, KEYS.terrain, 'geology terrain binding');
    requireId(terrain.revision, 'geology terrain.revision'); requireSha256(terrain.manifestSha256, 'geology terrain.manifestSha256');
    requireSha256(terrain.sourceSha256, 'geology terrain.sourceSha256'); requireFinite(terrain.seaLevel, 'geology seaLevel');
    requireKeys(terrain.bounds, BOUNDS_FIELDS.slice().sort().join(','), 'geology bounds');
    for (const key of BOUNDS_FIELDS) requireFinite(terrain.bounds[key], `geology bounds.${key}`);
    requireCondition(terrain.bounds.maxX > terrain.bounds.minX && terrain.bounds.maxZ > terrain.bounds.minZ, 'geology bounds must have positive area');
    requireKeys(terrain.grid, GRID_FIELDS.slice().sort().join(','), 'geology grid');
    requireInteger(terrain.grid.maxLevel, 0, 12, 'geology grid.maxLevel'); requireInteger(terrain.grid.chunkIntervals, 1, 4096, 'geology grid.chunkIntervals');
    const dimension = terrain.grid.chunkIntervals * 2 ** terrain.grid.maxLevel + 1;
    requireCondition(terrain.grid.columns === dimension && terrain.grid.rows === dimension, 'geology grid must match its dyadic chunk hierarchy');
    for (const key of ['spacingX', 'spacingZ']) { requireFinite(terrain.grid[key], `geology grid.${key}`); requireCondition(terrain.grid[key] > 0, 'geology grid spacing must be positive'); }
    const count = 4 ** terrain.grid.maxLevel;
    requireCondition(Array.isArray(terrain.chunks) && terrain.chunks.length === count, `geology must bind all ${count} native chunks`);
    const ids = new Set();
    terrain.chunks.forEach(entry => {
        requireKeys(entry, KEYS.chunk, 'geology native chunk');
        requireCondition(/^l\d+\/c\d+\/r\d+$/.test(entry.id) && entry.id.startsWith(`l${terrain.grid.maxLevel}/`) && !ids.has(entry.id), `geology native chunk ${entry.id} is invalid or repeated`);
        ids.add(entry.id); requireSha256(entry.height, `${entry.id}.height`); requireSha256(entry.landCover, `${entry.id}.landCover`);
    });
}

function validateChannels(channels) {
    requireCondition(Array.isArray(channels) && channels.length === LANDSCAPE_GEOLOGY_CHANNELS.length, `geology must declare the ${LANDSCAPE_GEOLOGY_CHANNELS.length} v1 channels`);
    channels.forEach((entry, i) => {
        requireKeys(entry, KEYS.channel, `geology channel ${i}`);
        const expected = LANDSCAPE_GEOLOGY_CHANNELS[i];
        requireCondition(Object.keys(expected).every(key => entry[key] === expected[key]), `geology channel ${i} must be ${expected.name} (${expected.curve} ${expected.scale}, layer ${expected.layer}${expected.component})`);
    });
}

function validateCategories(categories) {
    requireCondition(Array.isArray(categories) && categories.length === LANDSCAPE_GEOLOGY_CATEGORIES.length, `geology must declare the ${LANDSCAPE_GEOLOGY_CATEGORIES.length} v1 categories`);
    categories.forEach((entry, i) => {
        requireKeys(entry, KEYS.category, `geology category ${i}`);
        const expected = LANDSCAPE_GEOLOGY_CATEGORIES[i];
        const labels = expected.labels === null ? entry.labels === null : Array.isArray(entry.labels) && entry.labels.length === expected.labels.length && expected.labels.every((label, k) => entry.labels[k] === label);
        requireCondition(labels && ['name', 'layer', 'maximum', 'description'].every(key => entry[key] === expected[key]), `geology category ${i} must be ${expected.name} (layer ${expected.layer}, maximum ${expected.maximum}) with the v1 labels`);
    });
}

function validateStatistics(statistics) {
    requireKeys(statistics, KEYS.statistics, 'geology statistics');
    for (const [key, value] of Object.entries(statistics)) requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `geology statistics.${key} must be an object`);
}

function validateProvenance(provenance) {
    requireKeys(provenance, KEYS.provenance, 'geology provenance');
    requireCondition(provenance.algorithm === LANDSCAPE_GEOLOGY_ALGORITHM && provenance.measured === false, 'geology provenance must declare the v1 derived (unmeasured) algorithm');
    requireCondition(typeof provenance.recipeIdentity === 'string' && RECIPE_IDENTITY.test(provenance.recipeIdentity), 'geology provenance requires the synthesis recipe identity (synthesis-<24 hex>)');
    requireSha256(provenance.recipeSha256, 'geology recipeSha256');
    requireCondition(typeof provenance.rights === 'string' && provenance.rights.length > 0 && typeof provenance.derivedFrom === 'string' && provenance.derivedFrom.length > 0, 'geology provenance requires rights and derivation');
}

/**
 * Strictly validates a sidecar (key-order independent; unknown fields rejected). With a landscape, a different landscape ID, spatial
 * frame or sea level throws LandscapeGeologyBindingError; a different terrain revision is not an error (see staleness).
 * @param {any} input @param {any} [landscapeInput] @returns {Promise<any>} Frozen clone.
 */
export async function validateLandscapeGeology(input, landscapeInput) {
    const value = clonePlainData(input, 'geology');
    requireKeys(value, KEYS.sidecar, 'geology');
    requireCondition(value.format === LANDSCAPE_GEOLOGY_FORMAT && value.schemaVersion === 1, 'unsupported geology schema');
    requireId(value.landscapeId, 'geology landscapeId'); requireId(value.revision, 'geology revision');
    requireCondition(REVISION.test(value.revision), 'geology revision must be content derived (geology-<24 hex>)');
    validateTerrain(value.terrain);
    const layout = landscapeGeologyLayout(value.terrain.grid.chunkIntervals + 1);
    requireKeys(value.layout, KEYS.layout, 'geology layout'); requireKeys(value.layout.categorical, KEYS.categorical, 'geology categorical layout');
    requireCondition(Object.entries(layout).every(([key, expected]) => key === 'categorical' ? Object.entries(expected).every(([inner, v]) => value.layout.categorical[inner] === v) : value.layout[key] === expected),
        'geology layout must match the v1 page layout for this grid');
    validateChannels(value.channels);
    validateCategories(value.categories);
    validateStatistics(value.statistics);
    validateProvenance(value.provenance);
    const grid = value.terrain.grid, expectedPages = Array.from({ length: grid.maxLevel + 1 }, (_, level) => 4 ** level).reduce((sum, count) => sum + count, 0);
    requireCondition(Array.isArray(value.pages) && value.pages.length <= expectedPages && value.pages.length > 0, `geology requires 1..${expectedPages} pages`);
    const ids = new Set();
    for (const page of value.pages) {
        requireKeys(page, KEYS.page, 'geology page');
        requireInteger(page.level, 0, grid.maxLevel, 'geology page level');
        requireInteger(page.column, 0, 2 ** page.level - 1, 'geology page column'); requireInteger(page.row, 0, 2 ** page.level - 1, 'geology page row');
        requireCondition(page.id === `l${page.level}/c${page.column}/r${page.row}` && !ids.has(page.id), `geology page ${page.id} has an inconsistent or repeated identity`);
        ids.add(page.id);
        requireSha256(page.contentKey, `${page.id}.contentKey`);
        requireCondition(page.contentKey === await landscapeGeologyContentKey(value.terrain, page, value.provenance.recipeIdentity), `${page.id} contentKey does not match its native channel identities and recipe`);
        validatePayload(page.fields, `${page.id}.fields`, layout.pageBytes);
        validatePayload(page.categorical, `${page.id}.categorical`, layout.categorical.byteLength);
    }
    if (landscapeInput !== undefined) {
        const landscape = validateLandscapeManifest(landscapeInput);
        if (value.landscapeId !== landscape.id) throw new LandscapeGeologyBindingError(`geology belongs to landscape ${value.landscapeId}, not ${landscape.id}`);
        if (!BOUNDS_FIELDS.every(key => value.terrain.bounds[key] === landscape.bounds[key]) || !GRID_FIELDS.every(key => value.terrain.grid[key] === landscape.grid[key])) {
            throw new LandscapeGeologyBindingError('geology spatial frame does not match the landscape');
        }
        if (value.terrain.seaLevel !== landscape.coordinates.seaLevel) throw new LandscapeGeologyBindingError('geology was prepared for a different sea level');
        for (const page of value.pages) requireCondition(landscape.chunks.some(chunk => chunk.id === page.id), `geology page ${page.id} has no landscape chunk`);
    }
    return freezeData(value);
}

/**
 * Terrain-field staleness applied to the geology binding (same terrain.chunks, pages and 8 x 8 cell semantics): a native chunk whose
 * height or land-cover hash changed is stale, a page is stale when all its natives are and partial when some are.
 * @param {any} geology validated sidecar @param {any} landscape validated landscape manifest
 */
export function landscapeGeologyStaleness(geology, landscape) { return landscapeTerrainFieldsStaleness(geology, landscape); }

/**
 * Bilinear (GPU linear filtering at texel centers) unit values of the eight field channels of one page at a world position.
 * @param {Uint8Array} pixels page bytes (two layers) or a texture array @param {number} offset byte offset of layer 0
 * @param {{width:number,halo:number,layerBytes:number,samples:number,layers:number}} layout @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 * @param {number} x @param {number} z @param {Float64Array} [out]
 */
export function sampleLandscapeGeologyPageUnits(pixels, offset, layout, bounds, x, z, out = new Float64Array(LANDSCAPE_GEOLOGY_CHANNELS.length)) {
    const intervals = layout.samples - 1;
    const gx = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * intervals, 0, intervals), gz = clamp((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * intervals, 0, intervals);
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, width = layout.width;
    const base = (iz + layout.halo) * width + ix + layout.halo;
    for (let layer = 0; layer < layout.layers; layer++) {
        const at = offset + layer * layout.layerBytes + base * 4, below = at + width * 4;
        for (let component = 0; component < 4; component++) {
            const a = pixels[at + component], b = pixels[at + 4 + component], c = pixels[below + component], d = pixels[below + 4 + component];
            out[layer * 4 + component] = ((a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz) / 255;
        }
    }
    return out;
}

/** Decodes the eight (filtered) unit values in channel order, exactly as landscapeGeologyDecode in geology.glsl. @param {ArrayLike<number>} units */
export function decodeLandscapeGeology(units) {
    return Object.fromEntries(LANDSCAPE_GEOLOGY_CHANNELS.map((definition, i) => [definition.name, decodeLandscapeGeologyChannel(definition, units[i])]));
}

/**
 * Decoded field channels of one page at a world position: bilinear on the encoded bytes, then decode (the GPU path).
 * @param {Uint8Array} pixels page bytes @param {ReturnType<typeof landscapeGeologyLayout>} layout @param {{id:string,bounds:{minX:number,maxX:number,minZ:number,maxZ:number}}} chunk
 * @param {number} x @param {number} z
 */
export function sampleLandscapeGeologyPage(pixels, layout, chunk, x, z) {
    requireCondition(pixels instanceof Uint8Array && pixels.length === layout.pageBytes, `geology page ${chunk?.id} does not match its layout`);
    return decodeLandscapeGeology(sampleLandscapeGeologyPageUnits(pixels, 0, layout, chunk.bounds, x, z));
}

/**
 * The four categorical labels of the aligned sample nearest to a world position in one categorical page (a chunk of any level holds the
 * native labels at its aligned samples, so every level reads identical labels at shared positions). Never interpolated.
 * @param {Uint8Array} labels categorical page (four layers of samples x samples, row 0 north) @param {{id:string,bounds:{minX:number,maxX:number,minZ:number,maxZ:number},columns:number,rows:number}} chunk
 * @param {number} x @param {number} z
 */
export function sampleLandscapeGeologyCategory(labels, chunk, x, z) {
    const count = chunk.columns * chunk.rows;
    requireCondition(labels instanceof Uint8Array && labels.length === count * LANDSCAPE_GEOLOGY_CATEGORIES.length, `geology categorical page ${chunk?.id} does not match its chunk`);
    const b = chunk.bounds, column = clamp(Math.round((x - b.minX) / (b.maxX - b.minX) * (chunk.columns - 1)), 0, chunk.columns - 1);
    const row = clamp(Math.round((b.maxZ - z) / (b.maxZ - b.minZ) * (chunk.rows - 1)), 0, chunk.rows - 1), at = row * chunk.columns + column;
    return Object.fromEntries(LANDSCAPE_GEOLOGY_CATEGORIES.map((definition, k) => [definition.name, labels[k * count + at]]));
}
