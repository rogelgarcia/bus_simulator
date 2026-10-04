// Verifies multiscale preparation: native 1024 tiers, scale-separated micro pages, schema-1 byte stability, repeatability and publication gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { crc32 } from '../../../tools/bake_landscape/CoastalArchive.mjs';
import { prepareLandscapeAppearance, publishLandscapeAppearance, validateAppearanceCandidate } from '../../../tools/bake_landscape/AppearancePreparation.mjs';
import { appearanceJob } from '../../../tools/bake_landscape/AppearanceJob.mjs';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';
import { authoringHash } from '../../../tools/landscape_authoring/AuthoringFiles.mjs';
import { decodeLandscapeAppearanceMicroTexel, validateLandscapeAppearanceMultiscale } from '../../../src/app/landscape/index.js';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai577/d4/preparation-tests');
await mkdir(evidence, { recursive: true });
const config = JSON.parse(await readFile(path.join(root, 'tools/baking/blender.local.json'), 'utf8'));
const SIZE = 1024, TAU = 2 * Math.PI;
const srgbByte = linear => Math.round(255 * (linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055));

function chunk(type, data) {
    const name = Buffer.from(type), length = Buffer.alloc(4), check = Buffer.alloc(4);
    length.writeUInt32BE(data.length); check.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, check]);
}
function png(size, channels, bitDepth, write) {
    const bytes = channels * bitDepth / 8, stride = size * bytes + 1, raw = Buffer.alloc(size * stride), header = Buffer.alloc(13);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) write(raw, y * stride + 1 + x * bytes, x, y);
    header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = bitDepth; header[9] = channels === 3 ? 2 : 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}
const rgb = (size, pixel) => png(size, 3, 8, (raw, offset, x, y) => { const [r, g, b] = pixel(x, y); raw[offset] = r; raw[offset + 1] = g; raw[offset + 2] = b; });
const gray16 = (size, value) => png(size, 1, 16, (raw, offset, x, y) => raw.writeUInt16BE(value(x, y), offset));
const normalBytes = (sx, sy) => { const length = Math.hypot(sx, sy, 1); return [-sx / length, -sy / length, 1 / length].map(n => Math.round((n * .5 + .5) * 255)); };

// micro source: luminance detail along x plus a broad drift, slope detail along y plus a broad tilt, height detail along x plus a broad bulge along y
const microSlope = y => .25 * Math.sin(TAU * y / 16) + .3 * Math.sin(TAU * y / SIZE);
const MICRO = {
    'basecolor.png': rgb(SIZE, x => { const v = srgbByte(.35 * (1 + .3 * Math.sin(TAU * x / 16)) * (1 + .2 * Math.cos(TAU * x / SIZE))); return [v, v, v]; }),
    'normal_gl.png': rgb(SIZE, (x, y) => normalBytes(0, microSlope(y))),
    'displacement.png': gray16(SIZE, (x, y) => Math.round(32768 + 8000 * Math.sin(TAU * x / 32) + 20000 * Math.cos(TAU * y / SIZE)))
};

const baseImages = new Map();
function materialImages(size) {
    if (!baseImages.has(size)) baseImages.set(size, {
        'base.png': rgb(size, (x, y) => [(x * 7 + y * 13) & 255, (x ^ y) & 255, 64 + ((x >> 4) & 127)]),
        'normal.png': rgb(size, (x, y) => normalBytes(.2 * Math.sin(TAU * x / 64), .15 * Math.cos(TAU * y / 32))),
        'orm.png': rgb(size, (x, y) => [200 + (y & 31), 96 + (x & 127), 0]),
        'height.png': gray16(size, (x, y) => 20000 + ((x * 37 + y * 11) % 4096) * 6)
    });
    return baseImages.get(size);
}

