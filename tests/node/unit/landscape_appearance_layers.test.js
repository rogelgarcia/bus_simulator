// Verifies the layers appearance companion: the request reader, strict validation with binding errors, the loaders with a fixture fetch, the published coastal v3 companion page by page, and the surface materials table.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { LANDSCAPE_APPEARANCE_LAYERS_FORMAT, LANDSCAPE_APPEARANCE_LAYERS_LIMIT, LANDSCAPE_APPEARANCE_LAYER_CLASSES, LANDSCAPE_SURFACE_RECIPE, LandscapeAppearanceLayersBindingError,
    landscapeAppearanceBindingKey, landscapeAppearanceLayerClass, landscapeSurfaceMaterialsKey, loadLandscapeAppearanceLayers, loadLandscapeAppearanceLayersPage, validateLandscapeAppearanceLayers,
    validateLandscapeAppearanceManifest, validateLandscapeManifest, validateLandscapeSurfaceRecipe } from '../../../src/app/landscape/index.js';
import { APPEARANCE_LAYERS_REQUEST_FORMAT, readAppearanceLayersRequest } from '../../../tools/bake_landscape/AppearanceLayers.mjs';
import { LANDSCAPE_SURFACE_MATERIALS, landscapeSurfaceMaterialCalibration, landscapeSurfaceMaterialDefinition, validateLandscapeSurfaceMaterials } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceMaterials.js';
import { LANDSCAPE_MATERIAL_CALIBRATION } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialCalibration.js';
import { LANDSCAPE_MATERIAL_RESPONSE } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialResponse.js';
import { LANDSCAPE_MATERIAL_CLUMPS } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const landscapeDirectory = 'assets/public/landscape/coastal-city-v3', directory = path.resolve(landscapeDirectory, 'appearance');
const cacheSkip = landscapeCacheSkip(['manifest.json', 'appearance/manifest.json', 'appearance/layers.json'], landscapeDirectory);
const fixtures = path.resolve('tests/artifacts/screens/landscape/ai598/d2/tests');
await mkdir(fixtures, { recursive: true });
const REVISION = 'layers-37bceaa727eec12488968055';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const recipe = validateLandscapeSurfaceRecipe(LANDSCAPE_SURFACE_RECIPE);
const shipped = JSON.parse(await readFile(path.resolve('tools/bake_landscape/appearance/layers-v1-coastal-city-v3.json'), 'utf8'));
const bindingError = error => error instanceof LandscapeAppearanceLayersBindingError;
const structuralError = error => !bindingError(error) && /^\[Landscape\]/.test(error.message);
const toLinear = byte => { const v = byte / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
const toSrgb = v => Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055));

