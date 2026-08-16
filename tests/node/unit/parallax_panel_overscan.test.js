// tests/node/unit/parallax_panel_overscan.test.js
// AI 496: parallax interior panel overscan math.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    PARALLAX_PANEL_MAX_GRAZING_ANGLE_DEG,
    PARALLAX_PANEL_MAX_OVERSCAN_METERS,
    computeParallaxPanelOverscanMeters,
    resolveParallaxPanelDepthMeters,
    resolveParallaxPanelOverscanMeters
} from '../../../src/app/buildings/window_mesh/ParallaxPanelOverscan.js';

const near = (actual, expected, eps, msg) => {
    assert.ok(Math.abs(actual - expected) <= eps, `${msg} (expected ${expected}, got ${actual})`);
};

test('zero depth means zero overscan (unchanged panels)', () => {
    assert.equal(computeParallaxPanelOverscanMeters({ depthMeters: 0 }), 0);
    assert.equal(computeParallaxPanelOverscanMeters({ depthMeters: -1 }), 0);
    assert.equal(computeParallaxPanelOverscanMeters({}), 0);
});

test('overscan is depth x tan(max grazing angle)', () => {
    const depth = 0.05;
    const expected = depth * Math.tan(PARALLAX_PANEL_MAX_GRAZING_ANGLE_DEG * (Math.PI / 180));
    near(computeParallaxPanelOverscanMeters({ depthMeters: depth }), expected, 1e-9, 'default angle');

    // 45 deg is the clean case: extension equals depth.
    near(
        computeParallaxPanelOverscanMeters({ depthMeters: 0.2, maxGrazingAngleDeg: 45 }),
        0.2,
        1e-9,
        'tan(45) = 1'
    );
});

test('overscan scales with the configured depth', () => {
    const shallow = computeParallaxPanelOverscanMeters({ depthMeters: 0.02, maxOverscanMeters: 99 });
    const deep = computeParallaxPanelOverscanMeters({ depthMeters: 0.08, maxOverscanMeters: 99 });
    near(deep / shallow, 4.0, 1e-6, 'four times the depth means four times the extension');
});

test('absolute cap keeps deep panels from ballooning', () => {
    const capped = computeParallaxPanelOverscanMeters({ depthMeters: 5.0 });
    assert.equal(capped, PARALLAX_PANEL_MAX_OVERSCAN_METERS);
    assert.equal(computeParallaxPanelOverscanMeters({ depthMeters: 5.0, maxOverscanMeters: 0.1 }), 0.1);
});

test('neighbor gap clamps the extension below the wall gap', () => {
    // Unclamped this would be ~0.31m; a 0.2m wall gap must win, with the
    // safety factor keeping the panel strictly inside the gap.
    const clamped = computeParallaxPanelOverscanMeters({ depthMeters: 0.1, neighborGapMeters: 0.2 });
    assert.ok(clamped < 0.2, 'extension must stay inside the wall gap');
    near(clamped, 0.18, 1e-9, '0.2m gap with the 0.9 safety factor');

    // A generous gap does not inflate the extension beyond the angle result.
    const roomy = computeParallaxPanelOverscanMeters({ depthMeters: 0.02, neighborGapMeters: 10 });
    near(roomy, 0.02 * Math.tan(PARALLAX_PANEL_MAX_GRAZING_ANGLE_DEG * (Math.PI / 180)), 1e-9, 'gap does not inflate');

    assert.equal(computeParallaxPanelOverscanMeters({ depthMeters: 0.1, neighborGapMeters: 0 }), 0, 'no gap, no overscan');

    // Regression: an unset gap must not read as a zero gap. `Number(null)` is
    // a finite 0, which would silently collapse every overscan to nothing.
    const unset = computeParallaxPanelOverscanMeters({ depthMeters: 0.05, neighborGapMeters: null });
    near(unset, 0.05 * Math.tan(PARALLAX_PANEL_MAX_GRAZING_ANGLE_DEG * (Math.PI / 180)), 1e-9, 'null gap is unconstrained');
    assert.equal(computeParallaxPanelOverscanMeters({ depthMeters: 0.05, neighborGapMeters: undefined }) > 0, true);
});

test('panel depth is derived from the glass/shade/interior offsets', () => {
    // Defaults: panel sits the minimum 0.02m behind the glass.
    near(resolveParallaxPanelDepthMeters({ shade: { enabled: false }, interior: { zOffset: 0 } }), 0.02, 1e-9, 'default offset');

    // An extra interior zOffset pushes it further back.
    near(resolveParallaxPanelDepthMeters({ shade: { enabled: false }, interior: { zOffset: -0.06 } }), 0.08, 1e-9, 'deeper panel');

    // A shade in front pushes the panel behind the shade.
    near(
        resolveParallaxPanelDepthMeters({ shade: { enabled: true, zOffset: -0.06 }, interior: { zOffset: 0 } }),
        0.08,
        1e-9,
        'behind the shade'
    );

    // A panel in front of the glass is not "behind" anything.
    assert.equal(resolveParallaxPanelDepthMeters({ shade: { enabled: false }, interior: { zOffset: 0.5 } }), 0);
    assert.equal(resolveParallaxPanelDepthMeters(null), 0);
});

test('settings helper returns zero when the interior is off', () => {
    const off = resolveParallaxPanelOverscanMeters({
        shade: { enabled: false },
        interior: { enabled: false, zOffset: -0.06 }
    });
    assert.equal(off, 0);

    const on = resolveParallaxPanelOverscanMeters({
        shade: { enabled: false },
        interior: { enabled: true, zOffset: -0.06, overscanClampMeters: null }
    });
    near(on, 0.08 * Math.tan(PARALLAX_PANEL_MAX_GRAZING_ANGLE_DEG * (Math.PI / 180)), 1e-9, 'interior on');

    const clamped = resolveParallaxPanelOverscanMeters({
        shade: { enabled: false },
        interior: { enabled: true, zOffset: -0.06, overscanClampMeters: 0.05 }
    });
    near(clamped, 0.045, 1e-9, 'generator clamp applies');
});
