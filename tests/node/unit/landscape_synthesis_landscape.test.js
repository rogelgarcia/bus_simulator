// Verifies that a synthesized grid becomes a valid, re-readable, byte-reproducible saved landscape directory with copied references.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { createLandscapeManifest, validateLandscapeManifest } from '../../../src/app/landscape/index.js';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { writeSynthesizedLandscape } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisLandscape.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifacts = path.join(root, 'tests/artifacts/node/landscape_synthesis');
await mkdir(artifacts, { recursive: true });
const CHUNK_INTERVALS = 16, MAX_LEVEL = 2, COLUMNS = CHUNK_INTERVALS * 2 ** MAX_LEVEL + 1;

async function sourceLandscape(parent) {
    const fixture = createLandscapeModelFixture({ chunkIntervals: CHUNK_INTERVALS, maxLevel: MAX_LEVEL, minX: 0, minZ: 0, spacing: 2 }), directory = path.join(parent, 'source');
    const planning = Buffer.from(JSON.stringify([{ id: 1, name: 'Plateau', target_elevation_m: 4, typical_design_band_m: '3–5 m', boundary_xz_m: [[10, 10], [100, 10], [100, 100], [10, 100]] }]));
    const notes = Buffer.from('reference notes\n');
    const references = [
        { id: 'districts', role: 'planning-districts', url: 'source/plan/districts.json', sha256: createHash('sha256').update(planning).digest('hex'), byteLength: planning.length, encoding: 'json' },
        { id: 'notes', role: 'provenance', url: 'source/plan/README.txt', sha256: createHash('sha256').update(notes).digest('hex'), byteLength: notes.length, encoding: 'utf8' }];
    const manifest = createLandscapeManifest({ id: fixture.manifest.id, name: fixture.manifest.name, revision: fixture.manifest.revision, bounds: fixture.manifest.bounds, grid: fixture.manifest.grid, chunks: fixture.manifest.chunks, provenance: fixture.manifest.provenance, references });
    for (const [url, bytes] of fixture.resources) {
        if (url === 'manifest.json') continue;
        const file = path.join(directory, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
    }
    await mkdir(path.join(directory, 'source/plan'), { recursive: true });
    await writeFile(path.join(directory, 'source/plan/districts.json'), planning); await writeFile(path.join(directory, 'source/plan/README.txt'), notes);
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return { directory, manifest };
}

function synthesizedGrid() {
    const grid = { columns: COLUMNS, rows: COLUMNS, spacingX: 2, spacingZ: 2, minX: 0, maxZ: (COLUMNS - 1) * 2 };
    const heights = new Float32Array(COLUMNS * COLUMNS), cover = new Uint8Array(COLUMNS * COLUMNS);
    for (let row = 0; row < COLUMNS; row++) for (let column = 0; column < COLUMNS; column++) {
        const x = column * 2, z = grid.maxZ - row * 2, i = row * COLUMNS + column;
        heights[i] = Math.fround(x < 20 ? -3 + x * .1 : Math.sin(x / 11) * 2 + Math.cos(z / 7) * 1.5 + (x - 20) * .05);
        cover[i] = heights[i] < 0 ? 0 : x < 40 ? 1 : (row + column) % 9 === 0 ? 6 : 3;
    }
    return { grid, heights, cover };
}

const write = (source, outputDirectory, grid, extra = {}) => writeSynthesizedLandscape({ sourceDirectory: source.directory, outputDirectory, grid: grid.grid, heights: grid.heights, cover: grid.cover,
    id: 'coastal-city', name: 'Synthesis test landscape', revisionLabel: 'test-v1', provenance: { sourceName: 'synthesis-test', recipe: { id: 'fixture', identity: 'synthesis-000000000000000000000000' } },
    references: 'copy-planning', appearance: 'none', fields: 'none', ...extra });

test('Synthesis landscape: a dyadic grid becomes a complete hierarchy that reads back bit for bit with planning references copied', async () => {
    const parent = await mkdtemp(path.join(artifacts, 'write-')), source = await sourceLandscape(parent), grid = synthesizedGrid();
    const result = await write(source, path.join(parent, 'variant'), grid);
    assert.match(result.revision, /^synthesis-[a-f0-9]{24}$/); assert.match(result.contentRevision, /^synthesis-[a-f0-9]{24}$/); assert.notEqual(result.revision, result.contentRevision);
    const { bytes, manifest } = await readLandscapeFileManifest(result.directory);
    assert.equal(manifest.revision, result.revision); assert.equal(manifest.id, 'coastal-city'); assert.equal(manifest.chunks.length, 1 + 4 + 16);
    assert.ok(manifest.capabilities.includes('chunk-hierarchy-v1')); assert.equal(manifest.provenance.preparation.algorithm, 'landscape-synthesis-v1'); assert.equal(manifest.provenance.preparation.revisionLabel, 'test-v1');
    assert.equal(manifest.provenance.sourceSha256.length, 64); assert.equal(manifest.provenance.nativeResolutionMeters, 2); assert.equal(manifest.provenance.recipe.id, 'fixture');
    assert.deepEqual(manifest.references.map(reference => reference.id), ['districts']);
    assert.ok((await readFile(path.join(result.directory, 'source/plan/districts.json'))).length === source.manifest.references[0].byteLength);
    const snapshot = await readFile(path.join(result.directory, `manifest.${createHash('sha256').update(bytes).digest('hex')}.json`));
    assert.ok(snapshot.equals(bytes));
    for (const descriptor of manifest.chunks) {
        const chunk = await readLandscapeFileChunk(result.directory, manifest, descriptor.id);
        for (let r = 0; r < descriptor.rows; r++) for (let c = 0; c < descriptor.columns; c++) {
            const index = (descriptor.startRow + r * descriptor.sampleStride) * COLUMNS + descriptor.startColumn + c * descriptor.sampleStride;
            assert.ok(Object.is(chunk.heights[r * descriptor.columns + c], grid.heights[index]), `${descriptor.id} height ${c},${r}`);
            assert.equal(chunk.landCover[r * descriptor.columns + c], grid.cover[index]);
        }
        if (descriptor.level === MAX_LEVEL) assert.equal(descriptor.revision, result.contentRevision);
    }
    const overview = manifest.chunks.find(chunk => chunk.id === 'l0/c0/r0');
    assert.equal(overview.revision, result.contentRevision, 'the hierarchy keeps the identical overview descriptor');
    assert.ok(overview.geometricError > 0);
    assert.ok(!(await readdir(result.directory)).includes('.synthesis-stage'));
    assert.ok(!(await readdir(result.directory)).includes('authoring.lock'));
});

test('Synthesis landscape: repeated writes are byte-identical and a second write into the same directory is accepted', async () => {
    const parent = await mkdtemp(path.join(artifacts, 'repeat-')), source = await sourceLandscape(parent), grid = synthesizedGrid();
    const first = await write(source, path.join(parent, 'a'), grid), second = await write(source, path.join(parent, 'b'), grid);
    assert.equal(first.revision, second.revision); assert.equal(first.manifestSha256, second.manifestSha256);
    assert.ok((await readFile(path.join(first.directory, 'manifest.json'))).equals(await readFile(path.join(second.directory, 'manifest.json'))));
    const payloads = async directory => (await readdir(path.join(directory, 'payloads'))).sort();
    assert.deepEqual(await payloads(first.directory), await payloads(second.directory));
    for (const name of await payloads(first.directory)) assert.ok((await readFile(path.join(first.directory, 'payloads', name))).equals(await readFile(path.join(second.directory, 'payloads', name))));
    const again = await write(source, path.join(parent, 'a'), grid);
    assert.equal(again.revision, first.revision);
    const relabeled = await write(source, path.join(parent, 'c'), grid, { revisionLabel: 'test-v2' });
    assert.notEqual(relabeled.revision, first.revision); assert.notEqual(relabeled.contentRevision, first.contentRevision);
    assert.deepEqual(await payloads(relabeled.directory), await payloads(first.directory), 'payloads are content addressed and unaffected by the label');
});

test('Synthesis landscape: non-dyadic grids, the source directory and the canonical cache are refused before anything is written', async () => {
    const parent = await mkdtemp(path.join(artifacts, 'refuse-')), source = await sourceLandscape(parent), grid = synthesizedGrid();
    await assert.rejects(write(source, path.join(parent, 'bad'), grid, { chunkIntervals: 8 }), /does not match chunkIntervals/);
    await assert.rejects(write(source, source.directory, grid), /must differ from the source/);
    await assert.rejects(write(source, path.join(root, 'assets/public/landscape/coastal-city'), grid), /canonical landscape cache/);
    const wrong = { ...grid, cover: Uint8Array.from(grid.cover) }; wrong.cover[5] = 99;
    await assert.rejects(write(source, path.join(parent, 'bad'), wrong), /outside the land-cover catalog/);
    await assert.rejects(write(source, path.join(parent, 'bad'), grid, { provenance: {} }), /sourceName/);
    assert.throws(() => validateLandscapeManifest({ format: 'landscape' }), /schemaVersion/);
});
