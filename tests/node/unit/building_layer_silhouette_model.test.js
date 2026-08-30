// Node unit tests: Building v2 per-floor silhouette authoring contract (AI 520).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    LAYER_SILHOUETTE_MODE,
    SILHOUETTE_REMAP_DECISION,
    applySilhouetteRemapDecisions,
    cloneLayerSilhouette,
    createFacadeRunContinuityKey,
    createDetachedLayerSilhouette,
    createSilhouetteRemapReport,
    createSilhouetteRunTraversal,
    createSilhouetteStretchProvenance,
    deleteSilhouetteCorner,
    getSilhouetteRunMetrics,
    mergeSilhouetteRuns,
    moveSilhouetteCorner,
    moveSilhouetteRun,
    normalizeLayerSilhouette,
    planLayerSilhouetteTransitionSurfaces,
    replaySilhouetteLotFitApplications,
    resolveBuildingLayerSilhouettes,
    setSilhouetteRunArc,
    solveSilhouettePreferredSize,
    splitSilhouetteRun,
    tessellateLayerSilhouetteLoopForGeometry,
    translateSilhouetteLoop,
    validateLayerSilhouette
} from '../../../src/app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js';

function rectangle(width = 10, depth = 6) {
    return [
        { x: -width / 2, z: -depth / 2 },
        { x: width / 2, z: -depth / 2 },
        { x: width / 2, z: depth / 2 },
        { x: -width / 2, z: depth / 2 }
    ];
}

function sizeOf(loop) {
    const xs = loop.map((point) => point.x);
    const zs = loop.map((point) => point.z);
    return {
        width: Math.max(...xs) - Math.min(...xs),
        depth: Math.max(...zs) - Math.min(...zs)
    };
}

function signedAreaOf(loop) {
    return loop.reduce((sum, point, index) => {
        const next = loop[(index + 1) % loop.length];
        return sum + point.x * next.z - next.x * point.z;
    }, 0) * 0.5;
}

test('BuildingLayerSilhouetteModel: legacy absence resolves default without materializing persistence', () => {
    const legacyLayer = { id: 'legacy', type: 'floor', floors: 2 };
    assert.equal(Object.hasOwn(legacyLayer, 'silhouette'), false);

    const resolved = resolveBuildingLayerSilhouettes({
        footprintLoops: [rectangle()],
        layers: [legacyLayer]
    });
    assert.equal(resolved.ordered[0].mode, LAYER_SILHOUETTE_MODE.INHERIT_DEFAULT);
    assert.equal(resolved.ordered[0].sourceLayerId, 'building_default');
    assert.deepEqual(resolved.ordered[0].loop.map((point) => point.runId), ['A', 'B', 'C', 'D']);
    assert.equal(normalizeLayerSilhouette(undefined), null);
    assert.equal(normalizeLayerSilhouette(null), null);
});

test('BuildingLayerSilhouetteModel: default, previous, and detached ownership resolve in floor order', () => {
    const detached = createDetachedLayerSilhouette([
        { x: -4, z: -4 },
        { x: 4, z: -4 },
        { x: 0, z: 3 }
    ]);
    const layers = [
        { id: 'base', type: 'floor' },
        { id: 'middle', type: 'floor', silhouette: { mode: LAYER_SILHOUETTE_MODE.INHERIT_PREVIOUS } },
        { id: 'tower', type: 'floor', silhouette: detached }
    ];
    const resolved = resolveBuildingLayerSilhouettes({ layers, footprintLoops: [rectangle()] });
    assert.deepEqual(resolved.ordered.map((entry) => entry.mode), [
        LAYER_SILHOUETTE_MODE.INHERIT_DEFAULT,
        LAYER_SILHOUETTE_MODE.INHERIT_PREVIOUS,
        LAYER_SILHOUETTE_MODE.DETACHED
    ]);
    assert.equal(resolved.byLayerId.middle.sourceLayerId, 'base');
    assert.equal(resolved.byLayerId.middle.loop.length, 4);
    assert.equal(resolved.byLayerId.tower.loop.length, 3);
    assert.deepEqual(normalizeLayerSilhouette(layers[1].silhouette), {
        version: 1,
        mode: LAYER_SILHOUETTE_MODE.INHERIT_PREVIOUS
    });
});

