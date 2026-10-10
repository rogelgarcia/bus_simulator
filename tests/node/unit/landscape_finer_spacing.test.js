// Pins the AI 596 D3 finer-native-spacing contracts: synthesized provenance, the spacing-dependent smoothing cap and its reservation, the
// manifest-derived exact-query radius, bit-exact NW-SE sampling on 1025² and 2049² grids, and the manifest/sidecar limits of deeper trees.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import {
    LANDSCAPE_GEOLOGY_LIMIT, LANDSCAPE_MANIFEST_BYTE_LIMIT, LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES, LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES_FINE, LANDSCAPE_PROVENANCE_KINDS,
    LANDSCAPE_SMOOTH_FINE_SPACING_METERS, LANDSCAPE_SYNTHESIS_PROVENANCE_KIND, LANDSCAPE_SYNTHESIS_PROVENANCE_STATEMENT, LANDSCAPE_TERRAIN_FIELDS_LIMIT,
    applyLandscapeEditBatchStreamed, decodeLandscapeChannel, encodeLandscapeChannel, landscapeQueryRadiusLimit, landscapeSmoothRadiusSampleLimit, loadLandscapeManifest,
    planLandscapeRegion, sampleLandscapeChunk, validateLandscapeEditBatch, validateLandscapeManifest
} from '../../../src/app/landscape/index.js';
import { LANDSCAPE_TERRAIN_FIELD_RUNTIME } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainFieldPages.js';
import { LANDSCAPE_NATURAL_INFERENCE } from '../../../src/graphics/engine3d/landscape/LandscapeNaturalInference.js';
import { writeSynthesizedLandscape } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisLandscape.mjs';
import { prepareTerrainFields } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsPreparation.mjs';
import { prepareLandscapeGeology } from '../../../tools/bake_landscape/terrain_synthesis/geology/GeologyPreparation.mjs';
import { readLandscapeFileManifest } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { LANDSCAPE_GEOLOGY_LAYERS, LANDSCAPE_SYNTHESIS_LAYERS } from '../../../src/app/landscape/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifacts = path.join(root, 'tests/artifacts/node/landscape_finer_spacing');
await mkdir(artifacts, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const SPACINGS = Object.freeze([1.953125, 0.9765625, 0.48828125]);
const IDENTITY = `synthesis-${'0123456789abcdef'.repeat(2).slice(0, 24)}`;
const synthesisBlock = (spacing, sourceSpacingMeters = spacing) => ({ recipeId: 'plateau-road-shoreline', identity: IDENTITY, statement: LANDSCAPE_SYNTHESIS_PROVENANCE_STATEMENT, sourceSpacingMeters, upsampled: sourceSpacingMeters > spacing });
const batch = (manifest, operations, extras = {}) => ({ format: 'landscape-edit-batch', schemaVersion: 1, id: 'finer-batch', landscapeId: manifest.id, expectedRevision: manifest.revision, operations, ...extras });
const rectangle = bounds => ({ type: 'rectangle', ...bounds });

// a random generator with a fixed seed, so the sampled positions are the same on every run
function random(seed) { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; }; }

