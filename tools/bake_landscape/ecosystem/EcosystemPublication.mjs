// Stages, validates and publishes the additive landscape-ecosystem sidecar: content-addressed tile payloads and layer indexes, the manifest and its immutable snapshot.
// @ts-check
// Staging writes every tile as layers/tiles/<sha256>.bin (an index lists it as tiles/<sha256>.bin relative to itself, the cache convention), each
// offline layer's index as layers/<layerId>.<sha256>.json and the manifest whose revision derives from its own bytes. Validation re-reads every
// byte: hashes, the strict schema and terrain binding, every index against the recipe and the
// recomputed content keys, every payload decoded, inside its cell and rank sorted. Publication installs the immutable files, keeps the previous
// current sidecar's snapshot, writes the new snapshot and switches ecosystem/manifest.json last, only while the terrain manifest is still the one the
// sidecar was bound to; the caller holds the landscape's authoring lock, and terrain, appearance, field and geology files are never written.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { atomicAuthoringWrite, authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from '../../landscape_authoring/AuthoringFiles.mjs';
import { ECOSYSTEM_ALGORITHM } from '../../../src/app/landscape/ecosystem/EcosystemRules.js';
import { ecosystemLayerPriorityOrder, ecosystemRecipeIdentity } from '../../../src/app/landscape/ecosystem/EcosystemRecipe.js';
import { ecosystemOverridesIdentity } from '../../../src/app/landscape/ecosystem/EcosystemOverrides.js';
import { ECOSYSTEM_RECORD, decodeEcosystemTile, encodeEcosystemTile } from '../../../src/app/landscape/ecosystem/EcosystemTiles.js';
import { LANDSCAPE_ECOSYSTEM_DIRECTORY, LANDSCAPE_ECOSYSTEM_FORMAT, LANDSCAPE_ECOSYSTEM_LIMIT, LANDSCAPE_ECOSYSTEM_SCHEMA_VERSION, LANDSCAPE_ECOSYSTEM_TILES_FORMAT, LANDSCAPE_ECOSYSTEM_TILES_LIMIT, LANDSCAPE_ECOSYSTEM_TILE_LIMIT,
    LandscapeEcosystemBindingError, ecosystemTileContentKey, landscapeEcosystemRevision, validateLandscapeEcosystem, validateLandscapeEcosystemTiles } from '../../../src/app/landscape/ecosystem/EcosystemSidecar.js';

export const ECOSYSTEM_RIGHTS = 'Derived from the landscape\'s own terrain, field, geology and planning data by this repository\'s deterministic ecosystem recipe; the source rights recorded in the landscape provenance apply. No new license is asserted.';
const bytesOf = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const F = ECOSYSTEM_RECORD.floats, INDEX_DIRECTORY = 'layers';
const resolvePayload = (indexUrl, payloadUrl) => path.posix.join(path.posix.dirname(indexUrl), payloadUrl);

/**
 * Writes the sidecar candidate into `outputDirectory` from the generated cells of each offline layer.
 * @param {{landscape:any,recipe:any,recipeSha256:string,overrides:any,densityScale:number,layers:Map<string,any[]>,statistics:any,outputDirectory:string,signal?:AbortSignal}} options
 *   landscape: an opened landscape (EcosystemFileSources); layers: layer id → generated cells (every offline layer selected for publication)
 */
