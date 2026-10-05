// Prepares, validates and publishes the additive landscape-terrain-fields sidecar and its content-addressed pages.
// @ts-check
// Preparation reads the planned terrain snapshot, assembles the native grid, runs the global analyses (twice when determinism is
// verified, comparing every channel hash), slices mask-aligned pages, and writes an immutable candidate: pages/<sha256>.rgba8 and
// pages/<sha256>.u8 plus terrain-fields.json whose revision is derived from its content. Validation re-reads every byte. Publication
// installs pages, then the immutable manifest.<sha256>.json snapshot, and switches fields/manifest.json last, only while the current
// terrain manifest is still the exact one the fields were bound to; terrain and appearance files are never written.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { atomicAuthoringWrite, authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from '../../landscape_authoring/AuthoringFiles.mjs';
import { readLandscapeFileChunk } from '../../landscape_authoring/LandscapeFileIO.mjs';
import { LANDSCAPE_TERRAIN_FIELDS_ALGORITHM, LANDSCAPE_TERRAIN_FIELDS_FORMAT, LANDSCAPE_TERRAIN_FIELDS_HORIZON, LANDSCAPE_TERRAIN_FIELDS_LIMIT, LANDSCAPE_TERRAIN_FIELD_CHANNELS,
    LandscapeTerrainFieldsBindingError, landscapeTerrainFieldContentKey, landscapeTerrainFieldsLayout, validateLandscapeTerrainFields } from '../../../src/app/landscape/LandscapeTerrainFields.js';
import { TerrainFieldMemory } from './TerrainFieldsGrid.mjs';
import { readTerrainFieldSource, terrainFieldCoverTables } from './TerrainFieldsSource.mjs';
import { computeTerrainFields } from './TerrainFieldsGlobal.mjs';
import { terrainFieldCoarseTexel, terrainFieldNaturalSoilPage, terrainFieldPage } from './TerrainFieldsPages.mjs';
import { readTerrainFieldImports } from './TerrainFieldsImports.mjs';

export const TERRAIN_FIELDS_DIRECTORY = 'fields';
export const TERRAIN_FIELDS_RECIPE_FORMAT = 'landscape-terrain-fields-recipe';
const bytesOf = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const RIGHTS = 'Derived from the landscape\'s own terrain payloads by this repository\'s deterministic recipe; the source rights recorded in the landscape provenance apply. No new license is asserted.';

/** @param {string} file */
export async function readTerrainFieldsRecipe(file) {
    const bytes = await readAuthoringFile(file, 64 * 1024), recipe = JSON.parse(bytes.toString('utf8'));
    const required = 'curvature,deposition,depressions,flow,format,gradient,horizon,id,naturalSoil,rock,schemaVersion,shore,skyView,wetness,workingLimitBytes';
    if (Object.keys(recipe).sort().join(',') !== required || recipe.format !== TERRAIN_FIELDS_RECIPE_FORMAT || recipe.schemaVersion !== 1 || recipe.id !== LANDSCAPE_TERRAIN_FIELDS_ALGORITHM) {
        throw new Error(`[TerrainFields] Recipe must be ${TERRAIN_FIELDS_RECIPE_FORMAT} schema 1 for ${LANDSCAPE_TERRAIN_FIELDS_ALGORITHM} with exactly ${required}`);
    }
    if (!Number.isSafeInteger(recipe.workingLimitBytes) || recipe.workingLimitBytes < 1024 * 1024 || recipe.workingLimitBytes > 2 * 1024 * 1024 * 1024) throw new Error('[TerrainFields] Recipe working limit must be 1 MiB..2 GiB');
    return { recipe, bytes, sha256: authoringHash(bytes) };
}

function hashChannels(result) {
    return { channels: result.channels.map(channel => authoringHash(channel)), naturalSoil: authoringHash(result.naturalSoil) };
}