test('Provenance: procedural-synthesis needs the synthesis block, the exact statement and a native resolution equal to the grid spacing; older kinds validate unchanged', async () => {
    const { manifest } = createLandscapeModelFixture({ spacing: 0.9765625 });
    assert.deepEqual([...LANDSCAPE_PROVENANCE_KINDS], ['designed-prototype', 'synthetic-fixture', 'procedural-synthesis']);
    assert.equal(manifest.provenance.kind, 'synthetic-fixture');
    const synthesized = clone(manifest);
    synthesized.provenance = { ...synthesized.provenance, kind: LANDSCAPE_SYNTHESIS_PROVENANCE_KIND, synthesis: synthesisBlock(0.9765625) };
    const valid = validateLandscapeManifest(synthesized);
    assert.equal(valid.provenance.synthesis.upsampled, false); assert.ok(Object.isFrozen(valid.provenance.synthesis));
    const coarse = clone(synthesized); coarse.provenance.synthesis = synthesisBlock(0.9765625, 3.90625);
    assert.equal(validateLandscapeManifest(coarse).provenance.synthesis.upsampled, true, 'a coarser working grid is declared as an upsampling');
    const cases = [
        [input => { delete input.provenance.synthesis; }, /requires a synthesis block/],
        [input => { input.provenance.synthesis.statement = 'measured'; }, /statement must be exactly/],
        [input => { input.provenance.synthesis.identity = 'relief-b'; }, /identity must be the recipe identity/],
        [input => { input.provenance.synthesis.recipeId = ''; }, /recipeId/],
        [input => { input.provenance.nativeResolutionMeters = 1.953125; }, /must equal the grid spacing/],
        [input => { input.provenance.synthesis.sourceSpacingMeters = 0.5; }, /at least the native spacing/],
        [input => { input.provenance.synthesis.upsampled = true; }, /upsampled must be true exactly when/],
        [input => { input.provenance.synthesis = synthesisBlock(0.9765625, 3.90625); input.provenance.synthesis.upsampled = false; }, /upsampled must be true exactly when/],
        [input => { input.provenance.kind = 'measured-survey'; }, /provenance.kind is required \(designed-prototype, synthetic-fixture, procedural-synthesis\)/]
    ];
    for (const [mutate, expected] of cases) { const input = clone(synthesized); mutate(input); assert.throws(() => validateLandscapeManifest(input), expected); }
    // the older kinds do not need the block and keep a native resolution independent of the grid (the coast declares 1.953125 on its 1.953125 grid)
    const loose = clone(manifest); loose.provenance.nativeResolutionMeters = 5;
    assert.equal(validateLandscapeManifest(loose).provenance.nativeResolutionMeters, 5);
    const coastal = path.join(root, 'assets/public/landscape/coastal-city/manifest.json');
    const cached = await readFile(coastal).catch(() => null);
    if (cached) {
        const real = validateLandscapeManifest(JSON.parse(cached.toString('utf8')));
        assert.equal(real.provenance.kind, 'designed-prototype'); assert.equal(real.provenance.synthesis, undefined); assert.equal(real.chunks.length, 85);
    }
});

test('Synthesis writer: the synthesis option emits procedural-synthesis provenance with the recipe SHA-256 as the source identity; without it the pre-D3 shape stays', async () => {
    const parent = await mkdtemp(path.join(artifacts, 'writer-')), columns = 4 * 2 + 1, spacing = 0.9765625;
    const grid = { columns, rows: columns, spacingX: spacing, spacingZ: spacing, minX: 0, maxZ: (columns - 1) * spacing }, heights = new Float32Array(columns * columns), cover = new Uint8Array(columns * columns);
    for (let i = 0; i < heights.length; i++) { heights[i] = Math.fround(Math.sin(i / 7) * 3); cover[i] = heights[i] < 0 ? 0 : 2; }
    const recipeSha256 = sha256('recipe'), write = (outputDirectory, extra) => writeSynthesizedLandscape({ sourceDirectory: null, outputDirectory, grid, heights, cover, id: 'finer-fixture', name: 'Finer spacing writer test', revisionLabel: 'test-v1',
        provenance: { sourceName: 'writer test' }, references: 'none', appearance: 'none', fields: 'none', chunkIntervals: 4, maxLevel: 1, seaLevel: 0, ...extra });
    const synthesized = await write(path.join(parent, 'synthesized'), { synthesis: { recipeId: 'plateau-road-shoreline', identity: IDENTITY, recipeSha256, sourceSpacingMeters: 3.90625 } });
    const provenance = (await readLandscapeFileManifest(synthesized.directory)).manifest.provenance;
    assert.equal(provenance.kind, 'procedural-synthesis'); assert.equal(provenance.sourceSha256, recipeSha256); assert.equal(provenance.nativeResolutionMeters, spacing);
    assert.deepEqual(provenance.synthesis, { recipeId: 'plateau-road-shoreline', identity: IDENTITY, statement: 'procedurally synthesized, not measured', sourceSpacingMeters: 3.90625, upsampled: true });
    assert.equal(provenance.preparation.heightsSha256, synthesized.heightsSha256); assert.equal(provenance.preparation.algorithm, 'landscape-synthesis-v1');
    const legacy = await write(path.join(parent, 'legacy'), {}), legacyProvenance = (await readLandscapeFileManifest(legacy.directory)).manifest.provenance;
    assert.equal(legacyProvenance.kind, 'designed-prototype'); assert.equal(legacyProvenance.sourceSha256, legacy.heightsSha256); assert.equal(legacyProvenance.synthesis, undefined);
    assert.notEqual(legacy.revision, synthesized.revision, 'the provenance is part of the manifest identity');
    await assert.rejects(write(path.join(parent, 'bad'), { synthesis: { recipeId: 'x', identity: IDENTITY, recipeSha256, sourceSpacingMeters: 0.5 } }), /sourceSpacingMeters must be the spacing the operators ran at/);
    await assert.rejects(write(path.join(parent, 'bad'), { synthesis: { recipeId: 'x', identity: 'relief-b', recipeSha256, sourceSpacingMeters: spacing } }), /synthesis.identity/);
});

