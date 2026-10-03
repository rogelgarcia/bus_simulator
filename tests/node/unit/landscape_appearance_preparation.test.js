// Verifies offline appearance publication, deterministic linear-light/vector reduction and metadata-only global catalog reuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, writeFile, unlink } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { crc32 } from '../../../tools/bake_landscape/CoastalArchive.mjs';
import { prepareLandscapeAppearance, publishLandscapeAppearance, validateAppearanceCandidate } from '../../../tools/bake_landscape/AppearancePreparation.mjs';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';
import { landscapeAppearanceBindingKey } from '../../../src/app/landscape/index.js';
import { authoringHash } from '../../../tools/landscape_authoring/AuthoringFiles.mjs';
import { readAppearanceCompatibilitySnapshot } from '../../../tools/bake_landscape/AppearanceCompatibility.mjs';
import { appearanceJob } from '../../../tools/bake_landscape/AppearanceJob.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai576/d4/preparation-tests');
await mkdir(evidence, { recursive: true });

function png(type, data) {
    const name = Buffer.from(type), length = Buffer.alloc(4), check = Buffer.alloc(4);
    length.writeUInt32BE(data.length); check.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, check]);
}
function image(pixel) {
    const size = 512, header = Buffer.alloc(13), raw = Buffer.alloc(size * (size * 3 + 1));
    header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) Buffer.from(pixel(x, y)).copy(raw, y * (size * 3 + 1) + 1 + x * 3);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), png('IHDR', header), png('IDAT', deflateSync(raw)), png('IEND', Buffer.alloc(0))]);
}

function heightImage(pixel) {
    const size = 512, header = Buffer.alloc(13), raw = Buffer.alloc(size * (size * 2 + 1));
    header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 16; header[9] = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) raw.writeUInt16BE(pixel(x, y), y * (size * 2 + 1) + 1 + x * 2);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), png('IHDR', header), png('IDAT', deflateSync(raw)), png('IEND', Buffer.alloc(0))]);
}

test('Appearance registration uses only shared Python configuration and independent scoped input paths', () => {
    const plan = planBakes(bakeJobs, 'landscape/appearance');
    assert.deepEqual(plan.map(job => job.id), ['landscape/appearance']); assert.deepEqual(plan[0].configurationPaths, ['pythonExecutable']);
    const settings = resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/appearance:source-root=existing assets/pbr']));
    assert.equal(settings.get('landscape/appearance')['source-root'], 'existing assets/pbr');
    const filename = `manifest.${'a'.repeat(64)}.json`;
    assert.equal(resolveBakeOptions(plan, parseBakeOptions(['--set', `landscape/appearance:compatibility-snapshot=${filename}`])).get('landscape/appearance')['compatibility-snapshot'], filename);
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/appearance:compatibility-snapshot=../manifest.json'])), /one retained/);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => job.id !== 'landscape/appearance'));
});