test('BuildingLayerSilhouetteModel: topology edits retain unaffected ids and never recycle retired ids', () => {
    const base = createDetachedLayerSilhouette(rectangle());
    const split = splitSilhouetteRun(base, { runId: 'A', fraction: 0.4 });
    assert.deepEqual(split.loop.map((point) => point.runId), ['A', 'E', 'B', 'C', 'D']);
    const inserted = split.loop[1];

    const movedCorner = moveSilhouetteCorner(split, {
        cornerId: inserted.cornerId,
        dx: 0.5,
        dz: -0.25
    });
    assert.deepEqual(movedCorner.loop.map((point) => point.runId), ['A', 'E', 'B', 'C', 'D']);
    const movedRun = moveSilhouetteRun(movedCorner, { runId: 'C', dx: -0.2, dz: 0 });
    const translated = translateSilhouetteLoop(movedRun, { dx: 20, dz: -7 });
    assert.deepEqual(translated.loop.map((point) => point.cornerId), movedRun.loop.map((point) => point.cornerId));

    const deleted = deleteSilhouetteCorner(split, { cornerId: inserted.cornerId });
    assert.deepEqual(deleted.loop.map((point) => point.runId), ['A', 'B', 'C', 'D']);
    assert.deepEqual(deleted.idState.retiredRunIds, ['E']);
    assert.ok(deleted.idState.retiredCornerIds.includes(inserted.cornerId));
    const splitAgain = splitSilhouetteRun(deleted, { runId: 'A', fraction: 0.5 });
    assert.equal(splitAgain.loop[1].runId, 'F');
    assert.notEqual(splitAgain.loop[1].cornerId, inserted.cornerId);
});

test('BuildingLayerSilhouetteModel: merging collinear runs retains the preceding id', () => {
    const document = createDetachedLayerSilhouette([
        { x: -5, z: -3 },
        { x: 0, z: -3 },
        { x: 5, z: -3 },
        { x: 5, z: 3 },
        { x: -5, z: 3 }
    ]);
    const removedCorner = document.loop[1];
    const merged = mergeSilhouetteRuns(document, { cornerId: removedCorner.cornerId });
    assert.deepEqual(merged.loop.map((point) => point.runId), ['A', 'C', 'D', 'E']);
    assert.ok(merged.idState.retiredRunIds.includes('B'));
    assert.throws(
        () => mergeSilhouetteRuns(createDetachedLayerSilhouette(rectangle()), { cornerId: 'corner_2' }),
        /collinear/
    );
});