async function writeMaterial(sourceRoot, slug, size, { landscape, displacement = true } = {}) {
    const folder = path.join(sourceRoot, slug), materialId = `pbr.${slug}`;
    await mkdir(folder, { recursive: true });
    const mapFiles = { baseColor: 'base.png', normal: 'normal.png', orm: 'orm.png', ...(displacement ? { displacement: 'height.png' } : {}) };
    await writeFile(path.join(folder, 'pbr.material.config.js'), `export default Object.freeze(${JSON.stringify({ materialId, tileMeters: 4, mapFiles })});\n`);
    await writeFile(path.join(folder, 'pbr.material.correction.config.js'), `export default Object.freeze(${JSON.stringify({ materialId,
        presets: { aces: { adjustments: { normal: { strength: 1 }, roughness: { normalizeInputPercentiles: [5, 95] } } } } })});\n`);
    if (landscape) await writeFile(path.join(folder, 'pbr.landscape.config.json'), JSON.stringify({ format: 'landscape-material-preparation', schemaVersion: 1, materialId, ...landscape }));
    for (const file of Object.values(mapFiles)) await writeFile(path.join(folder, file), materialImages(size)[file]);
    return materialId;
}

async function writeMicro(sourceRoot, { license = 'CC0-1.0', algorithm = 'micro-periodic-highpass-v1' } = {}) {
    const folder = path.join(sourceRoot, 'fixture_micro'), materialId = 'pbr.fixture_micro';
    await mkdir(folder, { recursive: true });
    for (const [file, bytes] of Object.entries(MICRO)) await writeFile(path.join(folder, file), bytes);
    await writeFile(path.join(folder, 'pbr.material.config.js'), `export default Object.freeze(${JSON.stringify({ materialId, tileMeters: 2,
        mapFiles: { baseColor: 'basecolor.png', normal: 'normal_gl.png', displacement: 'displacement.png' }, source: { license, files: [] } })});\n`);
    await writeFile(path.join(folder, 'pbr.landscape.config.json'), JSON.stringify({ format: 'landscape-material-preparation', schemaVersion: 1, materialId,
        micro: { algorithm, encoding: 'micro-normal-height-luminance-v1', radiusPixels: 9, luminanceRangePercentiles: [.1, 99.9] } }));
    return materialId;
}

async function createFixture(label, size = SIZE) {
    const parent = await mkdtemp(path.join(evidence, `${label}-`)), fixture = createLandscapeModelFixture();
    const directory = path.join(parent, 'terrain'), sourceRoot = path.join(parent, 'source-pbr');
    await mkdir(directory); await mkdir(sourceRoot);
    const plain = await writeMaterial(sourceRoot, 'fixture_plain', size);
    const uniform = await writeMaterial(sourceRoot, 'fixture_uniform', size, { landscape: { baseColor: { algorithm: 'periodic-log-microdetail-v1', radiusPixels: 16 } } });
    const flat = await writeMaterial(sourceRoot, 'fixture_flat', size, { displacement: false });
    const bindings = { unknown: uniform, seabed: plain, sand: plain, loam: uniform, forest: flat, rock: uniform };
    const manifest = structuredClone(fixture.manifest);
    manifest.soil.catalog.forEach(soil => { soil.materialId = bindings[soil.id]; });
    await writeFile(path.join(sourceRoot, '_catalog_index.js'), [plain, uniform, flat].map((id, i) => `import material${i} from './${id.slice(4)}/pbr.material.config.js';`).join('\n'));
    const terrainBytes = Buffer.from(JSON.stringify(manifest)); await writeFile(path.join(directory, 'manifest.json'), terrainBytes);
    const request = path.join(parent, 'multiscale.json');
    await writeFile(request, JSON.stringify({ format: 'landscape-appearance-multiscale-request', schemaVersion: 1, landscapeId: manifest.id, extraTiers: [1024],
        micro: [{ materialId: await writeMicro(sourceRoot), soilIds: ['seabed', 'sand'] }] }));
    let stages = 0;
    const prepare = async options => {
        const stage = path.join(parent, `stage-${stages++}`); await mkdir(stage);
        return prepareLandscapeAppearance({ id: 'landscape/appearance', root, stage, config, processCount: 0, log: { line() {} }, signal: new AbortController().signal }, { directory, sourceRoot, ...options });
    };
    return { parent, directory, sourceRoot, manifest, terrainBytes, request, prepare };
}

const pageFile = (prepared, page) => readFile(path.join(prepared.outputDirectory, page.url));
// 1024-pixel fixtures are large: a passing test removes them, a failing one keeps them for diagnosis
const release = (...fixtures) => Promise.all(fixtures.map(fixture => rm(fixture.parent, { recursive: true, force: true })));
const micro = (multiscale, soilId) => multiscale.materials.find(material => material.soilId === soilId).micro;