test('Appearance preparation is reproducible, color-correct, source-preserving and refuses corrupt publication', async () => {
    const fixture = createLandscapeModelFixture(), parent = await mkdtemp(path.join(evidence, 'fixture-'));
    fixture.manifest = structuredClone(fixture.manifest);
    fixture.manifest.soil.catalog.forEach((soil, i) => { soil.materialId = `pbr.fixture_soil_${i}`; });
    const directory = path.join(parent, 'terrain'), sourceRoot = path.join(parent, 'source-pbr'), metadata = path.join(parent, 'published-pbr');
    await mkdir(directory); await mkdir(sourceRoot);
    const terrainBytes = Buffer.from(JSON.stringify(fixture.manifest)); await writeFile(path.join(directory, 'manifest.json'), terrainBytes);
    const images = { baseColor: image((x, y) => [(x + y) % 2 ? 255 : 0, y < 256 ? 0 : 255, 0]), normal: image(() => [128, 128, 255]), orm: image(() => [255, 128, 0]) };
    const index = [];
    for (const [i, soil] of fixture.manifest.soil.catalog.entries()) {
        const slug = soil.materialId.slice(4), folder = path.join(sourceRoot, slug); await mkdir(folder);
        const config = { materialId: soil.materialId, tileMeters: 4, mapFiles: { baseColor: 'base.png', normal: 'normal.png', orm: 'orm.png' } };
        if (i < 2) config.mapFiles.displacement = 'height.png';
        const calibration = { materialId: soil.materialId, presets: { aces: { adjustments: { normal: { strength: 1 }, roughness: { normalizeInputPercentiles: [5, 95] } } } } };
        await writeFile(path.join(folder, 'pbr.material.config.js'), `export default Object.freeze(${JSON.stringify(config)});\n`);
        await writeFile(path.join(folder, 'pbr.material.correction.config.js'), `export default Object.freeze(${JSON.stringify(calibration)});\n`);
        for (const [name, bytes] of Object.entries(images)) await writeFile(path.join(folder, config.mapFiles[name]), bytes);
        if (i < 2) await writeFile(path.join(folder, 'height.png'), heightImage((x, y) => i === 0 ? 10000 + y * 80 : 32000));
        if (i === 5) {
            await writeFile(path.join(folder, 'base.png'), image((x, y) => {
                const value = Math.round((.6 + .22 * Math.cos(x / 512 * Math.PI * 2)) * ((x + y) % 2 ? 200 : 110));
                return [value, value, value];
            }));
            await writeFile(path.join(folder, 'pbr.landscape.config.json'), JSON.stringify({ format: 'landscape-material-preparation', schemaVersion: 1, materialId: soil.materialId,
                baseColor: { algorithm: 'periodic-log-microdetail-v1', radiusPixels: 16 } }));
        }
        index.push(`import material${i} from './${slug}/pbr.material.config.js';`);
    }
    await writeFile(path.join(sourceRoot, '_catalog_index.js'), index.join('\n'));
    const config = JSON.parse(await readFile(path.join(root, 'tools/baking/blender.local.json'), 'utf8'));
    assert.ok(config.pythonExecutable, 'Configure the shared existing Python with Pillow and NumPy before this offline preparation test');
    const plannedStage = path.join(parent, 'planned-job'); await mkdir(plannedStage);
    const plannedContext = { root, stage: plannedStage, options: { directory, 'source-root': sourceRoot } };
    const plannedInputs = await appearanceJob.inputs(plannedContext);
    assert.ok(!plannedInputs.includes(path.join(directory, 'manifest.json')), 'the framework hashes frozen input bytes, not the intentionally published current pointer');
    assert.ok(plannedInputs.includes(path.join(plannedStage, 'planned-terrain-manifest.json')));
    assert.deepEqual(await readFile(path.join(plannedStage, 'planned-terrain-manifest.json')), terrainBytes);
    await writeFile(path.join(directory, 'manifest.json'), Buffer.concat([terrainBytes, Buffer.from('\n')]));
    await assert.rejects(appearanceJob.run(plannedContext), /changed after appearance planning/);
    await writeFile(path.join(directory, 'manifest.json'), terrainBytes);
    async function prepare(label, materialBindings) {
        const stage = path.join(parent, label); await mkdir(stage);
        return prepareLandscapeAppearance({ id: 'landscape/appearance', root, stage, config, processCount: 0, log: { line() {} }, signal: new AbortController().signal }, { directory, sourceRoot, materialBindings });
    }
    const first = await prepare('first'), candidate = await validateAppearanceCandidate(first);
    assert.equal(candidate.manifest.materials.length, 6);
    const page = candidate.manifest.materials[0].tiers[0].channels.baseColor;
    const color = await readFile(path.join(first.outputDirectory, page.url));
    assert.equal(color[0], 188, 'black/white must average in linear light, not to sRGB 128');
    assert.equal(color[1], 255, 'GPU row zero is south after the one offline image flip');
    assert.equal(color[(31 * 32) * 4 + 1], 0);
    const normal = await readFile(path.join(first.outputDirectory, candidate.manifest.materials[0].tiers[0].channels.normal.url));
    assert.deepEqual([...normal.subarray(0, 4)], [128, 128, 255, 255]);
    const height = await readFile(path.join(first.outputDirectory, candidate.manifest.materials[0].tiers[0].channels.orm.url));
    assert.ok(height[3] > 230 && height[(31 * 32) * 4 + 3] < 25, '16-bit source height must retain relief and the south-first flip instead of saturating to white');
    assert.ok(candidate.manifest.provenance.materialPreparation[0].height.sourceMedian > 255, 'normalization records native 16-bit scalar values');
    const flatHeight = await readFile(path.join(first.outputDirectory, candidate.manifest.materials[1].tiers[0].channels.orm.url));
    assert.ok(flatHeight.every((value, index) => index % 4 !== 3 || value === 128), 'flat source height must be neutral at every texel');
    assert.equal(candidate.manifest.materials[2].height, undefined, 'legacy materials must not claim opaque alpha as height');
    const uniform = await readFile(path.join(first.outputDirectory, candidate.manifest.materials[5].tiers[2].channels.baseColor.url));
    const columnMeans = Array.from({ length: 512 }, (_, x) => Array.from({ length: 512 }, (_, y) => uniform[(y * 512 + x) * 4]).reduce((a, b) => a + b) / 512);
    assert.ok(Math.max(...columnMeans) - Math.min(...columnMeans) < 8, 'periodic conditioning removes the broad source gradient');
    assert.ok(Math.abs(uniform[0] - uniform[4]) > 30, 'fine source detail survives conditioning');
    assert.ok(Math.abs(columnMeans[0] - columnMeans[511]) < 1, 'periodic conditioning does not introduce a tile edge');
    await publishLandscapeAppearance(first, metadata);
    const destination = path.join(directory, 'appearance');
    const currentAlias = path.join(destination, `binding.${await landscapeAppearanceBindingKey(fixture.manifest)}.json`);
    assert.deepEqual(await readFile(currentAlias), await readFile(first.manifestFile));
    const prior = structuredClone(candidate.manifest); prior.materials[2].materialId = 'pbr.previous_sand'; prior.revision = 'appearance-prior';
    const priorBytes = Buffer.from(JSON.stringify(prior));
    await writeFile(path.join(destination, 'manifest.json'), priorBytes);
    await publishLandscapeAppearance(first, metadata);
    assert.deepEqual(await readFile(path.join(destination, `binding.${await landscapeAppearanceBindingKey(prior)}.json`)), priorBytes);
    assert.deepEqual(await readFile(path.join(destination, `manifest.${authoringHash(priorBytes)}.json`)), priorBytes);
    const archived = structuredClone(prior); archived.materials[2].materialId = 'pbr.archived_sand'; archived.revision = 'appearance-archived';
    const archivedBytes = Buffer.from(JSON.stringify(archived)), archivedName = `manifest.${authoringHash(archivedBytes)}.json`;
    await writeFile(path.join(destination, archivedName), archivedBytes);
    assert.ok((await readAppearanceCompatibilitySnapshot(directory, archivedName)).files.length > 1);
    await publishLandscapeAppearance(first, metadata, { compatibilitySnapshot: archivedName });
    assert.deepEqual(await readFile(path.join(destination, `binding.${await landscapeAppearanceBindingKey(archived)}.json`)), archivedBytes);
    await writeFile(path.join(destination, `manifest.${'a'.repeat(64)}.json`), archivedBytes);
    await assert.rejects(publishLandscapeAppearance(first, metadata, { compatibilitySnapshot: `manifest.${'a'.repeat(64)}.json` }), /snapshot SHA-256/);
    assert.deepEqual(await readFile(path.join(destination, 'manifest.json')), await readFile(first.manifestFile));
    assert.deepEqual(await readFile(path.join(directory, 'manifest.json')), terrainBytes, 'appearance publication must not edit terrain');
    assert.deepEqual(await readFile(path.join(metadata, '_catalog_index.js')), await readFile(path.join(sourceRoot, '_catalog_index.js')));
    const repeated = await prepare('repeated'); assert.deepEqual(await readFile(repeated.manifestFile), await readFile(first.manifestFile));
    const bindingFile = path.join(parent, 'material-bindings.json');
    const materialIds = Object.fromEntries(fixture.manifest.soil.catalog.map(soil => [soil.id, soil.materialId]));
    materialIds.unknown = materialIds.rock;
    await writeFile(bindingFile, JSON.stringify({ format: 'landscape-material-bindings', schemaVersion: 1, landscapeId: fixture.manifest.id, materialIds }));
    const rebound = await prepare('rebound', bindingFile), terrainBefore = await readFile(path.join(directory, 'manifest.json'));
    const appearanceBefore = await readFile(path.join(destination, 'manifest.json'));
    const changedTerrain = JSON.parse(rebound.inputManifestBytes.toString('utf8')); changedTerrain.name = 'Unrelated terrain mutation';
    await assert.rejects(validateAppearanceCandidate({ ...rebound, inputManifestBytes: Buffer.from(JSON.stringify(changedTerrain)) }), /non-material landscape/);
    await writeFile(path.join(directory, 'manifest.json'), Buffer.concat([terrainBefore, Buffer.from('\n')]));
    await assert.rejects(publishLandscapeAppearance(rebound, metadata), /changed during appearance preparation/);
    await writeFile(path.join(directory, 'manifest.json'), terrainBefore);
    const collision = path.join(directory, `manifest.${authoringHash(rebound.inputManifestBytes)}.json`);
    await writeFile(collision, 'corrupt immutable snapshot');
    await assert.rejects(publishLandscapeAppearance(rebound, metadata), /Immutable content changed/);
    assert.deepEqual(await readFile(path.join(directory, 'manifest.json')), terrainBefore, 'failed installation must leave current terrain unchanged');
    assert.deepEqual(await readFile(path.join(destination, 'manifest.json')), appearanceBefore, 'immutable installation precedes both current-manifest switches');
    await unlink(collision);
    await publishLandscapeAppearance(rebound, metadata);
    assert.deepEqual(await readFile(path.join(directory, 'manifest.json')), rebound.inputManifestBytes);
    assert.deepEqual(await readFile(path.join(destination, 'manifest.json')), await readFile(rebound.manifestFile));
    assert.deepEqual(await readFile(path.join(directory, `manifest.${authoringHash(terrainBefore)}.json`)), terrainBefore);
    await writeFile(path.join(directory, 'manifest.json'), terrainBefore);
    await writeFile(path.join(destination, 'manifest.json'), appearanceBefore);
    const corruptFile = path.join(repeated.outputDirectory, page.url), corrupt = await readFile(corruptFile); corrupt[0] ^= 1; await writeFile(corruptFile, corrupt);
    const saved = await readFile(path.join(directory, 'appearance/manifest.json'));
    await assert.rejects(publishLandscapeAppearance(repeated, metadata), /integrity mismatch/);
    assert.deepEqual(await readFile(path.join(directory, 'appearance/manifest.json')), saved);
    const oversized = Buffer.from(images.baseColor); oversized.writeUInt32BE(2048, 16); oversized.writeUInt32BE(2048, 20);
    oversized.writeUInt32BE(crc32(oversized.subarray(12, 29)), 29);
    await writeFile(path.join(sourceRoot, 'fixture_soil_0/base.png'), oversized);
    await assert.rejects(prepare('oversized-source'), /512\.\.1024 pixels/);
    assert.deepEqual(await readFile(path.join(directory, 'appearance/manifest.json')), saved);
});