test('BuildingLayerSilhouetteModel: arc edits expose radius, sweep, tangents, and curve-preserving split', () => {
    const base = createDetachedLayerSilhouette(rectangle());
    const curved = setSilhouetteRunArc(base, { runId: 'A', sweepRadians: -Math.PI / 2, segments: 12 });
    const metrics = getSilhouetteRunMetrics(curved, 'A');
    assert.equal(metrics.curved, true);
    assert.ok(Math.abs(metrics.sweepRadians + Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(metrics.radius - Math.sqrt(50)) < 1e-9);
    assert.ok(Math.abs(Math.hypot(metrics.startTangent.x, metrics.startTangent.z) - 1) < 1e-9);
    const reshaped = setSilhouetteRunArc(curved, { runId: 'A', sweepRadians: -Math.PI / 3 });
    assert.equal(reshaped.loop[0].arc.segments, 12);

    const split = splitSilhouetteRun(curved, { runId: 'A', fraction: 0.5 });
    const first = getSilhouetteRunMetrics(split, 'A');
    const second = getSilhouetteRunMetrics(split, 'E');
    assert.ok(Math.abs(first.length + second.length - metrics.length) < 1e-8);
    assert.equal(first.curved, true);
    assert.equal(second.curved, true);
    assert.equal(validateLayerSilhouette(split).valid, true);

    const straight = setSilhouetteRunArc(curved, { runId: 'A', bulge: null });
    assert.equal(getSilhouetteRunMetrics(straight, 'A').curved, false);
    assert.throws(() => setSilhouetteRunArc(base, { runId: 'A', radius: 2 }), /at least half/);
});

test('BuildingLayerSilhouetteModel: validation blocks malformed arcs, self intersections, and solver minima', () => {
    const invalidArc = createDetachedLayerSilhouette(rectangle());
    invalidArc.loop[0].arc = { bulge: Number.NaN };
    const arcValidation = validateLayerSilhouette(invalidArc);
    assert.equal(arcValidation.valid, false);
    assert.ok(arcValidation.errors.some((entry) => entry.code === 'invalid_arc'));

    const bowTie = createDetachedLayerSilhouette([
        { x: -4, z: 3 },
        { x: 4, z: -3 },
        { x: 4, z: 3 },
        { x: -4, z: -3 }
    ]);
    assert.ok(validateLayerSilhouette(bowTie).errors.some((entry) => entry.code === 'self_intersection'));

    const minima = validateLayerSilhouette(createDetachedLayerSilhouette(rectangle()), {
        layerId: 'floor_a',
        minRunLengths: { A: 12 }
    });
    assert.equal(minima.valid, false);
    assert.deepEqual(minima.errors.find((entry) => entry.code === 'run_below_solver_minimum')?.runId, 'A');

    const overLimit = createDetachedLayerSilhouette(Array.from({ length: 27 }, (_, index) => {
        const angle = index * Math.PI * 2 / 27;
        return { x: Math.cos(angle) * 10, z: Math.sin(angle) * 10 };
    }));
    const overLimitValidation = validateLayerSilhouette(overLimit);
    assert.ok(overLimitValidation.errors.some((entry) => entry.code === 'too_many_runs'));
    assert.ok(overLimitValidation.errors.some((entry) => entry.code === 'invalid_run_id'));

    const duplicateIdentity = createDetachedLayerSilhouette([
        { x: -5, z: -3, cornerId: 'corner_1', runId: 'A', runForward: true },
        { x: 5, z: -3, cornerId: 'corner_1', runId: 'A', runForward: true },
        { x: 5, z: 3, cornerId: 'corner_3', runId: 'C', runForward: true },
        { x: -5, z: 3, cornerId: 'corner_4', runId: 'D', runForward: true }
    ], { idState: { nextCornerSerial: 5, retiredCornerIds: [], retiredRunIds: ['A'] } });
    const identityValidation = validateLayerSilhouette(duplicateIdentity);
    assert.ok(identityValidation.errors.some((entry) => entry.code === 'duplicate_run_id'));
    assert.ok(identityValidation.errors.some((entry) => entry.code === 'duplicate_corner_id'));
    assert.ok(identityValidation.errors.some((entry) => entry.code === 'recycled_run_id'));

    const invalidOrientation = createDetachedLayerSilhouette(rectangle().map((point, index) => ({
        ...point,
        runForward: index === 0 ? 'forward' : true
    })));
    assert.ok(validateLayerSilhouette(invalidOrientation).errors.some((entry) => entry.code === 'invalid_run_orientation'));

    const tangentDocument = setSilhouetteRunArc(createDetachedLayerSilhouette(rectangle()), {
        runId: 'A',
        sweepRadians: -Math.PI / 2
    });
    const tangentValidation = validateLayerSilhouette(tangentDocument, {
        tangentConstraints: [{ runId: 'A', end: 'start', tangent: { x: -1, z: 0 }, toleranceDegrees: 1 }]
    });
    assert.ok(tangentValidation.errors.some((entry) => entry.code === 'invalid_arc_tangency'));
});

test('BuildingLayerSilhouetteModel: BF2 positive-area runtime outer is clockwise', () => {
    const runtimeOuter = createDetachedLayerSilhouette(rectangle());
    assert.ok(signedAreaOf(runtimeOuter.loop) > 0, 'fixture must match generator-normalized outer winding');
    assert.equal(validateLayerSilhouette(runtimeOuter).valid, true);

    const opposite = createDetachedLayerSilhouette([...rectangle()].reverse());
    assert.ok(signedAreaOf(opposite.loop) < 0);
    const validation = validateLayerSilhouette(opposite);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((entry) => entry.code === 'counter_clockwise'));
});

