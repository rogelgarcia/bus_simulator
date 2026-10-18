// Fetches, verifies and generates ecosystem tiles off the render thread (AI 599 D3): published tiles, runtime cells, inspection traces and the determinism hash.
// @ts-check
// A LandscapeWorkerPool worker: the initialize message carries the loaded landscape, the validated sidecar with its tile indexes and the planning
// features (LandscapeEcosystemWorkerSources); every later message is one job answered by its id, with the tile arrays transferred. Cancellation is
// the pool's: an obsolete running job terminates the worker, so no job keeps state the next worker could not rebuild from the context.
import { ECOSYSTEM_RECORD, ecosystemCellOf, encodeEcosystemTile } from '../../../../app/landscape/ecosystem/EcosystemTiles.js';
import { ecosystemSiteCell, ecosystemSiteOf } from '../../../../app/landscape/ecosystem/EcosystemLattice.js';
import { traceEcosystemSite } from '../../../../app/landscape/ecosystem/EcosystemGeneration.js';
import { loadLandscapeEcosystemTile } from '../../../../app/landscape/ecosystem/EcosystemSidecarPayload.js';
import { createEcosystemWorkerSources } from './LandscapeEcosystemWorkerSources.js';

let sources = null;

const transferable = tile => ({ message: { records: tile.records, ids: tile.ids, count: tile.count }, transfer: [tile.records.buffer, tile.ids.buffer] });
const generationOf = data => ({ overrides: data.overrides ?? null, densityScale: data.densityScale ?? 1, key: data.key ?? 'none|1' });

async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function handle(data) {
    if (data.type === 'tile') {
        const tile = await loadLandscapeEcosystemTile(data.tile, { indexUrl: data.indexUrl });
        return transferable(tile);
    }
    if (data.type === 'generate') {
        const started = performance.now(), result = await sources.cell(data.layerId, data.cellX, data.cellZ, generationOf(data)), tile = result.tile;
        // the cached result keeps its arrays; a copy leaves so the transfer never empties the memo
        const reply = transferable({ records: tile.records.slice(0, tile.count * ECOSYSTEM_RECORD.floats), ids: tile.ids.slice(0, tile.count * ECOSYSTEM_RECORD.idInts), count: tile.count });
        reply.message.statistics = result.statistics; reply.message.generateMs = performance.now() - started;
        return reply;
    }
    if (data.type === 'hash') {
        const result = await sources.cell(data.layerId, data.cellX, data.cellZ, generationOf(data)), encoded = encodeEcosystemTile(result.tile);
        return { message: { hash: await sha256Hex(encoded), count: result.tile.count, byteLength: encoded.byteLength, generation: sources.recipe.layers[data.layerId].generation } };
    }
    if (data.type === 'trace') {
        const layer = sources.recipe.layers[data.layerId];
        if (!layer) throw new Error(`[LandscapeEcosystem] the recipe has no layer ${data.layerId}`);
        const explicit = Number.isInteger(data.siteX) && Number.isInteger(data.siteZ), child = Number.isInteger(data.child) ? data.child : ECOSYSTEM_RECORD.childNone;
        if (layer.rules.parent && !explicit) throw new Error(`[LandscapeEcosystem] tracing the child layer ${layer.id} needs a picked instance (its parent site and child index)`);
        const site = explicit ? { siteX: data.siteX, siteZ: data.siteZ } : ecosystemSiteOf(layer, data.x, data.z);
        const cell = child === ECOSYSTEM_RECORD.childNone ? ecosystemSiteCell(layer, site.siteX, site.siteZ) : ecosystemCellOf(layer.cell.meters, data.x, data.z);
        const generation = generationOf(data), { layerFeatures, sources: cellSources, overrides } = await sources.references(data.layerId, cell.cellX, cell.cellZ, generation), parent = layer.rules.parent?.layer ?? null;
        const trace = traceEcosystemSite({ recipe: sources.recipe, layer, siteX: site.siteX, siteZ: site.siteZ, child, sampler: cellSources.sampler, viewCorridor: cellSources.viewCorridor, overrides, densityScale: generation.densityScale,
            competitors: layerFeatures, parents: parent ? layerFeatures(parent) : null });
        return { message: { layerId: data.layerId, requested: { x: data.x, z: data.z }, site: { siteX: site.siteX, siteZ: site.siteZ, child }, cell, trace } };
    }
    throw new Error(`[LandscapeEcosystem] unknown ecosystem worker job ${String(data.type)}`);
}

self.onmessage = async ({ data }) => {
    if (data.type === 'initialize') { sources = createEcosystemWorkerSources(data); return; }
    const { id } = data;
    try {
        if (!sources) throw new Error('[LandscapeEcosystem] the ecosystem worker has no landscape context');
        const result = await handle(data);
        self.postMessage({ id, ...result.message }, result.transfer ?? []);
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
