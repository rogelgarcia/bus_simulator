// Node unit tests: wall decorator catalog + procedural shape placement model.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildWallDecoratorShapeSpecs,
    getDefaultWallDecoratorDebuggerState,
    getWallDecoratorCatalogEntryById,
    getWallDecoratorCatalogOptions,
    getWallDecoratorPresetOptions,
    getWallDecoratorTypePropertySpecsById,
    loadWallDecoratorCatalogEntry,
    sanitizeWallDecoratorDebuggerState,
    WALL_DECORATOR_ID,
    WALL_DECORATOR_MODE,
    WALL_DECORATOR_PROPERTY_TYPE,
    WALL_DECORATOR_POSITION,
    WALL_DECORATOR_WHERE_TO_APPLY
} from '../../../src/app/buildings/wall_decorators/index.js';

function assertNear(actual, expected, eps = 1e-9, msg = '') {
    const a = Number(actual);
    const e = Number(expected);
    assert.ok(Number.isFinite(a), `Expected finite number. ${msg}`);
    assert.ok(Math.abs(a - e) <= eps, `${msg} (actual=${a}, expected=${e}, eps=${eps})`);
}

test('WallDecoratorCatalog: defaults and options expose wall decorator entries', () => {
    const options = getWallDecoratorCatalogOptions();
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.SIMPLE_SKIRT));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.RIBBON));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.EDGE_BRICK_CHAIN));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.HALF_DOME));
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE));
    assert.equal(getWallDecoratorPresetOptions().length, 0, 'Expected empty wall-decoration preset catalog.');

    const entry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.ok(entry);
    assert.equal(entry.id, WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.equal(typeof entry.createShapeSpecs, 'function');
    assert.ok(Array.isArray(entry.properties), 'Expected type metadata to expose property descriptors.');
    assert.ok(entry.properties.length > 0, 'Expected non-empty property metadata.');
    const propertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.ok(propertySpecs.some((spec) => spec.type === WALL_DECORATOR_PROPERTY_TYPE.FLOAT), 'Expected float property type.');
    assert.ok(propertySpecs.some((spec) => spec.type === WALL_DECORATOR_PROPERTY_TYPE.ENUM), 'Expected enum property type.');
    assert.ok(propertySpecs.some((spec) => spec.id === 'sizePreset'), 'Expected preset property in metadata.');
    assert.ok(propertySpecs.some((spec) => spec.id === 'offsetMode'), 'Expected offset-mode property in metadata.');

    const ribbonEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.RIBBON);
    assert.ok(ribbonEntry);
    assert.equal(ribbonEntry.id, WALL_DECORATOR_ID.RIBBON);
    assert.equal(typeof ribbonEntry.createShapeSpecs, 'function');
    const ribbonPropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.RIBBON);
    const ribbonPropertyIds = ribbonPropertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        ribbonPropertyIds,
        ['sizePreset', 'offsetMode', 'nearEdgeOffsetMeters', 'patternId', 'patternNormalIntensity'],
        'Expected ribbon type to expose dedicated skirt-like sizing + pattern detail controls.'
    );
    const patternSpec = ribbonPropertySpecs.find((spec) => spec?.id === 'patternId') ?? null;
    assert.equal(patternSpec?.type, WALL_DECORATOR_PROPERTY_TYPE.ENUM, 'Expected ribbon pattern property to be enum.');
    assert.equal(patternSpec?.picker, 'thumbnail', 'Expected ribbon pattern selector to use thumbnail picker metadata.');
    const patternOptionIds = (patternSpec?.options ?? []).map((opt) => String(opt?.id ?? ''));
    assert.ok(patternOptionIds.includes('circle'), 'Expected circle ribbon pattern option.');
    assert.ok(patternOptionIds.includes('flat_base_x'), 'Expected flat-base X ribbon pattern option.');

    const edgeBrickChainEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.EDGE_BRICK_CHAIN);
    assert.ok(edgeBrickChainEntry);
    assert.equal(edgeBrickChainEntry.id, WALL_DECORATOR_ID.EDGE_BRICK_CHAIN);
    assert.equal(typeof edgeBrickChainEntry.createShapeSpecs, 'function');
    const edgeBrickChainPropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.EDGE_BRICK_CHAIN);
    const edgeBrickChainPropertyIds = edgeBrickChainPropertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        edgeBrickChainPropertyIds,
        ['edgeTarget', 'startY', 'endY', 'brickHeight', 'snapToFit'],
        'Expected edge brick chain metadata for edge targeting, range, and snap controls.'
    );

    const halfDomeEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.HALF_DOME);
    assert.ok(halfDomeEntry);
    assert.equal(halfDomeEntry.id, WALL_DECORATOR_ID.HALF_DOME);
    assert.equal(typeof halfDomeEntry.createShapeSpecs, 'function');
    const halfDomePropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.HALF_DOME);
    assert.ok(halfDomePropertySpecs.some((spec) => spec.id === 'diameterMeters'), 'Expected diameter control for half dome.');
    assert.ok(halfDomePropertySpecs.some((spec) => spec.id === 'outsetMeters'), 'Expected outset control for half dome.');

    const angledSupportEntry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE);
    assert.ok(angledSupportEntry);
    assert.equal(angledSupportEntry.id, WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE);
    assert.equal(typeof angledSupportEntry.createShapeSpecs, 'function');
    const angledSupportPropertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE);
    const angledSupportPropertyIds = angledSupportPropertySpecs.map((spec) => String(spec?.id ?? ''));
    assert.deepEqual(
        angledSupportPropertyIds,
        ['offset', 'shift', 'returnHeight'],
        'Expected angled support profile to expose only offset/shift/returnHeight parameters.'
    );

    const state = getDefaultWallDecoratorDebuggerState();
    assert.equal(state.decoratorId, '');
    assert.equal(state.whereToApply, WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE);
    assert.equal(state.mode, WALL_DECORATOR_MODE.FACE);
    assert.equal(state.position, WALL_DECORATOR_POSITION.BOTTOM);
    assert.deepEqual(state.configuration, {}, 'Expected no configuration until a decorator type is selected.');
    assert.equal(state.materialSelection.kind, 'match_wall');
    assert.equal(state.materialSelection.id, 'match_wall');
    const defaultSpecs = buildWallDecoratorShapeSpecs(state, { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 });
    assert.equal(defaultSpecs.length, 0, 'Expected no default decorator mesh/spec until a type is selected.');
});