export async function stageEcosystemSidecar({ landscape, recipe, recipeSha256, overrides, densityScale, layers, statistics, outputDirectory, signal }) {
    const { manifest } = landscape;
    const terrain = { revision: manifest.revision, manifestSha256: authoringHash(landscape.manifestBytes), seaLevel: manifest.coordinates.seaLevel, bounds: { ...manifest.bounds },
        grid: Object.fromEntries(['columns', 'rows', 'spacingX', 'spacingZ', 'chunkIntervals', 'maxLevel'].map(key => [key, manifest.grid[key]])),
        chunks: manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel).map(chunk => ({ id: chunk.id, height: chunk.channels.height.sha256, landCover: chunk.channels.landCover.sha256 })) };
    const dependencies = { recipeIdentity: await ecosystemRecipeIdentity(recipe), overridesIdentity: overrides ? await ecosystemOverridesIdentity(overrides) : null, fieldsRevision: landscape.fields?.revision ?? null, geologyRevision: landscape.geology?.revision ?? null,
        planningSha256s: [...new Set(landscape.planning.dependency.map(entry => entry.sha256))].sort() };
    const keyContext = { recipe, overrides, densityScale, terrain, dependencies }, files = new Map(), entries = [];
    await mkdir(path.join(outputDirectory, INDEX_DIRECTORY, 'tiles'), { recursive: true });
    const store = async (relative, data) => {
        if (!files.has(relative)) { await writeImmutableAuthoringFile(path.join(outputDirectory, relative), data, { signal }); files.set(relative, { byteLength: data.length, sha256: authoringHash(data) }); }
        return files.get(relative);
    };
    for (const layerId of ecosystemLayerPriorityOrder(recipe)) {
        const layer = recipe.layers[layerId], cells = layers.get(layerId) ?? null, base = { id: layerId, generation: layer.generation, cell: { ...layer.cell }, assetSet: layer.assetSet, priority: layer.rules.competition.priority };
        if (!cells) { entries.push({ ...base, tiles: null, instanceCount: 0, bounds: null }); continue; }
        const tiles = [], bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
        let instanceCount = 0;
        for (const cell of [...cells].sort((a, b) => a.cellZ - b.cellZ || a.cellX - b.cellX)) {
            if (cell.tile.count === 0) continue;
            signal?.throwIfAborted();
            const payload = encodeEcosystemTile(cell.tile), payloadUrl = `tiles/${authoringHash(payload)}.bin`, stored = await store(`${INDEX_DIRECTORY}/${payloadUrl}`, payload);
            for (let i = 0; i < cell.tile.count; i++) {
                const x = cell.tile.records[i * F], z = cell.tile.records[i * F + 2];
                bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x); bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
            }
            instanceCount += cell.tile.count;
            tiles.push({ id: cell.id, cellX: cell.cellX, cellZ: cell.cellZ, bounds: { ...cell.bounds }, count: cell.tile.count, contentKey: await ecosystemTileContentKey(keyContext, layerId, cell.cellX, cell.cellZ), payload: { url: payloadUrl, byteLength: stored.byteLength, sha256: stored.sha256 } });
        }
        const index = bytesOf({ format: LANDSCAPE_ECOSYSTEM_TILES_FORMAT, schemaVersion: LANDSCAPE_ECOSYSTEM_SCHEMA_VERSION, layer: layerId, tiles });
        if (index.length > LANDSCAPE_ECOSYSTEM_TILES_LIMIT) throw new Error(`[Ecosystem] the tile index of ${layerId} is ${index.length} bytes; the limit is ${LANDSCAPE_ECOSYSTEM_TILES_LIMIT}`);
        const indexUrl = `${INDEX_DIRECTORY}/${layerId}.${authoringHash(index)}.json`, stored = await store(indexUrl, index);
        entries.push({ ...base, tiles: { url: indexUrl, byteLength: stored.byteLength, sha256: stored.sha256, count: tiles.length }, instanceCount, bounds: instanceCount ? bounds : null });
    }
    const candidate = { format: LANDSCAPE_ECOSYSTEM_FORMAT, schemaVersion: LANDSCAPE_ECOSYSTEM_SCHEMA_VERSION, landscapeId: manifest.id, revision: 'pending', recipe: JSON.parse(JSON.stringify(recipe)), overrides: overrides ? JSON.parse(JSON.stringify(overrides)) : null,
        densityScale, terrain, dependencies, layers: entries, statistics,
        provenance: { algorithm: ECOSYSTEM_ALGORITHM, recipeSha256, measured: false, rights: ECOSYSTEM_RIGHTS, derivedFrom: 'deterministic per-cell generation from the bound terrain revision, its field and geology sidecars and planning references under the embedded recipe and overrides' } };
    candidate.revision = await landscapeEcosystemRevision(candidate);
    const value = await validateLandscapeEcosystem(candidate, manifest), bytes = bytesOf(value);
    if (bytes.length > LANDSCAPE_ECOSYSTEM_LIMIT) throw new Error(`[Ecosystem] the sidecar is ${bytes.length} bytes; the limit is ${LANDSCAPE_ECOSYSTEM_LIMIT}`);
    const manifestFile = path.join(outputDirectory, 'manifest.json');
    await writeImmutableAuthoringFile(manifestFile, bytes, { signal });
    const isTile = relative => relative.startsWith(`${INDEX_DIRECTORY}/tiles/`), tileBytes = [...files].filter(([relative]) => isTile(relative)).reduce((sum, [, file]) => sum + file.byteLength, 0), indexBytes = [...files].filter(([relative]) => !isTile(relative)).reduce((sum, [, file]) => sum + file.byteLength, 0);
    return { directory: landscape.directory, outputDirectory, manifestFile, manifest, sourceBytes: landscape.manifestBytes, value, bytes, files,
        report: { revision: value.revision, sidecarSha256: authoringHash(bytes), sidecarBytes: bytes.length, tileFiles: [...files.keys()].filter(isTile).length, tileBytes, indexBytes, totalBytes: tileBytes + indexBytes + bytes.length,
            layers: Object.fromEntries(entries.map(entry => [entry.id, { tiles: entry.tiles?.count ?? 0, instances: entry.instanceCount, indexBytes: entry.tiles?.byteLength ?? 0 }])) } };
}