const page = (resolution, colorSpace, seed) => { const sha = hash(seed); return { url: `pages/${sha}.rgba8`, width: resolution, height: resolution, encoding: 'rgba8', colorSpace, byteLength: resolution * resolution * 4, decodedByteLength: resolution * resolution * 4, sha256: sha, revision: sha }; };
const tiersOf = seed => [32, 128, 512, 1024].map(resolution => ({ id: String(resolution), resolution, channels: { baseColor: page(resolution, 'srgb', `${seed}b${resolution}`), normal: page(resolution, 'linear', `${seed}n${resolution}`), orm: page(resolution, 'linear', `${seed}o${resolution}`) } }));
async function synthetic(appearance) {
    return { format: LANDSCAPE_APPEARANCE_LAYERS_FORMAT, schemaVersion: 1, landscapeId: appearance.landscapeId, revision: 'layers-000000000000000000000000', appearanceRevision: appearance.revision,
        bindingKey: await landscapeAppearanceBindingKey(appearance), recipe: { id: recipe.id, materialsKey: await landscapeSurfaceMaterialsKey(recipe) },
        capabilities: { encoding: 'rgba8', gpuCompression: 'none', maxPageBytes: 4 * 1024 * 1024, tiers: [32, 128, 512, 1024] },
        materials: [{ classId: 'moss', kind: 'cover', materialId: recipe.materials.moss.materialId, tileMeters: 1.5, calibration: { presetId: 'aces', configSha256: hash('correction'), adjustments: { normal: { strength: .7 } } },
            roughnessInputRange: { min: .1, max: .9 }, height: { encoding: 'orm-alpha-unorm8', interpretation: 'relative-relief', neutral: .5 }, tiers: tiersOf('moss') }],
        provenance: { algorithm: 'landscape-appearance-layers-v1', sources: [{ path: 'pbr/landscape_moss_v1/pbr.material.config.js', sha256: hash('config'), byteLength: 1024 }], recipes: { request: { sha256: hash('request') } } } };
}
async function publishedAppearance() {
    const landscape = validateLandscapeManifest(JSON.parse(await readFile(path.resolve(landscapeDirectory, 'manifest.json'), 'utf8')));
    return validateLandscapeAppearanceManifest(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')), landscape);
}

test('Layers: the bindable classes are the substrates and the covers without none, and the shipped request reads against the recipe', async () => {
    assert.equal(LANDSCAPE_APPEARANCE_LAYER_CLASSES.length, 19);
    assert.deepEqual(LANDSCAPE_APPEARANCE_LAYER_CLASSES.slice(0, 2), [{ classId: 'sandstone', kind: 'substrate' }, { classId: 'caprock', kind: 'substrate' }]);
    assert.equal(landscapeAppearanceLayerClass('none'), null); assert.deepEqual(landscapeAppearanceLayerClass('wrack'), { classId: 'wrack', kind: 'cover' });
    const landscape = { id: 'coastal-city-v3' };
    const read = await readAppearanceLayersRequest(path.resolve('tools/bake_landscape/appearance/layers-v1-coastal-city-v3.json'), landscape, recipe);
    assert.equal(read.request.format, APPEARANCE_LAYERS_REQUEST_FORMAT); assert.equal(read.request.materials.length, 14); assert.equal(read.sha256.length, 64);
    for (const material of read.request.materials) assert.equal(recipe.materials[material.classId].materialId, material.materialId);
    const write = async (name, mutate) => { const value = structuredClone(shipped); mutate(value); const file = path.join(fixtures, `${name}.json`); await writeFile(file, JSON.stringify(value)); return file; };
    await assert.rejects(readAppearanceLayersRequest(await write('other-landscape', value => { value.landscapeId = 'coastal-city'; }), landscape, recipe), /landscape coastal-city-v3/);
    await assert.rejects(readAppearanceLayersRequest(await write('wrong-material', value => { value.materials[0].materialId = 'pbr.landscape_other_v1'; }), landscape, recipe), /recipe coastal-surface-v1 binds/);
    await assert.rejects(readAppearanceLayersRequest(await write('duplicate', value => { value.materials.push({ ...value.materials[0] }); }), landscape, recipe), /listed once/);
    await assert.rejects(readAppearanceLayersRequest(await write('wrong-kind', value => { value.materials[0].kind = 'cover'; }), landscape, recipe), /known class with its kind/);
    await assert.rejects(readAppearanceLayersRequest(await write('none', value => { value.materials[0] = { classId: 'none', kind: 'cover', materialId: 'pbr.x' }; }), landscape, recipe), /known class/);
    await assert.rejects(readAppearanceLayersRequest(await write('tiers', value => { value.extraTiers = [512]; }), landscape, recipe), /extraTiers/);
    await assert.rejects(readAppearanceLayersRequest(await write('micro', value => { value.micro = [{ materialId: 'pbr.m', classIds: ['nope'] }]; }), landscape, recipe), /micro entries/);
});

test('Layers: validation accepts a bound companion and separates structural faults from binding errors', { skip: cacheSkip }, async () => {
    const appearance = await publishedAppearance(), valid = await synthetic(appearance);
    const result = await validateLandscapeAppearanceLayers(valid, appearance, recipe);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.materials[0].tiers[3].channels.orm)); assert.equal(result.materials[0].tiers.length, 4);
    const mutated = async (mutate, check, label) => { const value = structuredClone(valid); mutate(value); await assert.rejects(validateLandscapeAppearanceLayers(value, appearance, recipe), check, label); };
    await mutated(value => { value.materials[0].classId = 'none'; }, structuralError, 'none binds nothing');
    await mutated(value => { value.materials[0].kind = 'substrate'; }, structuralError, 'kind must match the catalog');
    await mutated(value => { value.materials.push(structuredClone(value.materials[0])); }, structuralError, 'a class at most once');
    await mutated(value => { value.materials[0].tiers.pop(); }, structuralError, 'every tier is required');
    await mutated(value => { value.materials[0].tiers[0].channels.baseColor.colorSpace = 'linear'; }, structuralError, 'base colour pages are sRGB');
    await mutated(value => { value.materials[0].extra = 1; }, structuralError, 'exact keys');
    await mutated(value => { value.revision = 'multiscale-000000000000000000000000'; }, structuralError, 'a layers revision');
    await mutated(value => { value.capabilities.tiers = [32, 128, 512]; }, structuralError, 'capabilities declare every tier');
    await mutated(value => { value.materials[0].materialId = 'pbr.landscape_other_v1'; }, bindingError, 'the recipe binds another material');
    await mutated(value => { value.recipe.materialsKey = hash('other table'); }, bindingError, 'another material table');
    await mutated(value => { value.appearanceRevision = 'appearance-000000000000000000000000'; }, bindingError, 'another appearance revision');
    await mutated(value => { value.landscapeId = 'coastal-city'; }, bindingError, 'another landscape');
    await mutated(value => { value.bindingKey = hash('other binding'); }, bindingError, 'another binding key');
    const rebound = structuredClone(LANDSCAPE_SURFACE_RECIPE); rebound.materials = { ...rebound.materials, moss: { materialId: 'pbr.landscape_other_moss_v1', parameters: {} } };
    await assert.rejects(validateLandscapeAppearanceLayers(valid, appearance, rebound), bindingError, 'a rebinding of the recipe invalidates the companion');
    const retuned = structuredClone(LANDSCAPE_SURFACE_RECIPE); retuned.defaults = { coverFraction: .4 };
    assert.equal((await validateLandscapeAppearanceLayers(valid, appearance, retuned)).revision, valid.revision, 'recipe rule tuning keeps the companion bound');
});