test('WallDecoratorCatalog: load entry preserves placement and resets type-specific material/config defaults', () => {
    const dirty = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.TOP,
        materialSelection: { kind: 'color', id: 'belt.white' },
        wallBase: { tintHex: 0x123456, roughness: 0.2, normalStrength: 1.7 },
        tiling: { enabled: true, tileMetersU: 0.5, tileMetersV: 0.5, uvEnabled: true, offsetU: 2, offsetV: 2, rotationDegrees: 23 }
    });

    const loaded = loadWallDecoratorCatalogEntry(dirty, WALL_DECORATOR_ID.RIBBON);
    assert.equal(loaded.decoratorId, WALL_DECORATOR_ID.RIBBON);
    assert.equal(loaded.whereToApply, WALL_DECORATOR_WHERE_TO_APPLY.HALF);
    assert.equal(loaded.mode, WALL_DECORATOR_MODE.CORNER);
    assert.equal(loaded.position, WALL_DECORATOR_POSITION.TOP);
    assert.equal(loaded.materialSelection.kind, 'match_wall');
    assert.equal(loaded.materialSelection.id, 'match_wall');
    assert.equal(loaded.tiling.enabled, false);
    assert.equal(loaded.tiling.uvEnabled, false);
    assert.equal(typeof loaded.wallBase.tintHueDeg, 'number');
    assert.equal(typeof loaded.wallBase.tintSaturation, 'number');
    assert.equal(typeof loaded.wallBase.tintValue, 'number');
    assert.equal(typeof loaded.wallBase.tintIntensity, 'number');
    assert.equal(loaded.wallBase.tintBrightness, 1);
    assert.equal(loaded.configuration.sizePreset, 'medium');
    assert.equal(loaded.configuration.offsetMode, 'normal');
    assertNear(loaded.configuration.nearEdgeOffsetMeters, 0.1, 1e-9, 'Expected near-edge offset default.');
    assert.equal(typeof loaded.configuration.patternId, 'string', 'Expected type-specific ribbon pattern default.');
});

