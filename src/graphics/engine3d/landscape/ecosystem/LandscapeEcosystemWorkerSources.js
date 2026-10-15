// Opens the loaded landscape inside the ecosystem worker (AI 599 D3): native chunks, field, natural-soil and geology pages and published tiles behind bounded caches, reproducing the bake's per-cell generation byte for byte.
// @ts-check
// Design: the mirror of tools/bake_landscape/ecosystem/EcosystemFileSources.mjs over the HTTP loaders. The same decoded bytes reach
// createEcosystemCellSources (a position belongs to the native chunk and page the acquisition API assigns), generateEcosystemLayerCells memoizes the
// referenced cells of higher-priority layers through one cell cache per (overrides, density scale), and a referenced offline cell is seeded from its
// published tile (identical to its regeneration by the bake's determinism gate; a stale or unpublished cell generates like a runtime one). The field
// and geology sidecars must be bound and fresh, as the bake requires; an absent sidecar leaves its inputs neutral. Caches are small LRUs whose sizes
// the streamer reserves in the ecosystem share.
import { loadLandscapeChunk } from '../../../../app/landscape/LandscapePayload.js';
import { validateLandscapeManifest } from '../../../../app/landscape/LandscapeManifest.js';
import { landscapeTerrainFieldsLayout, landscapeTerrainFieldsStaleness } from '../../../../app/landscape/LandscapeTerrainFields.js';
import { loadLandscapeTerrainFieldPage, loadLandscapeTerrainFields } from '../../../../app/landscape/LandscapeTerrainFieldsPayload.js';
import { landscapeGeologyLayout, landscapeGeologyStaleness } from '../../../../app/landscape/LandscapeGeology.js';
import { loadLandscapeGeology, loadLandscapeGeologyPage } from '../../../../app/landscape/LandscapeGeologyPayload.js';
import { validateEcosystemRecipe } from '../../../../app/landscape/ecosystem/EcosystemRecipe.js';
import { validateEcosystemOverrides } from '../../../../app/landscape/ecosystem/EcosystemOverrides.js';
import { createEcosystemCellSources, ecosystemCellRequirements } from '../../../../app/landscape/ecosystem/EcosystemCellSources.js';
import { createEcosystemInputSampler } from '../../../../app/landscape/ecosystem/EcosystemInputs.js';
import { ECOSYSTEM_RECORD, createEcosystemTileData, ecosystemCellBounds, ecosystemTileId } from '../../../../app/landscape/ecosystem/EcosystemTiles.js';
import { ecosystemCellsIntersecting, ecosystemGrownBounds } from '../../../../app/landscape/ecosystem/EcosystemLattice.js';
import { createEcosystemCellCache, ecosystemLayerGenerationHalo, ecosystemLayerReferences, generateEcosystemLayerCells } from '../../../../app/landscape/ecosystem/EcosystemGeneration.js';
import { ecosystemTileStale, landscapeEcosystemStaleness } from '../../../../app/landscape/ecosystem/EcosystemSidecar.js';
import { loadLandscapeEcosystemTile } from '../../../../app/landscape/ecosystem/EcosystemSidecarPayload.js';

const F = ECOSYSTEM_RECORD.floats, I = ECOSYSTEM_RECORD.idInts;
const EMPTY = Object.freeze({ records: new Float32Array(0), ids: new Int32Array(0), count: 0 });
const intersects = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

function createLru(limit, load) {
    const entries = new Map();
    return {
        async get(key) {
            if (entries.has(key)) { const value = entries.get(key); entries.delete(key); entries.set(key, value); return value; }
            const value = await load(key);
            entries.set(key, value);
            while (entries.size > limit) entries.delete(entries.keys().next().value);
            return value;
        },
        get size() { return entries.size; }
    };
}

