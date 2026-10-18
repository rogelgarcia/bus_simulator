// Verifies the AI 598 D3a material parameter texture: the row catalog, the exact packing of the former per-soil uniforms, the salt halves and the cache-key hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_MATERIAL_PARAMETER_ROW, LANDSCAPE_MATERIAL_PARAMETER_ROWS, LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT, LANDSCAPE_MATERIAL_SLOTS_MAX, LANDSCAPE_MATERIAL_TIERS,
    LandscapeMaterialParameterTable, landscapeMaterialParameterDefines, landscapeMaterialParameterRows, landscapeMaterialParameterTable, landscapeMaterialSaltFromHalves, landscapeMaterialSaltHalves,
    landscapeMaterialTierIndex } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialParameters.js';
import { landscapeMaterialClumpUniforms } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';
import { landscapeMaterialSamplingUniforms } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialSampling.js';
import { landscapeMacroVariationUniforms } from '../../../src/graphics/engine3d/landscape/LandscapeMacroVariation.js';
import { LANDSCAPE_SOIL_CATALOG } from '../../../src/app/landscape/LandscapeCatalog.js';

const ROW = LANDSCAPE_MATERIAL_PARAMETER_ROW;

// the pre-D3a packing of LandscapeMaterialPages (initialize, applyCalibration, applyMicroUniforms, bind) into Vector4-like cells, float32 like a uniform upload
function legacyRows({ terrainRole, effective, albedoGain, roughnessInputRange, uvRotationDegrees, relief, resolution, tileMeters, micro, response, meanNormalSlope }) {
    const set = (...values) => values.map(Math.fround), remap = effective.roughnessRemap, normalize = Number.isFinite(remap?.lowPercentile) && Number.isFinite(remap?.highPercentile);
    const uSoilScale = set(terrainRole, effective.normalStrength, effective.aoIntensity, effective.metalness), uSoilState = set(relief ? 1 : 0, resolution, micro?.heightStrength ?? 0, response.opposition);
    const uSoilAlbedo = set(effective.albedoBrightness, effective.albedoHueDegrees * Math.PI / 180, effective.albedoSaturation, effective.albedoTintStrength);
    uSoilAlbedo[0] = Math.fround(effective.albedoBrightness * albedoGain);
    const uSoilRoughness = set(remap?.min ?? 0, remap?.max ?? 1, remap?.gamma ?? 1, remap?.invertInput ? 1 : 0);
    const uSoilRange = set(normalize ? roughnessInputRange.min : 0, normalize ? roughnessInputRange.max : 1, effective.roughness, (uvRotationDegrees ?? 0) * Math.PI / 180);
    const uSoilResponse = set(response.diffuseRoughness, response.specularShadowing, ...meanNormalSlope);
    const uSoilTiling = set(tileMeters, micro?.tileMeters ?? 0, micro?.normalStrength ?? 0, micro?.luminanceScale ?? 0);
    return { scale: uSoilScale, tiling: uSoilTiling, albedo: uSoilAlbedo, roughness: uSoilRoughness, range: uSoilRange, state: uSoilState, response: uSoilResponse };
}

const sample = {
    terrainRole: .5, effective: { normalStrength: 1.1, aoIntensity: .9, metalness: 0, albedoBrightness: 1.07, albedoHueDegrees: -3.5, albedoSaturation: .12, albedoTintStrength: .25, roughness: .97,
        roughnessRemap: { min: .3, max: .95, gamma: 1.2, invertInput: true, lowPercentile: 2, highPercentile: 98 } },
    albedoGain: .71, roughnessInputRange: { min: .18, max: .83 }, uvRotationDegrees: 17, relief: true, resolution: 512, tileMeters: 4.2,
    micro: { tileMeters: 1.5, normalStrength: 1, luminanceScale: .4, heightStrength: .3 }, response: { diffuseRoughness: .3, specularShadowing: 1, opposition: .5 }, meanNormalSlope: [-.03159, .02161]
};

