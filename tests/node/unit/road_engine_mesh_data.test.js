// Node unit tests: RoadEngineMeshData triangulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { triangulateSimplePolygonXZ } from '../../../src/app/road_engine/RoadEngineMeshData.js';

test('RoadEngineMeshData: triangulation faces +Y for CCW/CW inputs', () => {
    const square = [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 10 },
        { x: 0, z: 10 }
    ];

    for (const pts of [square, square.slice().reverse()]) {
        const { vertices, indices } = triangulateSimplePolygonXZ(pts);
        assert.ok(indices.length >= 3);
        for (let i = 0; i + 2 < indices.length; i += 3) {
            const a = vertices[indices[i]];
            const b = vertices[indices[i + 1]];
            const c = vertices[indices[i + 2]];
            const y = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
            assert.ok(y > 1e-9, `Expected +Y facing triangle, got ${y}`);
        }
    }
});

