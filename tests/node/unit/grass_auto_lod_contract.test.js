import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as autoLod from '../../../src/app/grass/GrassAutoLodContract.js';
import { sanitizeGrassMidClusterConfig } from '../../../src/graphics/engine3d/grass/GrassMidClusterConfig.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const {
    GRASS_AUTO_LOD_FORCE,
    GRASS_AUTO_LOD_VERSION,
    createGrassAutoLodFieldUnitHandoff,
    evaluateGrassAutoLod,
    getGrassAutoLodCandidateRadius,
    getGrassAutoLodStableSample,
    resolveGrassAutoLodUnitVisibility,
    sanitizeGrassAutoLodConfig
} = autoLod;

const NEUTRAL_ANGLE_DEGREES = 41;
const GEOMETRY_TIERS = ['near', 'billboard', 'middle'];

function assertNormalizedWeights(evaluation) {
    assert.deepEqual(Object.keys(evaluation.weights), ['near', 'billboard', 'middle', 'texture']);
    const values = Object.values(evaluation.weights);
    assert.equal(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1), true);
    assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 1e-9);
    const activeGeometry = GEOMETRY_TIERS.filter((tier) => evaluation.weights[tier] > 0);
    if (activeGeometry.length > 1) {
        const indices = activeGeometry.map((tier) => GEOMETRY_TIERS.indexOf(tier));
        assert.equal(Math.max(...indices) - Math.min(...indices), 1, JSON.stringify(evaluation));
    }
}

test('automatic grass LOD V2 defaults to close, billboard, middle, then texture at 3/8/25 m', () => {
    const config = sanitizeGrassAutoLodConfig(null);
    assert.equal(GRASS_AUTO_LOD_VERSION, 2);
    assert.equal(config.version, 2);
    assert.equal(config.force, 'auto');
    assert.equal(config.nearEndMeters, 3);
    assert.equal(config.billboardEndMeters, 8);
    assert.equal(config.middleEndMeters, 25);
    assert.equal(config.transitionWidthMeters, 2);
    assert.equal(config.hysteresisMeters, 0.75);
    assert.equal(GRASS_AUTO_LOD_FORCE.BILLBOARD, 'billboard');
    assert.equal(GRASS_AUTO_LOD_FORCE.MIDDLE, 'middle');

    assert.equal(evaluateGrassAutoLod({ distanceMeters: 1, viewAngleDeg: NEUTRAL_ANGLE_DEGREES, config }).activeTier, 'near');
    assert.equal(evaluateGrassAutoLod({ distanceMeters: 5, viewAngleDeg: NEUTRAL_ANGLE_DEGREES, config }).activeTier, 'billboard');
    assert.equal(evaluateGrassAutoLod({ distanceMeters: 12, viewAngleDeg: NEUTRAL_ANGLE_DEGREES, config }).activeTier, 'middle');
    const far = evaluateGrassAutoLod({ distanceMeters: 25, viewAngleDeg: NEUTRAL_ANGLE_DEGREES, config });
    assert.equal(far.activeTier, 'texture');
    assert.deepEqual(far.weights, { near: 0, billboard: 0, middle: 0, texture: 1 });
    assert.equal(far.beyondGeometryCutoff, true);
});

test('four-tier weights stay normalized and only adjacent tiers overlap at every view angle', () => {
    const config = sanitizeGrassAutoLodConfig(null);
    const transitions = new Set();
    for (const viewAngleDeg of [5, NEUTRAL_ANGLE_DEGREES, 80]) {
        for (let step = 0; step <= 600; step++) {
            const evaluation = evaluateGrassAutoLod({
                distanceMeters: step * 0.05,
                viewAngleDeg,
                config
            });
            assertNormalizedWeights(evaluation);
            transitions.add(evaluation.transitionState);
            assert.ok(evaluation.transitionProgress >= 0 && evaluation.transitionProgress <= 1);
            if (evaluation.beyondGeometryCutoff) {
                assert.equal(GEOMETRY_TIERS.every((tier) => evaluation.weights[tier] === 0), true);
            }
        }
    }
    assert.equal(transitions.has('near_to_billboard'), true);
    assert.equal(transitions.has('billboard_to_middle'), true);
    assert.equal(transitions.has('middle_to_texture'), true);
});