/**
 * @param {{directory:string,outputDirectory:string,source:{bytes:Buffer,manifest:any},recipeFile:string,importsFile?:string,verifyDeterminism?:boolean,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function prepareTerrainFields({ directory, outputDirectory, source, recipeFile, importsFile, verifyDeterminism = true, signal, log = () => {} }) {
    const started = performance.now(), timing = {};
    const manifest = source.manifest, { recipe, sha256: recipeSha256 } = await readTerrainFieldsRecipe(recipeFile);
    if (manifest.grid.spacingX !== manifest.grid.spacingZ) throw new Error('[TerrainFields] v1 fields require square native spacing');
    const imports = importsFile ? await readTerrainFieldImports(importsFile, manifest) : null;
    const memory = new TerrainFieldMemory(recipe.workingLimitBytes);
    memory.enter('source');
    const grid = await readTerrainFieldSource(directory, manifest, memory, { signal });
    timing.sourceSeconds = (performance.now() - started) / 1000;
    const tables = terrainFieldCoverTables(manifest), input = { ...grid, seaLevel: manifest.coordinates.seaLevel, ...tables, recipe, imports: imports?.entries ?? [], log };
    let mark = performance.now();
    const first = computeTerrainFields({ ...input, memory });
    timing.globalSeconds = (performance.now() - mark) / 1000;
    const hashes = hashChannels(first);
    let determinism = { verified: false, hashes };
    if (verifyDeterminism) {
        signal?.throwIfAborted();
        mark = performance.now();
        const repeatMemory = new TerrainFieldMemory(recipe.workingLimitBytes), repeat = computeTerrainFields({ ...input, memory: repeatMemory });
        const again = hashChannels(repeat);
        timing.repeatSeconds = (performance.now() - mark) / 1000;
        const identical = again.naturalSoil === hashes.naturalSoil && again.channels.every((hash, i) => hash === hashes.channels[i])
            && JSON.stringify(repeat.statistics) === JSON.stringify(first.statistics);
        if (!identical) throw new Error('[TerrainFields] Two runs of the global analyses on identical input differ; output is not deterministic');
        determinism = { verified: true, identical, hashes };
    }
    signal?.throwIfAborted();
    mark = performance.now();
    const samples = manifest.grid.chunkIntervals + 1, layout = landscapeTerrainFieldsLayout(samples), pagesDirectory = path.join(outputDirectory, 'pages');
    await mkdir(pagesDirectory, { recursive: true });
    const terrain = { revision: manifest.revision, manifestSha256: authoringHash(source.bytes), sourceSha256: manifest.provenance.sourceSha256, seaLevel: manifest.coordinates.seaLevel,
        bounds: { ...manifest.bounds }, grid: Object.fromEntries(['columns', 'rows', 'spacingX', 'spacingZ', 'chunkIntervals', 'maxLevel'].map(key => [key, manifest.grid[key]])),
        chunks: manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel).map(chunk => ({ id: chunk.id, height: chunk.channels.height.sha256, landCover: chunk.channels.landCover.sha256 })) };
    const pages = [], files = new Map();
    for (const chunk of manifest.chunks) {
        signal?.throwIfAborted();
        const fields = terrainFieldPage(grid.grid, first.channels, chunk, layout), fieldsSha = authoringHash(fields), fieldsUrl = `pages/${fieldsSha}.rgba8`;
        if (!files.has(fieldsUrl)) { await writeImmutableAuthoringFile(path.join(outputDirectory, fieldsUrl), fields); files.set(fieldsUrl, { byteLength: fields.length, sha256: fieldsSha }); }
        const natural = terrainFieldNaturalSoilPage(grid.grid, first.naturalSoil, grid.cover, tables.planningCover, chunk);
        let naturalSoil = null;
        if (natural) {
            const soilSha = authoringHash(natural), soilUrl = `pages/${soilSha}.u8`;
            if (!files.has(soilUrl)) { await writeImmutableAuthoringFile(path.join(outputDirectory, soilUrl), natural); files.set(soilUrl, { byteLength: natural.length, sha256: soilSha }); }
            naturalSoil = { url: soilUrl, byteLength: natural.length, sha256: soilSha };
        }
        const page = { id: chunk.id, level: chunk.level, column: chunk.column, row: chunk.row, contentKey: '', fields: { url: fieldsUrl, byteLength: fields.length, sha256: fieldsSha }, naturalSoil };
        page.contentKey = await landscapeTerrainFieldContentKey(terrain, page);
        pages.push(page);
    }
    timing.pageSeconds = (performance.now() - mark) / 1000;
    const candidate = { format: LANDSCAPE_TERRAIN_FIELDS_FORMAT, schemaVersion: 1, landscapeId: manifest.id, revision: 'pending', terrain, layout: JSON.parse(JSON.stringify(layout)),
        channels: LANDSCAPE_TERRAIN_FIELD_CHANNELS.map(definition => ({ ...definition })), horizon: JSON.parse(JSON.stringify(LANDSCAPE_TERRAIN_FIELDS_HORIZON)), pages,
        statistics: first.statistics,
        provenance: { algorithm: LANDSCAPE_TERRAIN_FIELDS_ALGORITHM, recipe, recipeSha256, measured: false, rights: RIGHTS,
            derivedFrom: 'native height and land-cover channels of the bound terrain revision, analyzed globally before page slicing',
            imports: (imports?.entries ?? []).map(entry => ({ id: entry.id, field: entry.field, mode: entry.mode, weight: entry.weight, encoding: entry.encoding, sha256: entry.sha256, byteLength: entry.byteLength, provenance: entry.provenance })) } };
    candidate.revision = `terrain-fields-${authoringHash(bytesOf({ ...candidate, revision: null })).slice(0, 24)}`;
    const value = await validateLandscapeTerrainFields(candidate, manifest), bytes = bytesOf(value);
    if (bytes.length > LANDSCAPE_TERRAIN_FIELDS_LIMIT) throw new Error(`[TerrainFields] Sidecar is ${bytes.length} bytes; the limit is ${LANDSCAPE_TERRAIN_FIELDS_LIMIT}`);
    const sidecarFile = path.join(outputDirectory, 'terrain-fields.json');
    await writeImmutableAuthoringFile(sidecarFile, bytes);
    const fieldsPages = pages.map(page => page.fields.url), uniqueFields = new Set(fieldsPages), naturalPages = pages.filter(page => page.naturalSoil).map(page => page.naturalSoil.url);
    const report = { passed: true, format: LANDSCAPE_TERRAIN_FIELDS_FORMAT, revision: value.revision, sidecarSha256: authoringHash(bytes), sidecarBytes: bytes.length,
        terrain: { revision: terrain.revision, manifestSha256: terrain.manifestSha256, nativeChunks: terrain.chunks.length, sharedSampleComparisons: grid.sharedSampleComparisons },
        pages: { count: pages.length, uniqueFieldPages: uniqueFields.size, fieldPageBytes: layout.pageBytes, uniqueFieldBytes: uniqueFields.size * layout.pageBytes,
            naturalSoilPages: naturalPages.length, uniqueNaturalSoilPages: new Set(naturalPages).size, uniqueNaturalSoilBytes: new Set(naturalPages).size * layout.naturalSoil.byteLength },
        recipe: { id: recipe.id, sha256: recipeSha256 }, imports: imports ? { sha256: imports.sha256, maps: imports.entries.map(entry => ({ id: entry.id, field: entry.field, sha256: entry.sha256 })) } : null,
        determinism, timing: { ...timing, totalSeconds: (performance.now() - started) / 1000 },
        memory: { ...memory.report(), processMaxRssBytes: process.resourceUsage().maxRSS * 1024, note: 'tracked typed arrays of the global stage; process RSS includes the Node runtime and is not a bound' } };
    return { directory, outputDirectory, sidecarFile, manifest, sourceBytes: source.bytes, value, bytes, report, files, importFiles: imports?.files ?? [] };
}

/** Re-reads every candidate byte and checks hashes, the sea-level sign of native shore distance, shared borders, coarse filtering and natural soil. @param {any} prepared */
export async function validateTerrainFieldsCandidate(prepared) {
    const bytes = await readAuthoringFile(prepared.sidecarFile, LANDSCAPE_TERRAIN_FIELDS_LIMIT);
    if (authoringHash(bytes) !== prepared.report.sidecarSha256) throw new Error('[TerrainFields] Sidecar receipt mismatch');
    const manifest = prepared.manifest, value = await validateLandscapeTerrainFields(JSON.parse(bytes.toString('utf8')), manifest);
    if (value.terrain.revision !== manifest.revision || value.terrain.manifestSha256 !== authoringHash(prepared.sourceBytes)) throw new Error('[TerrainFields] Candidate is not bound to its planned terrain');
    const layout = landscapeTerrainFieldsLayout(manifest.grid.chunkIntervals + 1), read = new Map();
    const payload = async entry => {
        if (read.has(entry.url)) return read.get(entry.url);
        const data = await readAuthoringFile(authoringFile(prepared.outputDirectory, entry.url), entry.byteLength);
        if (data.length !== entry.byteLength || authoringHash(data) !== entry.sha256 || !entry.url.startsWith(`pages/${entry.sha256}.`)) throw new Error(`[TerrainFields] Page integrity mismatch ${entry.url}`);
        read.set(entry.url, data);
        return data;
    };
    const byId = new Map(value.pages.map(page => [page.id, page])), chunks = new Map(manifest.chunks.map(chunk => [chunk.id, chunk]));
    const { coverSoil, planningCover } = terrainFieldCoverTables(manifest), shoreChannel = LANDSCAPE_TERRAIN_FIELD_CHANNELS.findIndex(channel => channel.name === 'shoreDistance');
    let shoreSamples = 0, borderTexels = 0, coarseTexels = 0, naturalChecked = 0;
    for (const page of value.pages) {
        const data = await payload(page.fields), chunk = chunks.get(page.id), native = page.level === manifest.grid.maxLevel ? await readLandscapeFileChunk(prepared.directory, manifest, page.id) : null;
        if (page.naturalSoil) {
            const soil = await payload(page.naturalSoil), cover = native?.landCover;
            for (let i = 0; i < soil.length; i++) {
                if (soil[i] >= manifest.soil.catalog.length || manifest.soil.catalog[soil[i]].id === 'unknown') throw new Error(`[TerrainFields] ${page.id} natural soil ${soil[i]} is not a natural catalog soil`);
                if (cover && !planningCover[cover[i]] && soil[i] !== coverSoil[cover[i]]) throw new Error(`[TerrainFields] ${page.id} natural soil changes the semantic soil of non-planning sample ${i}`);
            }
            naturalChecked += soil.length;
        }
        if (native) {
            const heights = native.heights, layer = shoreChannel >> 2, component = shoreChannel & 3;
            for (let r = 0; r < chunk.rows; r++) for (let c = 0; c < chunk.columns; c++) {
                const byte = data[layer * layout.layerBytes + ((r + layout.halo) * layout.width + c + layout.halo) * 4 + component];
                if ((byte >= 128) !== (heights[r * chunk.columns + c] >= manifest.coordinates.seaLevel)) throw new Error(`[TerrainFields] ${page.id} shore distance sign disagrees with sea level at sample ${c},${r}`);
                shoreSamples++;
            }
        }
        // the east and south neighbors share the border sample column/row and both halos bit for bit
        for (const [dc, dr] of [[1, 0], [0, 1]]) {
            const neighbor = byId.get(`l${page.level}/c${page.column + dc}/r${page.row + dr}`);
            if (!neighbor) continue;
            const other = await payload(neighbor.fields), shift = layout.samples - 1;
            for (let a = 0; a < layout.width; a++) for (let b = -layout.halo; b <= layout.halo; b++) {
                const ax = dc ? shift + layout.halo + b : a, ay = dr ? shift + layout.halo + b : a, bx = dc ? layout.halo + b : a, by = dr ? layout.halo + b : a;
                for (let layer = 0; layer < layout.layers; layer++) for (let k = 0; k < 4; k++) {
                    if (data[layer * layout.layerBytes + (ay * layout.width + ax) * 4 + k] !== other[layer * layout.layerBytes + (by * layout.width + bx) * 4 + k]) {
                        throw new Error(`[TerrainFields] ${page.id} and ${neighbor.id} disagree on a shared border or halo texel`);
                    }
                }
                borderTexels++;
            }
        }
    }
    // coarse pages: deterministic texels recomputed from native pages with the same tent prefilter
    const side = 2 ** manifest.grid.maxLevel, intervals = manifest.grid.chunkIntervals;
    const nativeData = new Map(value.pages.filter(page => page.level === manifest.grid.maxLevel).map(page => [page.row * side + page.column, read.get(page.fields.url)]));
    const nativeTexel = (column, row) => {
        const c = Math.min(side - 1, Math.floor(column / intervals)), r = Math.min(side - 1, Math.floor(row / intervals)), data = nativeData.get(r * side + c);
        const tx = column - c * intervals + layout.halo, ty = row - r * intervals + layout.halo;
        return Uint8Array.from({ length: 16 }, (_, k) => data[(k >> 2) * layout.layerBytes + (ty * layout.width + tx) * 4 + (k & 3)]);
    };
    for (const page of value.pages.filter(entry => entry.level < manifest.grid.maxLevel)) {
        const data = read.get(page.fields.url), chunk = chunks.get(page.id);
        for (let k = 0; k < 24; k++) {
            const tx = (k * 37 + page.column * 11) % layout.width, ty = (k * 53 + page.row * 7) % layout.width, expected = terrainFieldCoarseTexel(nativeTexel, manifest.grid, chunk, tx, ty, layout.halo);
            for (let c = 0; c < 16; c++) if (data[(c >> 2) * layout.layerBytes + (ty * layout.width + tx) * 4 + (c & 3)] !== expected[c]) throw new Error(`[TerrainFields] ${page.id} coarse texel ${tx},${ty} does not match its native tent prefilter`);
            coarseTexels++;
        }
    }
    return { value, bytes, files: [...read.keys()], checks: { shoreSamples, borderTexels, coarseTexels, naturalSoilSamples: naturalChecked } };
}

