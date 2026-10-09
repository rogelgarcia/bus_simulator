// Prepares, validates and publishes the additive landscape-geology sidecar and its content-addressed field and categorical pages.
// @ts-check
// Preparation binds the engine's final layers to the exact terrain they were synthesized with: the native grid is re-read from the
// landscape directory and must match the given heights bit for bit, the twelve layers are checked against the height invariant and
// encoded into channel bytes (twice when determinism is verified, comparing every hash), pages are sliced with the mask-aligned layout
// and written as an immutable candidate (pages/<sha256>.rgba8, pages/<sha256>.u8 and geology.json with a content-derived revision).
// Validation re-reads every byte. Publication installs pages, keeps the previous current sidecar's snapshot, writes the new snapshot and
// switches geology/manifest.json last, only while the terrain manifest is still the one the geology was bound to; the caller holds the
// authoring lock of the landscape directory, and terrain, appearance and fields files are never written.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { atomicAuthoringWrite, authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { validateLandscapeManifest } from '../../../../src/app/landscape/LandscapeManifest.js';
import { LANDSCAPE_SYNTHESIS_LAYERS } from '../../../../src/app/landscape/LandscapeSynthesisOperators.js';
import { LANDSCAPE_GEOLOGY_ALGORITHM, LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS, LANDSCAPE_GEOLOGY_FORMAT, LANDSCAPE_GEOLOGY_LAYERS, LANDSCAPE_GEOLOGY_LIMIT,
    LandscapeGeologyBindingError, encodeLandscapeGeologyChannel, landscapeGeologyContentKey, landscapeGeologyLayout, validateLandscapeGeology } from '../../../../src/app/landscape/LandscapeGeology.js';
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { readTerrainFieldSource } from '../../terrain_fields/TerrainFieldsSource.mjs';
import { geologyCategoricalPage, geologyCoarseTexel, geologyFieldPage } from './GeologyPages.mjs';

export const GEOLOGY_DIRECTORY = 'geology';
export const GEOLOGY_WORKING_LIMIT_BYTES = 512 * 1024 * 1024;
export const GEOLOGY_INVARIANT_TOLERANCE_METERS = 1e-3;
const RECIPE_IDENTITY = /^synthesis-[a-f0-9]{24}$/;
const GRID_KEYS = ['columns', 'rows', 'spacingX', 'spacingZ', 'minX', 'maxZ'];
const bytesOf = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const round6 = value => Math.round(value * 1e6) / 1e6;
const RIGHTS = 'Derived from the landscape\'s own terrain by this repository\'s deterministic synthesis recipe; the source rights recorded in the landscape provenance apply. No new license is asserted.';

function assertInputs({ directory, outputDirectory, source, layers, grid, heights, provenance }) {
    if (typeof directory !== 'string' || !directory || typeof outputDirectory !== 'string' || !outputDirectory) throw new Error('[Geology] directory and outputDirectory are required');
    if (!source || !(source.bytes instanceof Uint8Array) || !source.manifest) throw new Error('[Geology] source must carry the terrain manifest bytes and the parsed manifest');
    const manifest = validateLandscapeManifest(source.manifest), n = manifest.grid.columns * manifest.grid.rows;
    const expected = { columns: manifest.grid.columns, rows: manifest.grid.rows, spacingX: manifest.grid.spacingX, spacingZ: manifest.grid.spacingZ, minX: manifest.bounds.minX, maxZ: manifest.bounds.maxZ };
    for (const key of GRID_KEYS) if (!grid || grid[key] !== expected[key]) throw new Error(`[Geology] grid.${key} ${grid?.[key]} differs from the landscape ${manifest.id} (${expected[key]})`);
    if (!(heights instanceof Float32Array) || heights.length !== n) throw new Error(`[Geology] heights must be a Float32Array of ${n} samples`);
    if (!layers || typeof layers !== 'object' || Object.keys(layers).sort().join(',') !== [...LANDSCAPE_GEOLOGY_LAYERS].sort().join(',')) throw new Error(`[Geology] layers must be exactly ${LANDSCAPE_GEOLOGY_LAYERS.join(', ')}`);
    for (const name of LANDSCAPE_GEOLOGY_LAYERS) {
        const Type = LANDSCAPE_SYNTHESIS_LAYERS[name].type === 'uint8' ? Uint8Array : Float32Array;
        if (!(layers[name] instanceof Type) || layers[name].length !== n) throw new Error(`[Geology] layer ${name} must be a ${Type.name} of ${n} samples`);
    }
    if (!provenance || typeof provenance.recipeIdentity !== 'string' || !RECIPE_IDENTITY.test(provenance.recipeIdentity)) throw new Error('[Geology] provenance.recipeIdentity must be the synthesis recipe identity (synthesis-<24 hex>)');
    if (typeof provenance.recipeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(provenance.recipeSha256)) throw new Error('[Geology] provenance.recipeSha256 must be a lowercase SHA-256');
    return manifest;
}

