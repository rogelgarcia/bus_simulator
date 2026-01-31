// Node unit tests: Grass engine LOD evaluator + RNG determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../../../src/graphics/engine3d/grass/GrassRng.js';
import { evaluateGrassLod } from '../../../src/graphics/engine3d/grass/GrassLodEvaluator.js';

function makeLodConfig({ force = 'auto' } = {}) {
    return {
        enableMaster: true,
        force,
        distances: { master: 5, near: 20, mid: 55, far: 110, cutoff: 150 },
        transitionWidthMeters: 5,
        angle: {
            grazingDeg: 10,
            topDownDeg: 80,
            grazingDistanceScale: 0.75,
            topDownDistanceScale: 1.25,
            masterMaxDeg: 20
        }
    };
}

test('GrassRng: same seed produces same sequence', () => {
    const a = makeRng('seed');
    const b = makeRng('seed');
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    assert.deepEqual(seqA, seqB);
});

test('GrassLod: master activates when close + grazing', () => {
    const lod = makeLodConfig();
    const res = evaluateGrassLod({ distance: 2, viewAngleDeg: 5, lod });
    assert.equal(res.activeTier, 'master');
    assert.ok(res.weights.master > res.weights.near);
    assert.ok(res.weights.master > 0);
});

test('GrassLod: master does not activate at top-down angles', () => {
    const lod = makeLodConfig();
    const res = evaluateGrassLod({ distance: 2, viewAngleDeg: 60, lod });
    assert.equal(res.weights.master, 0);
    assert.equal(res.activeTier, 'near');
});

test('GrassLod: allowedLods can force lower detail', () => {
    const lod = makeLodConfig();
    const allowedLods = { master: false, near: false, mid: false, far: true };
    const res = evaluateGrassLod({ distance: 2, viewAngleDeg: 5, lod, allowedLods });
    assert.equal(res.activeTier, 'far');
    assert.equal(res.weights.far, 1);
});

test('GrassLod: force tier obeys allowedLods mapping', () => {
    const lod = makeLodConfig({ force: 'mid' });
    const allowedLods = { master: false, near: false, mid: false, far: true };
    const res = evaluateGrassLod({ distance: 2, viewAngleDeg: 5, lod, allowedLods });
    assert.equal(res.activeTier, 'far');
    assert.equal(res.weights.far, 1);
});

