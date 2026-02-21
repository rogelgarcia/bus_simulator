// Node unit tests for global PBR texture calibration + precedence resolution.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mapPbrCorrectionAdjustmentsToOverrides,
    PbrTextureCalibrationResolver
} from '../../../src/graphics/content3d/materials/PbrTextureCalibrationResolver.js';

test('PbrTextureCalibrationResolver maps correction adjustments into runtime overrides', () => {
    const mapped = mapPbrCorrectionAdjustmentsToOverrides({
        albedo: { brightness: 1.2, hueDegrees: 20, tintStrength: 0.15, saturation: 1.1 },
        normal: { strength: 0.85 },
        roughness: {
            min: 0.2,
            max: 0.8,
            gamma: 1.1,
            invertInput: true,
            normalizeInputPercentiles: [5, 95]
        },
        ao: { intensity: 1.4 },
        metalness: { value: 0.05 }
    });

    assert.ok(mapped);
    assert.equal(mapped.albedoBrightness, 1.2);
    assert.equal(mapped.albedoHueDegrees, 20);
    assert.equal(mapped.albedoTintStrength, 0.15);
    assert.ok(Math.abs(mapped.albedoSaturation - 0.1) < 1e-9);
    assert.equal(mapped.normalStrength, 0.85);
    assert.equal(mapped.aoIntensity, 1.4);
    assert.equal(mapped.metalness, 0.05);
    assert.deepEqual(mapped.roughnessRemap, {
        min: 0.2,
        max: 0.8,
        gamma: 1.1,
        invertInput: true,
        lowPercentile: 5,
        highPercentile: 95
    });
});

test('PbrTextureCalibrationResolver caches per-material overrides for the session', async () => {
    const resolver = new PbrTextureCalibrationResolver({
        logger: { warn: () => {} }
    });

    const first = await resolver.resolveOverrides('pbr.grass_004');
    const second = await resolver.resolveOverrides('pbr.grass_004');

    assert.ok(first);
    assert.strictEqual(first, second);
    assert.equal(resolver.hasCached('pbr.grass_004'), true);
    assert.strictEqual(resolver.getCachedOverrides('pbr.grass_004'), first);
    assert.equal(first.normalStrength, 0.9);
    assert.equal(first.metalness, 0);
    assert.deepEqual(first.roughnessRemap, {
        min: 1,
        max: 1,
        gamma: 1,
        invertInput: false,
        lowPercentile: 5,
        highPercentile: 95
    });
});

test('resolvePbrMaterialPipeline enforces catalog -> calibration -> local override precedence', async (t) => {
    let resolvePbrMaterialPipeline = null;
    try {
        ({ resolvePbrMaterialPipeline } = await import('../../../src/graphics/content3d/materials/PbrTexturePipeline.js'));
    } catch (err) {
        if (err?.code === 'ERR_MODULE_NOT_FOUND') {
            t.skip('PbrTexturePipeline depends on three package in this Node test environment.');
            return;
        }
        throw err;
    }

    const calibrationResolver = {
        getCachedOverrides: () => ({ tileMeters: 3.5, roughness: 0.2, aoIntensity: 1.3 }),
        hasCached: () => true
    };

    const resolved = resolvePbrMaterialPipeline('pbr.grass_004', {
        localOverrides: { roughness: 0.55, normalStrength: 1.25 },
        calibrationResolver
    });

    assert.equal(resolved.overrides.effective.tileMeters, 3.5);
    assert.equal(resolved.overrides.effective.roughness, 0.55);
    assert.equal(resolved.overrides.effective.normalStrength, 1.25);
    assert.equal(resolved.overrides.effective.aoIntensity, 1.3);

    assert.equal(resolved.overrides.sources.tileMeters, 'calibration');
    assert.equal(resolved.overrides.sources.roughness, 'local');
    assert.equal(resolved.overrides.sources.normalStrength, 'local');
    assert.equal(resolved.overrides.sources.aoIntensity, 'calibration');

    assert.equal(resolved.diagnostics.resolvedBy, 'global_pbr_pipeline');
    assert.equal(resolved.diagnostics.calibrationLoaded, true);
    assert.equal(resolved.diagnostics.hasCalibration, true);
});

test('PbrTextureLoaderService does not force texture upload before image data is ready', async (t) => {
    let PbrTextureLoaderService = null;
    let THREE = null;
    try {
        ({ PbrTextureLoaderService } = await import('../../../src/graphics/content3d/materials/PbrTexturePipeline.js'));
        THREE = await import('three');
    } catch (err) {
        if (err?.code === 'ERR_MODULE_NOT_FOUND') {
            t.skip('PbrTexturePipeline/three unavailable in this Node test environment.');
            return;
        }
        throw err;
    }

    const textureLoader = {
        load: () => new THREE.Texture()
    };
    const service = new PbrTextureLoaderService({
        textureLoader,
        logger: { warn: () => {}, info: () => {} }
    });

    const payloadShared = service.resolveMaterial('pbr.grass_004', {
        cloneTextures: false,
        repeat: { x: 1.5, y: 1.5 }
    });
    const sharedTextures = Object.values(payloadShared?.textures ?? {}).filter((tex) => tex?.isTexture);
    if (!sharedTextures.length) {
        t.skip('No texture URLs resolved for pbr.grass_004 in this environment.');
        return;
    }

    for (const tex of sharedTextures) {
        assert.notEqual(tex.needsUpdate, true);
    }

    const payloadCloned = service.resolveMaterial('pbr.grass_004', {
        cloneTextures: true,
        repeat: { x: 2, y: 2 }
    });
    const clonedTextures = Object.values(payloadCloned?.textures ?? {}).filter((tex) => tex?.isTexture);
    for (const tex of clonedTextures) {
        assert.notEqual(tex.needsUpdate, true);
    }
});