test('Smoothing: the kernel cap is 8 samples at 1.5 m and coarser and 16 below, and the 16-sample halo of a 257² tile reserves 2,464,867 bytes inside the 8 MiB cap', async () => {
    assert.deepEqual(SPACINGS.map(landscapeSmoothRadiusSampleLimit), [8, 16, 16]);
    assert.equal(landscapeSmoothRadiusSampleLimit(LANDSCAPE_SMOOTH_FINE_SPACING_METERS), LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES);
    assert.equal(landscapeSmoothRadiusSampleLimit(1.4999), LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES_FINE);
    assert.throws(() => landscapeSmoothRadiusSampleLimit(0), /positive/);
    // metric reach: 15.625 m at 1.953125 and 0.9765625 m, 7.8125 m at 0.48828125 m; the coastal template's 8 m radius stays valid at every spacing
    assert.deepEqual(SPACINGS.map(spacing => landscapeSmoothRadiusSampleLimit(spacing) * spacing), [15.625, 15.625, 7.8125]);
    const template = JSON.parse(await readFile(path.join(root, 'tools/landscape_authoring/examples/grade_smooth_polygon.template.json'), 'utf8')), templateRadius = template.operations.find(operation => operation.type === 'smooth').radiusMeters;
    assert.deepEqual(SPACINGS.map(spacing => Math.floor(templateRadius / spacing)), [4, 8, 16]);
    // one sample over the cap: 9 × 1.953125 = 17.578125 m, 17 × 0.9765625 = 16.6015625 m, 17 × 0.48828125 = 8.30078125 m
    for (const [spacing, accepted, rejected] of [[1.953125, 15.625, 17.6], [0.9765625, 15.625, 16.61], [0.48828125, 7.8125, 8.31]]) {
        const { manifest } = createLandscapeModelFixture({ chunkIntervals: 16, maxLevel: 1, minX: 0, minZ: 0, spacing });
        const smooth = radiusMeters => batch(manifest, [{ id: 'smooth', type: 'smooth', region: rectangle(manifest.bounds), falloff: { type: 'none' }, radiusMeters, strength: 1 }]);
        assert.equal(validateLandscapeEditBatch(manifest, smooth(accepted)).operations[0].radiusMeters, accepted);
        assert.throws(() => validateLandscapeEditBatch(manifest, smooth(rejected)), new RegExp(`1\\.\\.${landscapeSmoothRadiusSampleLimit(spacing)} native samples`));
    }
    const fixture = createLandscapeModelFixture({ chunkIntervals: 256, maxLevel: 0, spacing: 1, minX: 0, minZ: 0, heightAt: (c, r) => c === 128 && r === 128 ? 1089 : 0 });
    const resources = new Map(fixture.resources);
    const readChunk = async (id, { descriptor }) => ({ descriptor, heights: decodeLandscapeChannel(resources.get(descriptor.channels.height.url), descriptor.channels.height), landCover: decodeLandscapeChannel(resources.get(descriptor.channels.landCover.url), descriptor.channels.landCover) });
    const stageChunk = async ({ descriptor, heights }) => {
        const bytes = encodeLandscapeChannel(heights, 'float32-le'), hash = sha256(bytes), url = `immutable/${hash}.f32le`;
        resources.set(url, bytes);
        return { url, sha256: hash, encoding: 'float32-le', byteLength: bytes.length, decodedByteLength: bytes.length, revision: descriptor.revision };
    };
    const widest = batch(fixture.manifest, [{ id: 'widest', type: 'smooth', region: rectangle(fixture.manifest.bounds), falloff: { type: 'none' }, radiusMeters: 16, strength: 1 }]);
    await assert.rejects(applyLandscapeEditBatchStreamed(fixture.manifest, widest, { readChunk, stageChunk, newRevision: 'too-small', maxWorkingBytes: 2_464_866 }), /need 2464867 bytes/);
    const result = await applyLandscapeEditBatchStreamed(fixture.manifest, widest, { readChunk, stageChunk, newRevision: 'widest-r2' });
    assert.equal(result.summary.workingBytes, 2_464_867); assert.deepEqual(result.summary.workingBuffers.haloRadiusSamples, { x: 16, z: 16 });
    assert.ok(result.summary.workingBytes <= 8 * 1024 * 1024);
    const native = result.manifestDraft.chunks[0], edited = await readChunk(native.id, { descriptor: native });
    for (let r = 0; r < 257; r++) for (let c = 0; c < 257; c++) assert.equal(edited.heights[r * 257 + c], Math.abs(c - 128) <= 16 && Math.abs(r - 128) <= 16 ? 1 : 0, `${c},${r}`);
});