test('Material parameters: the row catalog names fourteen vec4 rows per material, the former uniforms and the volatile residency-following components', () => {
    assert.equal(LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT, 14);
    assert.equal(LANDSCAPE_MATERIAL_SLOTS_MAX, 32);
    assert.deepEqual([...LANDSCAPE_MATERIAL_TIERS], [128, 512, 1024]);
    assert.deepEqual(LANDSCAPE_MATERIAL_PARAMETER_ROWS.map(row => row.id), ['scale', 'tiling', 'albedo', 'roughness', 'range', 'state', 'response', 'clumps', 'stochastic', 'macro', 'residency', 'saltsA', 'saltsB', 'saltsC']);
    assert.ok(LANDSCAPE_MATERIAL_PARAMETER_ROWS.every(row => row.components.length === 4 && Object.isFrozen(row)));
    assert.deepEqual(LANDSCAPE_MATERIAL_PARAMETER_ROWS.map(row => row.former), ['uSoilScale', 'uSoilTiling', 'uSoilAlbedo', 'uSoilRoughness', 'uSoilRange', 'uSoilState', 'uSoilResponse', 'uSoilClumps', 'uSoilStochastic', 'uSoilMacro',
        'uSoilBase*/uSoilSurface*/uBlend*/uMaterialBlendIndex', 'uSoilClumpSalts', 'uSoilClumpSalts', 'uSoilStochasticSalts']);
    assert.deepEqual([...LANDSCAPE_MATERIAL_PARAMETER_ROWS[ROW.tiling].volatile], [1, 2, 3], 'the micro tiling follows the resident micro layer');
    assert.deepEqual([...LANDSCAPE_MATERIAL_PARAMETER_ROWS[ROW.state].volatile], [1, 2], 'the bound resolution and micro relief strength follow residency');
    assert.deepEqual([...LANDSCAPE_MATERIAL_PARAMETER_ROWS[ROW.residency].volatile], [0, 1, 2, 3]);
    const defines = landscapeMaterialParameterDefines();
    assert.equal(defines.LANDSCAPE_MATERIAL_PARAMETER_ROWS, '(14)');
    assert.equal(defines.LANDSCAPE_MATERIAL_SLOTS_MAX, '(32)');
    assert.equal(defines.LANDSCAPE_MATERIAL_TIER_RESOLUTIONS, 'vec3(128.0, 512.0, 1024.0)');
    assert.deepEqual([defines.LANDSCAPE_MATERIAL_ROW_SCALE, defines.LANDSCAPE_MATERIAL_ROW_RESIDENCY, defines.LANDSCAPE_MATERIAL_ROW_SALTS_A, defines.LANDSCAPE_MATERIAL_ROW_SALTS_C], ['(0)', '(10)', '(11)', '(13)']);
    assert.equal(landscapeMaterialTierIndex(512), 1);
    assert.throws(() => landscapeMaterialTierIndex(256), /not a material array resolution/);
});

test('Material parameters: the packer reproduces every former per-soil uniform value bit for bit, with and without a micro layer or a remap', () => {
    for (const input of [sample, { ...sample, micro: null, relief: false, resolution: 128 }, { ...sample, effective: { ...sample.effective, roughnessRemap: null }, uvRotationDegrees: 0 },
        { ...sample, effective: { ...sample.effective, roughnessRemap: { min: .1, max: .8 } } }]) {
        const rows = landscapeMaterialParameterRows(input), legacy = legacyRows(input);
        for (const id of ['scale', 'tiling', 'albedo', 'roughness', 'range', 'state', 'response']) assert.deepEqual(Array.from(Float32Array.from(rows[id])), legacy[id], id);
    }
    assert.throws(() => landscapeMaterialParameterRows({ ...sample, tileMeters: Number.NaN }), /finite/);
});

test('Material parameters: the table stores rows as float32 texels by material and row, keeps salts as exact halves and defaults residency to no array', () => {
    const table = new LandscapeMaterialParameterTable(6);
    assert.deepEqual([table.rows, table.capacity, table.data.length], [14, 6, 6 * 14 * 4]);
    assert.deepEqual(table.residency(3), { tier: -1, slot: 0, arrivingTier: -1, arrivingSlot: 0 });
    const version = table.version;
    table.set(2, ROW.albedo, 1.07 * .71, -3.5 * Math.PI / 180, .12, .25);
    assert.equal(table.version, version + 1);
    assert.deepEqual(Array.from(table.row(2, ROW.albedo)), [1.07 * .71, -3.5 * Math.PI / 180, .12, .25].map(Math.fround));
    assert.equal(table.offset(2, ROW.albedo), (2 * 14 + ROW.albedo) * 4);
    table.setComponent(2, ROW.state, 1, 1024);
    assert.equal(table.component(2, ROW.state, 1), 1024);
    for (const salt of [0, 1, 0xffff, 0x10000, 0x7fffffff, 0x80000000, 0xffffffff, -1, -0x80000000]) {
        const [low, high] = landscapeMaterialSaltHalves(salt);
        assert.ok(low >= 0 && low <= 0xffff && high >= 0 && high <= 0xffff);
        assert.equal(landscapeMaterialSaltFromHalves(low, high), salt >>> 0);
    }
    table.setSalts(4, [0x9e3779b9, 0x85ebca6b, -1, 7], 0xc2b2ae35 | 0);
    assert.deepEqual([0, 1, 2, 3].map(octave => table.clumpSalt(4, octave)), [0x9e3779b9, 0x85ebca6b, 0xffffffff, 7]);
    assert.equal(table.stochasticSalt(4), 0xc2b2ae35);
    assert.throws(() => table.set(6, 0, 0, 0, 0, 0), /outside the table/);
    assert.throws(() => table.set(0, 14, 0, 0, 0, 0), /outside 0\.\.13/);
    assert.throws(() => table.set(0, 0, Number.NaN, 0, 0, 0), /finite/);
    assert.throws(() => landscapeMaterialSaltHalves(2 ** 32), /int32 or uint32/);
    assert.throws(() => new LandscapeMaterialParameterTable(33), /1\.\.32 materials/);
    assert.throws(() => landscapeMaterialParameterTable({ uMaterialParameters: { value: null } }), /no material parameter table/);
    assert.equal(landscapeMaterialParameterTable({ uMaterialParameters: { value: null, table } }), table);
    let changes = 0;
    table.onChange(() => changes++);
    table.setRow(1, ROW.macro, [.1, .1, 3 * Math.PI / 180, .03]);
    assert.equal(changes, 1);
    assert.throws(() => table.setRow(1, ROW.macro, [1, 2, 3]), /four components/);
});

