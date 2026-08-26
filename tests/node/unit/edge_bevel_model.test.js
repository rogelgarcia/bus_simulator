// tests/node/unit/edge_bevel_model.test.js
// AI 499: plan edge bevel model — schema round-trip and the chamfer geometry
// (facet width vs cut-back, convexity, edge-fraction and clearance clamps).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    EDGE_BEVEL_CORNER_IDS,
    EDGE_BEVEL_DEFAULT_WIDTH_METERS,
    EDGE_BEVEL_MAX_EDGE_FRACTION,
    EDGE_BEVEL_SCOPE,
    EDGE_BEVEL_WIDTH_MAX_METERS,
    EDGE_BEVEL_WIDTH_MIN_METERS,
    bevelConvexLoopVertices,
    bevelRectLoopMainCorners,
    normalizeEdgeBevelConfig,
    resolveBevelCutbackMeters,
    resolveCornerBevelWidth,
    signedAreaXZ
} from '../../../src/app/buildings/EdgeBevelModel.js';

// 20m (x) by 12m (z) rect.
const RECT = Object.freeze([
    { x: -10, y: 0, z: 6 },
    { x: 10, y: 0, z: 6 },
    { x: 10, y: 0, z: -6 },
    { x: -10, y: 0, z: -6 }
]);

function assertClose(actual, expected, message, tol = 1e-9) {
    assert.ok(Math.abs(actual - expected) < tol, `${message ?? 'value'}: ${actual} != ${expected}`);
}

function hasVertexNear(loop, x, z, tol = 1e-6) {
    return loop.some((p) => Math.hypot(p.x - x, p.z - z) < tol);
}

test('schema: absent/disabled is null, scope and width are clamped', () => {
    assert.equal(normalizeEdgeBevelConfig(null), null);
    assert.equal(normalizeEdgeBevelConfig({ enabled: false }), null);

    const on = normalizeEdgeBevelConfig({ enabled: true });
    assert.equal(on.scope, EDGE_BEVEL_SCOPE.MAIN_CORNERS);
    assert.equal(on.widthMeters, EDGE_BEVEL_DEFAULT_WIDTH_METERS);
    assert.equal(on.includeConcave, false);
    for (const cornerId of EDGE_BEVEL_CORNER_IDS) {
        assert.deepEqual(on.corners[cornerId], { enabled: true, widthMeters: null });
    }

    assert.equal(normalizeEdgeBevelConfig({ enabled: true, widthMeters: 99 }).widthMeters, EDGE_BEVEL_WIDTH_MAX_METERS);
    assert.equal(normalizeEdgeBevelConfig({ enabled: true, widthMeters: 0.001 }).widthMeters, EDGE_BEVEL_WIDTH_MIN_METERS);
    assert.equal(
        normalizeEdgeBevelConfig({ enabled: true, scope: 'all_convex_edges' }).scope,
        EDGE_BEVEL_SCOPE.ALL_CONVEX_EDGES
    );
    assert.equal(normalizeEdgeBevelConfig({ enabled: true, scope: 'nonsense' }).scope, EDGE_BEVEL_SCOPE.MAIN_CORNERS);
});

test('schema: per-corner overrides round-trip', () => {
    const cfg = normalizeEdgeBevelConfig({
        enabled: true,
        widthMeters: 0.3,
        corners: { AB: { enabled: false }, BC: { widthMeters: 0.8 } }
    });
    assert.deepEqual(cfg.corners.AB, { enabled: false, widthMeters: null });
    assert.deepEqual(cfg.corners.BC, { enabled: true, widthMeters: 0.8 });

    assert.equal(resolveCornerBevelWidth(cfg, 'AB'), 0, 'a disabled corner has no width');
    assert.equal(resolveCornerBevelWidth(cfg, 'BC'), 0.8, 'the override wins');
    assert.equal(resolveCornerBevelWidth(cfg, 'CD'), 0.3, 'others fall back to the building width');
    assert.equal(resolveCornerBevelWidth(null, 'CD'), 0);

    const round = normalizeEdgeBevelConfig(cfg);
    assert.deepEqual(round, cfg, 'normalizing a normalized config is a no-op');
});

