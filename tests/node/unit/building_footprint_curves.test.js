// Node unit tests: canonical BF2 circular footprint-run math (AI 516).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeFootprintArcMetadata,
    resolveFootprintArcRun,
    reverseFootprintArcMetadata,
    sampleResolvedFootprintArc
} from '../../../src/app/buildings/footprint_curves/BuildingFootprintCurves.js';

test('BuildingFootprintCurves: quarter bulge resolves radius, sweep, and arc length', () => {
    const curve = resolveFootprintArcRun(
        { x: 18, z: 8 },
        { x: 12, z: 14 },
        { bulge: Math.SQRT2 - 1, segments: 18 }
    );
    assert.ok(curve);
    assert.ok(Math.abs(curve.radius - 6) < 1e-9);
    assert.ok(Math.abs(curve.sweep - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(curve.length - Math.PI * 3) < 1e-9);
    assert.equal(curve.segments, 18);
});

test('BuildingFootprintCurves: samples carry tangent-continuous endpoints', () => {
    const curve = resolveFootprintArcRun(
        { x: 18, z: 8 },
        { x: 12, z: 14 },
        { bulge: Math.SQRT2 - 1 }
    );
    const start = sampleResolvedFootprintArc(curve, 0);
    const end = sampleResolvedFootprintArc(curve, curve.length);
    assert.ok(Math.abs(start.tangent.x) < 1e-9);
    assert.ok(Math.abs(start.tangent.z - 1) < 1e-9);
    assert.ok(Math.abs(end.tangent.x + 1) < 1e-9);
    assert.ok(Math.abs(end.tangent.z) < 1e-9);
});

test('BuildingFootprintCurves: reversing an arc preserves its locus', () => {
    const forwardMeta = normalizeFootprintArcMetadata({ bulge: Math.SQRT2 - 1, segments: 18 });
    const reverseMeta = reverseFootprintArcMetadata(forwardMeta);
    const forward = resolveFootprintArcRun({ x: 18, z: 8 }, { x: 12, z: 14 }, forwardMeta);
    const reverse = resolveFootprintArcRun({ x: 12, z: 14 }, { x: 18, z: 8 }, reverseMeta);
    const a = sampleResolvedFootprintArc(forward, forward.length * 0.37);
    const b = sampleResolvedFootprintArc(reverse, reverse.length * 0.63);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-9);
});