test('Material parameters: the hash covers every non-volatile component, ignores residency and the micro tiling and is cached by version', () => {
    const table = new LandscapeMaterialParameterTable(4), hash = table.hash();
    assert.match(hash, /^[0-9a-f]{14}$/);
    assert.equal(table.hash(), hash, 'cached');
    table.set(1, ROW.residency, 2, 5, 1, 3);
    table.setComponent(1, ROW.tiling, 1, 1.5); table.setComponent(1, ROW.tiling, 2, 1); table.setComponent(1, ROW.tiling, 3, .4);
    table.setComponent(1, ROW.state, 1, 1024); table.setComponent(1, ROW.state, 2, .3);
    assert.equal(table.hash(), hash, 'residency, the micro tiling, the bound resolution and the micro relief strength are volatile');
    table.setComponent(1, ROW.tiling, 0, 4.2);
    const period = table.hash();
    assert.notEqual(period, hash, 'the physical period is part of the key');
    table.setComponent(1, ROW.state, 0, 1);
    assert.notEqual(table.hash(), period, 'the relief flag is part of the key');
    table.setSalts(0, [1, 2, 3, 4], 5);
    const salted = table.hash();
    table.setSalts(0, [1, 2, 3, 4], 6);
    assert.notEqual(table.hash(), salted, 'salts are part of the key');
});

test('Material parameters: the recipe setters of LandscapeAppearanceUniforms would write the clump, stochastic and macro rows of every soil from the recipe arrays', () => {
    const seed = 1207276911, soils = LANDSCAPE_SOIL_CATALOG.map(soil => ({ soilId: soil.id, enabled: soil.id !== 'seabed' }));
    const clumps = landscapeMaterialClumpUniforms({ seed, soils }), sampling = landscapeMaterialSamplingUniforms({ seed, soils }), macro = landscapeMacroVariationUniforms({ seed, soils });
    const table = new LandscapeMaterialParameterTable(6);
    // the setters' arithmetic: four components per soil into the rows, the two's-complement salts as halves
    soils.forEach((_, index) => {
        table.setRow(index, ROW.clumps, clumps.uSoilClumps.subarray(index * 4, index * 4 + 4));
        table.setRow(index, ROW.stochastic, sampling.uSoilStochastic.subarray(index * 4, index * 4 + 4));
        table.setRow(index, ROW.macro, macro.uSoilMacro.subarray(index * 4, index * 4 + 4));
        table.setSalts(index, Array.from(clumps.uSoilClumpSalts.subarray(index * 4, index * 4 + 4)), sampling.uSoilStochasticSalts[index]);
    });
    soils.forEach((soil, index) => {
        assert.deepEqual(Array.from(table.row(index, ROW.clumps)), Array.from(clumps.uSoilClumps.subarray(index * 4, index * 4 + 4)), `${soil.soilId} clumps`);
        assert.deepEqual([0, 1, 2, 3].map(octave => table.clumpSalt(index, octave)), Array.from(clumps.uSoilClumpSalts.subarray(index * 4, index * 4 + 4), salt => salt >>> 0), `${soil.soilId} clump salts`);
        assert.equal(table.stochasticSalt(index), sampling.uSoilStochasticSalts[index] >>> 0, `${soil.soilId} stochastic salt`);
        assert.deepEqual(Array.from(table.row(index, ROW.macro)), Array.from(macro.uSoilMacro.subarray(index * 4, index * 4 + 4)));
    });
});