test('Appearance multiscale preparation: registered option, request and source inputs participate in framework identity', async () => {
    assert.ok(config.pythonExecutable, 'Configure the shared existing Python with Pillow and NumPy before this offline preparation test');
    const plan = planBakes(bakeJobs, 'landscape/appearance');
    const settings = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/appearance:multiscale=tools/bake_landscape/appearance/multiscale-v1.json']));
    assert.equal(settings.get('landscape/appearance').multiscale, 'tools/bake_landscape/appearance/multiscale-v1.json');
    const fixture = await createFixture('inputs');
    const stage = path.join(fixture.parent, 'planned'); await mkdir(stage);
    const inputs = await appearanceJob.inputs({ root, stage, options: { directory: fixture.directory, 'source-root': fixture.sourceRoot, multiscale: fixture.request } });
    assert.ok(inputs.includes(fixture.request));
    for (const file of ['basecolor.png', 'normal_gl.png', 'displacement.png', 'pbr.material.config.js', 'pbr.landscape.config.json']) assert.ok(inputs.includes(path.join(fixture.sourceRoot, 'fixture_micro', file)), file);
    const shipped = JSON.parse(await readFile(path.join(root, 'tools/bake_landscape/appearance/multiscale-v1.json'), 'utf8'));
    assert.deepEqual(shipped.micro, [{ materialId: 'pbr.landscape_sand_micro_v1', soilIds: ['seabed', 'sand'] }]);
    await release(fixture);
});

test('Appearance multiscale preparation: native 1024 tiers and scale-separated micro pages decode exactly as specified', async () => {
    const fixture = await createFixture('decode');
    const schema1 = await fixture.prepare({});
    const prepared = await fixture.prepare({ multiscale: fixture.request });
    assert.deepEqual(await readFile(prepared.manifestFile), await readFile(schema1.manifestFile), 'adding the companion must not change schema-1 bytes');
    assert.equal(schema1.multiscale, undefined);
    const { manifest: appearance, multiscale } = await validateAppearanceCandidate(prepared);
    const sidecar = await validateLandscapeAppearanceMultiscale(JSON.parse(await readFile(prepared.multiscale.file, 'utf8')), appearance);
    assert.equal(sidecar.revision, multiscale.manifest.revision);
    const plain = sidecar.materials.find(material => material.soilId === 'sand'), plain512 = appearance.materials.find(material => material.soilId === 'sand').tiers[2];
    const source = { orm: (x, y) => [200 + (y & 31), 96 + (x & 127), 0], base: (x, y) => [(x * 7 + y * 13) & 255, (x ^ y) & 255, 64 + ((x >> 4) & 127)] };
    const orm1024 = await pageFile(prepared, plain.tiers[0].channels.orm), base1024 = await pageFile(prepared, plain.tiers[0].channels.baseColor);
    let baseError = 0;
    for (let row = 0; row < SIZE; row += 7) for (let column = 0; column < SIZE; column += 5) {
        const y = SIZE - 1 - row, offset = (row * SIZE + column) * 4;
        assert.deepEqual([...orm1024.subarray(offset, offset + 3)], source.orm(column, y), 'linear ORM RGB is the unmodified source, south-first');
        for (let c = 0; c < 3; c++) baseError = Math.max(baseError, Math.abs(base1024[offset + c] - source.base(column, y)[c]));
    }
    assert.ok(baseError <= 1, 'unconditioned sRGB base color round-trips without upsampling or drift');
    const orm512 = await pageFile(prepared, plain512.channels.orm);
    for (let row = 0; row < 512; row += 3) for (let column = 0; column < 512; column += 3) for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (const [dy, dx] of [[0, 0], [0, 1], [1, 0], [1, 1]]) sum += orm1024[((row * 2 + dy) * SIZE + column * 2 + dx) * 4 + c];
        assert.ok(Math.abs(sum / 4 - orm512[(row * 512 + column) * 4 + c]) <= 1, 'the 1024 tier is the same aligned source as the schema-1 512 tier');
    }
    const flat = sidecar.materials.find(material => material.soilId === 'forest').tiers[0].channels.orm;
    assert.ok((await pageFile(prepared, flat)).every((value, index) => index % 4 !== 3 || value === 255), 'materials without declared height keep opaque ORM alpha');
    const detail = micro(sidecar, 'sand');
    assert.deepEqual(detail, micro(sidecar, 'seabed'));
    assert.equal(detail.tileMeters, 2);
    assert.equal(sidecar.materials.filter(material => material.micro).length, 2);
    const page = await pageFile(prepared, detail.tiers[3].channels.micro);
    let luminance = 0, normal = 0, height = 0;
    const rowMeans = new Float64Array(SIZE), columnMeans = new Float64Array(SIZE);
    for (let row = 0; row < SIZE; row++) for (let column = 0; column < SIZE; column++) {
        const offset = (row * SIZE + column) * 4, texel = decodeLandscapeAppearanceMicroTexel(page[offset], page[offset + 1], page[offset + 2], page[offset + 3], detail.luminanceRange);
        const y = SIZE - 1 - row, slope = .25 * Math.sin(TAU * y / 16);
        luminance = Math.max(luminance, Math.abs(texel.luminanceRatio - (1 + .3 * Math.sin(TAU * column / 16))));
        normal = Math.max(normal, Math.abs(texel.normal[1] + slope / Math.hypot(slope, 1)), Math.abs(texel.normal[0]));
        height = Math.max(height, Math.abs(texel.height - (.5 + .45 * Math.sin(TAU * column / 32) / Math.sin(TAU * 8 / 32))));
        rowMeans[row] += texel.luminanceRatio / SIZE; columnMeans[column] += texel.height / SIZE;
    }
    assert.ok(luminance < .02, `luminance modulation keeps fine detail and drops the broad drift (worst ${luminance})`);
    assert.ok(normal < .02, `detail normals keep the 16 px relief, drop the broad tilt and follow the south-first flip (worst ${normal})`);
    assert.ok(height < .02, `relative height keeps the 32 px relief and drops the broad bulge (worst ${height})`);
    assert.ok(Math.max(...rowMeans) - Math.min(...rowMeans) < .005, 'no broad luminance drift remains along rows');
    const coarse = await pageFile(prepared, detail.tiers[0].channels.micro);
    assert.equal(coarse.length, 32 * 32 * 4);
    for (let i = 0; i < coarse.length; i += 4) for (const c of [0, 1, 3]) assert.ok(Math.abs(coarse[i + c] - 127.5) <= 2.5, 'fine detail averages to neutral at the coarsest tier');
    const report = prepared.report.multiscale;
    assert.equal(report.tiers['base-1024'].logicalPages, 18);
    const urls = new Set(sidecar.materials.flatMap(material => Object.values(material.tiers[0].channels).map(entry => entry.url)));
    assert.equal(report.tiers['base-1024'].uniquePages, urls.size);
    assert.equal(urls.size, 5, 'identical channel bytes (shared normal map, shared unconditioned color, shared relief) share one content-addressed page');
    assert.deepEqual(Object.keys(report.tiers).filter(key => key.startsWith('micro')), ['micro-32', 'micro-128', 'micro-512', 'micro-1024']);
    assert.ok(report.measurements.microTracedPeakBytes < 96 * 1024 * 1024 && report.measurements.baseTracedPeakBytes < 96 * 1024 * 1024);
    await release(fixture);
});