test('WallDecoratorCatalog: every decorator type defaults material selection to match_wall', () => {
    const types = [
        WALL_DECORATOR_ID.SIMPLE_SKIRT,
        WALL_DECORATOR_ID.RIBBON,
        WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        WALL_DECORATOR_ID.HALF_DOME,
        WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE
    ];

    for (const typeId of types) {
        const loaded = loadWallDecoratorCatalogEntry(getDefaultWallDecoratorDebuggerState(), typeId);
        assert.equal(loaded.materialSelection.kind, 'match_wall', `Expected ${typeId} default material kind to be match_wall.`);
        assert.equal(loaded.materialSelection.id, 'match_wall', `Expected ${typeId} default material id sentinel.`);
    }
});

test('WallDecoratorCatalog: material selection supports match_wall mode', () => {
    const state = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.HALF_DOME,
        materialSelection: {
            kind: 'match wall',
            id: 'should_be_ignored'
        }
    });

    assert.equal(state.materialSelection.kind, 'match_wall', 'Expected material kind normalization for match wall mode.');
    assert.equal(state.materialSelection.id, 'match_wall', 'Expected material id to normalize to match_wall sentinel.');
});

test('WallDecoratorCatalog: typed configuration metadata sanitizes enum/float values', () => {
    const state = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        configuration: {
            sizePreset: 'bad',
            offsetMode: 'wrong',
            nearEdgeOffsetMeters: 999
        }
    });

    assert.equal(state.configuration.sizePreset, 'medium', 'Expected preset enum fallback.');
    assert.equal(state.configuration.offsetMode, 'normal', 'Expected offset mode enum fallback.');
    assertNear(state.configuration.nearEdgeOffsetMeters, 2.0, 1e-9, 'Expected near-edge offset to clamp to max.');
});

test('WallDecoratorCatalog: Ribbon specs follow skirt surround rules and carry pattern-normal metadata', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };
    const state = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.RIBBON,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.NEAR_TOP,
        configuration: {
            sizePreset: 'small',
            offsetMode: 'extra',
            nearEdgeOffsetMeters: 0.12,
            patternId: 'flat_base_x',
            patternNormalIntensity: 2.1
        }
    });
    const specs = buildWallDecoratorShapeSpecs(state, wall);

    const frontMain = specs.find((s) => s?.role === 'front_main') ?? null;
    const rightMain = specs.find((s) => s?.role === 'right_main') ?? null;
    const cornerJoint = specs.find((s) => s?.role === 'corner_joint_45') ?? null;
    assert.ok(frontMain && rightMain && cornerJoint, 'Expected ribbon corner mode to emit front/right + 45deg corner joint pieces.');
    assert.equal(frontMain.geometryKind, 'ribbon', 'Expected ribbon geometry kind tag on surround segments.');
    assert.equal(rightMain.geometryKind, 'ribbon', 'Expected ribbon geometry kind tag on right-side surround segment.');
    assert.equal(cornerJoint.geometryKind, 'ribbon', 'Expected ribbon geometry kind tag on corner joint.');
    assert.equal(frontMain.ribbonPatternId, 'flat_base_x', 'Expected selected ribbon pattern id propagated to mesh specs.');
    assertNear(frontMain.ribbonPatternNormalIntensity, 2.1, 1e-9, 'Expected ribbon normal intensity propagated to specs.');
    assertNear((Number(frontMain.outsetMeters) || 0) + (Number(frontMain.depthMeters) || 0), 0.04, 1e-9, 'Expected small+extra ribbon projection to match skirt preset rules.');
});

