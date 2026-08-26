// tests/node/unit/rooftop_props_model.test.js
// AI 492: rooftop props model — schema round-trip, deterministic seeded
// scatter, and the roof-bounds contract every placement must satisfy.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ROOFTOP_PROP_CATALOG,
    ROOFTOP_PROP_TYPE,
    ROOFTOP_PROP_TYPE_IDS,
    computeRooftopPropFootprintCorners,
    normalizeRooftopPropsConfig,
    solveRooftopPropPlacements
} from '../../../src/app/buildings/RooftopPropsModel.js';

const RECT_ROOF = Object.freeze([
    { x: 0, z: 0 },
    { x: 22, z: 0 },
    { x: 22, z: 14 },
    { x: 0, z: 14 }
]);

function isPointInLoop(loop, x, z) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const zi = loop[i].z;
        const zj = loop[j].z;
        if ((zi > z) === (zj > z)) continue;
        const t = (z - zi) / (zj - zi);
        if (x < loop[i].x + t * (loop[j].x - loop[i].x)) inside = !inside;
    }
    return inside;
}

function insetRectLoop(loop, margin) {
    const xs = loop.map((p) => p.x);
    const zs = loop.map((p) => p.z);
    const minX = Math.min(...xs) + margin;
    const maxX = Math.max(...xs) - margin;
    const minZ = Math.min(...zs) + margin;
    const maxZ = Math.max(...zs) - margin;
    return [
        { x: minX, z: minZ },
        { x: maxX, z: minZ },
        { x: maxX, z: maxZ },
        { x: minX, z: maxZ }
    ];
}

test('normalizeRooftopPropsConfig round-trips and drops disabled/unknown input', () => {
    assert.equal(normalizeRooftopPropsConfig(null), null);
    assert.equal(normalizeRooftopPropsConfig({}), null);
    assert.equal(normalizeRooftopPropsConfig({ enabled: false, types: ['water_tower'] }), null);
    assert.equal(normalizeRooftopPropsConfig({ enabled: true, types: ['satellite_dish'] }), null);

    const once = normalizeRooftopPropsConfig({
        enabled: true,
        density: 9,
        edgeMarginMeters: -3,
        minSpacingMeters: 99,
        seedOffset: 4.6,
        types: ['MECH_BOX', 'mech_box', 'water_tower', 'nope'],
        placements: [
            { type: 'water_tower', variantId: 'large', x: 4, z: 5, rotationDegrees: 30 },
            { type: 'water_tower', x: 'nan', z: 2 },
            { type: 'unknown', x: 1, z: 1 }
        ],
        materials: { tank: 'slot:trim', frame: { kind: 'color', id: 'brown' }, mech: 12 }
    });

    assert.equal(once.density, 3.0);
    assert.equal(once.edgeMarginMeters, 0.0);
    assert.equal(once.minSpacingMeters, 8.0);
    assert.equal(once.seedOffset, 5);
    assert.deepEqual(once.types, ['mech_box', 'water_tower']);
    assert.equal(once.placements.length, 1);
    assert.equal(once.placements[0].variantId, 'large');
    assert.equal(once.materials.tank, 'slot:trim');
    assert.deepEqual(once.materials.frame, { kind: 'color', id: 'brown' });
    assert.equal(once.materials.mech, null);

    const twice = normalizeRooftopPropsConfig(once);
    assert.deepEqual(twice, once);
});

test('same seed produces the same layout, different seeds do not', () => {
    const config = normalizeRooftopPropsConfig({ enabled: true });
    const solve = (seed) => solveRooftopPropPlacements({ config, outerLoop: RECT_ROOF, seed });

    const a = solve(4242);
    const b = solve(4242);
    assert.ok(a.length > 0);
    assert.deepEqual(a, b);

    const c = solve(4243);
    assert.notDeepEqual(a, c);

    const offset = solveRooftopPropPlacements({
        config: normalizeRooftopPropsConfig({ enabled: true, seedOffset: 7 }),
        outerLoop: RECT_ROOF,
        seed: 4242
    });
    assert.notDeepEqual(a, offset);
});

test('every placement footprint stays inside the roof minus its margin', () => {
    const margin = 1.4;
    const config = normalizeRooftopPropsConfig({ enabled: true, density: 2.0, edgeMarginMeters: margin });

    for (let seed = 0; seed < 40; seed++) {
        const placements = solveRooftopPropPlacements({ config, outerLoop: RECT_ROOF, seed });
        assert.ok(placements.length > 0, `seed ${seed} placed nothing`);
        const allowed = insetRectLoop(RECT_ROOF, margin);
        for (const placement of placements) {
            for (const corner of computeRooftopPropFootprintCorners(placement)) {
                assert.ok(
                    isPointInLoop(allowed, corner.x, corner.z),
                    `seed ${seed}: ${placement.id} corner (${corner.x.toFixed(2)}, ${corner.z.toFixed(2)}) escapes the margin`
                );
            }
        }
    }
});