test('BuildingLayerSilhouetteModel: neighboring run continuity requires matching identity and orientation', () => {
    const lower = createDetachedLayerSilhouette(rectangle());
    const mixedUpper = cloneLayerSilhouette(lower);
    mixedUpper.loop.find((point) => point.runId === 'B').runForward = false;

    const mixedValidation = validateLayerSilhouette(lower, {
        layerId: 'lower',
        neighboringLoops: [{ layerId: 'upper', loop: mixedUpper.loop }]
    });
    const mismatch = mixedValidation.warnings.find(
        (entry) => entry.code === 'transition_run_orientation_mismatch'
    );
    assert.deepEqual(mismatch, {
        severity: 'warning',
        code: 'transition_run_orientation_mismatch',
        message: 'Run B cannot continue between layer lower and neighboring layer upper because runForward differs; remap it or start a separate facade group.',
        layerId: 'lower',
        neighborLayerId: 'upper',
        runId: 'B',
        sourceRunForward: true,
        neighborRunForward: false
    });
    assert.equal(
        mixedValidation.warnings.some((entry) => entry.code === 'transition_has_no_compatible_runs'),
        false,
        'matching A, C, and D remain compatible'
    );

    const flippedUpper = cloneLayerSilhouette(lower);
    flippedUpper.loop.forEach((point) => { point.runForward = false; });
    const flippedValidation = validateLayerSilhouette(lower, {
        layerId: 'lower',
        neighboringLoops: [{ layerId: 'upper', loop: flippedUpper.loop }]
    });
    assert.deepEqual(
        flippedValidation.warnings
            .filter((entry) => entry.code === 'transition_run_orientation_mismatch')
            .map((entry) => entry.runId),
        ['A', 'B', 'C', 'D']
    );
    const noCompatibleOrientation = flippedValidation.warnings.find(
        (entry) => entry.code === 'transition_has_no_compatible_runs'
    );
    assert.deepEqual(noCompatibleOrientation?.sharedRunIds, ['A', 'B', 'C', 'D']);
    assert.deepEqual(noCompatibleOrientation?.incompatibleRunIds, ['A', 'B', 'C', 'D']);

    const unrelatedUpper = cloneLayerSilhouette(lower);
    unrelatedUpper.loop.forEach((point, index) => { point.runId = ['E', 'F', 'G', 'H'][index]; });
    const unrelatedValidation = validateLayerSilhouette(lower, {
        neighboringLoops: [{ layerId: 'unrelated', loop: unrelatedUpper.loop }]
    });
    const noShared = unrelatedValidation.warnings.find(
        (entry) => entry.code === 'transition_has_no_compatible_runs'
    );
    assert.deepEqual(noShared?.sharedRunIds, []);
    assert.deepEqual(noShared?.incompatibleRunIds, []);
});

test('BuildingLayerSilhouetteModel: mixed run directions preserve physical order and independent local-u', () => {
    const loop = createDetachedLayerSilhouette(rectangle()).loop;
    loop[1].runForward = false;
    loop[3].runForward = false;
    const traversal = createSilhouetteRunTraversal(loop);

    assert.deepEqual(traversal.map((entry) => entry.runId), ['A', 'B', 'C', 'D']);
    assert.deepEqual(traversal.map((entry) => entry.loopIndex), [0, 1, 2, 3]);
    assert.deepEqual(traversal.map((entry) => [entry.localStartPointIndex, entry.localEndPointIndex]), [
        [0, 1],
        [2, 1],
        [2, 3],
        [0, 3]
    ]);
    assert.deepEqual(traversal.map((entry) => [entry.loopStartPointIndex, entry.loopEndPointIndex]), [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0]
    ]);
});