// the features of several tiles inside closed bounds as one tile (generateEcosystemLayerCells' merge, for the trace's references)
function mergeFeatures(tiles, bounds) {
    const merged = createEcosystemTileData(tiles.reduce((sum, tile) => sum + tile.count, 0));
    for (const tile of tiles) for (let i = 0; i < tile.count; i++) {
        const o = i * F, x = tile.records[o], z = tile.records[o + 2];
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
        merged.records.set(tile.records.subarray(o, o + F), merged.count * F); merged.ids.set(tile.ids.subarray(i * I, i * I + I), merged.count * I); merged.count++;
    }
    return merged;
}

/**
 * @param {{manifest:any,manifestUrl:string,ecosystemUrl:string,sidecar:any,indexes:Record<string,any>,planning:{features:readonly any[]}|null,cache:{chunks:number,pages:number,cells:number}}} context the streamer's
 *   initialize message: the validated landscape manifest, the sidecar (validated form) with the validated tile index of every offline layer, the planning features
 */
export function createEcosystemWorkerSources({ manifest: manifestInput, manifestUrl, ecosystemUrl, sidecar, indexes, planning, cache }) {
    const manifest = validateLandscapeManifest(manifestInput), recipe = validateEcosystemRecipe(sidecar.recipe), layerIds = Object.keys(recipe.layers), bounds = manifest.bounds;
    const staleness = landscapeEcosystemStaleness(sidecar, manifest), reads = { chunks: 0, fieldPages: 0, naturalSoilPages: 0, geologyPages: 0, tiles: 0 };
    const indexByLayer = new Map(Object.entries(indexes).map(([layerId, index]) => [layerId, { url: new URL(sidecar.layers.find(entry => entry.id === layerId).tiles.url, ecosystemUrl).href, tiles: new Map(index.tiles.map(tile => [tile.id, tile])) }]));
    const chunks = createLru(cache.chunks, async id => { reads.chunks++; return loadLandscapeChunk(manifest, id, { manifestUrl }); });
    let fields = null, geology = null, fieldPages = null, naturalSoilPages = null, geologyPages = null, fieldsLayout = null, geologyLayout = null;
    const requireFresh = (label, sidecarState, freshness) => {
        if (!freshness.bound || freshness.staleChunks.length > 0) throw new Error(`[LandscapeEcosystem] the ${label} sidecar is bound to ${freshness.terrainRevision} while the terrain is ${freshness.currentRevision} (${freshness.staleChunks.length} stale natives); runtime generation would not reproduce the bake`);
        return sidecarState;
    };
    // the field and geology sidecars beside the landscape manifest, as the bake reads them (absent: neutral inputs; stale: refused like the bake)
    const ready = (async () => {
        const fieldsUrl = new URL('fields/manifest.json', manifestUrl).href, geologyUrl = new URL('geology/manifest.json', manifestUrl).href;
        fields = await loadLandscapeTerrainFields(fieldsUrl, { landscape: manifest });
        if (fields) requireFresh('terrain-fields', fields, landscapeTerrainFieldsStaleness(fields, manifest));
        geology = await loadLandscapeGeology(geologyUrl, { landscape: manifest });
        if (geology) requireFresh('geology', geology, landscapeGeologyStaleness(geology, manifest));
        fieldsLayout = fields ? landscapeTerrainFieldsLayout(manifest.grid.chunkIntervals + 1) : null; geologyLayout = geology ? landscapeGeologyLayout(manifest.grid.chunkIntervals + 1) : null;
        const fieldPagesById = fields ? new Map(fields.pages.map(page => [page.id, page])) : null, geologyPagesById = geology ? new Map(geology.pages.map(page => [page.id, page])) : null;
        const pageOf = (pages, id, label) => { const page = pages.get(id); if (!page) throw new Error(`[LandscapeEcosystem] the ${label} sidecar has no page ${id}`); return page; };
        fieldPages = fields ? createLru(cache.pages, async id => { reads.fieldPages++; return loadLandscapeTerrainFieldPage(pageOf(fieldPagesById, id, 'terrain-fields').fields, { manifestUrl: fieldsUrl }); }) : null;
        naturalSoilPages = fields ? createLru(cache.pages, async id => { const page = fieldPagesById.get(id); if (!page?.naturalSoil) return null; reads.naturalSoilPages++; return loadLandscapeTerrainFieldPage(page.naturalSoil, { manifestUrl: fieldsUrl }); }) : null;
        geologyPages = geology ? createLru(cache.pages, async id => {
            const page = pageOf(geologyPagesById, id, 'geology'); reads.geologyPages++;
            return { fields: await loadLandscapeGeologyPage(page.fields, { manifestUrl: geologyUrl }), categorical: await loadLandscapeGeologyPage(page.categorical, { manifestUrl: geologyUrl }) };
        }) : null;
        return { fields: fields?.revision ?? null, geology: geology?.revision ?? null, bound: { fields: !fields || fields.revision === sidecar.dependencies.fieldsRevision, geology: !geology || geology.revision === sidecar.dependencies.geologyRevision } };
    })();
    ready.catch(() => {});
    const publishedTiles = createLru(cache.cells, async key => {
        const [layerId, tileId] = key.split('|'), index = indexByLayer.get(layerId), entry = index.tiles.get(tileId);
        reads.tiles++;
        return loadLandscapeEcosystemTile(entry, { indexUrl: index.url });
    });
    // the generation caches: one per (overrides, density scale) key, only the current one kept
    let cacheKey = null, cellCache = createEcosystemCellCache(cache.cells);
    const cacheFor = key => { if (key !== cacheKey) { cacheKey = key; cellCache = createEcosystemCellCache(cache.cells); } return cellCache; };
    const cellSources = async ({ layer, cellX, cellZ, haloMeters, layerFeatures }) => {
        await ready;
        const requirements = ecosystemCellRequirements(manifest, layer, cellX, cellZ, haloMeters), loaded = new Map(), fieldMap = fieldPages ? new Map() : null, soilMap = naturalSoilPages ? new Map() : null, geologyMap = geologyPages ? new Map() : null;
        for (const id of requirements.chunkIds) {
            loaded.set(id, await chunks.get(id));
            if (fieldMap) fieldMap.set(id, await fieldPages.get(id));
            if (soilMap) { const page = await naturalSoilPages.get(id); if (page) soilMap.set(id, page); }
            if (geologyMap) geologyMap.set(id, await geologyPages.get(id));
        }
        const sources = createEcosystemCellSources({ manifest, chunks: loaded, fieldPages: fieldMap, fieldsLayout, naturalSoilPages: soilMap, geologyPages: geologyMap, geologyLayout, planning, bounds: ecosystemCellBounds(layer.cell.meters, cellX, cellZ), layerDistanceMeters: haloMeters, layerFeatures });
        return { sampler: createEcosystemInputSampler({ layerIds, sources }), viewCorridor: sources.viewCorridor };
    };
    /** The published tile of an offline cell: decoded when fresh, empty when the index omits the cell, null when stale (it must generate). */
    const publishedTile = async (layerId, cellX, cellZ) => {
        const index = indexByLayer.get(layerId);
        if (!index) return null;
        const tileId = ecosystemTileId(layerId, cellX, cellZ), entry = index.tiles.get(tileId);
        if (!entry) return EMPTY;
        if (ecosystemTileStale(sidecar, manifest, layerId, entry, staleness)) return null;
        return publishedTiles.get(`${layerId}|${tileId}`);
    };
    const cellRecord = (layer, cellX, cellZ, tile) => ({ id: ecosystemTileId(layer.id, cellX, cellZ), layerId: layer.id, cellX, cellZ, bounds: ecosystemCellBounds(layer.cell.meters, cellX, cellZ), tile, statistics: null, trace: null });
    // the referenced cells of a target cell (competitors, parent, distance.layer targets), as generateEcosystemLayerCells visits them: published offline tiles enter the cache so they are never regenerated
    async function seedReferences(target, cellX, cellZ, cells) {
        const cellBounds = ecosystemCellBounds(target.cell.meters, cellX, cellZ);
        for (const entry of ecosystemLayerReferences(recipe, target)) {
            for (const cell of ecosystemCellsIntersecting(entry.layer, ecosystemGrownBounds(cellBounds, entry.reach))) {
                const id = ecosystemTileId(entry.layer.id, cell.cellX, cell.cellZ);
                if (cells.has(id) || !intersects(ecosystemCellBounds(entry.layer.cell.meters, cell.cellX, cell.cellZ), bounds)) continue;
                const published = entry.layer.generation === 'offline' ? await publishedTile(entry.layer.id, cell.cellX, cell.cellZ) : null;
                if (published) cells.set(id, cellRecord(entry.layer, cell.cellX, cell.cellZ, published));
                else await seedReferences(entry.layer, cell.cellX, cell.cellZ, cells);
            }
        }
    }
    const generation = { overrides: null, overridesKey: null };
    const overridesFor = (overrides, key) => {
        if (key !== generation.overridesKey) { generation.overrides = overrides === null ? null : validateEcosystemOverrides(overrides, recipe); generation.overridesKey = key; }
        return generation.overrides;
    };
    /** The final cell of a layer: its published tile when offline and fresh, otherwise generated with the memoized references. */
    async function cellResult(layer, cellX, cellZ, { overrides, densityScale, key }) {
        const cells = cacheFor(key), id = ecosystemTileId(layer.id, cellX, cellZ);
        if (cells.has(id)) return cells.get(id);
        if (!intersects(ecosystemCellBounds(layer.cell.meters, cellX, cellZ), bounds)) return cellRecord(layer, cellX, cellZ, EMPTY);
        const published = layer.generation === 'offline' ? await publishedTile(layer.id, cellX, cellZ) : null;
        if (published) { const record = cellRecord(layer, cellX, cellZ, published); cells.set(id, record); return record; }
        await seedReferences(layer, cellX, cellZ, cells);
        const [result] = await generateEcosystemLayerCells({ recipe, layer, cells: [{ cellX, cellZ }], cellSources, overrides: overridesFor(overrides, key), densityScale, cache: cells, bounds });
        return result;
    }
    return Object.freeze({
        ready, recipe, layerIds, manifest, reads,
        /** @param {string} layerId @param {number} cellX @param {number} cellZ @param {{overrides:any,densityScale:number,key:string}} generation */
        async cell(layerId, cellX, cellZ, generation) {
            const layer = recipe.layers[layerId];
            if (!layer) throw new Error(`[LandscapeEcosystem] the recipe has no layer ${layerId}`);
            return cellResult(layer, cellX, cellZ, generation);
        },
        /** The references of a cell merged within their reach (competitors, parent), for the inspection trace. */
        async references(layerId, cellX, cellZ, generation) {
            const layer = recipe.layers[layerId], cellBounds = ecosystemCellBounds(layer.cell.meters, cellX, cellZ), features = new Map();
            for (const entry of ecosystemLayerReferences(recipe, layer)) {
                const reach = ecosystemGrownBounds(cellBounds, entry.reach), tiles = [];
                for (const cell of ecosystemCellsIntersecting(entry.layer, reach)) {
                    if (!intersects(ecosystemCellBounds(entry.layer.cell.meters, cell.cellX, cell.cellZ), bounds)) continue;
                    tiles.push((await cellResult(entry.layer, cell.cellX, cell.cellZ, generation)).tile);
                }
                features.set(entry.layer.id, mergeFeatures(tiles, reach));
            }
            const layerFeatures = id => features.get(id) ?? null;
            return { layerFeatures, sources: await cellSources({ layer, cellX, cellZ, haloMeters: ecosystemLayerGenerationHalo(recipe, layer), layerFeatures }), overrides: overridesFor(generation.overrides, generation.key) };
        },
        snapshot() { return { reads: { ...reads }, caches: { chunks: chunks.size, publishedTiles: publishedTiles.size, cells: cellCache.size, key: cacheKey }, fields: fields?.revision ?? null, geology: geology?.revision ?? null }; }
    });
}
