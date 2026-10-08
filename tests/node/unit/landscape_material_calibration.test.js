// Verifies the AI577 D5c landscape-local material calibration against the published appearance pages: mean normal slopes, effective albedo
// inside each physical reference range under the calibrated game light, and the low-sun rotation spread that constrains D3 patch rotation.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LANDSCAPE_MATERIAL_CALIBRATION, landscapeMaterialCalibration } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialCalibration.js';
import { landscapeMaterialResponseDefinition } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialResponse.js';
import { landscapeMaterialSamplingDefinition, landscapeHexNormalSlope } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialSampling.js';
import { landscapeReflectedRadiance } from '../../../src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const cacheSkip = landscapeCacheSkip(['appearance/manifest.json', 'appearance/multiscale.json']);
const directory = path.resolve('assets/public/landscape/coastal-city/appearance');
const manifest = cacheSkip ? null : JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const multiscale = cacheSkip ? null : JSON.parse(await readFile(path.join(directory, 'multiscale.json'), 'utf8'));
const LUMA = [.2126, .7152, .0722], srgb = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const page = async channel => new Uint8Array(await readFile(path.join(directory, channel.url)));
const tierOf = definition => multiscale.materials.find(entry => entry.soilId === definition.soilId).tiers.find(tier => tier.resolution === 1024);

function meanSlope(bytes) {
    let x = 0, y = 0;
    const count = bytes.length / 4;
    for (let i = 0; i < count; i++) {
        const [sx, sy] = landscapeHexNormalSlope([bytes[i * 4] / 255 * 2 - 1, bytes[i * 4 + 1] / 255 * 2 - 1, bytes[i * 4 + 2] / 255 * 2 - 1], [1, 0]);
        x += sx; y += sy;
    }
    return [x / count, y / count];
}

// mean of max(0, n·l) for the strength-scaled mapped normals of a page rotated in its plane, sun at 12° elevation (one in every seventh texel)
function rotationSpread(bytes, strength, mean) {
    const l = [Math.cos(12 * Math.PI / 180), Math.sin(12 * Math.PI / 180), 0], values = [];
    for (let r = 0; r < 24; r++) {
        const c = Math.cos(r / 24 * 2 * Math.PI), s = Math.sin(r / 24 * 2 * Math.PI);
        let total = 0, count = 0;
        for (let i = 0; i < bytes.length / 4; i += 7) {
            const [sx, sy] = landscapeHexNormalSlope([bytes[i * 4] / 255 * 2 - 1, bytes[i * 4 + 1] / 255 * 2 - 1, bytes[i * 4 + 2] / 255 * 2 - 1], [c, s], undefined, mean);
            const wx = sx * strength, wz = sy * strength, length = Math.hypot(wx, 1, wz);
            total += Math.max(0, (wx * l[0] + l[1] + wz * l[2]) / length); count++;
        }
        values.push(total / count);
    }
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    return (Math.max(...values) - Math.min(...values)) / average;
}

test('Material calibration: every coastal material has an entry measured from its published 1024 normal page, and every tier shares the mean slope', { skip: cacheSkip }, async () => {
    assert.equal(LANDSCAPE_MATERIAL_CALIBRATION.id, 'landscape-material-calibration-v1');
    for (const definition of manifest.materials) {
        const entry = LANDSCAPE_MATERIAL_CALIBRATION.materials[definition.materialId], tier = tierOf(definition);
        assert.ok(entry, `${definition.materialId} is calibrated`);
        const bytes = await page(tier.channels.normal);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.measuredFrom.normalSha256, `${definition.materialId} was measured from the published page`);
        meanSlope(bytes).forEach((value, axis) => assert.ok(Math.abs(value - entry.meanNormalSlope[axis]) < 2e-5, `${definition.materialId} slope ${axis}: ${value} vs ${entry.meanNormalSlope[axis]}`));
        for (const schema of definition.tiers) meanSlope(await page(schema.channels.normal)).forEach((value, axis) => assert.ok(Math.abs(value - entry.meanNormalSlope[axis]) < .0025, `${definition.materialId} ${schema.resolution} tier slope ${axis}`));
    }
    const grass = LANDSCAPE_MATERIAL_CALIBRATION.materials['pbr.landscape_grass_uniform_v1'].meanNormalSlope;
    assert.ok(Math.atan(Math.hypot(...grass)) * 180 / Math.PI > 2, 'the grass page leans by more than two degrees');
});

