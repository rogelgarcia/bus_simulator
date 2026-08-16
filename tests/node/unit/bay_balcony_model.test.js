// tests/node/unit/bay_balcony_model.test.js
// AI 489: bay balcony model — normalization round-trip, preset merging and
// adjacency-driven side coverage.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    BALCONY_PLACEMENT,
    BALCONY_PRESET_ID,
    BALCONY_PRESET_OPTIONS,
    BALCONY_RAILING_INFILL,
    BALCONY_SUPPORT_MODE,
    getBalconyPresetConfigById,
    getBalconyPresetPreviewConfigs,
    normalizeBalconyConfig,
    resolveBalconySideCoverage
} from '../../../src/app/buildings/BayBalconyModel.js';

test('normalizeBalconyConfig returns null for absent or disabled configs', () => {
    assert.equal(normalizeBalconyConfig(null), null);
    assert.equal(normalizeBalconyConfig(undefined), null);
    assert.equal(normalizeBalconyConfig({ enabled: false, placement: 'projecting' }), null);
});

test('normalizeBalconyConfig clamps and defaults a raw config', () => {
    const cfg = normalizeBalconyConfig({
        enabled: true,
        placement: 'weird',
        platform: { depthMeters: 99, thicknessMeters: -1, elevationMeters: 42 },
        support: { mode: 'nope', bracketHeightMeters: 99, postSizeMeters: 0 },
        railing: {
            heightMeters: 99,
            infill: 'solidWall',
            grid: { barWidthMeters: 99, spacingMeters: 0 },
            glass: { opacity: 99 },
            topRail: { widthMeters: 99 },
            posts: { maxSpacingMeters: 0 }
        },
        sides: { left: 'ALWAYS', front: 'bogus', right: 'never' },
        floors: { start: -3, every: 0, end: 2 }
    });
    assert.equal(cfg.placement, BALCONY_PLACEMENT.PROJECTING);
    assert.equal(cfg.platform.depthMeters, 2.5);
    assert.equal(cfg.platform.thicknessMeters, 0.03);
    assert.equal(cfg.platform.elevationMeters, 1.0);
    assert.equal(cfg.support.mode, BALCONY_SUPPORT_MODE.CANTILEVER);
    assert.equal(cfg.support.bracketHeightMeters, 1.2);
    assert.equal(cfg.support.postSizeMeters, 0.04);
    assert.equal(cfg.railing.heightMeters, 1.8);
    // Old draft-spec camelCase alias maps onto the implemented enum.
    assert.equal(cfg.railing.infill, BALCONY_RAILING_INFILL.SOLID_WALL);
    assert.equal(cfg.railing.grid.barWidthMeters, 0.1);
    assert.equal(cfg.railing.grid.spacingMeters, 0.04);
    assert.equal(cfg.railing.glass.opacity, 0.9);
    assert.equal(cfg.railing.topRail.widthMeters, 0.3);
    assert.equal(cfg.railing.posts.maxSpacingMeters, 0.3);
    // Side policies are case-normalized; unknown falls back to auto.
    assert.equal(cfg.sides.left, 'always');
    assert.equal(cfg.sides.front, 'auto');
    assert.equal(cfg.sides.right, 'never');
    assert.equal(cfg.floors.start, 1);
    assert.equal(cfg.floors.every, 1);
    assert.equal(cfg.floors.end, 2);
});

test('normalizeBalconyConfig depth null means auto', () => {
    const cfg = normalizeBalconyConfig({ enabled: true, placement: 'recessed' });
    assert.equal(cfg.platform.depthMeters, null);
});

test('normalizeBalconyConfig is stable under re-normalization', () => {
    // Configs are normalized once in the solver and again in the generator;
    // the null "auto depth" sentinel must survive the second pass (regression:
    // Number(null) === 0 used to clamp it to the 0.03 minimum).
    const once = normalizeBalconyConfig({ enabled: true, presetId: BALCONY_PRESET_ID.MODERN_RECESSED });
    const twice = normalizeBalconyConfig(once);
    assert.deepEqual(twice, once);
    assert.equal(twice.platform.depthMeters, null);
});

test('presets provide the base and explicit fields win', () => {
    const juliet = normalizeBalconyConfig({ enabled: true, presetId: BALCONY_PRESET_ID.JULIET_IRON });
    assert.equal(juliet.presetId, BALCONY_PRESET_ID.JULIET_IRON);
    assert.equal(juliet.placement, BALCONY_PLACEMENT.PROJECTING);
    assert.equal(juliet.platform.widthMode, 'opening');
    assert.equal(juliet.railing.infill, BALCONY_RAILING_INFILL.GRID);
    assert.equal(juliet.sides.front, 'always');

    const custom = normalizeBalconyConfig({
        enabled: true,
        presetId: BALCONY_PRESET_ID.MODERN_GLASS_PROJECTING,
        railing: { infill: 'grid' },
        platform: { depthMeters: 0.9 }
    });
    assert.equal(custom.railing.infill, BALCONY_RAILING_INFILL.GRID, 'explicit infill should override the preset');
    assert.equal(custom.platform.depthMeters, 0.9, 'explicit depth should override the preset');
    assert.equal(custom.railing.topRail.enabled, true, 'untouched preset fields survive');

    const recessed = normalizeBalconyConfig({ enabled: true, presetId: BALCONY_PRESET_ID.MODERN_RECESSED });
    assert.equal(recessed.placement, BALCONY_PLACEMENT.RECESSED);
    assert.equal(recessed.platform.depthMeters, null, 'recessed preset leaves depth on auto (notch)');

    for (const option of BALCONY_PRESET_OPTIONS) {
        assert.ok(getBalconyPresetConfigById(option.id), `preset body exists for ${option.id}`);
    }
    assert.equal(getBalconyPresetConfigById('balcony.nope'), null);
});