test('WallDecoratorCatalog: Edge Brick Chain targets edges only and supports snap-to-fit alternating courses', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const rawState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        configuration: {
            edgeTarget: 'both',
            startY: 0.0,
            endY: 1.0,
            brickHeight: 0.30,
            snapToFit: false
        }
    });
    const rawSpecs = buildWallDecoratorShapeSpecs(rawState, wall);
    const rawFrontLeft = rawSpecs.filter((s) => s?.faceId === 'front' && s?.edgeColumn === 'left');
    const rawFrontRight = rawSpecs.filter((s) => s?.faceId === 'front' && s?.edgeColumn === 'right');
    assert.equal(rawFrontLeft.length, 5, 'Expected 5 alternating courses on front left edge (raw sizing with partial terminal).');
    assert.equal(rawFrontRight.length, 5, 'Expected same course count on front right edge in both-edge mode.');
    const rawHeights = rawFrontLeft.map((spec) => Number(spec?.heightMeters) || 0);
    assertNear(rawHeights[0], 0.30, 1e-9, 'Expected first raw course height.');
    assertNear(rawHeights[1], 0.15, 1e-9, 'Expected second raw course height.');
    assertNear(rawHeights[2], 0.30, 1e-9, 'Expected third raw course height.');
    assertNear(rawHeights[3], 0.15, 1e-9, 'Expected fourth raw course height.');
    assertNear(rawHeights[4], 0.10, 1e-9, 'Expected partial terminal course when snap-to-fit is disabled.');
    for (let i = 0; i < rawFrontLeft.length; i += 1) {
        assertNear(rawFrontLeft[i].heightMeters, rawFrontRight[i].heightMeters, 1e-9, 'Expected same parity sequence on both edges.');
        assertNear(rawFrontLeft[i].centerV, rawFrontRight[i].centerV, 1e-9, 'Expected both edges to start at the same Y range.');
    }

    const snapCornerState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.CORNER,
        configuration: {
            edgeTarget: 'right',
            startY: 0.0,
            endY: 1.0,
            brickHeight: 0.30,
            snapToFit: true
        }
    });
    const snapSpecs = buildWallDecoratorShapeSpecs(snapCornerState, wall);
    const snapFrontRight = snapSpecs.filter((s) => s?.faceId === 'front' && s?.edgeColumn === 'right');
    const snapRightCorner = snapSpecs.filter((s) => s?.faceId === 'right' && s?.edgeColumn === 'right');
    assert.equal(snapFrontRight.length, 5, 'Expected 5 scaled courses for snapped range.');
    assert.equal(snapRightCorner.length, 5, 'Expected corner continuation on right face for right-edge mode.');
    const snapHeights = snapFrontRight.map((spec) => Number(spec?.heightMeters) || 0);
    assertNear(snapHeights[0], 0.25, 1e-9, 'Expected snap-to-fit scaled first course.');
    assertNear(snapHeights[1], 0.125, 1e-9, 'Expected snap-to-fit scaled second course.');
    assertNear(snapHeights[4], 0.25, 1e-9, 'Expected no partial terminal course in snap-to-fit mode.');
    assert.equal(snapFrontRight.every((s) => s?.miterEnd45 === true), true, 'Expected 45-degree end miter on front corner edge courses.');
    assert.equal(snapRightCorner.every((s) => s?.miterStart45 === true), true, 'Expected 45-degree start miter on corner continuation courses.');
    const firstFrontRight = snapFrontRight[0] ?? null;
    const firstRightCorner = snapRightCorner[0] ?? null;
    assert.ok(firstFrontRight && firstRightCorner, 'Expected front/right corner courses for corner-edge validation.');
    assertNear((Number(firstFrontRight.centerU) || 0) + (Number(firstFrontRight.widthMeters) || 0) * 0.5, 5.0, 1e-9, 'Expected front corner course to keep full outer reach to the corner edge.');
    assertNear((Number(firstRightCorner.centerU) || 0) - (Number(firstRightCorner.widthMeters) || 0) * 0.5, 0.0, 1e-9, 'Expected right corner course to start exactly at the corner edge.');
});

