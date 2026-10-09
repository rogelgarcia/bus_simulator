// Writes a synthesized terrain grid as a complete saved landscape directory: native chunks, hierarchy, references, appearance, fields.
// @ts-check
// A variant landscape must be a first-class saved landscape (the viewer, the authoring store and the fields bake read it unchanged), so
// this module reuses the saved-landscape contract end to end: content-addressed payloads with exact min/max envelopes, the measured
// native hierarchy (prepareLandscapeHierarchy staged beside the output and installed immutably), references copied with their original
// identities, the canonical appearance directory copied because its binding key covers only id, bounds, grid and soil materials, and the
// terrain fields re-baked and published under the authoring lock because they bind the exact revision and chunk hashes. The manifest is
// written last (immutable manifest.<sha256>.json snapshot, then the current manifest.json atomically); chunk revisions identify the
// sample content and the manifest revision identifies the whole document, both as synthesis-<24 hex> derived from the revision label.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { createLandscapeChunkId, createLandscapeManifest, encodeLandscapeChannel, validateLandscapeManifest, landscapeAppearanceBindingKey, validateLandscapeAppearanceManifest } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_PLANNING_ROLES } from '../../../src/app/landscape/LandscapePlanningReferences.js';
import { LANDSCAPE_DEFAULT_DIRECTORY } from '../../../src/app/landscape/LandscapeCache.js';
import { acquireAuthoringLock, atomicAuthoringWrite, authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from '../../landscape_authoring/AuthoringFiles.mjs';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../../landscape_authoring/LandscapeFileIO.mjs';
import { prepareLandscapeHierarchy } from '../HierarchyPreparation.mjs';
import { prepareTerrainFields, publishTerrainFields, readCurrentTerrainFields } from '../terrain_fields/TerrainFieldsPreparation.mjs';

export const SYNTHESIS_PREPARATION_ALGORITHM = 'landscape-synthesis-v1';
export const SYNTHESIS_REVISION_PREFIX = 'synthesis-';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const DEFAULT_FIELDS_RECIPE_FILE = path.join(REPOSITORY_ROOT, 'tools/bake_landscape/terrain_fields/recipe-v1.json');
const STAGE_DIRECTORY = '.synthesis-stage';
const FILE_READ_LIMIT = 64 * 1024 * 1024;
const REFERENCE_POLICIES = Object.freeze(['copy-planning', 'copy-all', 'none']);
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const seconds = started => (performance.now() - started) / 1000;

function assertOptions(options) {
    const { sourceDirectory, outputDirectory, grid, heights, cover, id, name, revisionLabel, provenance, references = 'copy-planning', appearance = 'copy', fields = 'bake' } = options;
    if (typeof sourceDirectory !== 'string' || !sourceDirectory || typeof outputDirectory !== 'string' || !outputDirectory) throw new Error('[SynthesisLandscape] sourceDirectory and outputDirectory are required');
    const output = path.resolve(outputDirectory);
    if (output === path.resolve(sourceDirectory)) throw new Error('[SynthesisLandscape] The output directory must differ from the source directory');
    if (output === path.resolve(REPOSITORY_ROOT, LANDSCAPE_DEFAULT_DIRECTORY)) throw new Error(`[SynthesisLandscape] Refusing to write into the canonical landscape cache ${LANDSCAPE_DEFAULT_DIRECTORY}`);
    if (!grid || !Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) || grid.columns !== grid.rows) throw new Error('[SynthesisLandscape] The grid must be square (columns === rows)');
    if (!(grid.spacingX > 0) || grid.spacingX !== grid.spacingZ || !Number.isFinite(grid.minX) || !Number.isFinite(grid.maxZ)) throw new Error('[SynthesisLandscape] The grid needs equal positive spacing and finite minX/maxZ');
    if (!(heights instanceof Float32Array) || heights.length !== grid.columns * grid.rows) throw new Error('[SynthesisLandscape] heights must be a Float32Array of columns*rows samples');
    if (!(cover instanceof Uint8Array) || cover.length !== heights.length) throw new Error('[SynthesisLandscape] cover must be a Uint8Array of columns*rows samples');
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) throw new Error('[SynthesisLandscape] id must be a landscape identifier');
    if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('[SynthesisLandscape] name is required (1..200 characters)');
    if (typeof revisionLabel !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(revisionLabel)) throw new Error('[SynthesisLandscape] revisionLabel must be a short identifier');
    if (!provenance || typeof provenance !== 'object' || typeof provenance.sourceName !== 'string' || !provenance.sourceName) throw new Error('[SynthesisLandscape] provenance.sourceName is required');
    if (!REFERENCE_POLICIES.includes(references)) throw new Error(`[SynthesisLandscape] references must be one of ${REFERENCE_POLICIES.join(', ')}`);
    if (!['copy', 'none'].includes(appearance)) throw new Error('[SynthesisLandscape] appearance must be copy or none');
    if (!['bake', 'none'].includes(fields)) throw new Error('[SynthesisLandscape] fields must be bake or none');
    return { ...options, outputDirectory: output, references, appearance, fields };
}