// Adjacency scenarios from the AI 489 prompt. Depth axis: positive = outward.
const MID_FACADE_STRIPS = {
    A: [
        { u0: 0, u1: 4, depth: 0 },
        { u0: 4, u1: 8, depth: -1.4 },
        { u0: 8, u1: 12, depth: 0 }
    ]
};

test('adjacency: mid-facade recessed balcony gets no side covers', () => {
    const cov = resolveBalconySideCoverage({
        faceId: 'A',
        u0: 4,
        u1: 8,
        platformFrontDepth: 0,
        stripsByFaceId: MID_FACADE_STRIPS
    });
    assert.deepEqual(cov, { left: false, front: true, right: false });
});

test('adjacency: recessed balcony at a wrapping corner gets exactly one side cover', () => {
    const cov = resolveBalconySideCoverage({
        faceId: 'A',
        u0: 8,
        u1: 12,
        platformFrontDepth: 0,
        stripsByFaceId: {
            A: [
                { u0: 0, u1: 8, depth: 0 },
                { u0: 8, u1: 12, depth: -1.4 }
            ],
            // The adjacent face's corner bay is also recessed (ref-4 massing
            // notch), so the corner side faces open air.
            B: [
                { u0: 0, u1: 4, depth: -1.4 },
                { u0: 4, u1: 10, depth: 0 }
            ]
        }
    });
    assert.equal(cov.left, false, 'interior side abuts the notch return wall');
    assert.equal(cov.front, true);
    assert.equal(cov.right, true, 'corner side faces the open notch');
});

test('adjacency: recessed balcony at a closed corner stays uncovered', () => {
    const cov = resolveBalconySideCoverage({
        faceId: 'A',
        u0: 8,
        u1: 12,
        platformFrontDepth: 0,
        stripsByFaceId: {
            A: [
                { u0: 0, u1: 8, depth: 0 },
                { u0: 8, u1: 12, depth: -1.4 }
            ],
            B: [{ u0: 0, u1: 10, depth: 0 }]
        }
    });
    assert.equal(cov.right, false, 'the adjacent face wall closes the notch side');
});

test('adjacency: projecting balcony covers all air-facing sides', () => {
    const cov = resolveBalconySideCoverage({
        faceId: 'A',
        u0: 4,
        u1: 8,
        platformFrontDepth: 1.5,
        stripsByFaceId: {
            A: [
                { u0: 0, u1: 4, depth: 0 },
                { u0: 4, u1: 8, depth: 0 },
                { u0: 8, u1: 12, depth: 0 }
            ]
        }
    });
    assert.deepEqual(cov, { left: true, front: true, right: true });
});

test('adjacency: a deeper proud neighbor suppresses that side cover', () => {
    const cov = resolveBalconySideCoverage({
        faceId: 'A',
        u0: 4,
        u1: 8,
        platformFrontDepth: 1.5,
        stripsByFaceId: {
            A: [
                { u0: 0, u1: 4, depth: 2.0 },
                { u0: 4, u1: 8, depth: 0 },
                { u0: 8, u1: 12, depth: 0 }
            ]
        }
    });
    assert.equal(cov.left, false, 'the proud neighbor wall covers the left side');
    assert.equal(cov.right, true);
});

test('adjacency: per-side overrides win over the adjacency result', () => {
    const cov = resolveBalconySideCoverage({
        faceId: 'A',
        u0: 4,
        u1: 8,
        platformFrontDepth: 0,
        stripsByFaceId: MID_FACADE_STRIPS,
        sides: { left: 'always', front: 'never', right: 'auto' }
    });
    assert.deepEqual(cov, { left: true, front: false, right: false });
});

test('preset preview configs are renderable single-bay buildings', () => {
    const previews = getBalconyPresetPreviewConfigs();
    assert.equal(previews.length, 3);
    const seen = new Set();
    for (const cfg of previews) {
        const bay = cfg?.facades?.A?.layout?.bays?.items?.[0] ?? null;
        assert.ok(bay?.balcony?.presetId, 'preview bay carries a balcony preset');
        assert.ok(normalizeBalconyConfig(bay.balcony), 'preview balcony normalizes');
        assert.ok(Array.isArray(cfg.layers) && cfg.layers.length > 0);
        seen.add(bay.balcony.presetId);
    }
    assert.equal(seen.size, 3, 'each preview shows a different preset');
});