test('cut-back: a square corner cuts back w/sqrt(2) per edge', () => {
    const dirIn = { x: 1, z: 0 };
    const dirOut = { x: 0, z: -1 };
    assertClose(resolveBevelCutbackMeters({ widthMeters: 1, dirIn, dirOut }), 1 / Math.SQRT2, 'square corner');
    // A 135° interior angle (a bay-relief chamfer) cuts back further per edge.
    const shallow = resolveBevelCutbackMeters({
        widthMeters: 1,
        dirIn: { x: 1, z: 0 },
        dirOut: { x: Math.SQRT1_2, z: -Math.SQRT1_2 }
    });
    assert.ok(shallow < 1 / Math.SQRT2, 'a shallower turn needs a shorter cut-back for the same facet');
    assert.equal(resolveBevelCutbackMeters({ widthMeters: 1, dirIn, dirOut: dirIn }), 0, 'a straight edge is not a corner');
    assert.equal(resolveBevelCutbackMeters({ widthMeters: 0, dirIn, dirOut }), 0);
});

test('main corners: all four are cut and the faces shorten by the cut-back', () => {
    const config = normalizeEdgeBevelConfig({ enabled: true, widthMeters: 1.0 });
    const { loop, facets } = bevelRectLoopMainCorners({ loop: RECT, config, warnings: [] });

    assert.equal(loop.length, 8, 'a beveled rect is an octagon');
    assert.equal(facets.length, 4);
    const cut = 1.0 / Math.SQRT2;

    // Corner AB is the +x/+z vertex: it becomes (10-cut, 6) and (10, 6-cut).
    assert.ok(hasVertexNear(loop, 10 - cut, 6), 'face A shortened to the fold line');
    assert.ok(hasVertexNear(loop, 10, 6 - cut), 'face B shortened to the fold line');
    assert.ok(!hasVertexNear(loop, 10, 6), 'the sharp corner is gone');

    for (const facet of facets) {
        assertClose(facet.widthMeters, 1.0, `facet ${facet.cornerId} width`, 1e-9);
        assertClose(facet.cutbackMeters, cut, `facet ${facet.cornerId} cut-back`, 1e-9);
    }
    assert.deepEqual(facets.map((f) => f.cornerId).sort(), ['AB', 'BC', 'CD', 'DA']);
    assert.equal(Math.sign(signedAreaXZ(loop)), Math.sign(signedAreaXZ(RECT)), 'winding is preserved');
    assert.ok(Math.abs(signedAreaXZ(loop)) < Math.abs(signedAreaXZ(RECT)), 'a bevel only removes area');
});

test('main corners: per-corner enable and width are honoured', () => {
    const config = normalizeEdgeBevelConfig({
        enabled: true,
        widthMeters: 0.5,
        corners: { AB: { enabled: false }, BC: { widthMeters: 1.2 } }
    });
    const { loop, facets } = bevelRectLoopMainCorners({ loop: RECT, config, warnings: [] });

    assert.equal(facets.length, 3, 'the disabled corner stays sharp');
    assert.ok(hasVertexNear(loop, 10, 6), 'corner AB keeps its sharp vertex');
    const byId = new Map(facets.map((f) => [f.cornerId, f]));
    assertClose(byId.get('BC').widthMeters, 1.2, 'BC override', 1e-9);
    assertClose(byId.get('CD').widthMeters, 0.5, 'CD default', 1e-9);
});