test('Appearance multiscale preparation: repeated inputs are byte-identical and invalid requests or sources fail before publication', async () => {
    const fixture = await createFixture('repeat');
    const first = await fixture.prepare({ multiscale: fixture.request }), second = await fixture.prepare({ multiscale: fixture.request });
    assert.deepEqual(await readFile(second.multiscale.file), await readFile(first.multiscale.file));
    assert.deepEqual(await readFile(second.manifestFile), await readFile(first.manifestFile));
    const pages = async prepared => (await readdir(path.join(prepared.outputDirectory, 'pages'))).sort();
    assert.deepEqual(await pages(second), await pages(first));
    const request = JSON.parse(await readFile(fixture.request, 'utf8'));
    const invalid = {
        landscape: { ...request, landscapeId: 'other' }, tiers: { ...request, extraTiers: [2048] }, soil: { ...request, micro: [{ ...request.micro[0], soilIds: ['dunes'] }] },
        duplicate: { ...request, micro: [{ ...request.micro[0], soilIds: ['sand', 'sand'] }] }, field: { ...request, compress: 'bc7' }
    };
    for (const [label, value] of Object.entries(invalid)) {
        const file = path.join(fixture.parent, `request-${label}.json`); await writeFile(file, JSON.stringify(value));
        await assert.rejects(fixture.prepare({ multiscale: file }), /multiscale/, label);
    }
    const unlicensed = await createFixture('unlicensed');
    await writeMicro(unlicensed.sourceRoot, { license: 'proprietary' });
    await assert.rejects(unlicensed.prepare({ multiscale: unlicensed.request }), /CC0/);
    const small = await createFixture('upsampling', 512);
    await assert.rejects(small.prepare({ multiscale: small.request }), /upsampling is not allowed/);
    assert.ok(await small.prepare({}), 'the same 512 sources remain valid for schema-1 tiers');
    await release(fixture, unlicensed, small);
});