test('WallDecoratorCatalog: Simple Skirt procedural specs honor entire/half, face/corner, and position', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const base = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.BOTTOM
    });

    const specsBase = buildWallDecoratorShapeSpecs(base, wall);
    const baseFrontMain = specsBase.find((s) => s?.role === 'front_main') ?? null;
    const baseTopClosure = specsBase.find((s) => s?.role === 'front_closure_top') ?? null;
    const baseBottomClosure = specsBase.find((s) => s?.role === 'front_closure_bottom') ?? null;
    assert.equal(specsBase.length, 4, 'Expected front main + top + side closures (no bottom closure at floor).');
    assert.ok(baseFrontMain, 'Expected front surround main piece.');
    assert.ok(baseTopClosure, 'Expected top closure piece.');
    assert.equal(baseBottomClosure, null, 'Expected no bottom closure when position is bottom/floor.');
    assert.equal(baseFrontMain.faceId, 'front');
    assertNear(baseFrontMain.widthMeters, 10.0, 1e-9, 'Expected full-face width coverage.');
    assertNear(baseFrontMain.heightMeters, 0.5, 1e-9, 'Expected medium preset height.');
    assertNear(baseFrontMain.centerU, 0.0, 1e-9, 'Expected full-face center alignment.');
    assertNear(baseFrontMain.centerV, -1.5, 1e-9, 'Expected bottom alignment at floor.');
    assertNear((Number(baseFrontMain.outsetMeters) || 0) + (Number(baseFrontMain.depthMeters) || 0), 0.05, 1e-9, 'Expected outward offset to equal medium preset 5cm.');

    const cornerHalfNearTop = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.NEAR_TOP
    });
    const specsCornerHalf = buildWallDecoratorShapeSpecs(cornerHalfNearTop, wall);
    const cornerFrontMain = specsCornerHalf.find((s) => s?.role === 'front_main') ?? null;
    const cornerRightMain = specsCornerHalf.find((s) => s?.role === 'right_main') ?? null;
    const cornerFrontTop = specsCornerHalf.find((s) => s?.role === 'front_closure_top') ?? null;
    const cornerRightTop = specsCornerHalf.find((s) => s?.role === 'right_closure_top') ?? null;
    const cornerJoint45 = specsCornerHalf.find((s) => s?.role === 'corner_joint_45') ?? null;
    assert.equal(specsCornerHalf.length, 8, 'Expected front/right surround pieces with internal 45-degree miter wedge (no extra corner joint mesh).');
    assert.ok(cornerFrontMain, 'Expected front segment in corner mode.');
    assert.ok(cornerRightMain, 'Expected right segment in corner mode.');
    assert.ok(cornerFrontTop, 'Expected front top closure in corner mode.');
    assert.ok(cornerRightTop, 'Expected right top closure in corner mode.');
    assert.equal(cornerJoint45, null, 'Expected no dedicated corner-joint mesh when internal miter wedge strategy is used.');
    assert.equal(cornerFrontMain.faceId, 'front');
    assert.equal(cornerRightMain.faceId, 'right');
    assertNear(cornerFrontMain.widthMeters, 5.0, 1e-9, 'Expected front segment to keep full span up to corner (90-degree exterior edge).');
    assertNear(cornerRightMain.widthMeters, 5.0, 1e-9, 'Expected right segment to keep full span from corner (90-degree exterior edge).');
    assertNear(cornerFrontMain.centerU, 2.5, 1e-9, 'Expected front segment center to remain full-span centered.');
    assertNear(cornerRightMain.centerU, 2.5, 1e-9, 'Expected right segment center to remain full-span centered.');
    assertNear(cornerFrontMain.centerV, 1.4, 1e-9, 'Expected near-top placement 10cm below top.');
    assert.equal(cornerFrontMain.miterEnd45, true, 'Expected front segment to use end-side 45-degree internal wedge.');
    assert.equal(cornerFrontMain.miterStart45, false, 'Expected front segment start to remain untrimmed.');
    assert.equal(cornerRightMain.miterStart45, true, 'Expected right segment to use start-side 45-degree internal wedge.');
    assert.equal(cornerRightMain.miterEnd45, false, 'Expected right segment far end to remain untrimmed.');
    assert.equal(cornerFrontTop.miterEnd45, true, 'Expected front top closure to inherit internal wedge miter.');
    assert.equal(cornerRightTop.miterStart45, true, 'Expected right top closure to inherit internal wedge miter.');
    assert.equal(specsCornerHalf.some((s) => s?.role === 'front_closure_end'), false, 'Expected no front end closure at the corner joint.');
    assert.equal(specsCornerHalf.some((s) => s?.role === 'right_closure_start'), false, 'Expected no right start closure at the corner joint.');
    for (const spec of specsCornerHalf) {
        assert.ok((Number(spec?.outsetMeters) || 0) >= 0, `Expected non-negative outward offset for ${String(spec?.role ?? 'piece')}.`);
    }

    const extraOffset = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            sizePreset: 'small',
            offsetMode: 'extra'
        }
    });
    const normalOffset = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.TOP,
        configuration: {
            sizePreset: 'small',
            offsetMode: 'normal'
        }
    });

    const specsExtra = buildWallDecoratorShapeSpecs(extraOffset, wall);
    const specsNormal = buildWallDecoratorShapeSpecs(normalOffset, wall);
    const extraFrontMain = specsExtra.find((s) => s?.role === 'front_main') ?? null;
    const normalFrontMain = specsNormal.find((s) => s?.role === 'front_main') ?? null;
    const extraTopClosure = specsExtra.find((s) => s?.role === 'front_closure_top') ?? null;
    assert.ok(extraFrontMain && normalFrontMain && extraTopClosure, 'Expected front pieces for preset/offset mode validation.');
    const extraProjection = (Number(extraFrontMain.outsetMeters) || 0) + (Number(extraFrontMain.depthMeters) || 0);
    const normalProjection = (Number(normalFrontMain.outsetMeters) || 0) + (Number(normalFrontMain.depthMeters) || 0);
    assertNear(normalProjection, 0.02, 1e-9, 'Expected small preset normal projection = 2cm.');
    assertNear(extraProjection, 0.04, 1e-9, 'Expected extra mode to double small preset projection to 4cm.');
    assertNear(extraProjection, normalProjection * 2.0, 1e-9, 'Expected extra mode to be exactly 2x normal mode.');
    assertNear(extraFrontMain.heightMeters, 0.2, 1e-9, 'Expected small preset height to drive skirt height.');
    assertNear(extraTopClosure.depthMeters, 0.04, 1e-9, 'Expected closure depth to follow outward preset offset.');
});