function heightsLittleEndian(heights) {
    const bytes = Buffer.alloc(heights.length * 4);
    for (let i = 0; i < heights.length; i++) bytes.writeFloatLE(heights[i], i * 4);
    return bytes;
}

// maximum absolute difference between every native sample and the overview's triangulated (nw-se) preview, as the hierarchy measures it
function overviewError(grid, heights, stride) {
    const { columns, rows } = grid, lastColumn = columns - 1 - stride, lastRow = rows - 1 - stride;
    let maximum = 0;
    for (let row = 0; row < rows; row++) {
        const north = Math.min(Math.floor(row / stride) * stride, lastRow), v = (row - north) / stride;
        for (let column = 0; column < columns; column++) {
            const west = Math.min(Math.floor(column / stride) * stride, lastColumn), u = (column - west) / stride;
            const a = heights[north * columns + west], b = heights[north * columns + west + stride], c = heights[(north + stride) * columns + west], d = heights[(north + stride) * columns + west + stride];
            const preview = u >= v ? a + (b - a) * u + (d - b) * v : a + (d - c) * u + (c - a) * v, error = Math.abs(preview - heights[row * columns + column]);
            if (error > maximum) maximum = error;
        }
    }
    return maximum;
}

async function listFilesRecursive(directory, relative = '') {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)), files = [];
    for (const entry of entries) {
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...await listFilesRecursive(path.join(directory, entry.name), child));
        else if (entry.isFile()) files.push(child);
    }
    return files;
}

