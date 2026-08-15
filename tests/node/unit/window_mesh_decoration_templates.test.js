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
    WINDOW_DECORATION_PART_IDS,
    WINDOW_DECORATION_STYLE,
    WINDOW_DECORATION_WIDTH_MODE,
    WINDOW_DECORATION_MATERIAL_MODE,
    WINDOW_DECORATION_HEADER_PROFILE_STYLES,
    WINDOW_DECORATION_JAMBS_RUN_MODE
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

test('WindowDecorationTemplates: jambs part exists with run mode round-trip', () => {
    assert.ok(WINDOW_DECORATION_PART_IDS.includes(WINDOW_DECORATION_PART.JAMBS), 'Expected jambs part id.');

    const state = sanitizeWindowDecorationState({
        jambs: {
            enabled: true,
            depthMeters: 0.02,
            runMode: 'full_bay'
        }
    }, {
        wallMaterialId: 'pbr.brick_wall_11'
    });

    assert.equal(state.jambs.enabled, true);
    assert.equal(state.jambs.type, WINDOW_DECORATION_STYLE.SIMPLE);
    assert.equal(state.jambs.runMode, WINDOW_DECORATION_JAMBS_RUN_MODE.FULL_BAY);
    assert.equal(state.jambs.depthMeters, 0.02);
    assert.equal(state.jambs.template.height, 0.1, 'Jamb width comes from the template height field.');

    const again = sanitizeWindowDecorationState(state, { wallMaterialId: 'pbr.brick_wall_11' });
    assert.deepEqual(again.jambs, state.jambs, 'Jambs state should be stable through repeated sanitize.');

    const defaultRun = sanitizeWindowDecorationState({ jambs: { enabled: true } }, {});
    assert.equal(defaultRun.jambs.runMode, WINDOW_DECORATION_JAMBS_RUN_MODE.SILL_TO_HEADER);
});

test('WindowDecorationTemplates: header profile styles round-trip with ears', () => {
    for (const styleId of WINDOW_DECORATION_HEADER_PROFILE_STYLES) {
        const state = sanitizeWindowDecorationState({
            header: {
                enabled: true,
                type: styleId,
                earsMeters: 0.05
            }
        }, {
            wallMaterialId: 'pbr.brick_wall_11'
        });

        assert.equal(state.header.type, styleId, `Header style ${styleId} should survive sanitize.`);
        assert.equal(state.header.earsMeters, 0.05, `Header ears should survive sanitize for ${styleId}.`);

        const meta = getWindowDecorationTypeMetadata(WINDOW_DECORATION_PART.HEADER, styleId);
        assert.ok(meta, `Expected metadata for header style ${styleId}.`);
        assert.ok(Number(meta?.template?.height) > 0, `Expected template height for ${styleId}.`);

        const again = sanitizeWindowDecorationState(state, { wallMaterialId: 'pbr.brick_wall_11' });
        assert.deepEqual(again.header, state.header, `Header ${styleId} should be stable through repeated sanitize.`);
    }

    const options = getWindowDecorationTypeOptions(WINDOW_DECORATION_PART.HEADER).map((opt) => opt.id);
    for (const styleId of WINDOW_DECORATION_HEADER_PROFILE_STYLES) {
        assert.ok(options.includes(styleId), `Header type options should include ${styleId}.`);
    }
    assert.ok(!getWindowDecorationTypeOptions(WINDOW_DECORATION_PART.SILL).some((opt) => opt.id === WINDOW_DECORATION_STYLE.SPLAYED_LINTEL),
        'Sill should not expose header profile styles.');

    const ears = sanitizeWindowDecorationState({
        header: { enabled: true, type: 'splayed_lintel', earsMeters: 9 }
    }, {});
    assert.equal(ears.header.earsMeters, 0.6, 'Ears should clamp to the max.');
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