/** Re-reads every candidate byte: manifest hash, strict schema and binding, indexes, keys, and every payload decoded, inside its cell and rank sorted. @param {any} prepared */
export async function validateEcosystemCandidate(prepared) {
    const bytes = await readAuthoringFile(prepared.manifestFile, LANDSCAPE_ECOSYSTEM_LIMIT);
    if (authoringHash(bytes) !== prepared.report.sidecarSha256) throw new Error('[Ecosystem] sidecar receipt mismatch');
    const manifest = prepared.manifest, value = await validateLandscapeEcosystem(JSON.parse(bytes.toString('utf8')), manifest);
    if (value.terrain.revision !== manifest.revision || value.terrain.manifestSha256 !== authoringHash(prepared.sourceBytes)) throw new Error('[Ecosystem] candidate is not bound to its planned terrain');
    if (value.revision !== await landscapeEcosystemRevision(value)) throw new Error('[Ecosystem] sidecar revision does not derive from its content');
    const read = async (entry, limit, label) => {
        const data = await readAuthoringFile(authoringFile(prepared.outputDirectory, entry.url), Math.min(limit, entry.byteLength));
        if (data.length !== entry.byteLength || authoringHash(data) !== entry.sha256) throw new Error(`[Ecosystem] ${label} ${entry.url} integrity mismatch`);
        return data;
    };
    const entries = new Map(), checks = { indexes: 0, tiles: 0, instances: 0 };
    for (const entry of value.layers) {
        if (!entry.tiles) continue;
        const index = await validateLandscapeEcosystemTiles(JSON.parse((await read(entry.tiles, LANDSCAPE_ECOSYSTEM_TILES_LIMIT, 'tile index')).toString('utf8')), { sidecar: value, layerId: entry.id });
        entries.set(entry.tiles.url, { byteLength: entry.tiles.byteLength, sha256: entry.tiles.sha256 }); checks.indexes++;
        for (const tile of index.tiles) {
            const relative = resolvePayload(entry.tiles.url, tile.payload.url);
            if (entries.has(relative)) { checks.tiles++; checks.instances += tile.count; continue; }
            const payload = await read({ ...tile.payload, url: relative }, LANDSCAPE_ECOSYSTEM_TILE_LIMIT, `tile ${tile.id}`), decoded = decodeEcosystemTile(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
            if (decoded.count !== tile.count) throw new Error(`[Ecosystem] tile ${tile.id} holds ${decoded.count} instances, not ${tile.count}`);
            for (let i = 0; i < decoded.count; i++) {
                const x = decoded.records[i * F], z = decoded.records[i * F + 2];
                if (x < tile.bounds.minX || x >= tile.bounds.maxX || z < tile.bounds.minZ || z >= tile.bounds.maxZ) throw new Error(`[Ecosystem] tile ${tile.id} instance ${i} lies outside its cell`);
                if (i > 0 && decoded.records[i * F + ECOSYSTEM_RECORD.rank] < decoded.records[(i - 1) * F + ECOSYSTEM_RECORD.rank]) throw new Error(`[Ecosystem] tile ${tile.id} is not rank sorted at ${i}`);
            }
            entries.set(relative, { byteLength: tile.payload.byteLength, sha256: tile.payload.sha256 }); checks.tiles++; checks.instances += decoded.count;
        }
    }
    return { value, bytes, entries, files: [...entries.keys()], checks };
}

/** @param {string} destination ecosystem directory @returns {Promise<{bytes:Buffer,value:any}|null>} */
export async function readCurrentEcosystem(destination) {
    try {
        const bytes = await readAuthoringFile(path.join(destination, 'manifest.json'), LANDSCAPE_ECOSYSTEM_LIMIT);
        return { bytes, value: await validateLandscapeEcosystem(JSON.parse(bytes.toString('utf8'))) };
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/**
 * Installs tiles, indexes, the immutable snapshot and finally the current sidecar into <directory>/ecosystem. The caller holds the landscape's
 * authoring lock. Refuses a terrain that changed since planning and a current sidecar of another landscape; the previous current sidecar keeps
 * its immutable snapshot. @param {any} prepared @returns {Promise<string[]>} installed files, the current sidecar last
 */
export async function publishEcosystemSidecar(prepared) {
    const { value, bytes, entries } = await validateEcosystemCandidate(prepared), destination = path.join(prepared.directory, LANDSCAPE_ECOSYSTEM_DIRECTORY), installed = [];
    const current = async () => (await readAuthoringFile(path.join(prepared.directory, 'manifest.json'), 1024 * 1024)).equals(Buffer.from(prepared.sourceBytes.buffer, prepared.sourceBytes.byteOffset, prepared.sourceBytes.byteLength));
    if (!(await current())) throw new Error('[Ecosystem] the terrain changed after planning; publishing would bind the ecosystem to a revision that is no longer current');
    const previous = await readCurrentEcosystem(destination);
    if (previous && previous.value.landscapeId !== value.landscapeId) throw new LandscapeEcosystemBindingError(`current ecosystem belongs to landscape ${previous.value.landscapeId}`);
    for (const [relative, entry] of entries) {
        const data = await readAuthoringFile(authoringFile(prepared.outputDirectory, relative), entry.byteLength);
        if (authoringHash(data) !== entry.sha256) throw new Error(`[Ecosystem] ${relative} changed during publication`);
        const file = authoringFile(destination, relative); await writeImmutableAuthoringFile(file, data); installed.push(file);
    }
    if (previous) { const file = path.join(destination, `manifest.${authoringHash(previous.bytes)}.json`); await writeImmutableAuthoringFile(file, previous.bytes); installed.push(file); }
    const snapshot = path.join(destination, `manifest.${authoringHash(bytes)}.json`);
    await writeImmutableAuthoringFile(snapshot, bytes); installed.push(snapshot);
    if (!(await current())) throw new Error('[Ecosystem] the terrain changed during installation; the current sidecar was not switched');
    await atomicAuthoringWrite(path.join(destination, 'manifest.json'), bytes); installed.push(path.join(destination, 'manifest.json'));
    return [...new Set(installed)];
}