test('Layers: the loaders return null on 404, refuse corrupt or oversized metadata and authenticate pages by resolution', { skip: cacheSkip }, async () => {
    const appearance = await publishedAppearance(), valid = await synthetic(appearance), url = 'http://127.0.0.1:8002/landscape/appearance/layers.json';
    const respond = (body, status = 200) => async () => new Response(body, { status, headers: body instanceof Uint8Array || typeof body === 'string' ? { 'content-length': String(body.length ?? Buffer.byteLength(body)) } : {} });
    assert.equal(await loadLandscapeAppearanceLayers(url, { appearance, recipe, fetchImpl: respond(null, 404) }), null);
    assert.equal((await loadLandscapeAppearanceLayers(url, { appearance, recipe, fetchImpl: respond(JSON.stringify(valid)) })).revision, valid.revision);
    await assert.rejects(loadLandscapeAppearanceLayers(url, { appearance, recipe, fetchImpl: respond('{not json') }), /UTF-8 JSON/);
    await assert.rejects(loadLandscapeAppearanceLayers(url, { appearance, recipe, fetchImpl: respond('x'.repeat(LANDSCAPE_APPEARANCE_LAYERS_LIMIT + 1)) }), /exceeds/);
    await assert.rejects(loadLandscapeAppearanceLayers(url, { appearance, recipe, fetchImpl: respond(null, 500) }), /HTTP 500/);
    await assert.rejects(loadLandscapeAppearanceLayers(url, { appearance, fetchImpl: respond(JSON.stringify(valid)) }), /surface recipe/);
    for (const resolution of [512, 1024]) {
        const bytes = new Uint8Array(resolution * resolution * 4).fill(resolution === 512 ? 7 : 9), sha = hash(bytes);
        const descriptor = { url: `pages/${sha}.rgba8`, width: resolution, height: resolution, encoding: 'rgba8', colorSpace: 'linear', byteLength: bytes.length, decodedByteLength: bytes.length, sha256: sha, revision: sha };
        const loaded = await loadLandscapeAppearanceLayersPage(descriptor, { manifestUrl: url, fetchImpl: respond(bytes) });
        assert.equal(loaded.length, bytes.length); assert.equal(hash(loaded), sha);
        await assert.rejects(loadLandscapeAppearanceLayersPage({ ...descriptor, sha256: hash('other') }, { manifestUrl: url, fetchImpl: respond(bytes) }), /SHA-256 mismatch/);
    }
});

