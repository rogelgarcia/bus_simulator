// Defines the additive landscape-ecosystem v1 sidecar contract: constants, layout, strict validation with terrain binding, tile indexes, content keys and staleness.
// @ts-check
// Design: the sidecar embeds the validated recipe and overrides it was generated from, binds the exact terrain like the fields and geology sidecars
// (revision, manifest hash and every native chunk's channel hashes) and lists one content-addressed tile index per offline layer, each tile a
// content-addressed payload of ecosystem-instance-v1 records. A tile's content key hashes exactly what can change its bytes: the algorithm, the
// recipe identity, the cell, the density scale, the natives inside its dependency reach, the field and geology revisions and the override entries
// touching the cell, so a native edit marks stale exactly the tiles that could have read it (reusing the fields' 8 x 8 stale-cell semantics).
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl, requireSha256 } from '../internal/LandscapeValidation.js';
import { validateLandscapeManifest } from '../LandscapeManifest.js';
import { landscapeTerrainFieldsStaleness } from '../LandscapeTerrainFields.js';
import { ECOSYSTEM_ALGORITHM } from './EcosystemRules.js';
import { canonicalEcosystemJson, ecosystemLayerPriorityOrder, ecosystemRecipeIdentity, validateEcosystemRecipe } from './EcosystemRecipe.js';
import { ecosystemOverridesIdentity, ecosystemOverridesIntersecting, validateEcosystemOverrides } from './EcosystemOverrides.js';
import { ECOSYSTEM_RECORD, ECOSYSTEM_TILE_BYTES_PER_INSTANCE, ecosystemCellBounds, ecosystemTileId, parseEcosystemInstanceId } from './EcosystemTiles.js';
import { ecosystemGrownBounds } from './EcosystemLattice.js';
import { ecosystemNativeChunkIds } from './EcosystemCellSources.js';
import { ecosystemLayerDependencyMeters } from './EcosystemGeneration.js';

export const LANDSCAPE_ECOSYSTEM_FORMAT = 'landscape-ecosystem';
export const LANDSCAPE_ECOSYSTEM_TILES_FORMAT = 'landscape-ecosystem-tiles';
export const LANDSCAPE_ECOSYSTEM_SCHEMA_VERSION = 1;
export const LANDSCAPE_ECOSYSTEM_DIRECTORY = 'ecosystem';
export const LANDSCAPE_ECOSYSTEM_LIMIT = 1024 * 1024;
export const LANDSCAPE_ECOSYSTEM_TILES_LIMIT = 1024 * 1024;
export const LANDSCAPE_ECOSYSTEM_TILE_LIMIT = 8 * 1024 * 1024;
export const LANDSCAPE_ECOSYSTEM_REVISION = /^ecosystem-[a-f0-9]{24}$/;
const BOUNDS_FIELDS = ['minX', 'maxX', 'minZ', 'maxZ'], GRID_FIELDS = ['columns', 'rows', 'spacingX', 'spacingZ', 'chunkIntervals', 'maxLevel'];
const KEYS = Object.freeze({
    sidecar: 'densityScale,dependencies,format,landscapeId,layers,overrides,provenance,recipe,revision,schemaVersion,statistics,terrain',
    terrain: 'bounds,chunks,grid,manifestSha256,revision,seaLevel', chunk: 'height,id,landCover',
    dependencies: 'fieldsRevision,geologyRevision,overridesIdentity,planningSha256s,recipeIdentity',
    layer: 'assetSet,bounds,cell,generation,id,instanceCount,priority,tiles', tiles: 'byteLength,count,sha256,url',
    provenance: 'algorithm,derivedFrom,measured,recipeSha256,rights',
    index: 'format,layer,schemaVersion,tiles', tile: 'bounds,cellX,cellZ,contentKey,count,id,payload', payload: 'byteLength,sha256,url'
});

