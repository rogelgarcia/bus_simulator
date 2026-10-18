// Measures the ecosystem sidecar's invalidation on a saved landscape (AI 599 D6): which tiles an edit of one native chunk stales, and that reverting it restores every tile, without touching the cache.
// @ts-check
// Usage: node tools/landscape_review/ecosystem_invalidation.mjs --landscape assets/public/landscape/coastal-city-v3 [--chunk l4/c4/r9] [--output receipt.json]
// The edit is simulated on an in-memory copy of the terrain manifest (the native chunk's height hash changes, as the authoring store would publish);
// the published sidecar, its tile indexes and the landscape directory are never written.
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { validateLandscapeManifest, validateLandscapeEcosystem, validateLandscapeEcosystemTiles, landscapeEcosystemStaleness, ecosystemTileStale, ecosystemTileNatives } from '../../src/app/landscape/index.js';

const { values } = parseArgs({ options: { landscape: { type: 'string' }, chunk: { type: 'string', default: 'l4/c4/r9' }, output: { type: 'string' } } });
if (!values.landscape) { console.error('--landscape <saved landscape directory> is required'); process.exit(2); }
const directory = path.resolve(values.landscape), chunkId = /** @type {string} */ (values.chunk);
const manifest = validateLandscapeManifest(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')));
const sidecar = await validateLandscapeEcosystem(JSON.parse(await readFile(path.join(directory, 'ecosystem/manifest.json'), 'utf8')), manifest);
const indexes = new Map();
for (const layer of sidecar.layers) if (layer.tiles) indexes.set(layer.id, await validateLandscapeEcosystemTiles(JSON.parse(await readFile(path.join(directory, 'ecosystem', layer.tiles.url), 'utf8')), { sidecar, layerId: layer.id }));
const edited = JSON.parse(JSON.stringify(manifest));
const chunk = edited.chunks.find(entry => entry.id === chunkId);
if (!chunk) { console.error(`${chunkId} is not a chunk of ${manifest.id}`); process.exit(2); }
chunk.channels.height.sha256 = '0'.repeat(64);
chunk.revision = `${chunk.revision}-edited`;
edited.revision = `${manifest.revision}-edited`;
const measure = (label, landscape) => {
    const started = performance.now(), staleness = landscapeEcosystemStaleness(sidecar, landscape), layers = {};
    for (const [layerId, index] of indexes) {
        const stale = index.tiles.filter(tile => ecosystemTileStale(sidecar, landscape, layerId, tile, staleness));
        layers[layerId] = { tiles: index.tiles.length, stale: stale.length, staleIds: stale.map(tile => tile.id), staleInstances: stale.reduce((sum, tile) => sum + tile.count, 0) };
    }
    return { label, bound: staleness.bound, staleChunks: staleness.staleChunks, staleCells: staleness.staleCells, layers, milliseconds: performance.now() - started };
};
const before = measure('published', manifest), afterEdit = measure(`edit ${chunkId}`, validateLandscapeManifest(edited)), reverted = measure('revert', manifest);
const dependency = Object.fromEntries(sidecar.layers.filter(layer => layer.tiles).map(layer => [layer.id, ecosystemTileNatives(sidecar.terrain, sidecar.recipe, sidecar.recipe.layers[layer.id], 0, 0).length]));
const receipt = { format: 'landscape-ecosystem-invalidation', schemaVersion: 1, landscape: { id: manifest.id, revision: manifest.revision }, sidecar: sidecar.revision, editedChunk: chunkId, nativesPerCornerTile: dependency, runs: [before, afterEdit, reverted],
    passed: before.layers && Object.values(before.layers).every(layer => layer.stale === 0) && Object.values(afterEdit.layers).some(layer => layer.stale > 0) && Object.values(reverted.layers).every(layer => layer.stale === 0) };
for (const run of receipt.runs) console.log(`[EcosystemInvalidation] ${run.label}: bound ${run.bound}, stale chunks ${run.staleChunks.length}, ${Object.entries(run.layers).map(([id, layer]) => `${id} ${layer.stale}/${layer.tiles} tiles (${layer.staleInstances} instances)`).join(', ')}, ${run.milliseconds.toFixed(1)} ms`);
if (values.output) { await mkdir(path.dirname(path.resolve(values.output)), { recursive: true }); await writeFile(path.resolve(values.output), `${JSON.stringify(receipt, null, 2)}\n`); console.log(`[EcosystemInvalidation] ${receipt.passed ? 'PASS' : 'FAIL'} -> ${values.output}`); }
process.exit(receipt.passed ? 0 : 1);
