// Node unit tests: Window mesh settings + deterministic instance variation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDefaultWindowMeshSettings,
    sanitizeWindowMeshSettings,
    computeWindowMeshInstanceVariation,
    computeWindowMeshInstanceVariationFromSanitized,
    WINDOW_SHADE_DIRECTION,
    WINDOW_INTERIOR_ATLAS_ID,
    PARALLAX_INTERIOR_PRESET_ID
} from '../../../src/app/buildings/window_mesh/index.js';

test('WindowMeshSettings: arch disables when it cannot fit', () => {
    const s = sanitizeWindowMeshSettings({
        width: 1.0,
        height: 0.4,
        arch: { enabled: true, heightRatio: 0.5 }
    });
    assert.equal(s.arch.enabled, false);
});

test('WindowMeshSettings: muntins enabled requires grid divisions', () => {
    const s = sanitizeWindowMeshSettings({
        muntins: { enabled: true, columns: 1, rows: 1 }
    });
    assert.equal(s.muntins.enabled, false);
});

test('WindowMeshSettings: shade direction defaults to top-to-bottom', () => {
    const s = sanitizeWindowMeshSettings({
        shade: { direction: 'nope' }
    });
    assert.equal(s.shade.direction, WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM);
});

test('WindowMeshVariation: same seed+id is deterministic', () => {
    const settings = getDefaultWindowMeshSettings();
    const a = computeWindowMeshInstanceVariation({ settings, seed: 'seed', id: 'f0_c0' });
    const b = computeWindowMeshInstanceVariation({ settings, seed: 'seed', id: 'f0_c0' });
    assert.deepEqual(a, b);
});

test('WindowMeshVariation: random L/R shade direction is deterministic', () => {
    const defaults = getDefaultWindowMeshSettings();
    const settings = sanitizeWindowMeshSettings({
        ...defaults,
        shade: { ...defaults.shade, direction: WINDOW_SHADE_DIRECTION.RANDOM_LR, randomizeCoverage: false, coverage: 0.5 }
    });

    const a = computeWindowMeshInstanceVariationFromSanitized({ settings, seed: 'seed', id: 'f0_c0' });
    const b = computeWindowMeshInstanceVariationFromSanitized({ settings, seed: 'seed', id: 'f0_c0' });
    assert.equal(a.shadeDirection, b.shadeDirection);
    assert.ok([WINDOW_SHADE_DIRECTION.LEFT_TO_RIGHT, WINDOW_SHADE_DIRECTION.RIGHT_TO_LEFT].includes(a.shadeDirection));
});

test('WindowMeshVariation: output stays in expected ranges', () => {
    const settings = sanitizeWindowMeshSettings({
        ...getDefaultWindowMeshSettings(),
        interior: {
            enabled: true,
            atlasId: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL,
            randomizeCell: true,
            cell: { col: 0, row: 0 },
            randomFlipX: true,
            parallaxDepthMeters: 3,
            tintVariation: {
                hueShiftDeg: { min: -5, max: 5 },
                saturationMul: { min: 0.9, max: 1.1 },
                brightnessMul: { min: 0.8, max: 1.2 }
            }
        }
    });

    const v = computeWindowMeshInstanceVariationFromSanitized({ settings, seed: 'seed', id: 'f1_c2' });
    assert.ok([0.0, 0.2, 0.5, 1.0].includes(v.shadeCoverage));
    assert.ok([
        WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM,
        WINDOW_SHADE_DIRECTION.LEFT_TO_RIGHT,
        WINDOW_SHADE_DIRECTION.RIGHT_TO_LEFT
    ].includes(v.shadeDirection));
    assert.ok(Number.isInteger(v.interiorCell.col) && v.interiorCell.col >= 0 && v.interiorCell.col < 4);
    assert.ok(Number.isInteger(v.interiorCell.row) && v.interiorCell.row >= 0 && v.interiorCell.row < 4);
    assert.ok(typeof v.interiorFlipX === 'boolean');
    assert.ok(v.interiorTint.hueShiftDeg >= -5 && v.interiorTint.hueShiftDeg <= 5);
    assert.ok(v.interiorTint.saturationMul >= 0.9 && v.interiorTint.saturationMul <= 1.1);
    assert.ok(v.interiorTint.brightnessMul >= 0.8 && v.interiorTint.brightnessMul <= 1.2);
});

test('WindowMeshSettings: parallax interior presets override atlas/depth/zoom', () => {
    const s = sanitizeWindowMeshSettings({
        interior: {
            enabled: true,
            parallaxInteriorPresetId: PARALLAX_INTERIOR_PRESET_ID.OFFICE,
            atlasId: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL,
            uvZoom: 9,
            parallaxDepthMeters: 0
        }
    });

    assert.equal(s.interior.parallaxInteriorPresetId, PARALLAX_INTERIOR_PRESET_ID.OFFICE);
    assert.equal(s.interior.atlasId, WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4);
    assert.equal(s.interior.uvZoom, 1.6);
    assert.equal(s.interior.parallaxDepthMeters, 20.0);
});
