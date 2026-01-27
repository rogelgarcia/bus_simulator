// Node unit tests: road markings arrow no-mark zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadMarkingsMeshDataFromRoadEngineDerived } from '../../../src/app/road_decoration/markings/RoadMarkingsBuilder.js';

function makeDerived({ asphaltMinZ, asphaltMaxZ }) {
    return {
        segments: [
            {
                dir: { x: 1, z: 0 },
                right: { x: 0, z: -1 },
                laneWidth: 4.8,
                lanesF: 1,
                lanesB: 0,
                keptPieces: [
                    {
                        aWorld: { x: 0, z: 0 },
                        length: 10
                    }
                ]
            }
        ],
        junctions: [],
        primitives: [
            {
                type: 'polygon',
                kind: 'asphalt_piece',
                points: [
                    { x: 0, z: asphaltMinZ },
                    { x: 10, z: asphaltMinZ },
                    { x: 10, z: asphaltMaxZ },
                    { x: 0, z: asphaltMaxZ }
                ]
            }
        ]
    };
}

test('RoadMarkingsBuilder: keeps arrow when fully inside asphalt no-mark zone', () => {
    const derived = makeDerived({ asphaltMinZ: -4, asphaltMaxZ: 0 });
    const markings = buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, {
        laneWidth: 4.8,
        markingY: 0,
        arrowY: 0,
        crosswalkY: 0,
        boundaryEpsilon: 1e-4
    });
    assert.equal(markings.arrowPositions.length, 27);
    assert.equal(markings.arrowsSkippedNoMarkZone, 0);
});

test('RoadMarkingsBuilder: skips arrow when it would extend beyond asphalt no-mark zone', () => {
    const derived = makeDerived({ asphaltMinZ: -3, asphaltMaxZ: 0 });
    const markings = buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, {
        laneWidth: 4.8,
        markingY: 0,
        arrowY: 0,
        crosswalkY: 0,
        boundaryEpsilon: 1e-4
    });
    assert.equal(markings.arrowPositions.length, 0);
    assert.equal(markings.arrowsSkippedNoMarkZone, 1);
});

