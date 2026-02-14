// Node unit tests: sidewalk grass-edge dirt strip mesh builder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadSidewalkEdgeDirtStripMeshDataFromRoadEnginePrimitives } from '../../../src/app/road_decoration/wear/RoadSidewalkEdgeDirtStripBuilder.js';

function crossY(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const abx = bx - ax;
    const abz = bz - az;
    const acx = cx - ax;
    const acz = cz - az;
    return abz * acx - abx * acz;
}

test('RoadSidewalkEdgeDirtStripBuilder: builds outward strip with UV gradient', () => {
    const primitives = [{
        type: 'polygon',
        kind: 'asphalt_piece',
        points: [
            { x: -2, z: -2 },
            { x: 2, z: -2 },
            { x: 2, z: 2 },
            { x: -2, z: 2 }
        ]
    }];

    const strip = buildRoadSidewalkEdgeDirtStripMeshDataFromRoadEnginePrimitives(primitives, {
        surfaceY: 0.02,
        curbThickness: 0.48,
        sidewalkWidth: 1.875,
        stripWidth: 0.65,
        lift: 0.0012
    });

    assert.ok(strip.positions instanceof Float32Array);
    assert.ok(strip.uvs instanceof Float32Array);
    assert.ok(strip.positions.length > 0, 'Expected strip positions.');
    assert.equal(strip.positions.length / 3, strip.uvs.length / 2, 'Expected one UV per vertex.');

    const expectedY = 0.0212;
    for (let i = 1; i < strip.positions.length; i += 3) {
        assert.ok(Math.abs(strip.positions[i] - expectedY) <= 1e-6, `Expected flat strip at y=${expectedY}.`);
    }

    let sawV0 = false;
    let sawV1 = false;
    for (let i = 1; i < strip.uvs.length; i += 2) {
        const v = strip.uvs[i];
        if (Math.abs(v - 0) <= 1e-6) sawV0 = true;
        if (Math.abs(v - 1) <= 1e-6) sawV1 = true;
    }
    assert.equal(sawV0, true, 'Expected UV v=0 at sidewalk edge.');
    assert.equal(sawV1, true, 'Expected UV v=1 at grass edge.');
});

test('RoadSidewalkEdgeDirtStripBuilder: top-face winding points upward', () => {
    const primitives = [{
        type: 'polygon',
        kind: 'asphalt_piece',
        points: [
            { x: -1, z: -1 },
            { x: 1, z: -1 },
            { x: 1, z: 1 },
            { x: -1, z: 1 }
        ]
    }];

    const strip = buildRoadSidewalkEdgeDirtStripMeshDataFromRoadEnginePrimitives(primitives, {
        stripWidth: 0.5
    });
    assert.ok(strip.positions.length >= 9, 'Expected at least one triangle.');

    const p = strip.positions;
    const ny = crossY(
        p[0], p[1], p[2],
        p[3], p[4], p[5],
        p[6], p[7], p[8]
    );
    assert.ok(ny > 0, `Expected first triangle winding to produce +Y normal, got ${ny}.`);
});