test('WallDecoratorCatalog: Curved Ring specs sweep half-circle profile across facade span with corner miters', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const faceState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.HALF_DOME,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.NEAR_BOTTOM,
        configuration: {
            diameterMeters: 1.2,
            outsetMeters: 0.03,
            nearEdgeOffsetMeters: 0.2
        }
    });
    const faceSpecs = buildWallDecoratorShapeSpecs(faceState, wall);
    assert.equal(faceSpecs.length, 1, 'Expected one front curved-ring sweep in face mode.');
    const faceRing = faceSpecs[0] ?? null;
    assert.ok(faceRing, 'Expected face-mode curved-ring spec.');
    assert.equal(faceRing.geometryKind, 'curved_ring');
    assert.equal(faceRing.faceId, 'front');
    assert.equal(faceRing.miterStart45, false);
    assert.equal(faceRing.miterEnd45, false);
    assertNear(faceRing.widthMeters, 5.0, 1e-9, 'Expected half-facade sweep width in face mode.');
    assertNear(faceRing.heightMeters, 1.2, 1e-9, 'Expected curved-ring height from diameter.');
    assertNear(faceRing.depthMeters, 0.6, 1e-9, 'Expected curved-ring protrusion depth to be radius.');
    assertNear(faceRing.centerU, 2.5, 1e-9, 'Expected half-facade placement centered in right-half span.');
    assertNear(faceRing.centerV, -0.95, 1e-9, 'Expected near-bottom placement offset 20cm from floor.');
    assertNear(faceRing.outsetMeters, 0.03, 1e-9, 'Expected outward offset to pass through to spec.');

    const cornerState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.HALF_DOME,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.BOTTOM,
        configuration: {
            diameterMeters: 0.8,
            outsetMeters: 0.02
        }
    });
    const cornerSpecs = buildWallDecoratorShapeSpecs(cornerState, wall);
    assert.equal(cornerSpecs.length, 2, 'Expected front + right curved-ring sweeps in corner mode.');
    const frontCorner = cornerSpecs.find((s) => s?.faceId === 'front') ?? null;
    const rightCorner = cornerSpecs.find((s) => s?.faceId === 'right') ?? null;
    assert.ok(frontCorner, 'Expected front corner curved-ring sweep.');
    assert.ok(rightCorner, 'Expected right corner curved-ring sweep.');
    assert.equal(frontCorner.geometryKind, 'curved_ring');
    assert.equal(rightCorner.geometryKind, 'curved_ring');
    assert.equal(frontCorner.miterEnd45, true, 'Expected front corner sweep to miter towards corner.');
    assert.equal(frontCorner.miterStart45, false, 'Expected front corner sweep start to stay untrimmed.');
    assert.equal(rightCorner.miterStart45, true, 'Expected right corner sweep to miter towards corner.');
    assert.equal(rightCorner.miterEnd45, false, 'Expected right corner sweep end to stay untrimmed.');
    assertNear(frontCorner.depthMeters, 0.4, 1e-9, 'Expected front corner depth from radius.');
    assertNear(rightCorner.depthMeters, 0.4, 1e-9, 'Expected right corner depth from radius.');
    assertNear(frontCorner.widthMeters, 10.0, 1e-9, 'Expected front sweep span to stay full-width with internal wedge miter.');
    assertNear(rightCorner.widthMeters, 10.0, 1e-9, 'Expected right sweep span to stay full-width with internal wedge miter.');
    assertNear(frontCorner.centerU, 0.0, 1e-9, 'Expected front sweep center to remain full-span centered.');
    assertNear(rightCorner.centerU, 5.0, 1e-9, 'Expected right sweep center to remain full-span centered.');
    assertNear(frontCorner.outsetMeters, 0.02, 1e-9, 'Expected front corner outward offset.');
    assertNear(rightCorner.outsetMeters, 0.02, 1e-9, 'Expected right corner outward offset.');
});