// encodes the twelve layers into channel bytes and label layers, measuring the height invariant and per-channel ranges
function encodeGeologyLayers({ heights, layers, seaLevel, memory, signal }) {
    const n = heights.length, land = i => heights[i] >= seaLevel;
    let landSamples = 0;
    for (let i = 0; i < n; i++) if (land(i)) landSamples++;
    const { bedrock, regolith, depositThickness } = layers;
    let maxAbove = -Infinity, maxResidual = 0;
    for (let i = 0; i < n; i++) {
        const above = bedrock[i] - heights[i], residual = Math.abs(heights[i] - bedrock[i] - regolith[i] - depositThickness[i]);
        if (above > GEOLOGY_INVARIANT_TOLERANCE_METERS) throw new Error(`[Geology] bedrock lies ${above} m above the height at sample ${i}; run geology-channels last`);
        if (residual > GEOLOGY_INVARIANT_TOLERANCE_METERS) throw new Error(`[Geology] height = bedrock + regolith + depositThickness is violated by ${residual} m at sample ${i} (tolerance ${GEOLOGY_INVARIANT_TOLERANCE_METERS} m); run geology-channels last`);
        if (above > maxAbove) maxAbove = above; if (residual > maxResidual) maxResidual = residual;
    }
    signal?.throwIfAborted();
    const channels = LANDSCAPE_GEOLOGY_CHANNELS.map(definition => memory.allocate(`geology/channel/${definition.name}`, Uint8Array, n)), channelStatistics = {};
    LANDSCAPE_GEOLOGY_CHANNELS.forEach((definition, k) => {
        const source = definition.name === 'bedrockOffset' ? null : layers[definition.name], target = channels[k];
        let minimum = Infinity, maximum = -Infinity, landSum = 0, clipped = 0;
        for (let i = 0; i < n; i++) {
            const value = source ? source[i] : heights[i] - bedrock[i];
            if (!Number.isFinite(value)) throw new Error(`[Geology] ${definition.name} is not finite at sample ${i}`);
            if (value < 0 || value > definition.scale) clipped++;
            target[i] = encodeLandscapeGeologyChannel(definition, value);
            if (value < minimum) minimum = value; if (value > maximum) maximum = value; if (land(i)) landSum += value;
        }
        channelStatistics[definition.name] = { minimum: round6(minimum), maximum: round6(maximum), landMean: round6(landSamples ? landSum / landSamples : 0), clippedSamples: clipped };
        signal?.throwIfAborted();
    });
    const labels = [], categoryStatistics = {};
    for (const category of LANDSCAPE_GEOLOGY_CATEGORIES) {
        const source = layers[category.name], counts = new Uint32Array(256);
        for (let i = 0; i < n; i++) {
            if (source[i] > category.maximum) throw new Error(`[Geology] ${category.name} label ${source[i]} at sample ${i} exceeds the catalog maximum ${category.maximum}`);
            counts[source[i]]++;
        }
        const histogram = {};
        for (let label = 0; label <= category.maximum; label++) if (counts[label] > 0) histogram[category.labels ? category.labels[label] : String(label)] = counts[label];
        categoryStatistics[category.name] = { histogram, maximum: category.maximum };
        labels.push(source);
    }
    return { channels, labels, statistics: { land: { samples: n, landSamples, waterSamples: n - landSamples, seaLevel }, channels: channelStatistics, categories: categoryStatistics,
        invariant: { toleranceMeters: GEOLOGY_INVARIANT_TOLERANCE_METERS, maxBedrockAboveHeightMeters: round6(maxAbove), maxResidualMeters: round6(maxResidual) } } };
}

