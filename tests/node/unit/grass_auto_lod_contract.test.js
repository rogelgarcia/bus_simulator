import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    evaluateGrassAutoLod,
    getGrassAutoLodCandidateRadius,
    getGrassAutoLodStableSample,
    resolveGrassAutoLodMaskedVisibility,
    sanitizeGrassAutoLodConfig
} from '../../../src/app/grass/GrassAutoLodContract.js';
import { sanitizeGrassMidClusterConfig } from '../../../src/graphics/engine3d/grass/GrassMidClusterConfig.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('automatic grass LOD defaults to a short near, cluster, and texture-only path', () => {
    const config = sanitizeGrassAutoLodConfig(null);
    assert.equal(config.force, 'auto');
    assert.equal(config.nearEndMeters, 9);
    assert.equal(config.clusterEndMeters, 30);
    assert.equal(evaluateGrassAutoLod({ distanceMeters: 2, viewAngleDeg: 12, config }).activeTier, 'near');
    assert.equal(evaluateGrassAutoLod({ distanceMeters: 20, viewAngleDeg: 12, config }).activeTier, 'cluster');
    const far = evaluateGrassAutoLod({ distanceMeters: 40, viewAngleDeg: 12, config });
    assert.equal(far.activeTier, 'texture');
    assert.equal(far.weights.near, 0);
    assert.equal(far.weights.cluster, 0);
    assert.equal(far.beyondGeometryCutoff, true);
});

test('view angle contracts world-space geometry range for top-down views', () => {
    const config = sanitizeGrassAutoLodConfig(null);
    const grazing = getGrassAutoLodCandidateRadius(config, 'cluster', 5);
    const topDown = getGrassAutoLodCandidateRadius(config, 'cluster', 80);
    assert.ok(grazing > topDown);
    assert.equal(grazing, 37.5);
    assert.equal(topDown, 25);
});

test('stable masked transitions are deterministic and apply hysteresis', () => {
    const config = sanitizeGrassAutoLodConfig(null);
    const sampleA = getGrassAutoLodStableSample('4,9', 'near');
    const sampleB = getGrassAutoLodStableSample('4,9', 'near');
    assert.equal(sampleA, sampleB);
    const retained = resolveGrassAutoLodMaskedVisibility({ weight: sampleA - 0.01, stableSample: sampleA, previousVisible: true, config });
    const entering = resolveGrassAutoLodMaskedVisibility({ weight: sampleA - 0.01, stableSample: sampleA, previousVisible: false, config });
    assert.equal(retained, true);
    assert.equal(entering, false);
});

test('manual tier forcing remains bounded by the geometry cutoff', () => {
    const near = sanitizeGrassAutoLodConfig({ force: 'near' });
    assert.equal(getGrassAutoLodCandidateRadius(near, 'near', 5), 37.5);
    const cluster = sanitizeGrassAutoLodConfig({ force: 'cluster' });
    assert.equal(evaluateGrassAutoLod({ distanceMeters: 10, viewAngleDeg: 12, config: cluster }).weights.cluster, 1);
    assert.equal(evaluateGrassAutoLod({ distanceMeters: 50, viewAngleDeg: 12, config: cluster }).activeTier, 'texture');
    const texture = sanitizeGrassAutoLodConfig({ force: 'texture' });
    assert.equal(getGrassAutoLodCandidateRadius(texture, 'near', 12), 0);
    assert.equal(getGrassAutoLodCandidateRadius(texture, 'cluster', 12), 0);
});

test('mid cluster contract uses one or two cards and eight atlas variants', () => {
    const config = sanitizeGrassMidClusterConfig({ enabled: true });
    assert.equal(config.patchSizeMeters, 2);
    assert.equal(config.cardsPerPatch, 2);
    assert.equal(config.atlasVariants, 8);
    assert.equal(sanitizeGrassMidClusterConfig({ cardsPerPatch: 99 }).cardsPerPatch, 2);
});

test('cluster renderer is one opaque atlas batch with culling and no shadows', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassMidClusterSystem.js`, 'utf8');
    const view = readFileSync(`${REPO_ROOT}/src/graphics/gui/grass_debugger/view/GrassDebuggerView.js`, 'utf8');
    assert.equal((source.match(/new THREE\.InstancedMesh\(/g) ?? []).length, 1);
    assert.match(source, /grassAtlasVariant/);
    assert.match(source, /mesh\.frustumCulled = true/);
    assert.match(source, /mesh\.castShadow = false/);
    assert.match(view, /LOW_CUT_GRASS_ATLAS_ROLE\.MID_CLUSTER/);
    assert.match(view, /LOW_CUT_GRASS_ATLAS_ROLE\.ACCENT_CLUMP/);
    assert.match(view, /contract\.channels/);
    assert.match(view, /transparent: false/);
    assert.match(view, /material\.alphaToCoverage = contract\.alphaToCoverage/);
    assert.match(source, /grassAtlasInset/);
    assert.match(source, /atlasChannelRoles/);
    assert.doesNotMatch(source, /cluster_atlas\.png/);
});

test('AI 355 remains Lab-only and gameplay has no cluster or auto-LOD import', () => {
    const gameplay = readFileSync(`${REPO_ROOT}/src/states/GameplayState.js`, 'utf8');
    assert.doesNotMatch(gameplay, /GrassMidClusterSystem|GrassAutoLodContract/);
});