/**
 * @param {{sourceDirectory:string,outputDirectory:string,grid:{columns:number,rows:number,spacingX:number,spacingZ:number,minX:number,maxZ:number},heights:Float32Array,cover:Uint8Array,
 *   id:string,name:string,revisionLabel:string,provenance:{sourceName:string,[key:string]:any},references?:'copy-planning'|'copy-all'|'none',appearance?:'copy'|'none',fields?:'bake'|'none',
 *   fieldsRecipeFile?:string,verifyFieldsDeterminism?:boolean,chunkIntervals?:number,maxLevel?:number,seaLevel?:number,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function writeSynthesizedLandscape(options) {
    const settings = assertOptions(options), { sourceDirectory, outputDirectory, grid, heights, cover, id, name, revisionLabel, signal, log = () => {} } = settings, started = performance.now(), timing = {};
    const source = await readLandscapeFileManifest(sourceDirectory, 'manifest.json', { signal });
    const chunkIntervals = settings.chunkIntervals ?? source.manifest.grid.chunkIntervals, maxLevel = settings.maxLevel ?? source.manifest.grid.maxLevel, seaLevel = settings.seaLevel ?? source.manifest.coordinates.seaLevel;
    if (!Number.isInteger(chunkIntervals) || !Number.isInteger(maxLevel) || grid.columns !== chunkIntervals * 2 ** maxLevel + 1) throw new Error(`[SynthesisLandscape] Grid ${grid.columns} does not match chunkIntervals ${chunkIntervals} x 2^${maxLevel} + 1`);
    if (!Number.isFinite(seaLevel)) throw new Error('[SynthesisLandscape] seaLevel must be finite');
    const spacing = grid.spacingX, samples = chunkIntervals + 1, bounds = { minX: grid.minX, maxX: grid.minX + (grid.columns - 1) * spacing, minZ: grid.maxZ - (grid.rows - 1) * spacing, maxZ: grid.maxZ };
    const catalogIds = new Set(source.manifest.landCover.catalog.map(entry => entry.id));
    for (let i = 0; i < heights.length; i++) {
        if (!Number.isFinite(heights[i])) throw new Error(`[SynthesisLandscape] Height sample ${i} is not finite`);
        if (!catalogIds.has(cover[i])) throw new Error(`[SynthesisLandscape] Cover sample ${i} has class ${cover[i]} outside the land-cover catalog`);
    }
    await mkdir(outputDirectory, { recursive: true });
    const release = await acquireAuthoringLock(outputDirectory), files = new Set(), stage = path.join(outputDirectory, STAGE_DIRECTORY);
    try {
        await rm(stage, { recursive: true, force: true });
        // content identity
        let mark = performance.now();
        const heightBytes = heightsLittleEndian(heights), heightsSha256 = authoringHash(heightBytes), coverSha256 = authoringHash(cover);
        const contentRevision = `${SYNTHESIS_REVISION_PREFIX}${authoringHash(jsonBytes({ revisionLabel, heightsSha256, coverSha256, id, grid: { columns: grid.columns, rows: grid.rows, spacing, minX: grid.minX, maxZ: grid.maxZ }, seaLevel })).slice(0, 24)}`;
        timing.identitySeconds = seconds(mark);
        // native chunks and the overview
        mark = performance.now();
        log(`[SynthesisLandscape] ${id}: writing ${4 ** maxLevel} native chunks and the overview into ${outputDirectory}`);
        let globalMin = Infinity, globalMax = -Infinity;
        for (let i = 0; i < heights.length; i++) { if (heights[i] < globalMin) globalMin = heights[i]; if (heights[i] > globalMax) globalMax = heights[i]; }
        const chunkHeights = new Float32Array(samples * samples), chunkCover = new Uint8Array(samples * samples), chunks = [];
        const writeChannel = async (values, encoding) => {
            signal?.throwIfAborted();
            const bytes = encodeLandscapeChannel(values, encoding), sha256 = authoringHash(bytes), url = `payloads/${sha256}.${encoding === 'float32-le' ? 'f32le' : 'u8'}`;
            await writeImmutableAuthoringFile(authoringFile(outputDirectory, url), bytes, { signal }); files.add(authoringFile(outputDirectory, url));
            return { url, encoding, byteLength: bytes.length, decodedByteLength: bytes.length, sha256, revision: contentRevision };
        };
        const levels = [{ level: 0, stride: 2 ** maxLevel }, { level: maxLevel, stride: 1 }];
        for (const { level, stride } of levels) {
            for (let row = 0; row < 2 ** level; row++) for (let column = 0; column < 2 ** level; column++) {
                const startColumn = column * chunkIntervals * stride, startRow = row * chunkIntervals * stride;
                let min = Infinity, max = -Infinity;
                for (let r = 0; r < samples; r++) for (let c = 0; c < samples; c++) {
                    const value = heights[(startRow + r * stride) * grid.columns + startColumn + c * stride], local = r * samples + c;
                    chunkHeights[local] = value; chunkCover[local] = cover[(startRow + r * stride) * grid.columns + startColumn + c * stride];
                    if (value < min) min = value; if (value > max) max = value;
                }
                chunks.push({ id: createLandscapeChunkId(level, column, row), level, column, row, startColumn, startRow, sampleStride: stride, columns: samples, rows: samples,
                    bounds: { minX: bounds.minX + startColumn * spacing, maxX: bounds.minX + (startColumn + chunkIntervals * stride) * spacing, minZ: bounds.maxZ - (startRow + chunkIntervals * stride) * spacing, maxZ: bounds.maxZ - startRow * spacing },
                    minHeight: level === 0 ? globalMin : min, maxHeight: level === 0 ? globalMax : max, geometricError: level === 0 ? overviewError(grid, heights, stride) : 0, revision: contentRevision,
                    parentId: level === 0 ? null : 'l0/c0/r0',
                    channels: { height: await writeChannel(chunkHeights, 'float32-le'), landCover: await writeChannel(chunkCover, 'uint8') } });
            }
        }
        timing.chunkSeconds = seconds(mark);
        // references copied with their original identities
        mark = performance.now();
        const references = [];
        if (settings.references !== 'none') {
            for (const reference of source.manifest.references) {
                if (settings.references === 'copy-planning' && !LANDSCAPE_PLANNING_ROLES.includes(reference.role)) continue;
                const bytes = await readAuthoringFile(authoringFile(sourceDirectory, reference.url), reference.byteLength, { signal });
                if (bytes.length !== reference.byteLength || authoringHash(bytes) !== reference.sha256) throw new Error(`[SynthesisLandscape] Source reference ${reference.id} does not match its recorded identity`);
                await writeImmutableAuthoringFile(authoringFile(outputDirectory, reference.url), bytes, { signal }); files.add(authoringFile(outputDirectory, reference.url));
                references.push({ id: reference.id, role: reference.role, url: reference.url, sha256: reference.sha256, byteLength: reference.byteLength, encoding: reference.encoding });
            }
        }
        timing.referenceSeconds = seconds(mark);
        // appearance copied whole (its binding key covers id, bounds, grid and soil materials only)
        mark = performance.now();
        let appearance = null;
        if (settings.appearance === 'copy') {
            const appearanceFiles = await listFilesRecursive(path.join(sourceDirectory, 'appearance'));
            if (!appearanceFiles.includes('manifest.json')) throw new Error('[SynthesisLandscape] The source landscape has no appearance/manifest.json to copy');
            let bytesCopied = 0;
            for (const relative of appearanceFiles) {
                const bytes = await readAuthoringFile(path.join(sourceDirectory, 'appearance', relative), FILE_READ_LIMIT, { signal });
                await writeImmutableAuthoringFile(authoringFile(outputDirectory, `appearance/${relative}`), bytes, { signal }); files.add(authoringFile(outputDirectory, `appearance/${relative}`));
                bytesCopied += bytes.length;
            }
            appearance = { files: appearanceFiles.length, bytes: bytesCopied };
        }
        timing.appearanceSeconds = seconds(mark);
        // provisional manifest, then the hierarchy staged beside the output
        mark = performance.now();
        const { sourceName, preparation: preparationExtra = {}, ...provenanceExtra } = settings.provenance;
        const provenance = { kind: 'designed-prototype', ...provenanceExtra, sourceName, sourceSha256: heightsSha256, nativeResolutionMeters: spacing,
            preparation: { algorithm: SYNTHESIS_PREPARATION_ALGORITHM, chunkIntervals, overviewStride: 2 ** maxLevel, maxLevel, revisionLabel, coverSha256, ...preparationExtra } };
        const provisional = createLandscapeManifest({ id, name, revision: contentRevision, bounds, grid: { columns: grid.columns, rows: grid.rows, spacingX: spacing, spacingZ: spacing, chunkIntervals, maxLevel },
            coordinates: { units: 'meters', upAxis: 'Y', xDirection: 'east', zDirection: 'north', rasterRow0: 'north', origin: { x: bounds.minX, y: 0, z: bounds.minZ }, seaLevel }, chunks, overviewId: 'l0/c0/r0', provenance, references });
        log(`[SynthesisLandscape] ${id}: preparing hierarchy levels 1..${maxLevel - 1}`);
        const hierarchy = await prepareLandscapeHierarchy({ directory: outputDirectory, outputDirectory: stage, source: { bytes: jsonBytes(provisional), manifest: provisional }, signal });
        for (const file of hierarchy.files) {
            const relative = path.relative(stage, file).split(path.sep).join('/');
            if (relative === 'manifest.json') continue;
            const bytes = await readAuthoringFile(file, FILE_READ_LIMIT, { signal });
            await writeImmutableAuthoringFile(authoringFile(outputDirectory, relative), bytes, { signal }); files.add(authoringFile(outputDirectory, relative));
        }
        const candidate = structuredClone(hierarchy.manifest);
        candidate.revision = `${SYNTHESIS_REVISION_PREFIX}${authoringHash(jsonBytes({ ...candidate, revision: null, revisionLabel })).slice(0, 24)}`;
        const manifest = validateLandscapeManifest(candidate), manifestBytes = jsonBytes(manifest), manifestSha256 = authoringHash(manifestBytes);
        for (const chunk of manifest.chunks) for (const channel of Object.values(chunk.channels)) {
            const payload = await readAuthoringFile(authoringFile(outputDirectory, channel.url), channel.byteLength, { signal });
            if (authoringHash(payload) !== channel.sha256) throw new Error(`[SynthesisLandscape] Installed payload ${channel.url} does not match the manifest`);
        }
        const snapshotFile = path.join(outputDirectory, `manifest.${manifestSha256}.json`);
        await writeImmutableAuthoringFile(snapshotFile, manifestBytes, { signal }); files.add(snapshotFile);
        await atomicAuthoringWrite(path.join(outputDirectory, 'manifest.json'), manifestBytes, { signal }); files.add(path.join(outputDirectory, 'manifest.json'));
        timing.hierarchySeconds = seconds(mark);
        // terrain fields bind the exact revision and chunk hashes, so they are re-baked here
        mark = performance.now();
        let fields = null;
        if (settings.fields === 'bake') {
            log(`[SynthesisLandscape] ${id}: baking terrain fields`);
            const prepared = await prepareTerrainFields({ directory: outputDirectory, outputDirectory: path.join(stage, 'fields'), source: { bytes: manifestBytes, manifest }, recipeFile: settings.fieldsRecipeFile ?? DEFAULT_FIELDS_RECIPE_FILE,
                verifyDeterminism: settings.verifyFieldsDeterminism ?? true, signal, log });
            for (const file of await publishTerrainFields(prepared)) files.add(file);
            fields = { revision: prepared.report.revision, pages: prepared.report.pages, determinism: prepared.report.determinism, timing: prepared.report.timing, recipe: prepared.report.recipe };
        }
        timing.fieldsSeconds = seconds(mark);
        await rm(stage, { recursive: true, force: true });
        // verification: re-read the manifest and chunks through the authenticated readers and compare with the grid bit for bit
        mark = performance.now();
        const reread = await readLandscapeFileManifest(outputDirectory, 'manifest.json', { signal });
        if (!reread.bytes.equals(manifestBytes) || reread.manifest.revision !== manifest.revision) throw new Error('[SynthesisLandscape] The written manifest does not read back identically');
        for (const chunkId of [manifest.overviewId, createLandscapeChunkId(maxLevel, 0, 0), createLandscapeChunkId(maxLevel, 2 ** maxLevel - 1, 2 ** maxLevel - 1)]) {
            const chunk = await readLandscapeFileChunk(outputDirectory, reread.manifest, chunkId, { signal }), descriptor = chunk.descriptor;
            for (let r = 0; r < samples; r++) for (let c = 0; c < samples; c++) {
                const index = (descriptor.startRow + r * descriptor.sampleStride) * grid.columns + descriptor.startColumn + c * descriptor.sampleStride, local = r * samples + c;
                if (!Object.is(chunk.heights[local], heights[index]) || chunk.landCover[local] !== cover[index]) throw new Error(`[SynthesisLandscape] ${chunkId} sample ${c},${r} differs from the synthesized grid`);
            }
        }
        if (fields) {
            const current = await readCurrentTerrainFields(path.join(outputDirectory, 'fields'));
            if (!current || current.value.terrain.revision !== manifest.revision || current.value.revision !== fields.revision) throw new Error('[SynthesisLandscape] Published terrain fields are not bound to the written revision');
        }
        if (appearance) {
            const sidecar = validateLandscapeAppearanceManifest(JSON.parse((await readAuthoringFile(path.join(outputDirectory, 'appearance/manifest.json'), FILE_READ_LIMIT)).toString('utf8')), manifest);
            if (await landscapeAppearanceBindingKey(sidecar) !== await landscapeAppearanceBindingKey(manifest)) throw new Error('[SynthesisLandscape] The copied appearance does not bind to the written landscape');
            appearance = { ...appearance, revision: sidecar.revision, bindingKey: await landscapeAppearanceBindingKey(manifest) };
        }
        timing.verifySeconds = seconds(mark);
        timing.totalSeconds = seconds(started);
        log(`[SynthesisLandscape] ${id}: ${manifest.revision} written (${files.size} files) in ${timing.totalSeconds.toFixed(1)} s`);
        return { directory: outputDirectory, manifest, revision: manifest.revision, manifestSha256, contentRevision, heightsSha256, coverSha256, files: [...files].sort(), references, appearance, fields, timing,
            hierarchy: hierarchy.report };
    } finally { await release(); }
}