/** @param {string} destination fields directory @returns {Promise<{bytes:Buffer,value:any}|null>} */
export async function readCurrentTerrainFields(destination) {
    try {
        const bytes = await readAuthoringFile(path.join(destination, 'manifest.json'), LANDSCAPE_TERRAIN_FIELDS_LIMIT);
        return { bytes, value: await validateLandscapeTerrainFields(JSON.parse(bytes.toString('utf8'))) };
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/**
 * Installs pages, the immutable snapshot and finally the current sidecar. Refuses a terrain that changed since planning (the sidecar would
 * be orphaned from its binding) and a current sidecar of another landscape; the previous current sidecar keeps its immutable snapshot.
 * @param {any} prepared
 */
export async function publishTerrainFields(prepared) {
    const { value, bytes, files } = await validateTerrainFieldsCandidate(prepared), destination = path.join(prepared.directory, TERRAIN_FIELDS_DIRECTORY), installed = [];
    const current = async () => (await readAuthoringFile(path.join(prepared.directory, 'manifest.json'), 1024 * 1024)).equals(prepared.sourceBytes);
    if (!(await current())) throw new Error('[TerrainFields] The terrain changed after planning; publishing would bind fields to a revision that is no longer current');
    const previous = await readCurrentTerrainFields(destination);
    if (previous && previous.value.landscapeId !== value.landscapeId) throw new LandscapeTerrainFieldsBindingError(`current terrain fields belong to landscape ${previous.value.landscapeId}`);
    for (const relative of files) {
        const entry = value.pages.flatMap(page => [page.fields, page.naturalSoil]).find(item => item?.url === relative);
        const data = await readAuthoringFile(authoringFile(prepared.outputDirectory, relative), entry.byteLength);
        if (authoringHash(data) !== entry.sha256) throw new Error('[TerrainFields] Page changed during publication');
        const file = authoringFile(destination, relative); await writeImmutableAuthoringFile(file, data); installed.push(file);
    }
    if (previous) { const file = path.join(destination, `manifest.${authoringHash(previous.bytes)}.json`); await writeImmutableAuthoringFile(file, previous.bytes); installed.push(file); }
    const snapshot = path.join(destination, `manifest.${authoringHash(bytes)}.json`);
    await writeImmutableAuthoringFile(snapshot, bytes); installed.push(snapshot);
    if (!(await current())) throw new Error('[TerrainFields] The terrain changed during installation; the current sidecar was not switched');
    await atomicAuthoringWrite(path.join(destination, 'manifest.json'), bytes); installed.push(path.join(destination, 'manifest.json'));
    return [...new Set(installed)];
}