test('Appearance multiscale preparation: publication installs immutable pages and switches the companion after its appearance, never orphaning it', async () => {
    const fixture = await createFixture('publish'), metadata = path.join(fixture.parent, 'published-pbr'), destination = path.join(fixture.directory, 'appearance');
    const prepared = await fixture.prepare({ multiscale: fixture.request });
    const corrupt = await fixture.prepare({ multiscale: fixture.request });
    const sidecar = JSON.parse(await readFile(corrupt.multiscale.file, 'utf8')), page = micro(sidecar, 'sand').tiers[2].channels.micro;
    const corruptFile = path.join(corrupt.outputDirectory, page.url), bytes = await readFile(corruptFile); bytes[1] ^= 1; await writeFile(corruptFile, bytes);
    await assert.rejects(publishLandscapeAppearance(corrupt, metadata), /multiscale page integrity mismatch/);
    await assert.rejects(readFile(path.join(destination, 'manifest.json')), { code: 'ENOENT' }, 'a corrupt companion page stops publication before any switch');
    await publishLandscapeAppearance(prepared, metadata);
    const published = await readFile(path.join(destination, 'multiscale.json'));
    assert.deepEqual(published, await readFile(prepared.multiscale.file));
    assert.deepEqual(await readFile(path.join(destination, `multiscale.${authoringHash(published)}.json`)), published);
    assert.deepEqual(await readFile(path.join(destination, 'manifest.json')), await readFile(prepared.manifestFile));
    assert.deepEqual(await readFile(path.join(fixture.directory, 'manifest.json')), fixture.terrainBytes, 'companion publication never edits terrain');
    for (const file of ['pbr.material.config.js', 'pbr.landscape.config.json']) assert.deepEqual(await readFile(path.join(metadata, 'fixture_micro', file)), await readFile(path.join(fixture.sourceRoot, 'fixture_micro', file)));
    const companion = JSON.parse(published);
    for (const material of companion.materials) for (const tier of [...material.tiers, ...(material.micro?.tiers ?? [])]) for (const entry of Object.values(tier.channels)) {
        assert.equal(authoringHash(await readFile(path.join(destination, entry.url))), entry.sha256);
    }
    await publishLandscapeAppearance(await fixture.prepare({}), metadata);
    assert.deepEqual(await readFile(path.join(destination, 'multiscale.json')), published, 'republishing the same appearance revision keeps its companion');
    const bindingFile = path.join(fixture.parent, 'material-bindings.json');
    const materialIds = Object.fromEntries(fixture.manifest.soil.catalog.map(soil => [soil.id, soil.materialId])); materialIds.rock = materialIds.forest;
    await writeFile(bindingFile, JSON.stringify({ format: 'landscape-material-bindings', schemaVersion: 1, landscapeId: fixture.manifest.id, materialIds }));
    const appearanceBefore = await readFile(path.join(destination, 'manifest.json'));
    await assert.rejects(publishLandscapeAppearance(await fixture.prepare({ materialBindings: bindingFile }), metadata), /would orphan/);
    assert.deepEqual(await readFile(path.join(destination, 'manifest.json')), appearanceBefore);
    assert.deepEqual(await readFile(path.join(fixture.directory, 'manifest.json')), fixture.terrainBytes);
    const rebound = await fixture.prepare({ materialBindings: bindingFile, multiscale: fixture.request });
    await publishLandscapeAppearance(rebound, metadata);
    const current = JSON.parse(await readFile(path.join(destination, 'multiscale.json'), 'utf8'));
    assert.equal(current.appearanceRevision, JSON.parse(await readFile(rebound.manifestFile, 'utf8')).revision);
    assert.deepEqual(await readFile(path.join(destination, `multiscale.${authoringHash(published)}.json`)), published, 'the previous immutable companion snapshot is retained');
    await release(fixture);
});