const hashesOf = encoded => ({ channels: encoded.channels.map(channel => authoringHash(channel)), labels: encoded.labels.map(label => authoringHash(label)) });

/**
 * @param {{directory:string,outputDirectory:string,source:{bytes:Uint8Array,manifest:any},layers:Record<string,Float32Array|Uint8Array>,grid:any,heights:Float32Array,
 *   provenance:{recipeIdentity:string,recipeSha256:string},verifyDeterminism?:boolean,workingLimitBytes?:number,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function prepareLandscapeGeology({ directory, outputDirectory, source, layers, grid, heights, provenance, verifyDeterminism = true, workingLimitBytes = GEOLOGY_WORKING_LIMIT_BYTES, signal, log = () => {} }) {
    const started = performance.now(), timing = {}, manifest = assertInputs({ directory, outputDirectory, source, layers, grid, heights, provenance });
    const memory = new TerrainFieldMemory(workingLimitBytes), n = heights.length, seaLevel = manifest.coordinates.seaLevel;
    memory.enter('source');
    const native = await readTerrainFieldSource(directory, manifest, memory, { signal });
    for (let i = 0; i < n; i++) if (!Object.is(native.heights[i], heights[i])) throw new Error(`[Geology] heights differ from the native terrain of ${manifest.id} ${manifest.revision} at sample ${i}; geology must be prepared from the exact published grid`);
    memory.free('source/heights', 'source/cover');
    timing.sourceSeconds = (performance.now() - started) / 1000;
    memory.enter('encode');
    log(`[Geology] ${manifest.id}: encoding ${LANDSCAPE_GEOLOGY_CHANNELS.length} channels and ${LANDSCAPE_GEOLOGY_CATEGORIES.length} categories of ${manifest.revision}`);
    let mark = performance.now();
    const first = encodeGeologyLayers({ heights, layers, seaLevel, memory, signal }), hashes = hashesOf(first);
    timing.encodeSeconds = (performance.now() - mark) / 1000;
    let determinism = { verified: false, hashes };
    if (verifyDeterminism) {
        signal?.throwIfAborted();
        mark = performance.now();
        const repeat = encodeGeologyLayers({ heights, layers, seaLevel, memory: new TerrainFieldMemory(workingLimitBytes), signal }), again = hashesOf(repeat);
        timing.repeatSeconds = (performance.now() - mark) / 1000;
        const identical = again.channels.every((hash, i) => hash === hashes.channels[i]) && again.labels.every((hash, i) => hash === hashes.labels[i]) && JSON.stringify(repeat.statistics) === JSON.stringify(first.statistics);
        if (!identical) throw new Error('[Geology] Two encodings of identical layers differ; output is not deterministic');
        determinism = { verified: true, identical, hashes };
    }
    signal?.throwIfAborted();
    mark = performance.now();
    memory.enter('pages');
    const layout = landscapeGeologyLayout(manifest.grid.chunkIntervals + 1), pagesDirectory = path.join(outputDirectory, 'pages');
    await mkdir(pagesDirectory, { recursive: true });
    const terrain = { revision: manifest.revision, manifestSha256: authoringHash(source.bytes), sourceSha256: manifest.provenance.sourceSha256, seaLevel,
        bounds: { ...manifest.bounds }, grid: Object.fromEntries(['columns', 'rows', 'spacingX', 'spacingZ', 'chunkIntervals', 'maxLevel'].map(key => [key, manifest.grid[key]])),
        chunks: manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel).map(chunk => ({ id: chunk.id, height: chunk.channels.height.sha256, landCover: chunk.channels.landCover.sha256 })) };
    const pages = [], files = new Map();
    const store = async (data, extension) => {
        const sha256 = authoringHash(data), url = `pages/${sha256}.${extension}`;
        if (!files.has(url)) { await writeImmutableAuthoringFile(path.join(outputDirectory, url), data, { signal }); files.set(url, { byteLength: data.length, sha256 }); }
        return { url, byteLength: data.length, sha256 };
    };
    for (const chunk of manifest.chunks) {
        signal?.throwIfAborted();
        const fields = await store(geologyFieldPage(grid, first.channels, chunk, layout), 'rgba8'), categorical = await store(geologyCategoricalPage(grid, first.labels, chunk, layout), 'u8');
        const page = { id: chunk.id, level: chunk.level, column: chunk.column, row: chunk.row, contentKey: '', fields, categorical };
        page.contentKey = await landscapeGeologyContentKey(terrain, page, provenance.recipeIdentity);
        pages.push(page);
    }
    timing.pageSeconds = (performance.now() - mark) / 1000;
    const candidate = { format: LANDSCAPE_GEOLOGY_FORMAT, schemaVersion: 1, landscapeId: manifest.id, revision: 'pending', terrain, layout: JSON.parse(JSON.stringify(layout)),
        channels: LANDSCAPE_GEOLOGY_CHANNELS.map(definition => ({ ...definition })), categories: LANDSCAPE_GEOLOGY_CATEGORIES.map(entry => ({ ...entry, labels: entry.labels === null ? null : [...entry.labels] })), pages,
        statistics: first.statistics,
        provenance: { algorithm: LANDSCAPE_GEOLOGY_ALGORITHM, recipeIdentity: provenance.recipeIdentity, recipeSha256: provenance.recipeSha256, measured: false, rights: RIGHTS,
            derivedFrom: 'geology layers of the terrain synthesis recipe that produced the bound terrain revision, encoded globally before page slicing' } };
    candidate.revision = `geology-${authoringHash(bytesOf({ ...candidate, revision: null })).slice(0, 24)}`;
    const value = await validateLandscapeGeology(candidate, manifest), bytes = bytesOf(value);
    if (bytes.length > LANDSCAPE_GEOLOGY_LIMIT) throw new Error(`[Geology] Sidecar is ${bytes.length} bytes; the limit is ${LANDSCAPE_GEOLOGY_LIMIT}`);
    const sidecarFile = path.join(outputDirectory, 'geology.json');
    await writeImmutableAuthoringFile(sidecarFile, bytes, { signal });
    const fieldUrls = new Set(pages.map(page => page.fields.url)), categoricalUrls = new Set(pages.map(page => page.categorical.url));
    const report = { passed: true, format: LANDSCAPE_GEOLOGY_FORMAT, revision: value.revision, sidecarSha256: authoringHash(bytes), sidecarBytes: bytes.length,
        terrain: { revision: terrain.revision, manifestSha256: terrain.manifestSha256, nativeChunks: terrain.chunks.length, sharedSampleComparisons: native.sharedSampleComparisons },
        pages: { count: pages.length, uniqueFieldPages: fieldUrls.size, fieldPageBytes: layout.pageBytes, uniqueFieldBytes: fieldUrls.size * layout.pageBytes,
            uniqueCategoricalPages: categoricalUrls.size, categoricalPageBytes: layout.categorical.byteLength, uniqueCategoricalBytes: categoricalUrls.size * layout.categorical.byteLength },
        provenance: { recipeIdentity: provenance.recipeIdentity, recipeSha256: provenance.recipeSha256 }, statistics: first.statistics, determinism,
        timing: { ...timing, totalSeconds: (performance.now() - started) / 1000 },
        memory: { ...memory.report(), processMaxRssBytes: process.resourceUsage().maxRSS * 1024, note: 'tracked typed arrays of the encode stage; process RSS includes the Node runtime and is not a bound' } };
    return { directory, outputDirectory, sidecarFile, manifest, sourceBytes: source.bytes, value, bytes, report, files };
}

/** Re-reads every candidate byte and checks hashes, the strict schema and binding, shared borders and halos, aligned labels and coarse filtering. @param {any} prepared */
export async function validateLandscapeGeologyCandidate(prepared) {
    const bytes = await readAuthoringFile(prepared.sidecarFile, LANDSCAPE_GEOLOGY_LIMIT);
    if (authoringHash(bytes) !== prepared.report.sidecarSha256) throw new Error('[Geology] Sidecar receipt mismatch');
    const manifest = prepared.manifest, value = await validateLandscapeGeology(JSON.parse(bytes.toString('utf8')), manifest);
    if (value.terrain.revision !== manifest.revision || value.terrain.manifestSha256 !== authoringHash(prepared.sourceBytes)) throw new Error('[Geology] Candidate is not bound to its prepared terrain');
    const layout = landscapeGeologyLayout(manifest.grid.chunkIntervals + 1), read = new Map(), samples = layout.samples, labelBytes = layout.categorical.layerBytes, categories = LANDSCAPE_GEOLOGY_CATEGORIES.length;
    const payload = async entry => {
        if (read.has(entry.url)) return read.get(entry.url);
        const data = await readAuthoringFile(authoringFile(prepared.outputDirectory, entry.url), entry.byteLength);
        if (data.length !== entry.byteLength || authoringHash(data) !== entry.sha256 || !entry.url.startsWith(`pages/${entry.sha256}.`)) throw new Error(`[Geology] Page integrity mismatch ${entry.url}`);
        read.set(entry.url, data);
        return data;
    };
    const byId = new Map(value.pages.map(page => [page.id, page])), chunks = new Map(manifest.chunks.map(chunk => [chunk.id, chunk]));
    let borderTexels = 0, borderLabels = 0, alignedLabels = 0, coarseTexels = 0;
    for (const page of value.pages) {
        const data = await payload(page.fields), labels = await payload(page.categorical);
        for (let k = 0; k < categories; k++) for (let i = 0; i < labelBytes; i++) {
            if (labels[k * labelBytes + i] > LANDSCAPE_GEOLOGY_CATEGORIES[k].maximum) throw new Error(`[Geology] ${page.id} ${LANDSCAPE_GEOLOGY_CATEGORIES[k].name} label ${labels[k * labelBytes + i]} exceeds the catalog maximum`);
        }
        // the east and south neighbors share the border sample column/row and both field halos bit for bit, and the border labels exactly
        for (const [dc, dr] of [[1, 0], [0, 1]]) {
            const neighbor = byId.get(`l${page.level}/c${page.column + dc}/r${page.row + dr}`);
            if (!neighbor) continue;
            const other = await payload(neighbor.fields), otherLabels = await payload(neighbor.categorical), shift = samples - 1;
            for (let a = 0; a < layout.width; a++) for (let b = -layout.halo; b <= layout.halo; b++) {
                const ax = dc ? shift + layout.halo + b : a, ay = dr ? shift + layout.halo + b : a, bx = dc ? layout.halo + b : a, by = dr ? layout.halo + b : a;
                for (let layer = 0; layer < layout.layers; layer++) for (let k = 0; k < 4; k++) {
                    if (data[layer * layout.layerBytes + (ay * layout.width + ax) * 4 + k] !== other[layer * layout.layerBytes + (by * layout.width + bx) * 4 + k]) {
                        throw new Error(`[Geology] ${page.id} and ${neighbor.id} disagree on a shared border or halo texel`);
                    }
                }
                borderTexels++;
            }
            for (let a = 0; a < samples; a++) for (let k = 0; k < categories; k++) {
                const mine = dc ? a * samples + shift : shift * samples + a, theirs = dc ? a * samples : a;
                if (labels[k * labelBytes + mine] !== otherLabels[k * labelBytes + theirs]) throw new Error(`[Geology] ${page.id} and ${neighbor.id} disagree on a shared border label`);
                borderLabels++;
            }
        }
    }
    // coarse pages: labels equal to the native page labels at every aligned sample, deterministic texels recomputed from native pages with the same tent prefilter
    const side = 2 ** manifest.grid.maxLevel, intervals = manifest.grid.chunkIntervals;
    const nativeOf = (column, row) => {
        const c = Math.min(side - 1, Math.floor(column / intervals)), r = Math.min(side - 1, Math.floor(row / intervals)), page = byId.get(`l${manifest.grid.maxLevel}/c${c}/r${r}`);
        if (!page) throw new Error(`[Geology] native page l${manifest.grid.maxLevel}/c${c}/r${r} is missing from the candidate`);
        return { page, tx: column - c * intervals, ty: row - r * intervals };
    };
    const nativeTexel = (column, row) => {
        const { page, tx, ty } = nativeOf(column, row), data = read.get(page.fields.url);
        return Uint8Array.from({ length: LANDSCAPE_GEOLOGY_CHANNELS.length }, (_, k) => data[(k >> 2) * layout.layerBytes + ((ty + layout.halo) * layout.width + tx + layout.halo) * 4 + (k & 3)]);
    };
    for (const page of value.pages.filter(entry => entry.level < manifest.grid.maxLevel)) {
        const data = read.get(page.fields.url), labels = read.get(page.categorical.url), chunk = chunks.get(page.id);
        for (let r = 0; r < chunk.rows; r++) for (let c = 0; c < chunk.columns; c++) {
            const { page: native, tx, ty } = nativeOf(chunk.startColumn + c * chunk.sampleStride, chunk.startRow + r * chunk.sampleStride), nativeLabels = read.get(native.categorical.url);
            for (let k = 0; k < categories; k++) {
                if (labels[k * labelBytes + r * samples + c] !== nativeLabels[k * labelBytes + ty * samples + tx]) throw new Error(`[Geology] ${page.id} ${LANDSCAPE_GEOLOGY_CATEGORIES[k].name} label ${c},${r} differs from native ${native.id}`);
                alignedLabels++;
            }
        }
        for (let k = 0; k < 24; k++) {
            const tx = (k * 37 + page.column * 11) % layout.width, ty = (k * 53 + page.row * 7) % layout.width, expected = geologyCoarseTexel(nativeTexel, manifest.grid, chunk, tx, ty, layout.halo);
            for (let c = 0; c < expected.length; c++) if (data[(c >> 2) * layout.layerBytes + (ty * layout.width + tx) * 4 + (c & 3)] !== expected[c]) throw new Error(`[Geology] ${page.id} coarse texel ${tx},${ty} does not match its native tent prefilter`);
            coarseTexels++;
        }
    }
    return { value, bytes, files: [...read.keys()], checks: { borderTexels, borderLabels, alignedLabels, coarseTexels } };
}