test('Queries: the admissible selection radius is half the native chunk span; below it every position is admitted, at it only the tangent chunk-centre case is not', () => {
    for (const [spacing, expected] of [[1.953125, 250], [0.9765625, 125], [0.48828125, 62.5]]) {
        const { manifest } = createLandscapeModelFixture({ chunkIntervals: 256, maxLevel: 0, minX: 0, minZ: 0, spacing });
        assert.equal(landscapeQueryRadiusLimit(manifest), expected);
    }
    const { manifest } = createLandscapeModelFixture({ chunkIntervals: 4, maxLevel: 2, minX: 0, minZ: 0, spacing: 1 }), limit = landscapeQueryRadiusLimit(manifest);
    assert.equal(limit, 2);
    let below = 0, at = 0, tangent = 0;
    for (let x = limit; x <= 16 - limit; x += 0.25) for (let z = limit; z <= 16 - limit; z += 0.25) {
        const plan = planLandscapeRegion(manifest, { type: 'circle', center: { x, z }, radius: limit - 0.25 });
        assert.equal(plan.status, 'ready'); assert.ok(plan.chunkIds.length <= 4, `${x},${z}: ${plan.chunkIds.length} chunks below the limit`); below++;
        // at the limit the circle's box spans exactly one chunk width: from an interior chunk centre line (x or z = 6, 10) it touches that axis's
        // neighbours tangentially; the touch point falls into two chunks when the other coordinate is a centre line (5 chunks) or a chunk
        // boundary (4, 8, 12: 6 chunks); every other centre stays within four
        const centred = value => (value - limit) % (2 * limit) === 0 && value > limit && value < 16 - limit, boundary = value => value % (2 * limit) === 0 && value > 0 && value < 16;
        const refused = (centred(x) && (centred(z) || boundary(z))) || (centred(z) && (centred(x) || boundary(x)));
        if (!refused) { const exact = planLandscapeRegion(manifest, { type: 'circle', center: { x, z }, radius: limit }); assert.ok(exact.chunkIds.length <= 4, `${x},${z}: ${exact.chunkIds.length} chunks at the limit`); at++; }
        else { assert.throws(() => planLandscapeRegion(manifest, { type: 'circle', center: { x, z }, radius: limit }), /needs [56] native chunks; D2 limit is 4/); tangent++; }
    }
    assert.ok(below > 2000 && at > 2000 && tangent === 16, `${below} / ${at} / ${tangent}`);
    // above the limit the circle crosses a third column and row from a chunk centre (admitted elsewhere: from (5, 5) it still spans two columns)
    assert.throws(() => planLandscapeRegion(manifest, { type: 'circle', center: { x: 6, z: 6 }, radius: limit + 0.01 }), /needs 5 native chunks; D2 limit is 4/);
    assert.equal(planLandscapeRegion(manifest, { type: 'circle', center: { x: 5, z: 5 }, radius: limit + 0.01 }).chunkIds.length, 4);
    assert.throws(() => landscapeQueryRadiusLimit({ grid: { spacingX: 1, spacingZ: 1, chunkIntervals: 1024 } }), /four native chunks must fit/);
});

