// Node unit tests: road sidewalk boundary loop construction and offset handoff.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassLabFixtureDefinition } from '../../../src/graphics/gui/grass_debugger/GrassLabContract.js';
import { ROAD_DEFAULTS } from '../../../src/graphics/assets3d/generators/GeneratorParams.js';
import { buildRoadEngineRoadsFromCityMap } from '../../../src/app/road_engine/RoadEngineCityMapAdapter.js';
import { computeRoadEngineEdges } from '../../../src/app/road_engine/RoadEngineCompute.js';
import {
    buildRoadSidewalkGrassBoundaryLoopPairs,
    buildRoadSidewalkOuterBoundaryLoopsFromRoadEnginePrimitives,
    offsetRoadSidewalkOuterBoundaryLoops
} from '../../../src/app/road_decoration/sidewalks/RoadSidewalkBuilder.js';

function boundsOf(loop) {
    return loop.reduce((bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        minZ: Math.min(bounds.minZ, point.z),
        maxX: Math.max(bounds.maxX, point.x),
        maxZ: Math.max(bounds.maxZ, point.z)
    }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
}

function assertNear(actual, expected, epsilon = 1e-9) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}.`);
}

function cross(a, b, c) {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsProperlyIntersect(a, b, c, d, epsilon = 1e-8) {
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    const opposite = (left, right) => (
        (left > epsilon && right < -epsilon)
        || (left < -epsilon && right > epsilon)
    );
    return opposite(abC, abD) && opposite(cdA, cdB);
}

function findProperNonAdjacentSelfIntersections(loop) {
    const intersections = [];
    for (let first = 0; first < loop.length; first++) {
        const firstNext = (first + 1) % loop.length;
        for (let second = first + 1; second < loop.length; second++) {
            const secondNext = (second + 1) % loop.length;
            if (first === second || firstNext === second || secondNext === first) continue;
            if (segmentsProperlyIntersect(loop[first], loop[firstNext], loop[second], loop[secondNext])) {
                intersections.push({ first, second });
            }
        }
    }
    return intersections;
}

function distanceToLoop(point, loop) {
    let best = Infinity;
    for (let index = 0; index < loop.length; index++) {
        const a = loop[index];
        const b = loop[(index + 1) % loop.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared > 0
            ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared))
            : 0;
        best = Math.min(best, Math.hypot(
            point.x - (a.x + dx * t),
            point.z - (a.z + dz * t)
        ));
    }
    return best;
}

function buildGrassLabSidewalkBoundaryFixture({ filletRadiusFactor = 1.0 } = {}) {
    const tileSize = 24;
    const width = 15;
    const height = 15;
    const origin = { x: -168, z: -168 };
    const bounds = { minX: -180, minZ: -180, maxX: 180, maxZ: 180, sizeX: 360, sizeZ: 360 };
    const roadHalfWidth = (
        ROAD_DEFAULTS.laneWidth * 2
        + ROAD_DEFAULTS.shoulder * 2
        + ROAD_DEFAULTS.curb.thickness * 2
        + ROAD_DEFAULTS.sidewalk.extraWidth * 2
    ) * 0.5;
    const fixtures = createGrassLabFixtureDefinition({ bounds, tileSize, roadHalfWidth });
    const roads = buildRoadEngineRoadsFromCityMap({
        tileSize,
        width,
        height,
        origin,
        roadNetwork: { seed: fixtures.seed },
        roadSegments: fixtures.roadSegments
    });
    const derived = computeRoadEngineEdges({
        roads,
        settings: {
            tileSize,
            laneWidth: ROAD_DEFAULTS.laneWidth,
            marginFactor: ROAD_DEFAULTS.shoulder / ROAD_DEFAULTS.laneWidth,
            origin,
            flags: {
                centerline: false,
                directionCenterlines: false,
                laneEdges: false,
                asphaltEdges: false,
                markers: false,
                asphaltObb: false
            },
            junctions: {
                enabled: true,
                autoCreate: true,
                filletRadiusFactor
            },
            trim: {
                enabled: true,
                threshold: ROAD_DEFAULTS.laneWidth * ROAD_DEFAULTS.trim.thresholdFactor
            }
        }
    });
    const asphaltPrimitives = derived.primitives.filter((primitive) => (
        primitive?.type === 'polygon'
        && (primitive.kind === 'asphalt_piece' || primitive.kind === 'junction_surface')
    ));
    const sidewalkOptions = {
        curbThickness: ROAD_DEFAULTS.curb.thickness,
        sidewalkWidth: ROAD_DEFAULTS.sidewalk.extraWidth,
        startFromCurb: true,
        boundaryEpsilon: 1e-4,
        miterLimit: 4
    };
    const renderedSourceLoops = buildRoadSidewalkOuterBoundaryLoopsFromRoadEnginePrimitives(
        asphaltPrimitives,
        sidewalkOptions
    );
    const boundaryPairs = buildRoadSidewalkGrassBoundaryLoopPairs(renderedSourceLoops, {
        distance: 0.08,
        boundaryEpsilon: 1e-4,
        miterLimit: 1.25
    });
    return { asphaltPrimitives, renderedSourceLoops, boundaryPairs, sidewalkOptions };
}

test('RoadSidewalkBuilder: offsets the exact built sidewalk outer loop by the requested distance', () => {
    const primitives = [{
        type: 'polygon',
        id: 'square-asphalt',
        kind: 'asphalt_piece',
        points: [
            { x: 0, z: 0 },
            { x: 4, z: 0 },
            { x: 4, z: 4 },
            { x: 0, z: 4 }
        ]
    }];
    const sidewalkLoops = buildRoadSidewalkOuterBoundaryLoopsFromRoadEnginePrimitives(primitives, {
        curbThickness: 0.5,
        sidewalkWidth: 1,
        boundaryEpsilon: 1e-6,
        miterLimit: 4
    });
    const sourceSnapshot = structuredClone(sidewalkLoops);
    const grassOnsetLoops = offsetRoadSidewalkOuterBoundaryLoops(sidewalkLoops, {
        distance: 0.08,
        boundaryEpsilon: 1e-6,
        miterLimit: 4
    });

    assert.equal(sidewalkLoops.length, 1);
    assert.equal(grassOnsetLoops.length, 1);
    assert.deepEqual(sidewalkLoops, sourceSnapshot, 'Expected source sidewalk loops to remain unchanged.');
    assert.notEqual(grassOnsetLoops, sidewalkLoops);
    assert.notEqual(grassOnsetLoops[0], sidewalkLoops[0]);
    assert.notEqual(grassOnsetLoops[0][0], sidewalkLoops[0][0]);

    const sidewalkBounds = boundsOf(sidewalkLoops[0]);
    const onsetBounds = boundsOf(grassOnsetLoops[0]);
    assertNear(sidewalkBounds.minX, -1.5);
    assertNear(sidewalkBounds.minZ, -1.5);
    assertNear(sidewalkBounds.maxX, 5.5);
    assertNear(sidewalkBounds.maxZ, 5.5);
    assertNear(onsetBounds.minX, -1.58);
    assertNear(onsetBounds.minZ, -1.58);
    assertNear(onsetBounds.maxX, 5.58);
    assertNear(onsetBounds.maxZ, 5.58);
});

test('RoadSidewalkBuilder: sanitizes non-positive offset requests to a cloned zero offset', () => {
    const source = [[
        { x: -2, z: -1 },
        { x: 2, z: -1 },
        { x: 2, z: 1 },
        { x: -2, z: 1 }
    ]];

    for (const distance of [-0.08, Number.NaN, Number.POSITIVE_INFINITY]) {
        const result = offsetRoadSidewalkOuterBoundaryLoops(source, {
            distance,
            boundaryEpsilon: 1e-6,
            miterLimit: 0
        });
        assert.deepEqual(result, source);
        assert.notEqual(result, source);
        assert.notEqual(result[0], source[0]);
        assert.notEqual(result[0][0], source[0][0]);
    }
});

test('RoadSidewalkBuilder: applies deterministic bounded joins to acute outer-loop corners', () => {
    const source = [[
        { x: 0, z: 0 },
        { x: 6, z: 0 },
        { x: 0.1, z: 0.2 }
    ]];
    const options = { distance: 1, boundaryEpsilon: 1e-6, miterLimit: 1.25 };
    const first = offsetRoadSidewalkOuterBoundaryLoops(source, options);
    const second = offsetRoadSidewalkOuterBoundaryLoops(source, options);

    assert.deepEqual(first, second, 'Expected identical output for identical loop inputs.');
    assert.ok(first[0].length >= source[0].length);
    for (const point of first[0]) {
        const nearestSourceVertex = Math.min(...source[0].map((sourcePoint) => Math.hypot(
            point.x - sourcePoint.x,
            point.z - sourcePoint.z
        )));
        assert.ok(nearestSourceVertex <= 1.25 + 1e-9, `Expected join displacement <= 1.25, got ${nearestSourceVertex}.`);
    }
});

test('RoadSidewalkBuilder: treats clockwise source ordering as the same outward polygon', () => {
    const ccw = [[
        { x: -2, z: -1 },
        { x: 2, z: -1 },
        { x: 2, z: 1 },
        { x: -2, z: 1 }
    ]];
    const clockwise = [ccw[0].slice().reverse()];
    const options = { distance: 0.08, boundaryEpsilon: 1e-6, miterLimit: 4 };

    assert.deepEqual(
        boundsOf(offsetRoadSidewalkOuterBoundaryLoops(clockwise, options)[0]),
        boundsOf(offsetRoadSidewalkOuterBoundaryLoops(ccw, options)[0])
    );
    assert.deepEqual(clockwise[0], ccw[0].slice().reverse(), 'Expected clockwise source points to remain untouched.');
});

test('RoadSidewalkBuilder: grass source and onset share one canonical point topology', () => {
    const source = [[
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 4 },
        { x: 0, z: 4 },
        { x: 0, z: 0 }
    ]];
    const snapshot = structuredClone(source);
    const pairs = buildRoadSidewalkGrassBoundaryLoopPairs(source, {
        distance: 0.08,
        boundaryEpsilon: 1e-6,
        miterLimit: 4
    });

    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].sourceLoop.length, 4, 'Expected the zero-area collinear vertex and closing duplicate to be removed once.');
    assert.equal(pairs[0].onsetLoop.length, pairs[0].sourceLoop.length);
    assert.deepEqual(source, snapshot, 'Expected the rendered handoff loop to remain untouched.');
    assert.deepEqual(
        offsetRoadSidewalkOuterBoundaryLoops(source, {
            distance: 0.08,
            boundaryEpsilon: 1e-6,
            miterLimit: 4
        }),
        pairs.map(({ onsetLoop }) => onsetLoop)
    );
});

test('RoadSidewalkBuilder: Grass Lab fixes its junction input without changing shared sidewalk builders', () => {
    const historical = buildGrassLabSidewalkBoundaryFixture({
        filletRadiusFactor: ROAD_DEFAULTS.junctions.filletRadiusFactor
    });
    const lab = buildGrassLabSidewalkBoundaryFixture({ filletRadiusFactor: 1.0 });

    assert.equal(historical.renderedSourceLoops.length, 1);
    assert.ok(findProperNonAdjacentSelfIntersections(historical.renderedSourceLoops[0]).length > 0);
    assert.equal(lab.renderedSourceLoops.length, 1);
    assert.deepEqual(findProperNonAdjacentSelfIntersections(lab.renderedSourceLoops[0]), []);
    assert.ok(lab.renderedSourceLoops[0].length > historical.renderedSourceLoops[0].length);
});

test('RoadSidewalkBuilder: actual Grass Lab RoadEngine loop has a stable intersection-free 80 mm onset', () => {
    const first = buildGrassLabSidewalkBoundaryFixture();
    const second = buildGrassLabSidewalkBoundaryFixture();

    assert.deepEqual(first, second, 'Expected the pure Grass Lab RoadEngine fixture to be deterministic.');
    assert.equal(first.renderedSourceLoops.length, 1);
    assert.equal(first.boundaryPairs.length, 1);
    assert.ok(first.renderedSourceLoops[0].length > 300, 'Expected the real curved/diagonal rendered boundary, not a reduced synthetic polygon.');

    const pair = first.boundaryPairs[0];
    assert.equal(pair.sourceLoop.length, pair.onsetLoop.length);
    assert.deepEqual(findProperNonAdjacentSelfIntersections(first.renderedSourceLoops[0]), []);
    assert.deepEqual(findProperNonAdjacentSelfIntersections(pair.sourceLoop), []);
    assert.deepEqual(findProperNonAdjacentSelfIntersections(pair.onsetLoop), []);

    const tolerance = 1e-6;
    const onsetDistances = pair.onsetLoop.map((point) => distanceToLoop(point, pair.sourceLoop));
    assert.ok(onsetDistances.length > 250);
    for (const distance of onsetDistances) {
        assert.ok(
            distance >= 0.06 - tolerance && distance <= 0.1 + tolerance,
            `Expected the 80 mm onset vertex distance to stay within 60-100 mm, got ${distance} m.`
        );
    }
    assert.ok(onsetDistances.some((distance) => Math.abs(distance - 0.08) <= tolerance));
});