test('BuildingLayerSilhouetteModel: preferred dimensions compile only through named stretch bands', () => {
    const source = createDetachedLayerSilhouette(rectangle());
    const stretchBands = [
        { id: 'xmin_top', runId: 'A', end: 'start' },
        { id: 'xmax_top', runId: 'A', end: 'end' },
        { id: 'xmax_bottom', runId: 'C', end: 'start' },
        { id: 'xmin_bottom', runId: 'C', end: 'end' }
    ];
    const result = solveSilhouettePreferredSize({
        loop: source.loop,
        preferredSize: { widthMeters: 14, depthMeters: 6 },
        stretchBands,
        quantumMeters: 0.01
    });
    assert.equal(result.exact, true);
    assert.deepEqual(sizeOf(result.loop), { width: 14, depth: 6 });
    assert.deepEqual(result.loop.map((point) => point.runId), ['A', 'B', 'C', 'D']);
    assert.ok(result.applications.length > 0);

    const pinned = solveSilhouettePreferredSize({
        loop: source.loop,
        preferredSize: { widthMeters: 14 },
        stretchBands: []
    });
    assert.equal(pinned.exact, false);
    assert.deepEqual(sizeOf(pinned.loop), { width: 10, depth: 6 });
    assert.ok(pinned.issues.some((entry) => entry.code === 'preferred_size_has_no_stretch_bands'));
});

test('BuildingLayerSilhouetteModel: layer facade minima constrain preferred-size compilation', () => {
    const silhouette = createDetachedLayerSilhouette(rectangle(), {
        preferredSize: { widthMeters: 4, depthMeters: 6 },
        stretchBands: [
            { id: 'xmin_top', runId: 'A', end: 'start' },
            { id: 'xmax_top', runId: 'A', end: 'end' },
            { id: 'xmax_bottom', runId: 'C', end: 'start' },
            { id: 'xmin_bottom', runId: 'C', end: 'end' }
        ]
    });
    const resolved = resolveBuildingLayerSilhouettes({
        footprintLoops: [rectangle()],
        layers: [{ id: 'facade_floor', type: 'floor', silhouette }],
        minRunLengthsByLayerId: {
            facade_floor: { A: 8, C: 8 }
        }
    });
    const floor = resolved.byLayerId.facade_floor;
    assert.ok(sizeOf(floor.loop).width >= 8 - 1e-6);
    assert.equal(floor.preferredSizeResult.exact, false);
    assert.deepEqual(floor.minRunLengths, { A: 8, C: 8 });
});

test('BuildingLayerSilhouetteModel: topology remap never guesses removed authored targets', () => {
    const before = createDetachedLayerSilhouette(rectangle());
    const after = deleteSilhouetteCorner(before, { cornerId: before.loop[1].cornerId });
    const report = createSilhouetteRemapReport({
        beforeLoop: before.loop,
        afterLoop: after.loop,
        targets: [
            { targetId: 'facade:B', kind: 'facade', faceId: 'B' },
            { targetId: 'material:C', kind: 'material', faceId: 'C' },
            { targetId: 'decoration:B', kind: 'decoration', target: { bayRefs: ['B:bay_1'] } }
        ]
    });
    assert.deepEqual(report.removedRunIds, ['B']);
    assert.equal(report.targets[0].status, 'needs_decision');
    assert.equal(report.targets[1].status, 'retained');
    assert.deepEqual(report.targets[2].missingRunIds, ['B']);
    assert.equal(applySilhouetteRemapDecisions(report, {}).valid, false);

    const applied = applySilhouetteRemapDecisions(report, {
        'facade:B': { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: 'C' },
        'decoration:B': { action: SILHOUETTE_REMAP_DECISION.ORPHAN }
    });
    assert.equal(applied.valid, true);
    assert.deepEqual(applied.resolved.find((entry) => entry.targetId === 'facade:B')?.resolvedRunIds, ['C']);
    assert.deepEqual(applied.targetRemap.decisions, {
        'facade:B': { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: 'C' },
        'decoration:B': { action: SILHOUETTE_REMAP_DECISION.ORPHAN }
    });
    assert.deepEqual(applied.targetRemap.unresolved, []);
});

