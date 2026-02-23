// Node unit tests: window decoration templates (visualization-only model).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDefaultWindowDecorationState,
    getWindowDecorationTypeMetadata,
    getWindowDecorationTypeOptions,
    sanitizeWindowDecorationState,
    resolveWindowDecorationState,
    WINDOW_DECORATION_PART,
    WINDOW_DECORATION_STYLE,
    WINDOW_DECORATION_WIDTH_MODE,
    WINDOW_DECORATION_MATERIAL_MODE
} from '../../../src/app/buildings/window_mesh/index.js';

test('WindowDecorationTemplates: defaults use template baseline and required modes', () => {
    const state = getDefaultWindowDecorationState({ wallMaterialId: 'pbr.brick_wall_11' });

    assert.equal(state.sill.enabled, false);
    assert.equal(state.sill.type, WINDOW_DECORATION_STYLE.SIMPLE);
    assert.equal(state.sill.widthMode, WINDOW_DECORATION_WIDTH_MODE.PCT_15);
    assert.equal(state.sill.depthMeters, 0.08);
    assert.equal(state.sill.material.mode, WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL);
    assert.equal(state.sill.material.materialId, 'pbr.brick_wall_11');

    assert.equal(state.header.widthMode, WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW);

    for (const partId of [WINDOW_DECORATION_PART.SILL, WINDOW_DECORATION_PART.HEADER, WINDOW_DECORATION_PART.TRIM]) {
        const part = state[partId];
        assert.equal(part.template.height, 0.08);
        assert.equal(part.template.depth, 0.08);
        assert.equal(part.template.gap, 0.0);
        assert.deepEqual(part.template.offset, { x: 0.0, y: 0.0, z: 0.0 });
    }
});

test('WindowDecorationTemplates: sill type metadata exposes bottom cover suggestions', () => {
    const sillOptions = getWindowDecorationTypeOptions(WINDOW_DECORATION_PART.SILL);
    assert.ok(sillOptions.some((opt) => opt.id === WINDOW_DECORATION_STYLE.SIMPLE));
    assert.ok(sillOptions.some((opt) => opt.id === WINDOW_DECORATION_STYLE.BOTTOM_COVER));

    const headerOptions = getWindowDecorationTypeOptions(WINDOW_DECORATION_PART.HEADER);
    assert.ok(headerOptions.every((opt) => opt.id !== WINDOW_DECORATION_STYLE.BOTTOM_COVER), 'Header should not expose bottom cover.');

    const bottomCover = getWindowDecorationTypeMetadata(WINDOW_DECORATION_PART.SILL, WINDOW_DECORATION_STYLE.BOTTOM_COVER);
    assert.equal(bottomCover?.suggestions?.widthMode, WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW);
    assert.equal(bottomCover?.suggestions?.depthMeters, 0.08);
    assert.equal(bottomCover?.suggestions?.materialMode, WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME);
    assert.equal(bottomCover?.template?.height, 0.5);
    assert.equal(bottomCover?.template?.offsetZFromDepthScale, -1.0);
});

test('WindowDecorationTemplates: sanitize maps legacy width/depth/material to constrained model', () => {
    const state = sanitizeWindowDecorationState({
        sill: {
            enabled: true,
            widthScale: 1.0,
            depth: 0.02,
            material: { mode: 'solid' }
        },
        header: {
            enabled: true,
            widthScale: 1.15,
            depth: 0.031,
            material: { mode: 'match_frame' }
        }
    }, {
        wallMaterialId: 'pbr.concrete_01'
    });

    assert.equal(state.sill.enabled, true);
    assert.equal(state.sill.widthMode, WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW);
    assert.equal(state.sill.depthMeters, 0.02);
    assert.equal(state.sill.material.mode, WINDOW_DECORATION_MATERIAL_MODE.PBR);

    assert.equal(state.header.widthMode, WINDOW_DECORATION_WIDTH_MODE.PCT_15);
    assert.equal(state.header.depthMeters, 0.02, 'Expected nearest allowed depth option to be selected.');
    assert.equal(state.header.material.mode, WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME);

    assert.equal(state.trim.material.mode, WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL);
    assert.equal(state.trim.material.materialId, 'pbr.concrete_01');
});

test('WindowDecorationTemplates: sill bottom cover applies suggestion defaults and depth-relative z offset', () => {
    const state = sanitizeWindowDecorationState({
        sill: {
            enabled: true,
            type: WINDOW_DECORATION_STYLE.BOTTOM_COVER
        }
    }, {
        wallMaterialId: 'pbr.concrete_01'
    });

    assert.equal(state.sill.type, WINDOW_DECORATION_STYLE.BOTTOM_COVER);
    assert.equal(state.sill.widthMode, WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW);
    assert.equal(state.sill.depthMeters, 0.08);
    assert.equal(state.sill.material.mode, WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME);
    assert.equal(state.sill.template.height, 0.5);
    assert.equal(state.sill.template.offset.z, -0.08);

    const resolved = resolveWindowDecorationState({
        sill: {
            enabled: true,
            type: WINDOW_DECORATION_STYLE.BOTTOM_COVER,
            depthMeters: 0.02
        }
    }, {
        wallMaterialId: 'pbr.concrete_01'
    });
    assert.equal(resolved.sill.template.depth, 0.02);
    assert.equal(resolved.sill.template.offset.z, -0.02);
});

test('WindowDecorationTemplates: resolved width semantics are deterministic', () => {
    const resolved = resolveWindowDecorationState({
        sill: {
            enabled: true,
            widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
            depthMeters: 0.08,
            material: { mode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL }
        },
        header: {
            enabled: true,
            widthMode: WINDOW_DECORATION_WIDTH_MODE.PCT_15,
            depthMeters: 0.08,
            material: { mode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME }
        }
    }, {
        wallMaterialId: 'pbr.wall_x'
    });

    assert.equal(resolved.sill.widthScale, 1.0);
    assert.equal(resolved.header.widthScale, 1.15);
    assert.equal(resolved.sill.template.depth, 0.08);
    assert.equal(resolved.header.template.depth, 0.08);
});