/** @param {string} destination geology directory @returns {Promise<{bytes:Buffer,value:any}|null>} */
export async function readCurrentLandscapeGeology(destination) {
    try {
        const bytes = await readAuthoringFile(path.join(destination, 'manifest.json'), LANDSCAPE_GEOLOGY_LIMIT);
        return { bytes, value: await validateLandscapeGeology(JSON.parse(bytes.toString('utf8'))) };
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/**
 * Installs pages, the immutable snapshot and finally the current sidecar into <directory>/geology. The caller holds the landscape's
 * authoring lock. Refuses a terrain that changed since preparation (the sidecar would be orphaned from its binding) and a current sidecar
 * of another landscape; the previous current sidecar keeps its immutable snapshot. Terrain, appearance and fields files are never written.
 * @param {any} prepared @returns {Promise<string[]>} installed files, the current sidecar last
 */
export async function publishLandscapeGeology(prepared) {
    const { value, bytes, files } = await validateLandscapeGeologyCandidate(prepared), destination = path.join(prepared.directory, GEOLOGY_DIRECTORY), installed = [];
    const current = async () => (await readAuthoringFile(path.join(prepared.directory, 'manifest.json'), 1024 * 1024)).equals(Buffer.from(prepared.sourceBytes.buffer, prepared.sourceBytes.byteOffset, prepared.sourceBytes.byteLength));
    if (!(await current())) throw new Error('[Geology] The terrain changed after preparation; publishing would bind geology to a revision that is no longer current');
    const previous = await readCurrentLandscapeGeology(destination);
    if (previous && previous.value.landscapeId !== value.landscapeId) throw new LandscapeGeologyBindingError(`current geology belongs to landscape ${previous.value.landscapeId}`);
    for (const relative of files) {
        const entry = value.pages.flatMap(page => [page.fields, page.categorical]).find(item => item.url === relative);
        const data = await readAuthoringFile(authoringFile(prepared.outputDirectory, relative), entry.byteLength);
        if (authoringHash(data) !== entry.sha256) throw new Error('[Geology] Page changed during publication');
        const file = authoringFile(destination, relative); await writeImmutableAuthoringFile(file, data); installed.push(file);
    }
    if (previous) { const file = path.join(destination, `manifest.${authoringHash(previous.bytes)}.json`); await writeImmutableAuthoringFile(file, previous.bytes); installed.push(file); }
    const snapshot = path.join(destination, `manifest.${authoringHash(bytes)}.json`);
    await writeImmutableAuthoringFile(snapshot, bytes); installed.push(snapshot);
    if (!(await current())) throw new Error('[Geology] The terrain changed during installation; the current sidecar was not switched');
    await atomicAuthoringWrite(path.join(destination, 'manifest.json'), bytes); installed.push(path.join(destination, 'manifest.json'));
    return [...new Set(installed)];
}