test('WallDecoratorCatalog: Angled Support Profile specs follow signed shift profile + corner miter rules', () => {
    const wall = { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 };

    const faceState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.BOTTOM,
        configuration: {
            offset: 0.12,
            shift: -0.04,
            returnHeight: 0.22
        }
    });
    const faceSpecs = buildWallDecoratorShapeSpecs(faceState, wall);
    assert.equal(faceSpecs.length, 1, 'Expected one continuous front support profile in face mode.');
    const faceSupport = faceSpecs[0] ?? null;
    assert.ok(faceSupport, 'Expected angled support face spec.');
    assert.equal(faceSupport.geometryKind, 'angled_support_profile');
    assert.equal(faceSupport.faceId, 'front');
    assertNear(faceSupport.widthMeters, 10.0, 1e-9, 'Expected full-facade sweep in face mode.');
    assertNear(faceSupport.profileOffsetMeters, 0.12, 1e-9, 'Expected offset parameter to map to profile offset.');
    assertNear(faceSupport.profileShiftMeters, -0.04, 1e-9, 'Expected signed shift parameter to map to profile shift.');
    assertNear(faceSupport.profileReturnHeightMeters, 0.22, 1e-9, 'Expected returnHeight parameter to map to profile return.');
    assert.equal(faceSupport.miterStart45, false, 'Expected no start miter in face mode.');
    assert.equal(faceSupport.miterEnd45, false, 'Expected no end miter in face mode.');

    const cornerState = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.NEAR_TOP,
        configuration: {
            offset: 0.10,
            shift: 0.03,
            returnHeight: 0.25
        }
    });
    const cornerSpecs = buildWallDecoratorShapeSpecs(cornerState, wall);
    assert.equal(cornerSpecs.length, 2, 'Expected front+right support sweeps in corner mode.');
    const frontSupport = cornerSpecs.find((spec) => spec?.faceId === 'front') ?? null;
    const rightSupport = cornerSpecs.find((spec) => spec?.faceId === 'right') ?? null;
    assert.ok(frontSupport, 'Expected front support in corner mode.');
    assert.ok(rightSupport, 'Expected right support in corner mode.');
    assert.equal(frontSupport.geometryKind, 'angled_support_profile', 'Expected front support profile kind.');
    assert.equal(rightSupport.geometryKind, 'angled_support_profile', 'Expected right support profile kind.');
    assert.equal(frontSupport.miterEnd45, true, 'Expected front segment to miter at corner end.');
    assert.equal(frontSupport.miterStart45, false, 'Expected front segment start to stay straight.');
    assert.equal(rightSupport.miterStart45, true, 'Expected right segment to miter at corner start.');
    assert.equal(rightSupport.miterEnd45, false, 'Expected right segment far end to stay straight.');
    assertNear(frontSupport.profileOffsetMeters, 0.10, 1e-9, 'Expected corner front offset passthrough.');
    assertNear(rightSupport.profileOffsetMeters, 0.10, 1e-9, 'Expected corner right offset passthrough.');
    assertNear(frontSupport.profileShiftMeters, 0.03, 1e-9, 'Expected corner front signed shift passthrough.');
    assertNear(rightSupport.profileShiftMeters, 0.03, 1e-9, 'Expected corner right signed shift passthrough.');
    assertNear(frontSupport.profileReturnHeightMeters, 0.25, 1e-9, 'Expected corner front return-height passthrough.');
    assertNear(rightSupport.profileReturnHeightMeters, 0.25, 1e-9, 'Expected corner right return-height passthrough.');
    assertNear(frontSupport.widthMeters, 5.0, 1e-9, 'Expected front support span to stay full-width with internal wedge miter.');
    assertNear(rightSupport.widthMeters, 5.0, 1e-9, 'Expected right support span to stay full-width with internal wedge miter.');
    assertNear(frontSupport.centerU, 2.5, 1e-9, 'Expected front support center to remain full-span centered.');
    assertNear(rightSupport.centerU, 2.5, 1e-9, 'Expected right support center to remain full-span centered.');
});
