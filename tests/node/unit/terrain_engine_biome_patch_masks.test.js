// Node unit tests: deterministic terrain biome patches + humidity + blend behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainEngine } from '../../../src/app/city/terrain_engine/index.js';

test('TerrainEngine: patch sampling is deterministic and patch-based', () => {
    const engine = createTerrainEngine({
        seed: 'unit-test',
        bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
        patch: { sizeMeters: 10, originX: 0, originZ: 0 },
        biomes: { mode: 'source_map', defaultBiomeId: 'land' },
        humidity: { mode: 'source_map' },
        transition: { cameraBlendRadiusMeters: 1000, cameraBlendFeatherMeters: 0, boundaryBandMeters: 2 }
    });

    engine.setSourceMaps({
        biome: {
            width: 2,
            height: 1,
            data: new Uint8Array([0, 2]),
            bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 }
        },
        humidity: {
            width: 1,
            height: 1,
            data: new Uint8Array([128]),
            bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 }
        }
    });

    engine.setViewOrigin({ x: 10, z: 10 });

    const a = engine.sample(5, 5);
    const b = engine.sample(9, 5);
    const c = engine.sample(15, 5);

    assert.equal(a.primaryBiomeId, 'stone');
    assert.equal(c.primaryBiomeId, 'land');
    assert.equal(a.patchId, b.patchId);
    assert.notEqual(a.patchId, 0);

    const expectedHumidity = 128 / 255;
    assert.ok(Math.abs(a.humidity - expectedHumidity) < 1e-3);
});

test('TerrainEngine: blend activates only near camera and near boundaries', () => {
    const engine = createTerrainEngine({
        seed: 'unit-test',
        bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
        patch: { sizeMeters: 10, originX: 0, originZ: 0 },
        biomes: { mode: 'source_map', defaultBiomeId: 'land' },
        transition: { cameraBlendRadiusMeters: 1000, cameraBlendFeatherMeters: 0, boundaryBandMeters: 2 }
    });

    engine.setSourceMaps({
        biome: {
            width: 2,
            height: 1,
            data: new Uint8Array([0, 2]),
            bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 }
        }
    });

    engine.setViewOrigin({ x: 10, z: 10 });

    const farFromBoundary = engine.sample(8, 5);
    assert.equal(farFromBoundary.primaryBiomeId, 'stone');
    assert.equal(farFromBoundary.secondaryBiomeId, 'land');
    assert.equal(farFromBoundary.biomeBlend, 0);

    const nearBoundary = engine.sample(9, 5);
    assert.equal(nearBoundary.primaryBiomeId, 'stone');
    assert.equal(nearBoundary.secondaryBiomeId, 'land');
    assert.ok(nearBoundary.biomeBlend > 0.05);

    engine.setConfig({
        ...engine.getConfig(),
        transition: { cameraBlendRadiusMeters: 1, cameraBlendFeatherMeters: 0, boundaryBandMeters: 2 }
    });
    engine.setViewOrigin({ x: 100, z: 100 });
    const outsideBlendZone = engine.sample(9, 5);
    assert.equal(outsideBlendZone.biomeBlend, 0);
});

test('TerrainEngine: voronoi domain warp produces non-grid patch regions', () => {
    const seed = 'unit-test';
    const bounds = { minX: 0, maxX: 200, minZ: 0, maxZ: 200 };
    const base = {
        seed,
        bounds,
        biomes: { mode: 'patch_grid', defaultBiomeId: 'land' },
        transition: { cameraBlendRadiusMeters: 0, cameraBlendFeatherMeters: 0, boundaryBandMeters: 0 }
    };

    const grid = createTerrainEngine({
        ...base,
        patch: { sizeMeters: 20, originX: 0, originZ: 0, layout: 'grid' }
    });
    const warped = createTerrainEngine({
        ...base,
        patch: { sizeMeters: 20, originX: 0, originZ: 0, layout: 'voronoi', voronoiJitter: 0.0, warpScale: 0.05, warpAmplitudeMeters: 30 }
    });

    let mismatches = 0;
    outer: for (let z = 5; z <= 195; z += 7) {
        for (let x = 5; x <= 195; x += 5) {
            const a = grid.sample(x, z);
            const b = warped.sample(x, z);
            if (a.patchId !== b.patchId) {
                mismatches++;
                break outer;
            }
        }
    }

    assert.ok(mismatches > 0);
});

test('TerrainEngine: humidity source map deterministically resolves dry/neutral/wet slots', () => {
    const engine = createTerrainEngine({
        seed: 'unit-test',
        bounds: { minX: 0, maxX: 30, minZ: 0, maxZ: 10 },
        patch: { sizeMeters: 10, originX: 0, originZ: 0 },
        biomes: { mode: 'patch_grid', defaultBiomeId: 'land', weights: { stone: 0.0, grass: 0.0, land: 1.0 } },
        humidity: { mode: 'source_map' },
        transition: { cameraBlendRadiusMeters: 0, cameraBlendFeatherMeters: 0, boundaryBandMeters: 0 }
    });

    engine.setSourceMaps({
        humidity: {
            width: 3,
            height: 1,
            data: new Uint8Array([16, 128, 240]),
            bounds: { minX: 0, maxX: 30, minZ: 0, maxZ: 10 }
        }
    });

    const resolveSlot = (h) => {
        if (h <= 0.33) return 'dry';
        if (h >= 0.67) return 'wet';
        return 'neutral';
    };

    const dry = engine.sample(4, 5);
    const neutral = engine.sample(15, 5);
    const wet = engine.sample(26, 5);

    assert.equal(resolveSlot(dry.humidity), 'dry');
    assert.equal(resolveSlot(neutral.humidity), 'neutral');
    assert.equal(resolveSlot(wet.humidity), 'wet');

    const repeat = engine.sample(26, 5);
    assert.equal(resolveSlot(repeat.humidity), 'wet');
    assert.ok(Math.abs(repeat.humidity - wet.humidity) < 1e-9);
});