test('Layers: the published coastal v3 companion binds the current appearance and recipe, names every class with a new material and authenticates page by page', { skip: cacheSkip }, async () => {
    const appearance = await publishedAppearance(), bytes = await readFile(path.join(directory, 'layers.json'));
    const layers = await validateLandscapeAppearanceLayers(JSON.parse(bytes.toString('utf8')), appearance, recipe);
    assert.equal(layers.revision, REVISION); assert.ok(bytes.length < LANDSCAPE_APPEARANCE_LAYERS_LIMIT);
    assert.deepEqual(await readFile(path.join(directory, `layers.${hash(bytes)}.json`)), bytes, 'the current companion has an immutable snapshot');
    assert.deepEqual(layers.materials.map(material => material.classId), shipped.materials.map(material => material.classId));
    const unbound = Object.keys(recipe.materials).filter(classId => !layers.materials.some(material => material.classId === classId)).sort();
    assert.deepEqual(unbound, ['compacted-sand', 'dirt', 'sand', 'wet-sand', 'wrack'], 'the soil-material classes and wrack (no homogeneous CC0 source) have no companion material');
    const seen = new Set();
    for (const material of layers.materials) {
        const slug = material.materialId.slice(4), folder = path.resolve('assets/public/pbr', slug);
        const config = (await import(pathToFileURL(path.join(folder, 'pbr.material.config.js')).href)).default;
        assert.equal(config.source.license, 'CC0-1.0'); assert.equal(config.tileMeters, material.tileMeters); assert.ok(config.source.files.length >= 3);
        assert.equal(material.calibration.configSha256, hash(await readFile(path.join(folder, 'pbr.material.correction.config.js'))));
        for (const file of ['pbr.material.config.js', 'pbr.material.correction.config.js']) assert.equal(layers.provenance.sources.find(source => source.path === `pbr/${slug}/${file}`)?.sha256, hash(await readFile(path.join(folder, file))));
        for (const file of config.source.files) assert.equal(layers.provenance.sources.find(source => source.path === `pbr/${slug}/${file.file}`)?.sha256, file.sha256, `${slug}/${file.file} is the recorded source`);
        assert.ok(material.height, `${material.classId} carries relief`);
        const [fine, coarse] = [material.tiers[3], material.tiers[2]];
        for (const [channel, entry] of Object.entries(fine.channels)) {
            if (seen.has(entry.url)) continue;
            seen.add(entry.url);
            const page = await readFile(path.join(directory, entry.url)), lower = await readFile(path.join(directory, coarse.channels[channel].url));
            assert.equal(page.length, 1024 * 1024 * 4); assert.equal(hash(page), entry.sha256); assert.equal(hash(lower), coarse.channels[channel].sha256);
            let worst = 0, alphaMin = 255, alphaMax = 0;
            for (let row = 0; row < 512; row += 4) for (let column = 0; column < 512; column += 4) for (let c = 0; c < 4; c++) {
                const texels = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([dy, dx]) => page[((row * 2 + dy) * 1024 + column * 2 + dx) * 4 + c]);
                const expected = channel === 'baseColor' && c < 3 ? toSrgb(texels.reduce((sum, byte) => sum + toLinear(byte), 0) / 4) : texels.reduce((a, b) => a + b, 0) / 4;
                if (channel !== 'normal' || c === 3) worst = Math.max(worst, Math.abs(expected - lower[(row * 512 + column) * 4 + c]));
            }
            for (let i = 0; i < page.length; i += 4) {
                alphaMin = Math.min(alphaMin, page[i + 3]); alphaMax = Math.max(alphaMax, page[i + 3]);
                if (channel === 'normal' && i % 4096 === 0) assert.ok(Math.abs(Math.hypot(page[i] / 127.5 - 1, page[i + 1] / 127.5 - 1, page[i + 2] / 127.5 - 1) - 1) <= .015);
            }
            assert.ok(worst <= 1.5, `${material.classId}/${channel}: the 2x2 reduction of the 1024 tier matches the 512 tier (worst ${worst})`);
            if (channel === 'orm') assert.ok(alphaMin < alphaMax, `${material.classId} ORM alpha carries relative relief`); else assert.equal(alphaMin, 255);
        }
    }
    assert.equal(seen.size, 42, 'fourteen materials, three unique 1024 pages each');
});