// the fixture's owner chunk of a native column/row (the east/south chunk at shared borders, the last chunk at the maximum edges)
function ownerOf(manifest, column, row) {
    const count = 2 ** manifest.grid.maxLevel, intervals = manifest.grid.chunkIntervals;
    return `l${manifest.grid.maxLevel}/c${Math.min(count - 1, Math.floor(column / intervals))}/r${Math.min(count - 1, Math.floor(row / intervals))}`;
}

test('Sampling: sampleLandscapeChunk is bit-exact at native vertices and at dyadic cell positions on 1025² and 2049² grids, including real 257² tiles', () => {
    const grids = [
        { label: '1025² with 33² tiles', chunkIntervals: 32, maxLevel: 5, spacing: 0.9765625 },
        { label: '2049² with 65² tiles', chunkIntervals: 64, maxLevel: 5, spacing: 0.48828125 },
        { label: '1025² with 257² tiles', chunkIntervals: 256, maxLevel: 2, spacing: 0.9765625 }
    ];
    for (const { label, chunkIntervals, maxLevel, spacing } of grids) {
        const columns = chunkIntervals * 2 ** maxLevel + 1;
        const fixture = createLandscapeModelFixture({ chunkIntervals, maxLevel, minX: 0, minZ: 0, spacing, heightAt: (c, r) => Math.fround(Math.sin(c * 0.013) * 9 + Math.cos(r * 0.011) * 7 + ((c * 7 + r * 13) % 17) * 0.05), coverAt: (c, r) => (c + r) % 8 });
        assert.equal(fixture.manifest.grid.columns, columns);
        const { manifest, sourceHeights } = fixture, next = random(1234 + columns), source = (c, r) => sourceHeights[r * columns + c];
        for (let i = 0; i < 1000; i++) {
            const c = Math.floor(next() * columns), r = Math.floor(next() * columns), chunk = fixture.decoded.get(ownerOf(manifest, c, r));
            const sample = sampleLandscapeChunk(manifest, chunk, c * spacing, (columns - 1) * spacing - r * spacing);
            assert.equal(sample.status, 'ready'); assert.equal(sample.accuracy, 'authoritative');
            assert.ok(Object.is(sample.height, source(c, r)), `${label} vertex ${c},${r}`);
            assert.equal(sample.landCoverId, fixture.sourceCover[r * columns + c]);
        }
        // cell centers (u = v = 0.5: the NW-SE diagonal, owned by the first triangle) and dyadic eighths inside both triangles
        let centers = 0, eighths = 0;
        for (let i = 0; i < 1000; i++) {
            const c = Math.floor(next() * (columns - 1)), r = Math.floor(next() * (columns - 1)), chunk = fixture.decoded.get(ownerOf(manifest, c, r));
            const a = source(c, r), b = source(c + 1, r), sw = source(c, r + 1), d = source(c + 1, r + 1);
            const u = i % 2 ? 0.5 : (1 + Math.floor(next() * 7)) / 8, v = i % 2 ? 0.5 : (1 + Math.floor(next() * 7)) / 8;
            const expected = u >= v ? a + (b - a) * u + (d - b) * v : a + (d - sw) * u + (sw - a) * v;
            const sample = sampleLandscapeChunk(manifest, chunk, (c + u) * spacing, (columns - 1) * spacing - (r + v) * spacing);
            assert.ok(Object.is(sample.height, expected), `${label} cell ${c},${r} at ${u},${v}: ${sample.height} vs ${expected}`);
            if (u === 0.5 && v === 0.5) centers++; else eighths++;
        }
        assert.ok(centers >= 400 && eighths >= 400);
    }
});

// geology layers that satisfy the height invariant (the sidecar size depends on the page count, not on the values)
function geologyLayers(heights) {
    const layers = Object.fromEntries(LANDSCAPE_GEOLOGY_LAYERS.map(name => [name, LANDSCAPE_SYNTHESIS_LAYERS[name].type === 'uint8' ? new Uint8Array(heights.length) : new Float32Array(heights.length)]));
    for (let i = 0; i < heights.length; i++) { layers.bedrock[i] = heights[i]; layers.coastalZone[i] = heights[i] < 0 ? 1 : 0; layers.drainage[i] = heights[i] < 0 ? 5 : 0; }
    return layers;
}