test('main corners: only corners the footprint actually has are cut', () => {
    const lShape = [
        { x: -10, z: 6 }, { x: 10, z: 6 }, { x: 10, z: 0 }, { x: 0, z: 0 }, { x: 0, z: -6 }, { x: -10, z: -6 }
    ];
    const config = normalizeEdgeBevelConfig({ enabled: true, widthMeters: 0.5 });
    const warnings = [];
    const { loop, facets } = bevelRectLoopMainCorners({ loop: lShape, config, warnings });
    // Only vertices that actually sit on a bounds corner can be cut. This plan
    // has no +x/-z vertex (that is where the notch is), so corner BC is skipped
    // and said so — no bevel is invented for a corner the footprint lacks.
    assert.deepEqual(facets.map((f) => f.cornerId).sort(), ['AB', 'CD', 'DA']);
    assert.ok(warnings.some((w) => String(w).includes('corner BC')), 'the missing corner is reported');
    assert.equal(loop.length, lShape.length + 3);
});

test('convex pass: concave vertices are skipped unless opted in', () => {
    // A plan with one convex step out and one concave step back in.
    const stepped = [
        { x: -10, z: 6 }, { x: 10, z: 6 }, { x: 10, z: -6 }, { x: 0, z: -6 }, { x: 0, z: -2 }, { x: -10, z: -2 }
    ];
    const convexOnly = bevelConvexLoopVertices({ loop: stepped, widthMeters: 0.4 });
    const withConcave = bevelConvexLoopVertices({ loop: stepped, widthMeters: 0.4, includeConcave: true });
    assert.ok(withConcave.beveled > convexOnly.beveled, 'opting in cuts the re-entrant arris too');
});

test('convex pass: a cut never eats more than its share of either edge', () => {
    // A 0.3m relief step between two long runs: a 2m bevel cannot swallow it.
    const stepped = [
        { x: -10, z: 6 }, { x: 0, z: 6 }, { x: 0, z: 6.3 }, { x: 10, z: 6.3 }, { x: 10, z: -6 }, { x: -10, z: -6 }
    ];
    const { loop } = bevelConvexLoopVertices({ loop: stepped, widthMeters: 2.0 });
    const stepVertices = loop.filter((p) => Math.abs(p.x) < 1.5 && p.z > 5.5);
    for (const p of stepVertices) {
        assert.ok(
            p.z >= 6 - 1e-9 && p.z <= 6.3 + 1e-9,
            `expected the cut to stay inside the 0.3m step, got z=${p.z}`
        );
    }
    const maxCut = 0.3 * EDGE_BEVEL_MAX_EDGE_FRACTION;
    assert.ok(maxCut < 0.3, 'sanity: the fraction clamp is what bounds this');
});

test('convex pass: a per-vertex clearance ceiling clamps or skips the cut', () => {
    const config = { loop: RECT, widthMeters: 1.0 };
    const clamped = bevelConvexLoopVertices({ ...config, maxCutbackFor: () => 0.1 });
    assert.equal(clamped.beveled, 4);
    // 0.1m cut-back at a square corner is a 0.141m facet — above the minimum.
    assert.ok(hasVertexNear(clamped.loop, 10 - 0.1, 6, 1e-9), 'the clearance ceiling set the cut-back');

    const warnings = [];
    const refused = bevelConvexLoopVertices({ ...config, maxCutbackFor: () => 0.001, warnings });
    assert.equal(refused.beveled, 0, 'too little clearance leaves the arris sharp');
    assert.equal(refused.skipped, 4);
    assert.ok(warnings.some((w) => String(w).includes('no room')), 'and says so');
});

test('convex pass: vertex metadata rides onto both new vertices', () => {
    const detail = RECT.map((p, i) => ({ ...p, kind: 'profile', faceId: 'A', u: i, depth: 0 }));
    const { loop } = bevelConvexLoopVertices({
        loop: detail,
        widthMeters: 0.5,
        lerpVertex: (cur, toward, t) => ({
            ...cur,
            x: cur.x + (toward.x - cur.x) * t,
            z: cur.z + (toward.z - cur.z) * t,
            u: cur.u + (toward.u - cur.u) * t
        })
    });
    assert.ok(loop.every((p) => p.kind === 'profile' && p.faceId === 'A'), 'kind/faceId survive the cut');
    assert.equal(loop.length, 8);
});