test('shared unit handoff samples are deterministic, complementary, and hysteretic without gaps', () => {
    assert.equal(typeof resolveGrassAutoLodUnitVisibility, 'function');
    if (typeof resolveGrassAutoLodUnitVisibility !== 'function') return;
    const config = sanitizeGrassAutoLodConfig(null);
    const unitKey = '12,-7';
    const firstSample = getGrassAutoLodStableSample(unitKey, 'near_to_billboard');
    assert.equal(getGrassAutoLodStableSample(unitKey, 'near_to_billboard'), firstSample);

    for (const [fromMeters, toMeters, outgoing, incoming] of [
        [2, 4, 'near', 'billboard'],
        [7, 9, 'billboard', 'middle']
    ]) {
        let previousOutgoing = true;
        let previousIncoming = false;
        for (let step = 0; step <= 80; step++) {
            const distanceMeters = fromMeters + (toMeters - fromMeters) * step / 80;
            const evaluation = evaluateGrassAutoLod({ distanceMeters, viewAngleDeg: NEUTRAL_ANGLE_DEGREES, config });
            const outgoingVisible = resolveGrassAutoLodUnitVisibility({
                evaluation,
                tier: outgoing,
                unitKey,
                previousVisible: previousOutgoing,
                config
            });
            const incomingVisible = resolveGrassAutoLodUnitVisibility({
                evaluation,
                tier: incoming,
                unitKey,
                previousVisible: previousIncoming,
                config
            });
            assert.equal(outgoingVisible || incomingVisible, true, JSON.stringify({ distanceMeters, evaluation }));
            previousOutgoing = outgoingVisible;
            previousIncoming = incomingVisible;
        }
    }
});

test('field-unit handoff identity includes seed and boundary while distance stays on the canonical cell center', () => {
    const options = {
        unitKey: '12,-7',
        fieldSeed: 'cohesive-seed-a',
        boundarySignature: 'boundary-a',
        cameraX: 11.75,
        cameraZ: -8.25
    };
    const first = createGrassAutoLodFieldUnitHandoff(options);
    const repeated = createGrassAutoLodFieldUnitHandoff(options);
    assert.deepEqual(repeated, first);
    assert.deepEqual(JSON.parse(first.identity), [
        'bus-simulator.grass-auto-lod',
        2,
        'field_unit',
        'cohesive-seed-a',
        'boundary-a',
        '12,-7'
    ]);
    assert.equal(first.x, 12.5);
    assert.equal(first.z, -6.5);
    assert.equal(first.distanceMeters, Math.hypot(0.75, 1.75));

    const changedSeed = createGrassAutoLodFieldUnitHandoff({ ...options, fieldSeed: 'cohesive-seed-b' });
    const changedBoundary = createGrassAutoLodFieldUnitHandoff({ ...options, boundarySignature: 'boundary-b' });
    assert.notEqual(changedSeed.identity, first.identity);
    assert.notEqual(changedBoundary.identity, first.identity);
    assert.notEqual(
        getGrassAutoLodStableSample(changedSeed.identity, 'near_to_billboard'),
        getGrassAutoLodStableSample(first.identity, 'near_to_billboard')
    );
    assert.notEqual(
        getGrassAutoLodStableSample(changedBoundary.identity, 'near_to_billboard'),
        getGrassAutoLodStableSample(first.identity, 'near_to_billboard')
    );
});