test('Deeper trees: a 341-node landscape keeps its manifest under 1 MiB while its sidecars outgrow the former 256 KiB; a 1365-node manifest exceeds 1 MiB and every bounded reader refuses it', async () => {
    assert.equal(LANDSCAPE_TERRAIN_FIELDS_LIMIT, 1024 * 1024); assert.equal(LANDSCAPE_GEOLOGY_LIMIT, 1024 * 1024);
    assert.equal(LANDSCAPE_TERRAIN_FIELD_RUNTIME.manifestDecodeBytes, 3 * 1024 * 1024); assert.equal(LANDSCAPE_NATURAL_INFERENCE.manifestDecodeBytes, 3 * 1024 * 1024);
    // 341 nodes with 4-interval chunks (65² grid, 250 m chunk spans like the 4097² city): the real writers produce the documents
    const parent = await mkdtemp(path.join(artifacts, 'deep-')), directory = path.join(parent, 'l4'), columns = 4 * 16 + 1, spacing = 62.5;
    const grid = { columns, rows: columns, spacingX: spacing, spacingZ: spacing, minX: 0, maxZ: 4000 }, heights = new Float32Array(columns * columns), cover = new Uint8Array(columns * columns);
    for (let r = 0; r < columns; r++) for (let c = 0; c < columns; c++) { const i = r * columns + c; heights[i] = Math.fround(-30 + c * 0.9 + 11 * Math.sin(r / 5.3) * Math.cos(c / 4.1)); cover[i] = heights[i] < 0 ? 0 : (c + r) % 6 === 0 ? 5 : 3; }
    const written = await writeSynthesizedLandscape({ sourceDirectory: null, outputDirectory: directory, grid, heights, cover, id: 'coastal-city', name: 'Deep tree size test', revisionLabel: 'size-v1',
        provenance: { sourceName: 'size test' }, synthesis: { recipeId: 'ai596-relief-b-raised-80', identity: IDENTITY, recipeSha256: sha256('recipe'), sourceSpacingMeters: spacing },
        references: 'none', appearance: 'none', fields: 'none', chunkIntervals: 4, maxLevel: 4, seaLevel: 0 });
    const saved = await readLandscapeFileManifest(directory);
    assert.equal(saved.manifest.chunks.length, 341); assert.equal(written.hierarchy.builds[0].sourceChunkReads, 2304);
    assert.ok(saved.bytes.length < LANDSCAPE_MANIFEST_BYTE_LIMIT / 2, `341-node manifest ${saved.bytes.length} bytes`);
    const fields = await prepareTerrainFields({ directory, outputDirectory: path.join(parent, 'fields'), source: saved, recipeFile: path.join(root, 'tools/bake_landscape/terrain_fields/recipe-v1.json'), verifyDeterminism: false });
    const filled = clone(fields.value), sample = fields.value.pages.find(page => page.naturalSoil).naturalSoil;
    for (const page of filled.pages) if (!page.naturalSoil) page.naturalSoil = { ...sample };
    const everyPageWithSoil = Buffer.byteLength(JSON.stringify(filled, null, 2) + '\n');
    assert.equal(fields.value.pages.length, 341);
    assert.ok(fields.report.sidecarBytes > 0.9 * 256 * 1024 && everyPageWithSoil > 256 * 1024 && everyPageWithSoil <= LANDSCAPE_TERRAIN_FIELDS_LIMIT, `fields ${fields.report.sidecarBytes} / ${everyPageWithSoil} bytes`);
    const geology = await prepareLandscapeGeology({ directory, outputDirectory: path.join(parent, 'geology'), source: saved, layers: geologyLayers(heights), grid, heights, provenance: { recipeIdentity: IDENTITY, recipeSha256: sha256('recipe') }, verifyDeterminism: false });
    assert.equal(geology.value.pages.length, 341);
    assert.ok(geology.report.sidecarBytes > 256 * 1024 && geology.report.sidecarBytes <= LANDSCAPE_GEOLOGY_LIMIT, `geology ${geology.report.sidecarBytes} bytes`);
    // 1365 nodes (in memory, with content-addressed URLs and synthesis revisions of the real length): the manifest alone exceeds 1 MiB
    const deep = createLandscapeModelFixture({ chunkIntervals: 2, maxLevel: 5, minX: 0, minZ: 0, spacing: 62.5, heightAt: (c, r) => Math.fround(Math.sin(c * 0.37) * 3 + Math.cos(r * 0.29) * 2) });
    const manifest = clone(deep.manifest), n = 3, size = manifest.grid.columns;
    for (let level = 1; level < 5; level++) for (let row = 0; row < 2 ** level; row++) for (let column = 0; column < 2 ** level; column++) {
        const sampleStride = 2 ** (5 - level), startColumn = column * 2 * sampleStride, startRow = row * 2 * sampleStride, values = new Float32Array(n * n), labels = new Uint8Array(n * n);
        let minHeight = Infinity, maxHeight = -Infinity;
        for (let r = 0; r <= 2 * sampleStride; r++) for (let c = 0; c <= 2 * sampleStride; c++) {
            const index = (startRow + r) * size + startColumn + c, value = deep.sourceHeights[index];
            minHeight = Math.min(minHeight, value); maxHeight = Math.max(maxHeight, value);
            if (r % sampleStride === 0 && c % sampleStride === 0) { values[r / sampleStride * n + c / sampleStride] = value; labels[r / sampleStride * n + c / sampleStride] = deep.sourceCover[index]; }
        }
        const channel = (array, encoding, extension) => { const bytes = encodeLandscapeChannel(array, encoding), hash = sha256(bytes); return { url: `payloads/${hash}.${extension}`, encoding, byteLength: bytes.length, decodedByteLength: bytes.length, sha256: hash, revision: `hierarchy-${hash.slice(0, 24)}` }; };
        manifest.chunks.push({ id: `l${level}/c${column}/r${row}`, level, column, row, startColumn, startRow, sampleStride, columns: n, rows: n,
            bounds: { minX: startColumn * 62.5, maxX: (startColumn + 2 * sampleStride) * 62.5, minZ: manifest.bounds.maxZ - (startRow + 2 * sampleStride) * 62.5, maxZ: manifest.bounds.maxZ - startRow * 62.5 },
            minHeight, maxHeight, geometricError: (maxHeight - minHeight) * 0.123456789, revision: `hierarchy-${sha256(`${level}/${column}/${row}`).slice(0, 24)}`, parentId: null, channels: { height: channel(values, 'float32-le', 'f32le'), landCover: channel(labels, 'uint8', 'u8') } });
    }
    for (const descriptor of manifest.chunks) {
        descriptor.parentId = descriptor.level ? `l${descriptor.level - 1}/c${Math.floor(descriptor.column / 2)}/r${Math.floor(descriptor.row / 2)}` : null;
        if (descriptor.level === 0 || descriptor.level === 5) for (const [name, extension] of [['height', 'f32le'], ['landCover', 'u8']]) {
            const channel = descriptor.channels[name];
            descriptor.channels[name] = { ...channel, url: `payloads/${channel.sha256}.${extension}`, revision: `synthesis-${channel.sha256.slice(0, 24)}` };
        }
        if (descriptor.level === 5) descriptor.revision = `synthesis-${descriptor.channels.height.sha256.slice(0, 24)}`;
    }
    manifest.capabilities.push('chunk-hierarchy-v1'); manifest.hierarchy = { algorithm: 'native-hierarchy-v1', errorPolicy: 'measured-native-vertices' };
    const validated = validateLandscapeManifest(manifest), bytes = Buffer.from(JSON.stringify(validated, null, 2) + '\n');
    assert.equal(validated.chunks.length, 1365);
    assert.ok(bytes.length > LANDSCAPE_MANIFEST_BYTE_LIMIT, `1365-node manifest ${bytes.length} bytes`);
    await assert.rejects(loadLandscapeManifest('https://example.test/deep/manifest.json', { fetchImpl: async () => new Response(bytes, { status: 200 }) }), /exceeds/);
    await writeFile(path.join(parent, 'deep-manifest.json'), bytes);
    await assert.rejects(readLandscapeFileManifest(parent, 'deep-manifest.json'), /exceeds 1048576-byte admission limit/);
});
