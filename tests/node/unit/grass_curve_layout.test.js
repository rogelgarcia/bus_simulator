// Verify the curve control points survive the road engine's minimum segment trimming.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassCurveLayout, readGrassCurveRadius } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2CurveLayout.js';
import { buildRoadEngineRoadsFromCityMap } from '../../../src/app/road_engine/RoadEngineCityMapAdapter.js';
import { computeRoadEngineEdges } from '../../../src/app/road_engine/RoadEngineCompute.js';

test('Grass curve selection preserves the straight reference and rejects unsupported radii', () => {
    assert.equal(readGrassCurveRadius(''), null);
    assert.equal(readGrassCurveRadius('?curve=off'), null);
    assert.equal(readGrassCurveRadius('?curve=18'), 18);
    assert.equal(readGrassCurveRadius('?curve=30'), 30);
    assert.throws(() => readGrassCurveRadius('?curve=bogus'));
    assert.throws(() => createGrassCurveLayout(2));
});

for (const radius of [18, 30]) test(`Grass curve ${radius} m retains a continuous filleted bend beside the reference fields`, () => {
    const layout = createGrassCurveLayout(radius);
    const map = { width: 25, height: 25, tileSize: 24, origin: { x: -288, z: -288 }, roadSegments: [layout.segment] };
    const derived = computeRoadEngineEdges({ roads: buildRoadEngineRoadsFromCityMap(map), settings: {
        tileSize: 24, origin: map.origin, laneWidth: 4.8, marginFactor: .525 / 4.8,
        junctions: { enabled: true, autoCreate: true }, trim: { enabled: true, threshold: .48 }
    } });
    const surfaces = derived.primitives.filter(p => p.type === 'polygon' && ['asphalt_piece', 'junction_surface'].includes(p.kind));
    assert.equal(surfaces.filter(p => p.kind === 'junction_surface').length, 13);
    assert.equal(surfaces.length, 27);
    assert.ok(Math.max(...surfaces.flatMap(p => p.points.map(p => p.z))) > layout.center.z + radius + 5);
    assert.ok(layout.bounds.minX > 40);
    assert.equal((layout.bounds.maxX - layout.bounds.minX) % 2, 0);
    assert.ok(layout.outline.every(p => Math.abs(Math.hypot(p.x - layout.center.x, p.z - layout.center.z) - layout.plotRadius) < 1e-9));
});