test('placements keep the configured spacing and avoid courtyard holes', () => {
    const config = normalizeRooftopPropsConfig({ enabled: true, density: 2.5, minSpacingMeters: 1.2 });
    const hole = [{ x: 9, z: 5 }, { x: 14, z: 5 }, { x: 14, z: 10 }, { x: 9, z: 10 }];

    for (let seed = 0; seed < 20; seed++) {
        const placements = solveRooftopPropPlacements({
            config,
            outerLoop: RECT_ROOF,
            holeLoops: [hole],
            seed
        });
        for (const placement of placements) {
            assert.ok(!isPointInLoop(hole, placement.x, placement.z), `seed ${seed}: ${placement.id} sits in the courtyard`);
            for (const corner of computeRooftopPropFootprintCorners(placement)) {
                assert.ok(!isPointInLoop(hole, corner.x, corner.z), `seed ${seed}: ${placement.id} overhangs the courtyard`);
            }
        }
        for (let i = 0; i < placements.length; i++) {
            for (let j = i + 1; j < placements.length; j++) {
                const gap = Math.hypot(placements[i].x - placements[j].x, placements[i].z - placements[j].z)
                    - placements[i].radiusMeters
                    - placements[j].radiusMeters;
                assert.ok(gap >= 1.2 - 1e-9, `seed ${seed}: ${placements[i].id}/${placements[j].id} gap ${gap.toFixed(3)}`);
            }
        }
    }
});

test('counts scale with roof area and respect the allowed type list', () => {
    const config = normalizeRooftopPropsConfig({ enabled: true });
    const countFor = (width, depth) => solveRooftopPropPlacements({
        config,
        outerLoop: [{ x: 0, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }],
        seed: 99
    }).length;

    assert.ok(countFor(40, 30) > countFor(22, 14));
    assert.ok(countFor(22, 14) > countFor(9, 8));

    // A mid-rise roof gets the reference dressing: tower + bulkhead + boxes.
    const midRise = solveRooftopPropPlacements({ config, outerLoop: RECT_ROOF, seed: 7 });
    const byType = (type) => midRise.filter((p) => p.type === type).length;
    assert.equal(byType(ROOFTOP_PROP_TYPE.WATER_TOWER), 1);
    assert.equal(byType(ROOFTOP_PROP_TYPE.ROOF_BULKHEAD), 1);
    assert.ok(byType(ROOFTOP_PROP_TYPE.MECH_BOX) >= 1);

    const towersOnly = solveRooftopPropPlacements({
        config: normalizeRooftopPropsConfig({ enabled: true, types: ['water_tower'] }),
        outerLoop: RECT_ROOF,
        seed: 7
    });
    assert.ok(towersOnly.length > 0);
    assert.ok(towersOnly.every((p) => p.type === ROOFTOP_PROP_TYPE.WATER_TOWER));
});

test('explicit hero placements are honoured, out-of-bounds ones are rejected with a warning', () => {
    const config = normalizeRooftopPropsConfig({
        enabled: true,
        types: ['water_tower'],
        placements: [
            { id: 'hero', type: 'water_tower', variantId: 'large', x: 11, z: 7, rotationDegrees: 15 },
            { id: 'over_the_street', type: 'water_tower', x: 21.5, z: 13.5 }
        ]
    });
    const warnings = [];
    const placements = solveRooftopPropPlacements({ config, outerLoop: RECT_ROOF, seed: 3, warnings });

    const hero = placements.find((p) => p.id === 'hero');
    assert.ok(hero);
    assert.equal(hero.source, 'explicit');
    assert.equal(hero.x, 11);
    assert.equal(hero.z, 7);
    assert.equal(hero.rotationDegrees, 15);
    assert.equal(placements.some((p) => p.id === 'over_the_street'), false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /over_the_street/);
});

test('catalog variants stay within the low-poly footprint budget the solver assumes', () => {
    for (const type of ROOFTOP_PROP_TYPE_IDS) {
        const entry = ROOFTOP_PROP_CATALOG[type];
        assert.ok(entry.variants.length >= 1);
        assert.ok(entry.scatter.minCount <= entry.scatter.maxCount);
        for (const variant of entry.variants) {
            assert.ok(variant.widthMeters > 0 && variant.depthMeters > 0 && variant.heightMeters > 0);
        }
    }
    assert.equal(ROOFTOP_PROP_CATALOG[ROOFTOP_PROP_TYPE.MECH_BOX].variants.length, 3);
    assert.equal(ROOFTOP_PROP_CATALOG[ROOFTOP_PROP_TYPE.WATER_TOWER].variants.length, 2);
});