test('Material calibration: de-leaned pages may rotate freely; the grass lean alone produced the low-sun hexagon patches', { skip: cacheSkip }, async () => {
    for (const definition of manifest.materials) {
        const sampling = landscapeMaterialSamplingDefinition(definition.soilId), entry = LANDSCAPE_MATERIAL_CALIBRATION.materials[definition.materialId];
        if (sampling.rotationRangeDegrees === 0) continue;
        const bytes = await page(tierOf(definition).channels.normal), strength = definition.calibration.adjustments.normal.strength;
        const spread = rotationSpread(bytes, strength, entry.meanNormalSlope);
        assert.ok(spread < .02, `${definition.soilId}: rotated de-leaned patches differ by ${(spread * 100).toFixed(2)}% of mean low-sun irradiance`);
        if (definition.soilId === 'loam') assert.ok(rotationSpread(bytes, strength, [0, 0]) > .15, 'without de-leaning the rotated grass patches differ by more than 15%');
    }
});

test('Material calibration: effective shaded albedo lies inside each physical reference range; only materials outside it are scaled', { skip: cacheSkip }, async () => {
    const n = [0, 1, 0], l = [Math.sin(Math.PI / 4), Math.cos(Math.PI / 4), 0], v = [0, 1, 0], seen = new Set();
    for (const definition of manifest.materials) {
        const entry = LANDSCAPE_MATERIAL_CALIBRATION.materials[definition.materialId], tier = tierOf(definition), adjustments = definition.calibration.adjustments;
        const [base, orm] = await Promise.all([page(tier.channels.baseColor), page(tier.channels.orm)]), count = base.length / 4, sum = [0, 0, 0];
        let roughness = 0;
        const range = definition.roughnessInputRange, remap = adjustments.roughness;
        for (let i = 0; i < count; i++) {
            for (let k = 0; k < 3; k++) sum[k] += srgb(base[i * 4 + k] / 255);
            const t = Math.min(1, Math.max(0, (orm[i * 4 + 1] / 255 - range.min) / (range.max - range.min)));
            roughness += remap.min + (remap.max - remap.min) * t ** remap.gamma;
        }
        const raw = sum.map(value => value / count), y = raw.reduce((a, value, k) => a + value * LUMA[k], 0);
        const shared = raw.map(value => (y + (value - y) * adjustments.albedo.saturation) * adjustments.albedo.brightness);
        const response = landscapeMaterialResponseDefinition(definition.soilId), terms = [response.diffuseRoughness, response.specularShadowing, response.opposition];
        // pi L / E of flat ground lit by a sun at 45° zenith, seen from the nadir (the 45/0 geometry of reflectance standards)
        const effective = gain => {
            const radiance = landscapeReflectedRadiance({ albedo: shared.map(value => value * gain), normal: n, view: v, roughness: roughness / count, metalness: 0, occlusion: 1, response: terms },
                { sunDirection: l, sunIrradiance: [1, 1, 1], skyIrradiance: [0, 0, 0], skyRadiance: [0, 0, 0] });
            return radiance.reduce((a, value, k) => a + value * LUMA[k], 0) * Math.PI / l[1];
        };
        const [low, high] = entry.reference.range, after = effective(entry.albedoGain), before = effective(1);
        assert.ok(after >= low && after <= high, `${definition.soilId} ${definition.materialId}: effective albedo ${after.toFixed(3)} within ${low}-${high}`);
        if (!seen.has(definition.materialId)) {
            seen.add(definition.materialId);
            if (entry.albedoGain === 1) assert.ok(before >= low && before <= high, `${definition.materialId} keeps its shared albedo inside the range`);
            else {
                assert.ok(before < low || before > high, `${definition.materialId} was outside ${low}-${high} (${before.toFixed(3)}) before its landscape gain`);
                assert.ok(Math.abs(after - (low + high) / 2) < .2 * (high - low), `${definition.materialId} lands near the middle of its range (${after.toFixed(3)})`);
            }
        }
    }
});

test('Material calibration: lookups are explicit for uncalibrated materials and switchable for A/B evidence', () => {
    assert.deepEqual(landscapeMaterialCalibration('pbr.not_landscape'), { status: 'uncalibrated', albedoGain: 1, meanNormalSlope: [0, 0], applied: { albedo: false, normalLean: false } });
    const grass = landscapeMaterialCalibration('pbr.landscape_grass_uniform_v1');
    assert.equal(grass.status, 'calibrated'); assert.equal(grass.albedoGain, .71);
    assert.deepEqual(landscapeMaterialCalibration('pbr.landscape_grass_uniform_v1', { albedo: false }).albedoGain, 1);
    assert.deepEqual(landscapeMaterialCalibration('pbr.landscape_grass_uniform_v1', { normalLean: false }).meanNormalSlope, [0, 0]);
    assert.throws(() => landscapeMaterialCalibration('pbr.landscape_grass_uniform_v1', { albedo: 'off' }), /must be boolean/);
    assert.throws(() => landscapeMaterialCalibration(''), /material ID is required/);
});