test('BuildingLayerSilhouetteModel: run orientation flips require an explicit target policy', () => {
    const before = createDetachedLayerSilhouette(rectangle());
    const after = cloneLayerSilhouette(before);
    after.loop[0].runForward = false;
    const report = createSilhouetteRemapReport({
        beforeLoop: before.loop,
        afterLoop: after.loop,
        targets: [
            { targetId: 'facade:A', kind: 'facade', faceId: 'A' },
            { targetId: 'material:C', kind: 'material', faceId: 'C' }
        ]
    });

    assert.deepEqual(report.retainedRunIds, ['A', 'B', 'C', 'D']);
    assert.deepEqual(report.orientationChangedRunIds, ['A']);
    assert.equal(report.targets[0].status, 'needs_decision');
    assert.deepEqual(report.targets[0].missingRunIds, []);
    assert.deepEqual(report.targets[0].incompatibleRunIds, ['A']);
    assert.match(report.targets[0].message, /orientation changed/i);
    assert.equal(report.targets[1].status, 'retained');
    assert.equal(report.requiresDecisions, true);

    assert.equal(applySilhouetteRemapDecisions(report, {}).valid, false);
    assert.equal(applySilhouetteRemapDecisions(report, {
        'facade:A': { action: SILHOUETTE_REMAP_DECISION.KEEP }
    }).valid, false, 'an orientation flip cannot silently retain the target');

    const explicit = applySilhouetteRemapDecisions(report, {
        'facade:A': { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: 'A' }
    });
    assert.equal(explicit.valid, true);
    const resolved = explicit.resolved.find((entry) => entry.targetId === 'facade:A');
    assert.equal(resolved.reverseLocalU, true);
    assert.deepEqual(resolved.orientationMappings, [{
        sourceRunId: 'A',
        targetRunId: 'A',
        affected: true,
        sourceRunForward: true,
        targetRunForward: false,
        reverseLocalU: true
    }]);
    assert.equal(explicit.targetRemap.resolved.find((entry) => entry.targetId === 'facade:A')?.reverseLocalU, true);
});

test('BuildingLayerSilhouetteModel: multi-reference remap preserves unaffected identities', () => {
    const before = createDetachedLayerSilhouette(rectangle());
    before.loop[1].runForward = false;
    const after = deleteSilhouetteCorner(before, { cornerId: before.loop[1].cornerId });
    const report = createSilhouetteRemapReport({
        beforeLoop: before.loop,
        afterLoop: after.loop,
        targets: [{
            targetId: 'face-link:A-B',
            kind: 'face_link',
            sourceFaceId: 'A',
            targetFaceId: 'B'
        }]
    });
    assert.deepEqual(report.targets[0].runIds, ['A', 'B']);
    assert.deepEqual(report.targets[0].missingRunIds, ['B']);

    const applied = applySilhouetteRemapDecisions(report, {
        'face-link:A-B': { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: 'C' }
    });
    assert.equal(applied.valid, true);
    const resolved = applied.resolved[0];
    assert.deepEqual(resolved.resolvedRunIds, ['A', 'C']);
    assert.equal(resolved.reverseLocalU, true);
    assert.deepEqual(resolved.orientationMappings, [
        {
            sourceRunId: 'A',
            targetRunId: 'A',
            affected: false,
            sourceRunForward: true,
            targetRunForward: true,
            reverseLocalU: false
        },
        {
            sourceRunId: 'B',
            targetRunId: 'C',
            affected: true,
            sourceRunForward: false,
            targetRunForward: true,
            reverseLocalU: true
        }
    ]);
});

