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

test('WallDecoratorCatalog: defaults and options expose Simple Skirt entry', () => {
    const options = getWallDecoratorCatalogOptions();
    assert.ok(options.some((opt) => opt.id === WALL_DECORATOR_ID.SIMPLE_SKIRT));
    assert.equal(getWallDecoratorPresetOptions().length, 0, 'Expected empty wall-decoration preset catalog.');

    const entry = getWallDecoratorCatalogEntryById(WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.ok(entry);
    assert.equal(entry.id, WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.equal(typeof entry.createShapeSpecs, 'function');
    assert.ok(Array.isArray(entry.properties), 'Expected type metadata to expose property descriptors.');
    assert.ok(entry.properties.length > 0, 'Expected non-empty property metadata.');
    const propertySpecs = getWallDecoratorTypePropertySpecsById(WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.ok(propertySpecs.some((spec) => spec.type === WALL_DECORATOR_PROPERTY_TYPE.FLOAT), 'Expected float property type.');
    assert.ok(propertySpecs.some((spec) => spec.type === WALL_DECORATOR_PROPERTY_TYPE.INT), 'Expected int property type.');
    assert.ok(propertySpecs.some((spec) => spec.type === WALL_DECORATOR_PROPERTY_TYPE.ENUM), 'Expected enum property type.');
    assert.ok(propertySpecs.some((spec) => spec.type === WALL_DECORATOR_PROPERTY_TYPE.BOOL), 'Expected bool property type.');

    const state = getDefaultWallDecoratorDebuggerState();
    assert.equal(state.decoratorId, '');
    assert.equal(state.whereToApply, WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE);
    assert.equal(state.mode, WALL_DECORATOR_MODE.FACE);
    assert.equal(state.position, WALL_DECORATOR_POSITION.BOTTOM);
    assert.deepEqual(state.configuration, {}, 'Expected no configuration until a decorator type is selected.');
    assert.equal(state.materialSelection.kind, 'texture');
    assert.equal(state.materialSelection.id, 'pbr.brick_wall_11');
    const defaultSpecs = buildWallDecoratorShapeSpecs(state, { widthMeters: 10, heightMeters: 3.5, depthMeters: 0.3 });
    assert.equal(defaultSpecs.length, 0, 'Expected no default decorator mesh/spec until a type is selected.');
});

test('WallDecoratorCatalog: load entry resets placement/material to entry defaults', () => {
    const dirty = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.TOP,
        materialSelection: { kind: 'color', id: 'belt.white' },
        wallBase: { tintHex: 0x123456, roughness: 0.2, normalStrength: 1.7 },
        tiling: { enabled: true, tileMetersU: 0.5, tileMetersV: 0.5, uvEnabled: true, offsetU: 2, offsetV: 2, rotationDegrees: 23 }
    });

    const loaded = loadWallDecoratorCatalogEntry(dirty, WALL_DECORATOR_ID.SIMPLE_SKIRT);
    assert.equal(loaded.whereToApply, WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE);
    assert.equal(loaded.mode, WALL_DECORATOR_MODE.FACE);
    assert.equal(loaded.position, WALL_DECORATOR_POSITION.BOTTOM);
    assert.equal(loaded.materialSelection.kind, 'texture');
    assert.equal(loaded.materialSelection.id, 'pbr.brick_wall_11');
    assert.equal(loaded.tiling.enabled, false);
    assert.equal(loaded.tiling.uvEnabled, false);
    assert.equal(loaded.configuration.heightMeters, 0.35);
    assert.equal(loaded.configuration.depthOversizeMeters, 0.05);
    assert.equal(loaded.configuration.edgeCapMode, 'auto');
    assert.equal(loaded.configuration.edgeCapThicknessCm, 4);
    assert.equal(loaded.configuration.cornerConnector, true);
});

test('WallDecoratorCatalog: typed configuration metadata sanitizes float/int/enum/bool values', () => {
    const state = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        configuration: {
            heightMeters: 9,
            depthOversizeMeters: -3,
            nearEdgeOffsetMeters: 0.22,
            edgeCapMode: 'invalid',
            edgeCapThicknessCm: 13.8,
            cornerConnector: 0
        }
    });

    assert.equal(state.configuration.heightMeters, 2.5, 'Expected float properties clamped to metadata max.');
    assert.equal(state.configuration.depthOversizeMeters, 0, 'Expected float properties clamped to metadata min.');
    assertNear(state.configuration.nearEdgeOffsetMeters, 0.22, 1e-9, 'Expected valid float to be preserved.');
    assert.equal(state.configuration.edgeCapMode, 'auto', 'Expected enum to fallback to default option.');
    assert.equal(state.configuration.edgeCapThicknessCm, 14, 'Expected int property to round values.');
    assert.equal(state.configuration.cornerConnector, false, 'Expected bool property coercion.');
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
    const baseFrontStrip = specsBase.find((s) => s?.role === 'front_strip') ?? null;
    const baseEdgeCap = specsBase.find((s) => s?.role === 'front_corner_edge_cap') ?? null;
    assert.equal(specsBase.length, 2);
    assert.ok(baseFrontStrip, 'Expected front strip spec.');
    assert.equal(baseFrontStrip.faceId, 'front');
    assertNear(baseFrontStrip.widthMeters, 10.0, 1e-9, 'Expected full-face width coverage.');
    assertNear(baseFrontStrip.depthMeters, 0.35, 1e-9, 'Expected 5cm depth oversize on wall footprint.');
    assertNear(baseFrontStrip.heightMeters, 0.35, 1e-9, 'Expected Simple Skirt fixed profile height.');
    assertNear(baseFrontStrip.centerU, 0.0, 1e-9, 'Expected full-face center alignment.');
    assertNear(baseFrontStrip.centerV, -1.575, 1e-9, 'Expected bottom alignment at floor.');
    assert.ok(baseEdgeCap, 'Expected front corner edge cap when mode=face.');
    assert.equal(baseEdgeCap.faceId, 'front');
    assertNear(baseEdgeCap.centerU, 4.98, 1e-9, 'Expected edge cap at the front-right corner.');
    assertNear(baseEdgeCap.widthMeters, 0.04, 1e-9, 'Expected thin edge-cap closure thickness.');

    const cornerHalfNearTop = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.NEAR_TOP
    });
    const specsCornerHalf = buildWallDecoratorShapeSpecs(cornerHalfNearTop, wall);
    const cornerFrontStrip = specsCornerHalf.find((s) => s?.role === 'front_strip') ?? null;
    const cornerRightStrip = specsCornerHalf.find((s) => s?.role === 'right_strip') ?? null;
    const cornerConnector = specsCornerHalf.find((s) => s?.role === 'corner_connector') ?? null;
    assert.equal(specsCornerHalf.length, 3);
    assert.ok(cornerFrontStrip, 'Expected front strip in corner mode.');
    assert.ok(cornerRightStrip, 'Expected right strip in corner mode.');
    assert.ok(cornerConnector, 'Expected corner connector in corner mode.');
    assert.equal(cornerFrontStrip.faceId, 'front');
    assert.equal(cornerRightStrip.faceId, 'right');
    assertNear(cornerFrontStrip.widthMeters, 5.0, 1e-9, 'Expected half-face width on primary face.');
    assertNear(cornerFrontStrip.centerU, 2.5, 1e-9, 'Expected half placement anchored to the front-right corner.');
    assertNear(cornerFrontStrip.centerV, 1.475, 1e-9, 'Expected near-top placement 10cm below top.');
    assertNear(cornerRightStrip.centerU, 2.5, 1e-9, 'Expected right strip to extend half-face from corner.');
    assertNear(cornerConnector.widthMeters, 0.35, 1e-9, 'Expected corner connector to bridge front/right strips.');
    assertNear(cornerConnector.depthMeters, 0.35, 1e-9, 'Expected corner connector square footprint.');
    assertNear(cornerConnector.centerU, 4.825, 1e-9, 'Expected connector centered on front-right corner wrap.');

    const faceNoCap = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
        mode: WALL_DECORATOR_MODE.FACE,
        position: WALL_DECORATOR_POSITION.BOTTOM,
        configuration: {
            heightMeters: 0.5,
            depthOversizeMeters: 0.1,
            nearEdgeOffsetMeters: 0.25,
            edgeCapMode: 'none'
        }
    });
    const specsFaceNoCap = buildWallDecoratorShapeSpecs(faceNoCap, wall);
    assert.equal(specsFaceNoCap.length, 1, 'Expected enum configuration to disable edge-cap mesh.');
    assertNear(specsFaceNoCap[0]?.heightMeters, 0.5, 1e-9, 'Expected configured height to drive generated strip height.');
    assertNear(specsFaceNoCap[0]?.depthMeters, 0.4, 1e-9, 'Expected configured depth oversize to drive strip depth.');

    const cornerNoConnector = sanitizeWallDecoratorDebuggerState({
        decoratorId: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.HALF,
        mode: WALL_DECORATOR_MODE.CORNER,
        position: WALL_DECORATOR_POSITION.NEAR_TOP,
        configuration: {
            cornerConnector: false
        }
    });
    const specsCornerNoConnector = buildWallDecoratorShapeSpecs(cornerNoConnector, wall);
    assert.equal(specsCornerNoConnector.length, 2, 'Expected bool configuration to disable corner connector mesh.');
});