test('a reset with both adjacent previous states hidden still leaves every handoff unit represented', () => {
    const config = sanitizeGrassAutoLodConfig(null);
    const handoff = createGrassAutoLodFieldUnitHandoff({
        unitKey: '12,-7',
        fieldSeed: 'reset-regression',
        boundarySignature: 'boundary-reset',
        cameraX: 0,
        cameraZ: 0
    });
    for (const [fromMeters, toMeters, outgoing, incoming] of [
        [2, 4, 'near', 'billboard'],
        [7, 9, 'billboard', 'middle']
    ]) {
        for (let step = 0; step <= 400; step++) {
            const distanceMeters = fromMeters + (toMeters - fromMeters) * step / 400;
            const evaluation = evaluateGrassAutoLod({
                distanceMeters,
                viewAngleDeg: NEUTRAL_ANGLE_DEGREES,
                config
            });
            const outgoingVisible = resolveGrassAutoLodUnitVisibility({
                evaluation,
                tier: outgoing,
                unitKey: handoff.identity,
                previousVisible: false,
                config
            });
            const incomingVisible = resolveGrassAutoLodUnitVisibility({
                evaluation,
                tier: incoming,
                unitKey: handoff.identity,
                previousVisible: false,
                config
            });
            assert.equal(
                outgoingVisible || incomingVisible,
                true,
                JSON.stringify({ distanceMeters, outgoing, incoming, evaluation })
            );
        }
    }
});

test('manual force values and the legacy cluster alias remain bounded by the 25 m cutoff', () => {
    assert.equal(sanitizeGrassAutoLodConfig({ force: 'cluster' }).force, 'middle');
    for (const force of ['near', 'billboard', 'middle']) {
        const config = sanitizeGrassAutoLodConfig({ force });
        const inside = evaluateGrassAutoLod({ distanceMeters: 10, viewAngleDeg: NEUTRAL_ANGLE_DEGREES, config });
        assert.equal(inside.weights[force], 1);
        const cutoff = evaluateGrassAutoLod({ distanceMeters: 25, viewAngleDeg: NEUTRAL_ANGLE_DEGREES, config });
        assert.equal(GEOMETRY_TIERS.every((tier) => cutoff.weights[tier] === 0), true);
        assert.equal(cutoff.activeTier, 'texture');
        assert.equal(cutoff.beyondGeometryCutoff, true);
    }
    const texture = sanitizeGrassAutoLodConfig({ force: 'texture' });
    assert.equal(GEOMETRY_TIERS.every((tier) => getGrassAutoLodCandidateRadius(texture, tier, 12) === 0), true);

    const forcedNear = sanitizeGrassAutoLodConfig({ force: 'near' });
    const forcedBillboard = sanitizeGrassAutoLodConfig({ force: 'billboard' });
    const forcedMiddle = sanitizeGrassAutoLodConfig({ force: 'middle' });
    assert.ok(getGrassAutoLodCandidateRadius(forcedNear, 'near', NEUTRAL_ANGLE_DEGREES)
        < forcedNear.billboardEndMeters);
    assert.ok(getGrassAutoLodCandidateRadius(forcedBillboard, 'billboard', NEUTRAL_ANGLE_DEGREES)
        < forcedBillboard.middleEndMeters);
    assert.equal(
        getGrassAutoLodCandidateRadius(forcedMiddle, 'middle', NEUTRAL_ANGLE_DEGREES),
        forcedMiddle.middleEndMeters
    );
});

test('view angle preserves tier ordering while extending grazing and contracting top-down range', () => {
    const config = sanitizeGrassAutoLodConfig(null);
    for (const tier of GEOMETRY_TIERS) {
        const grazing = getGrassAutoLodCandidateRadius(config, tier, 5);
        const topDown = getGrassAutoLodCandidateRadius(config, tier, 80);
        assert.ok(grazing >= topDown);
    }
    assert.ok(getGrassAutoLodCandidateRadius(config, 'near', NEUTRAL_ANGLE_DEGREES)
        < getGrassAutoLodCandidateRadius(config, 'billboard', NEUTRAL_ANGLE_DEGREES));
    assert.ok(getGrassAutoLodCandidateRadius(config, 'billboard', NEUTRAL_ANGLE_DEGREES)
        < getGrassAutoLodCandidateRadius(config, 'middle', NEUTRAL_ANGLE_DEGREES));
});