test('BuildingLayerSilhouetteModel: compatible lot-fit applications replay once through stable provenance', () => {
    const source = createDetachedLayerSilhouette(rectangle());
    const provenance = createSilhouetteStretchProvenance({
        sourceLoop: source.loop,
        stretchBands: [{ id: 'grow_xmax', runId: 'A', end: 'end' }],
        applications: [{
            axis: 'x',
            side: 'max',
            faceId: 'A',
            end: 'end',
            appliedDelta: 2,
            crossedRunIds: ['A', 'C']
        }]
    });
    const compatible = replaySilhouetteLotFitApplications({ loop: source.loop, provenance });
    assert.equal(compatible.reachable, true);
    assert.equal(compatible.applied.length, 1);
    assert.deepEqual(sizeOf(compatible.loop), { width: 12, depth: 6 });
    assert.deepEqual(compatible.loop.map((point) => point.cornerId), source.loop.map((point) => point.cornerId));

    const withoutProvenance = replaySilhouetteLotFitApplications({
        loop: source.loop,
        applications: provenance.applications
    });
    assert.equal(withoutProvenance.reachable, false);
    assert.equal(withoutProvenance.applied.length, 0);
    assert.deepEqual(sizeOf(withoutProvenance.loop), { width: 10, depth: 6 });
    assert.ok(withoutProvenance.issues.some((entry) => entry.code === 'lot_fit_provenance_required'));

    const missingBandProvenance = { ...provenance, bands: [] };
    const missingBand = replaySilhouetteLotFitApplications({
        loop: source.loop,
        provenance: missingBandProvenance
    });
    assert.equal(missingBand.reachable, false);
    assert.equal(missingBand.applied.length, 0);
    assert.ok(missingBand.issues.some((entry) => entry.code === 'lot_fit_provenance_band_missing'));

    const incompatibleLoop = source.loop.map((point) => ({ ...point, runId: point.runId === 'A' ? 'E' : point.runId }));
    const incompatible = replaySilhouetteLotFitApplications({ loop: incompatibleLoop, provenance });
    assert.equal(incompatible.reachable, false);
    assert.equal(incompatible.applied.length, 0);
    assert.ok(incompatible.issues.some((entry) => entry.code === 'lot_fit_lineage_mapping_required'));

    const curved = setSilhouetteRunArc(source, { runId: 'A', sweepRadians: -Math.PI / 3 });
    const pinnedCurve = replaySilhouetteLotFitApplications({ loop: curved.loop, provenance });
    assert.equal(pinnedCurve.reachable, false);
    assert.ok(pinnedCurve.issues.some((entry) => entry.code === 'lot_fit_curved_band_pinned'));
    const curvePreserving = createSilhouetteStretchProvenance({
        sourceLoop: curved.loop,
        stretchBands: [{ id: 'grow_xmax', runId: 'A', end: 'end', curveRule: 'preserve_bulge' }],
        applications: provenance.applications
    });
    const curvedReplay = replaySilhouetteLotFitApplications({ loop: curved.loop, provenance: curvePreserving });
    assert.equal(curvedReplay.reachable, true);
    assert.equal(getSilhouetteRunMetrics(curvedReplay.loop, 'A').curved, true);
    assert.ok(Math.abs(getSilhouetteRunMetrics(curvedReplay.loop, 'A').sweepRadians + Math.PI / 3) < 1e-9);

    const ownedProvenance = createSilhouetteStretchProvenance({
        sourceLoop: source.loop,
        sourceLayerId: 'base_owner',
        stretchBands: [{ id: 'grow_xmax', runId: 'A', end: 'end' }],
        applications: provenance.applications
    });
    const unrelated = replaySilhouetteLotFitApplications({
        loop: source.loop,
        provenance: ownedProvenance,
        targetSourceLayerId: 'unrelated_tower'
    });
    assert.equal(unrelated.reachable, false);
    assert.ok(unrelated.issues.some((entry) => entry.code === 'lot_fit_lineage_mapping_required'));
    const explicitlyMapped = replaySilhouetteLotFitApplications({
        loop: source.loop,
        provenance: ownedProvenance,
        targetSourceLayerId: 'unrelated_tower',
        bandMap: { grow_xmax: { id: 'tower_xmax', runId: 'A', end: 'end' } }
    });
    assert.equal(explicitlyMapped.reachable, true);

    const shrinkProvenance = createSilhouetteStretchProvenance({
        sourceLoop: source.loop,
        stretchBands: [{ id: 'shrink_xmax', runId: 'A', end: 'end' }],
        applications: [{
            axis: 'x',
            side: 'max',
            faceId: 'A',
            end: 'end',
            appliedDelta: -6,
            crossedRunIds: ['A', 'C']
        }]
    });
    const minimumConstrained = replaySilhouetteLotFitApplications({
        loop: source.loop,
        provenance: shrinkProvenance,
        minRunLengths: { A: 8, C: 8 }
    });
    assert.ok(sizeOf(minimumConstrained.loop).width >= 8 - 1e-6);
    assert.equal(minimumConstrained.reachable, false);
    assert.ok(minimumConstrained.issues.some((entry) => entry.code === 'lot_fit_replay_clamped'));
});

