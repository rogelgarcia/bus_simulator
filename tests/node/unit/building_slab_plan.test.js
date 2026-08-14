// Node unit tests: building foundation slab planning (region field core).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SLAB_EDGE_MODE,
    planBuildingSlabs,
    signedAreaXZ
} from '../../../src/app/city/BuildingSlabPlan.js';

function rect(minX, minZ, maxX, maxZ) {
    return [
        { x: minX, z: minZ },
        { x: maxX, z: minZ },
        { x: maxX, z: maxZ },
        { x: minX, z: maxZ }
    ];
}

function loopBounds(loop) {
    const xs = loop.map((p) => p.x);
    const zs = loop.map((p) => p.z);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs)
    };
}

function insideLoop(loop, p) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i];
        const b = loop[j];
        if ((a.z > p.z) !== (b.z > p.z)
            && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

const SQUARE = rect(-5, -5, 5, 5);
const TOL = 0.2;

test('BuildingSlabPlan: isolated building gets a 1m beveled apron ring', () => {
    const plans = planBuildingSlabs({ footprintLoops: [SQUARE], sidewalkBoundaries: [] });
    assert.equal(plans.length, 1);
    const plan = plans[0];
    assert.ok(signedAreaXZ(plan.top) > 0);

    const b = loopBounds(plan.top);
    assert.ok(Math.abs(b.maxX - 6) < TOL, `maxX ${b.maxX}`);
    assert.ok(Math.abs(b.minX - -6) < TOL);
    assert.ok(Math.abs(b.maxZ - 6) < TOL);
    assert.ok(Math.abs(b.minZ - -6) < TOL);

    for (const mode of plan.edgeModes) assert.equal(mode, SLAB_EDGE_MODE.BEVEL);
    const fb = loopBounds(plan.foot);
    assert.ok(fb.maxX > b.maxX + 0.1);
});

test('BuildingSlabPlan: a sidewalk within reach gets an exact flush cut', () => {
    // Sidewalk region starting at x = 8.5: 2.5m beyond the apron edge.
    const boundary = [rect(8.5, -40, 30, 40)];
    const plans = planBuildingSlabs({ footprintLoops: [SQUARE], sidewalkBoundaries: boundary });
    assert.equal(plans.length, 1);
    const plan = plans[0];

    const flushPoints = plan.top.filter((p) => Math.abs(p.x - 8.5) < 0.08 && Math.abs(p.z) < 5);
    assert.ok(flushPoints.length >= 2, `expected flush points on the boundary, got ${flushPoints.length}`);
    assert.ok(plan.edgeModes.includes(SLAB_EDGE_MODE.CONNECT));

    const b = loopBounds(plan.top);
    assert.ok(b.maxX <= 8.5 + 0.08, `maxX ${b.maxX}`);

    for (let i = 0; i < plan.top.length; i++) {
        if (Math.abs(plan.top[i].x - 8.5) < 0.08) {
            const dx = plan.foot[i].x - plan.top[i].x;
            const dz = plan.foot[i].z - plan.top[i].z;
            assert.ok(Math.hypot(dx, dz) < 1e-6);
        }
    }
});

test('BuildingSlabPlan: sidewalks beyond reach leave a plain apron', () => {
    const boundary = [rect(11.5, -40, 30, 40)];
    const plans = planBuildingSlabs({ footprintLoops: [SQUARE], sidewalkBoundaries: boundary });
    assert.equal(plans.length, 1);
    const b = loopBounds(plans[0].top);
    assert.ok(b.maxX < 6 + TOL, `maxX ${b.maxX}`);
    assert.ok(!plans[0].edgeModes.includes(SLAB_EDGE_MODE.CONNECT));
});

test('BuildingSlabPlan: slanted sidewalks are cut along their line', () => {
    // Sidewalk region whose west boundary is slanted, 2.5-4.6m from the facade.
    const boundary = [[
        { x: 7.5, z: -12 },
        { x: 10.5, z: 12 },
        { x: 30, z: 12 },
        { x: 30, z: -12 }
    ]];
    const plans = planBuildingSlabs({ footprintLoops: [SQUARE], sidewalkBoundaries: boundary });
    assert.equal(plans.length, 1);
    const plan = plans[0];

    const distToLine = (p) => {
        const a = { x: 7.5, z: -12 };
        const b = { x: 10.5, z: 12 };
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz)));
        return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
    };
    const flush = plan.top.filter((p) => p.x > 6.5 && distToLine(p) < 0.08);
    assert.ok(flush.length >= 3, `cut should follow the slanted boundary (${flush.length})`);
    const zs = flush.map((p) => p.z);
    assert.ok(Math.max(...zs) - Math.min(...zs) > 3, 'cut should span along the boundary');
});

