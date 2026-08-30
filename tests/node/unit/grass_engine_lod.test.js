// Node unit tests: Grass engine LOD evaluator + RNG determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../../../src/graphics/engine3d/grass/GrassRng.js';
import { evaluateGrassLod } from '../../../src/graphics/engine3d/grass/GrassLodEvaluator.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function createGrassEngineMethodHarness() {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassEngine.js`, 'utf8');
    const marker = 'export class GrassEngine {';
    const classStart = source.indexOf(marker);
    assert.notEqual(classStart, -1);
    const classSource = source.slice(classStart).replace(/^export\s+/, '');
    const GrassEngineHarness = Function(`"use strict"; return (${classSource});`)();
    return Object.create(GrassEngineHarness.prototype);
}

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

test('AI 360 engine forwards exact coverage identity and bounds forced-near evidence to the near radius', () => {
    const engine = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassEngine.js`, 'utf8');
    const near = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassNearCarpetSystem.js`, 'utf8');
    assert.match(engine, /setNearCarpetCoverageInput/);
    assert.match(engine, /setCoverageInput/);
    assert.match(engine, /setNearEvidenceMode/);
    assert.match(near, /boundarySignature/);
    assert.match(near, /setCoverageInput/);
    assert.match(near, /forcedEvidence\s*\?\s*config\.radiusMeters/);
});

test('AI 360 clearing near evidence restores unchanged mid-cluster and accent layouts', () => {
    const engine = createGrassEngineMethodHarness();
    engine._nearEvidenceMode = null;
    engine._nearCarpet = {
        group: { visible: true },
        setEvidenceMode() {},
        getStats: () => ({ patchInstances: 1 })
    };
    engine._midCluster = { _layoutKey: 'stable-mid-layout', group: { visible: true } };
    engine._localizedAccents = { _layoutKey: 'stable-accent-layout', group: { visible: true } };
    engine._chunks = [];
    engine._lodRings = null;
    engine._lodAngleScaledRings = null;

    engine.setNearEvidenceMode('near_mesh');
    assert.equal(engine._midCluster.group.visible, false);
    assert.equal(engine._localizedAccents.group.visible, false);

    engine.setNearEvidenceMode(null);
    assert.equal(engine._midCluster._layoutKey, 'stable-mid-layout');
    assert.equal(engine._localizedAccents._layoutKey, 'stable-accent-layout');
    assert.equal(engine._midCluster.group.visible, true);
    assert.equal(engine._localizedAccents.group.visible, true);
});