test('AI 361 renderer contract exposes two cohesive field batches with shared V2 material ownership', () => {
    const source = readFileSync(REPO_ROOT + '/src/graphics/engine3d/grass/GrassMidClusterSystem.js', 'utf8');
    const near = readFileSync(REPO_ROOT + '/src/graphics/engine3d/grass/GrassNearCarpetSystem.js', 'utf8');
    const engine = readFileSync(REPO_ROOT + '/src/graphics/engine3d/grass/GrassEngine.js', 'utf8');
    const view = readFileSync(REPO_ROOT + '/src/graphics/gui/grass_debugger/view/GrassDebuggerView.js', 'utf8');
    assert.equal((source.match(/new THREE\.InstancedMesh\(/g) ?? []).length, 2);
    assert.match(source, /billboard/i);
    assert.match(source, /middle/i);
    assert.match(source, /mesh\.frustumCulled = true/);
    assert.match(source, /mesh\.castShadow = false/);
    assert.match(source, /lastBufferUpdates/);
    assert.match(source, /footprintEffectiveDistanceMeters/);
    assert.match(source, /cutoffRejectedUnits/);
    assert.match(source, /candidateUnits/);
    assert.match(source, /overlapUnits/);
    assert.match(source, /totalBufferUpdates/);
    assert.match(source, /rejectedByKind/);
    assert.match(source, /createGrassAutoLodFieldUnitHandoff/);
    assert.match(source, /renderRootEffectiveDistanceMeters/);
    assert.match(source, /cutoffFootprintScale/);
    assert.match(source, /facingDelta \* 0\.65/);
    assert.match(source, /this\._stats\.cutoffRejectedUnits = 0/);
    assert.match(near, /createGrassAutoLodFieldUnitHandoff/);
    assert.match(near, /visibilityKey/);
    assert.match(near, /cameraX: \(centerCellX \+ 0\.5\) \* config\.patchSizeMeters/);
    assert.match(engine, /fieldHandoffSeed: this\._config\.midCluster\.seed/);
    assert.match(engine, /setFieldHandoffSeed\(next\.midCluster\.seed\)/);
    assert.match(view, /LOW_CUT_GRASS_ATLAS_ROLE\.MID_CLUSTER/);
    assert.match(view, /transparent: false/);
    assert.match(view, /material\.alphaToCoverage = contract\.alphaToCoverage/);
    assert.doesNotMatch(source, /new\s+THREE\.TextureLoader/);
    assert.doesNotMatch(source, /cluster_atlas\.png/);
});

test('billboard cards keep their physical source height while sinking the rendered base into the opaque cap', () => {
    const config = sanitizeGrassMidClusterConfig(null);
    const renderer = readFileSync(REPO_ROOT + '/src/graphics/engine3d/grass/GrassMidClusterSystem.js', 'utf8');
    assert.equal(config.billboard.heightMeters, 0.055);
    assert.equal(config.middle.heightMeters, 0.055);
    assert.equal(config.billboard.baseSinkMeters, 0.01);
    assert.equal(config.middle.baseSinkMeters, 0);
    const clamped = sanitizeGrassMidClusterConfig({
        billboard: { baseSinkMeters: 9 },
        middle: { baseSinkMeters: -9 }
    });
    assert.equal(clamped.billboard.baseSinkMeters, 0.02);
    assert.equal(clamped.middle.baseSinkMeters, 0);
    assert.match(renderer, /const baseY = -config\.baseSinkMeters;/);
    assert.match(renderer, /const tipY = baseY \+ config\.heightMeters;/);
});

test('AI 361 remains Lab-only and gameplay has no cohesive hierarchy import', () => {
    const gameplay = readFileSync(REPO_ROOT + '/src/states/GameplayState.js', 'utf8');
    assert.doesNotMatch(gameplay, /GrassMidClusterSystem|GrassAutoLodContract|GrassCohesiveFieldLayout/);
});