/** Identifies a structurally valid sidecar that was generated for another landscape, spatial frame or sea level. */
export class LandscapeEcosystemBindingError extends Error {
    constructor(message) { super(`[Landscape] ${message}`); this.name = 'LandscapeEcosystemBindingError'; }
}

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields (expected ${keys})`);
}
const requireBoundsShape = (bounds, label) => {
    requireKeys(bounds, 'maxX,maxZ,minX,minZ', label);
    for (const key of BOUNDS_FIELDS) requireFinite(bounds[key], `${label}.${key}`);
    requireCondition(bounds.maxX >= bounds.minX && bounds.maxZ >= bounds.minZ, `${label} must be ordered`);
};

/** The files of a published sidecar relative to `<landscape>/ecosystem/`; every url is relative to the file that lists it (the cache convention), so an index under `layers/` names its payloads as `tiles/<sha256>.bin`. */
export function landscapeEcosystemLayout() {
    return Object.freeze({ directory: LANDSCAPE_ECOSYSTEM_DIRECTORY, manifest: 'manifest.json', snapshot: 'manifest.<sha256>.json', layerIndex: 'layers/<layerId>.<sha256>.json', tile: 'layers/tiles/<sha256>.bin', payloadUrl: 'tiles/<sha256>.bin (relative to the index)',
        record: ECOSYSTEM_RECORD.id, bytesPerInstance: ECOSYSTEM_TILE_BYTES_PER_INSTANCE, limits: Object.freeze({ manifest: LANDSCAPE_ECOSYSTEM_LIMIT, index: LANDSCAPE_ECOSYSTEM_TILES_LIMIT, tile: LANDSCAPE_ECOSYSTEM_TILE_LIMIT }), staleGrid: 8 });
}

async function sha256Text(text) {
    requireCondition(!!globalThis.crypto?.subtle, 'Ecosystem identity requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** Native chunks a tile depends on: those intersecting its cell grown by the layer's dependency reach, as `[id, heightHash, landCoverHash]` in row-major order. @param {any} terrain binding @param {any} recipe @param {any} layer @param {number} cellX @param {number} cellZ */
export function ecosystemTileNatives(terrain, recipe, layer, cellX, cellZ) {
    const byId = new Map(terrain.chunks.map(entry => [entry.id, entry])), window = ecosystemGrownBounds(ecosystemCellBounds(layer.cell.meters, cellX, cellZ), ecosystemLayerDependencyMeters(recipe, layer));
    return ecosystemNativeChunkIds(terrain, window).map(id => { const entry = byId.get(id); requireCondition(!!entry, `ecosystem terrain binding lacks native chunk ${id}`); return [id, entry.height, entry.landCover]; });
}

/**
 * Canonical JSON of everything a tile's bytes depend on (§7): algorithm, recipe identity, layer, cell, density scale, natives within the dependency
 * reach, the field and geology revisions and the override entries touching the cell (regions, masks, pins and the removed ids of its sites).
 * @param {{recipe:any,overrides:any,densityScale:number,terrain:any,dependencies:{recipeIdentity:string,fieldsRevision:string|null,geologyRevision:string|null}}} sidecar @param {string} layerId @param {number} cellX @param {number} cellZ
 */
export function ecosystemTileContentInput(sidecar, layerId, cellX, cellZ) {
    const layer = sidecar.recipe.layers[layerId];
    requireCondition(!!layer, `ecosystem recipe has no layer ${layerId}`);
    const bounds = ecosystemCellBounds(layer.cell.meters, cellX, cellZ), overrideRegions = [];
    if (sidecar.overrides) {
        overrideRegions.push(...ecosystemOverridesIntersecting(sidecar.overrides, layerId, bounds));
        for (const id of sidecar.overrides.instances.removed) {
            const parsed = parseEcosystemInstanceId(id);
            if (parsed.layerId === layerId && Math.floor(parsed.siteX / layer.cell.sitesPerAxis) === cellX && Math.floor(parsed.siteZ / layer.cell.sitesPerAxis) === cellZ) overrideRegions.push(id);
        }
        overrideRegions.sort();
    }
    return canonicalEcosystemJson({ algorithm: ECOSYSTEM_ALGORITHM, recipeIdentity: sidecar.dependencies.recipeIdentity, layer: layerId, cellX, cellZ, densityScale: sidecar.densityScale,
        natives: ecosystemTileNatives(sidecar.terrain, sidecar.recipe, layer, cellX, cellZ), fieldsRevision: sidecar.dependencies.fieldsRevision, geologyRevision: sidecar.dependencies.geologyRevision, overrideRegions });
}

/** SHA-256 of the content input. @returns {Promise<string>} */
export function ecosystemTileContentKey(sidecar, layerId, cellX, cellZ) { return sha256Text(ecosystemTileContentInput(sidecar, layerId, cellX, cellZ)); }

/** `ecosystem-<24 hex>` of a candidate's pretty-printed JSON with a null revision (the bytes the publication writes). @param {any} value */
export async function landscapeEcosystemRevision(value) { return `ecosystem-${(await sha256Text(JSON.stringify({ ...value, revision: null }, null, 2) + '\n')).slice(0, 24)}`; }

function validateTerrain(terrain) {
    requireKeys(terrain, KEYS.terrain, 'ecosystem terrain binding');
    requireId(terrain.revision, 'ecosystem terrain.revision'); requireSha256(terrain.manifestSha256, 'ecosystem terrain.manifestSha256'); requireFinite(terrain.seaLevel, 'ecosystem seaLevel');
    requireBoundsShape(terrain.bounds, 'ecosystem bounds');
    requireCondition(terrain.bounds.maxX > terrain.bounds.minX && terrain.bounds.maxZ > terrain.bounds.minZ, 'ecosystem bounds must have positive area');
    requireKeys(terrain.grid, GRID_FIELDS.slice().sort().join(','), 'ecosystem grid');
    requireInteger(terrain.grid.maxLevel, 0, 12, 'ecosystem grid.maxLevel'); requireInteger(terrain.grid.chunkIntervals, 1, 4096, 'ecosystem grid.chunkIntervals');
    const dimension = terrain.grid.chunkIntervals * 2 ** terrain.grid.maxLevel + 1;
    requireCondition(terrain.grid.columns === dimension && terrain.grid.rows === dimension, 'ecosystem grid must match its dyadic chunk hierarchy');
    for (const key of ['spacingX', 'spacingZ']) { requireFinite(terrain.grid[key], `ecosystem grid.${key}`); requireCondition(terrain.grid[key] > 0, 'ecosystem grid spacing must be positive'); }
    const count = 4 ** terrain.grid.maxLevel, ids = new Set();
    requireCondition(Array.isArray(terrain.chunks) && terrain.chunks.length === count, `ecosystem must bind all ${count} native chunks`);
    for (const entry of terrain.chunks) {
        requireKeys(entry, KEYS.chunk, 'ecosystem native chunk');
        requireCondition(/^l\d+\/c\d+\/r\d+$/.test(entry.id) && entry.id.startsWith(`l${terrain.grid.maxLevel}/`) && !ids.has(entry.id), `ecosystem native chunk ${entry.id} is invalid or repeated`);
        ids.add(entry.id); requireSha256(entry.height, `${entry.id}.height`); requireSha256(entry.landCover, `${entry.id}.landCover`);
    }
}

function validateLayers(layers, recipe) {
    const order = ecosystemLayerPriorityOrder(recipe);
    requireCondition(Array.isArray(layers) && layers.length === order.length && layers.every((entry, i) => entry?.id === order[i]), 'ecosystem layers must list every recipe layer in descending priority');
    return layers.map(entry => {
        requireKeys(entry, KEYS.layer, `ecosystem layer ${entry.id}`);
        const layer = recipe.layers[entry.id];
        requireCondition(entry.generation === layer.generation && entry.assetSet === layer.assetSet && entry.priority === layer.rules.competition.priority, `ecosystem layer ${entry.id} disagrees with the recipe`);
        requireKeys(entry.cell, 'meters,sitesPerAxis', `ecosystem layer ${entry.id}.cell`);
        requireCondition(entry.cell.meters === layer.cell.meters && entry.cell.sitesPerAxis === layer.cell.sitesPerAxis, `ecosystem layer ${entry.id}.cell disagrees with the recipe`);
        requireInteger(entry.instanceCount, 0, Number.MAX_SAFE_INTEGER, `ecosystem layer ${entry.id}.instanceCount`);
        if (entry.bounds !== null) requireBoundsShape(entry.bounds, `ecosystem layer ${entry.id}.bounds`);
        if (entry.tiles === null) { requireCondition(entry.instanceCount === 0 && entry.bounds === null, `ecosystem layer ${entry.id} without tiles must be empty`); return entry; }
        requireCondition(layer.generation === 'offline', `runtime layer ${entry.id} cannot publish tiles`);
        requireKeys(entry.tiles, KEYS.tiles, `ecosystem layer ${entry.id}.tiles`);
        requireRelativeUrl(entry.tiles.url, `ecosystem layer ${entry.id}.tiles.url`); requireSha256(entry.tiles.sha256, `ecosystem layer ${entry.id}.tiles.sha256`);
        requireCondition(entry.tiles.url === `layers/${entry.id}.${entry.tiles.sha256}.json`, `ecosystem layer ${entry.id}.tiles.url must be its content-addressed index`);
        requireInteger(entry.tiles.byteLength, 2, LANDSCAPE_ECOSYSTEM_TILES_LIMIT, `ecosystem layer ${entry.id}.tiles.byteLength`); requireInteger(entry.tiles.count, 0, 2 ** 31, `ecosystem layer ${entry.id}.tiles.count`);
        requireCondition((entry.tiles.count === 0) === (entry.instanceCount === 0) && (entry.instanceCount === 0) === (entry.bounds === null), `ecosystem layer ${entry.id} tile count, instance count and bounds disagree`);
        return entry;
    });
}

function validateDependencies(dependencies) {
    requireKeys(dependencies, KEYS.dependencies, 'ecosystem dependencies');
    requireCondition(/^ecosystem-recipe-[a-f0-9]{24}$/.test(dependencies.recipeIdentity), 'ecosystem dependencies.recipeIdentity must be ecosystem-recipe-<24 hex>');
    requireCondition(dependencies.overridesIdentity === null || /^ecosystem-overrides-[a-f0-9]{24}$/.test(dependencies.overridesIdentity), 'ecosystem dependencies.overridesIdentity must be null or ecosystem-overrides-<24 hex>');
    requireCondition(dependencies.fieldsRevision === null || /^terrain-fields-[a-f0-9]{24}$/.test(dependencies.fieldsRevision), 'ecosystem dependencies.fieldsRevision must be null or a terrain-fields revision');
    requireCondition(dependencies.geologyRevision === null || /^geology-[a-f0-9]{24}$/.test(dependencies.geologyRevision), 'ecosystem dependencies.geologyRevision must be null or a geology revision');
    requireCondition(Array.isArray(dependencies.planningSha256s) && dependencies.planningSha256s.length <= 64, 'ecosystem dependencies.planningSha256s must be a bounded array');
    dependencies.planningSha256s.forEach((value, i) => { requireSha256(value, `ecosystem dependencies.planningSha256s[${i}]`); requireCondition(i === 0 || value > dependencies.planningSha256s[i - 1], 'ecosystem dependencies.planningSha256s must be sorted and distinct'); });
}

function validateProvenance(provenance) {
    requireKeys(provenance, KEYS.provenance, 'ecosystem provenance');
    requireCondition(provenance.algorithm === ECOSYSTEM_ALGORITHM && provenance.measured === false, 'ecosystem provenance must declare the v1 derived (unmeasured) algorithm');
    requireSha256(provenance.recipeSha256, 'ecosystem recipeSha256');
    requireCondition(typeof provenance.rights === 'string' && provenance.rights.length > 0 && typeof provenance.derivedFrom === 'string' && provenance.derivedFrom.length > 0, 'ecosystem provenance requires rights and derivation');
}

/**
 * Strictly validates a sidecar manifest (key-order independent; unknown fields rejected; the embedded recipe and overrides must be their validated
 * forms and match the dependency identities). With a landscape, another landscape id, spatial frame or sea level throws
 * LandscapeEcosystemBindingError; a different terrain revision is not an error (see staleness).
 * @param {any} input @param {any} [landscapeInput] @returns {Promise<any>} frozen clone
 */
export async function validateLandscapeEcosystem(input, landscapeInput) {
    const value = clonePlainData(input, 'ecosystem');
    requireKeys(value, KEYS.sidecar, 'ecosystem');
    requireCondition(value.format === LANDSCAPE_ECOSYSTEM_FORMAT && value.schemaVersion === LANDSCAPE_ECOSYSTEM_SCHEMA_VERSION, 'unsupported ecosystem schema');
    requireId(value.landscapeId, 'ecosystem landscapeId'); requireId(value.revision, 'ecosystem revision');
    requireCondition(LANDSCAPE_ECOSYSTEM_REVISION.test(value.revision), 'ecosystem revision must be content derived (ecosystem-<24 hex>)');
    const recipe = validateEcosystemRecipe(value.recipe);
    requireCondition(canonicalEcosystemJson(recipe) === canonicalEcosystemJson(value.recipe), 'ecosystem recipe must be stored in its validated form');
    const overrides = value.overrides === null ? null : validateEcosystemOverrides(value.overrides, recipe);
    requireCondition(overrides === null || canonicalEcosystemJson(overrides) === canonicalEcosystemJson(value.overrides), 'ecosystem overrides must be stored in their validated form');
    requireFinite(value.densityScale, 'ecosystem densityScale'); requireCondition(value.densityScale >= 0 && value.densityScale <= 16, 'ecosystem densityScale must be in 0..16');
    validateTerrain(value.terrain);
    validateDependencies(value.dependencies);
    requireCondition(value.dependencies.recipeIdentity === await ecosystemRecipeIdentity(recipe), 'ecosystem dependencies.recipeIdentity does not identify the embedded recipe');
    requireCondition(value.dependencies.overridesIdentity === (overrides === null ? null : await ecosystemOverridesIdentity(overrides)), 'ecosystem dependencies.overridesIdentity does not identify the embedded overrides');
    validateLayers(value.layers, recipe);
    requireCondition(!!value.statistics && typeof value.statistics === 'object' && !Array.isArray(value.statistics), 'ecosystem statistics must be an object');
    for (const [key, entry] of Object.entries(value.statistics)) requireCondition(!!entry && typeof entry === 'object' && !Array.isArray(entry), `ecosystem statistics.${key} must be an object`);
    validateProvenance(value.provenance);
    if (landscapeInput !== undefined) {
        const landscape = validateLandscapeManifest(landscapeInput);
        if (value.landscapeId !== landscape.id) throw new LandscapeEcosystemBindingError(`ecosystem belongs to landscape ${value.landscapeId}, not ${landscape.id}`);
        if (!BOUNDS_FIELDS.every(key => value.terrain.bounds[key] === landscape.bounds[key]) || !GRID_FIELDS.every(key => value.terrain.grid[key] === landscape.grid[key])) throw new LandscapeEcosystemBindingError('ecosystem spatial frame does not match the landscape');
        if (value.terrain.seaLevel !== landscape.coordinates.seaLevel) throw new LandscapeEcosystemBindingError('ecosystem was generated for a different sea level');
    }
    return freezeData(value);
}

/**
 * Strictly validates one layer's tile index. With the sidecar (and the layer entry it belongs to) the cells, bounds, counts and content keys are
 * checked against the recipe and the terrain binding.
 * @param {any} input @param {{sidecar?:any,layerId?:string}} [context] @returns {Promise<any>} frozen clone
 */
export async function validateLandscapeEcosystemTiles(input, { sidecar = null, layerId = null } = {}) {
    const value = clonePlainData(input, 'ecosystem tiles');
    requireKeys(value, KEYS.index, 'ecosystem tiles');
    requireCondition(value.format === LANDSCAPE_ECOSYSTEM_TILES_FORMAT && value.schemaVersion === LANDSCAPE_ECOSYSTEM_SCHEMA_VERSION, 'unsupported ecosystem tiles schema');
    requireId(value.layer, 'ecosystem tiles layer');
    requireCondition(layerId === null || value.layer === layerId, `ecosystem tiles belong to layer ${value.layer}, not ${layerId}`);
    const layer = sidecar ? sidecar.recipe.layers[value.layer] : null, entry = sidecar ? sidecar.layers.find(item => item.id === value.layer) : null;
    requireCondition(!sidecar || (!!layer && !!entry), `ecosystem sidecar has no layer ${value.layer}`);
    requireCondition(Array.isArray(value.tiles) && value.tiles.length <= 2 ** 20, 'ecosystem tiles must be a bounded array');
    requireCondition(!entry || entry.tiles === null || entry.tiles.count === value.tiles.length, 'ecosystem tile index count disagrees with the sidecar');
    const ids = new Set();
    let instances = 0;
    for (const tile of value.tiles) {
        requireKeys(tile, KEYS.tile, 'ecosystem tile');
        requireInteger(tile.cellX, -(2 ** 24), 2 ** 24, 'ecosystem tile cellX'); requireInteger(tile.cellZ, -(2 ** 24), 2 ** 24, 'ecosystem tile cellZ');
        requireCondition(tile.id === ecosystemTileId(value.layer, tile.cellX, tile.cellZ) && !ids.has(tile.id), `ecosystem tile ${tile.id} has an inconsistent or repeated identity`);
        ids.add(tile.id);
        requireBoundsShape(tile.bounds, `${tile.id}.bounds`);
        requireInteger(tile.count, 1, ECOSYSTEM_RECORD.maxInstances, `${tile.id}.count`); instances += tile.count;
        requireSha256(tile.contentKey, `${tile.id}.contentKey`);
        requireKeys(tile.payload, KEYS.payload, `${tile.id}.payload`);
        requireRelativeUrl(tile.payload.url, `${tile.id}.payload.url`); requireSha256(tile.payload.sha256, `${tile.id}.payload.sha256`);
        requireCondition(tile.payload.url === `tiles/${tile.payload.sha256}.bin`, `${tile.id}.payload.url must be its content-addressed payload`);
        requireCondition(tile.payload.byteLength === tile.count * ECOSYSTEM_TILE_BYTES_PER_INSTANCE && tile.payload.byteLength <= LANDSCAPE_ECOSYSTEM_TILE_LIMIT, `${tile.id}.payload.byteLength must be ${ECOSYSTEM_TILE_BYTES_PER_INSTANCE} bytes per instance within the tile limit`);
        if (layer) {
            const bounds = ecosystemCellBounds(layer.cell.meters, tile.cellX, tile.cellZ);
            requireCondition(BOUNDS_FIELDS.every(key => tile.bounds[key] === bounds[key]), `${tile.id}.bounds must be its cell bounds`);
            requireCondition(tile.contentKey === await ecosystemTileContentKey(sidecar, value.layer, tile.cellX, tile.cellZ), `${tile.id} contentKey does not match its natives, recipe and overrides`);
        }
    }
    requireCondition(!entry || entry.tiles === null || entry.instanceCount === instances, 'ecosystem tile index instance total disagrees with the sidecar');
    return freezeData(value);
}

/**
 * Compares the bound native channel identities with a (possibly edited) landscape: stale chunks and the fields' 8 x 8 stale-cell bits.
 * @param {any} sidecar validated @param {any} landscape validated landscape manifest
 */
export function landscapeEcosystemStaleness(sidecar, landscape) {
    const { bound, terrainRevision, currentRevision, staleChunks, staleCells } = landscapeTerrainFieldsStaleness({ terrain: sidecar.terrain, pages: [] }, landscape);
    return Object.freeze({ bound, terrainRevision, currentRevision, staleChunks, staleCells });
}

/**
 * Whether a tile must not be loaded: a native chunk inside its dependency reach changed since the bake.
 * @param {any} sidecar validated @param {any} landscape validated landscape manifest @param {string} layerId @param {{cellX:number,cellZ:number}} tile @param {ReturnType<typeof landscapeEcosystemStaleness>} [staleness]
 */
export function ecosystemTileStale(sidecar, landscape, layerId, tile, staleness = landscapeEcosystemStaleness(sidecar, landscape)) {
    if (staleness.staleChunks.length === 0) return false;
    const stale = new Set(staleness.staleChunks), layer = sidecar.recipe.layers[layerId];
    requireCondition(!!layer, `ecosystem recipe has no layer ${layerId}`);
    return ecosystemTileNatives(sidecar.terrain, sidecar.recipe, layer, tile.cellX, tile.cellZ).some(([id]) => stale.has(id));
}