test('BuildingSlabPlan: slab-sidewalk transitions are straight, not blended', () => {
    // Sidewalk region only beside the south half of the facade: the strip
    // connects flush there and returns STRAIGHT to the apron where the
    // sidewalk ends - no curved taper along the sidewalk-facing side.
    const boundary = [rect(8, -40, 30, 0)];
    const plans = planBuildingSlabs({ footprintLoops: [SQUARE], sidewalkBoundaries: boundary });
    assert.equal(plans.length, 1);
    const plan = plans[0];

    const flush = plan.top.filter((p) => Math.abs(p.x - 8) < 0.08);
    assert.ok(flush.length >= 2, 'expected a flush run against the sidewalk');
    for (const p of flush) assert.ok(p.z <= 0.45, `flush point past the sidewalk end: z ${p.z}`);

    // Beyond the sidewalk end the outline is back at the apron: no points in
    // the taper wedge a smooth blend would create.
    const stray = plan.top.filter((p) => p.x > 6.4 && p.z > 1.2);
    assert.equal(stray.length, 0, `blend points found: ${JSON.stringify(stray)}`);
});

test('BuildingSlabPlan: near buildings merge across a partial bridge', () => {
    const a = rect(-12, -4, -2, 4);
    const b = rect(0.8, 0, 10.8, 12);
    const plans = planBuildingSlabs({ footprintLoops: [a, b], sidewalkBoundaries: [] });
    assert.equal(plans.length, 1, 'slabs should merge into one outline');

    const outline = plans[0].top;
    assert.equal(insideLoop(outline, { x: -0.6, z: 2 }), true);
    assert.equal(insideLoop(outline, { x: -0.6, z: 11 }), false);
});

test('BuildingSlabPlan: far buildings stay separate', () => {
    const a = rect(-12, -4, -2, 4);
    const b = rect(4, -4, 14, 4);
    const plans = planBuildingSlabs({ footprintLoops: [a, b], sidewalkBoundaries: [] });
    assert.equal(plans.length, 2);
});

test('BuildingSlabPlan: pockets enclosed by slabs and sidewalk fill up', () => {
    // Two bridged buildings with a sidewalk across their north facades: the
    // pocket between the two connect strips, the bridge neck, and the
    // sidewalk is fully enclosed - it must become slab.
    const a = rect(-15, -5, -1, 5);
    const b = rect(1, -5, 15, 5);
    const boundary = [rect(-40, 8.9, 40, 30)];
    const plans = planBuildingSlabs({ footprintLoops: [a, b], sidewalkBoundaries: boundary });
    assert.equal(plans.length, 1);
    const outline = plans[0].top;

    assert.equal(insideLoop(outline, { x: 0, z: 8.2 }), true, 'enclosed pocket should be filled');
    assert.equal(insideLoop(outline, { x: 0, z: 0 }), true, 'bridge neck');
    // The fill never crosses into the sidewalk region.
    const b2 = loopBounds(outline);
    assert.ok(b2.maxZ <= 8.9 + 0.08, `maxZ ${b2.maxZ}`);
});

test('BuildingSlabPlan: degenerate input yields no plans', () => {
    assert.deepEqual(planBuildingSlabs({ footprintLoops: [] }), []);
    assert.deepEqual(planBuildingSlabs({ footprintLoops: [[{ x: 0, z: 0 }]] }), []);
});