test('BuildingLayerSilhouetteModel: working-copy clone includes identity and provenance without aliasing', () => {
    const targetRemap = {
        decisions: { 'attachment:B': { action: SILHOUETTE_REMAP_DECISION.ORPHAN } },
        resolved: [{ targetId: 'attachment:B', decision: SILHOUETTE_REMAP_DECISION.ORPHAN }],
        unresolved: []
    };
    const document = createDetachedLayerSilhouette(rectangle(), {
        preferredSize: { widthMeters: 12, depthMeters: 7 },
        stretchBands: [{ id: 'grow', runId: 'A', end: 'end' }],
        stretchProvenance: { version: 1, applications: [{ bandId: 'grow', appliedDelta: 1 }] },
        targetRemap
    });
    const cloned = cloneLayerSilhouette(document);
    assert.deepEqual(cloned, document);
    assert.notEqual(cloned, document);
    assert.notEqual(cloned.loop, document.loop);
    assert.notEqual(cloned.stretchProvenance, document.stretchProvenance);
    assert.notEqual(cloned.targetRemap, document.targetRemap);

    const jsonRoundTrip = normalizeLayerSilhouette(JSON.parse(JSON.stringify(document)));
    assert.deepEqual(jsonRoundTrip, document);
    assert.equal(jsonRoundTrip.targetRemap.version, 1);
});

test('BuildingLayerSilhouetteModel: runtime tessellation keeps one authored arc while producing a curved shell path', () => {
    const authored = setSilhouetteRunArc(createDetachedLayerSilhouette(rectangle()), {
        runId: 'A',
        sweepRadians: Math.PI / 2,
        segments: 12
    });
    const sampled = tessellateLayerSilhouetteLoopForGeometry(authored.loop);

    assert.equal(authored.loop.length, 4, 'display tessellation must not split the authored run');
    assert.equal(sampled.length, 15, 'one 12-segment arc plus three straight starts');
    const chordStart = authored.loop[0];
    const chordEnd = authored.loop[1];
    const midpoint = sampled[6];
    const chordMidpoint = {
        x: (chordStart.x + chordEnd.x) * 0.5,
        z: (chordStart.z + chordEnd.z) * 0.5
    };
    assert.ok(Math.hypot(midpoint.x - chordMidpoint.x, midpoint.z - chordMidpoint.z) > 0.5);
});

test('BuildingLayerSilhouetteModel: changed adjacent floor silhouettes plan an upper-shell transition underside', () => {
    const lower = createDetachedLayerSilhouette(rectangle(10, 6)).loop;
    const sameRotated = [...lower.slice(2), ...lower.slice(0, 2)];
    const overhang = createDetachedLayerSilhouette(rectangle(14, 8)).loop;
    const layers = [
        { id: 'lower', type: 'floor' },
        { id: 'upper', type: 'floor' },
        { id: 'roof', type: 'roof' }
    ];

    assert.deepEqual(planLayerSilhouetteTransitionSurfaces({
        layers,
        layerPlanLoopsById: new Map([['lower', [lower]], ['upper', [sameRotated]]])
    }), []);
    assert.deepEqual(planLayerSilhouetteTransitionSurfaces({
        layers,
        layerPlanLoopsById: new Map([['lower', [lower]], ['upper', [overhang]]])
    }), [{ lowerLayerId: 'lower', upperLayerId: 'upper' }]);
});

test('BuildingLayerSilhouetteModel: facade capital continuity requires run direction, lineage and design compatibility', () => {
    const source = {
        lineageId: 'building_default',
        runId: 'A',
        runForward: true,
        bayId: 'pier',
        designKey: 'layout-v1'
    };
    const key = createFacadeRunContinuityKey(source);

    assert.equal(createFacadeRunContinuityKey({ ...source }), key);
    assert.notEqual(createFacadeRunContinuityKey({ ...source, runForward: false }), key);
    assert.notEqual(createFacadeRunContinuityKey({ ...source, lineageId: 'detached:tower' }), key);
    assert.notEqual(createFacadeRunContinuityKey({ ...source, runId: 'B' }), key);
    assert.notEqual(createFacadeRunContinuityKey({ ...source, designKey: 'layout-v2' }), key);
});