test('Layers: the surface materials table covers the soil materials and every companion material with validated data and the calibration authority', () => {
    const ids = Object.keys(LANDSCAPE_SURFACE_MATERIALS);
    assert.deepEqual(ids.slice(0, 5), ['pbr.landscape_soil_uniform_v1', 'pbr.aerial_beach_01', 'pbr.landscape_grass_uniform_v1', 'pbr.landscape_forest_soil_uniform_v1', 'pbr.landscape_rock_uniform_v1']);
    for (const material of shipped.materials) assert.ok(ids.includes(material.materialId), `${material.materialId} is in the table`);
    for (const id of ids) { assert.ok(LANDSCAPE_MATERIAL_CALIBRATION.materials[id], `${id} is calibrated`); assert.equal(landscapeSurfaceMaterialCalibration(id).albedoGain, LANDSCAPE_MATERIAL_CALIBRATION.materials[id].albedoGain); }
    assert.equal(LANDSCAPE_SURFACE_MATERIALS['pbr.landscape_grass_uniform_v1'].response, LANDSCAPE_MATERIAL_RESPONSE.materials.loam, 'soil materials reference their per-soil tables');
    assert.equal(LANDSCAPE_SURFACE_MATERIALS['pbr.landscape_rock_uniform_v1'].clump, LANDSCAPE_MATERIAL_CLUMPS.materials.rock);
    assert.equal(LANDSCAPE_SURFACE_MATERIALS['pbr.aerial_beach_01'].microPaired, 'pbr.landscape_sand_micro_v1');
    const turf = landscapeSurfaceMaterialDefinition('pbr.landscape_turf_v1'), loam = LANDSCAPE_MATERIAL_RESPONSE.materials.loam;
    assert.deepEqual([turf.response.diffuseRoughness, turf.response.specularShadowing, turf.response.opposition], [loam.diffuseRoughness, loam.specularShadowing, loam.opposition]);
    assert.equal(landscapeSurfaceMaterialDefinition('pbr.landscape_dune_sand_v1').sampling.rotationRangeDegrees, 0, 'ripples keep their orientation');
    assert.equal(landscapeSurfaceMaterialDefinition('pbr.landscape_cobble_v1').clump.textureReliefGain, 3);
    assert.equal(landscapeSurfaceMaterialDefinition('pbr.landscape_algae_rock_v1').response.specularShadowing, 0, 'the wet film keeps the GGX sheen');
    for (const id of ids) { const role = LANDSCAPE_SURFACE_MATERIALS[id].terrainRole; assert.ok(role >= -1 && role <= 1); assert.ok(LANDSCAPE_SURFACE_MATERIALS[id].rationale.length > 20); }
    assert.throws(() => landscapeSurfaceMaterialDefinition('pbr.not_a_material'), /No surface material data/);
    const sample = structuredClone(LANDSCAPE_SURFACE_MATERIALS['pbr.landscape_moss_v1']);
    assert.throws(() => validateLandscapeSurfaceMaterials({ 'pbr.landscape_moss_v1': { ...sample, response: { ...sample.response, opposition: 3 } } }), /opposition amplitude/);
    assert.throws(() => validateLandscapeSurfaceMaterials({ 'pbr.landscape_moss_v1': { ...sample, clump: { ...sample.clump, shaping: 'ridged' } } }), /smooth or billow/);
    assert.throws(() => validateLandscapeSurfaceMaterials({ 'pbr.landscape_uncalibrated_v1': sample }), /no landscape calibration row/);
});
