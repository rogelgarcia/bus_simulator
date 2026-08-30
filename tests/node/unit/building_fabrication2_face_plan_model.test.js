// Node unit tests: BF2 curved-face plan-picker paths and authoring values.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildFacePlanPath,
    createFaceArcMetadata,
    resolveFacePlanLabelAnchor,
    resolveFaceCurveUiState
} from '../../../src/graphics/gui/building_fabrication2/BuildingFabrication2FacePlanModel.js';

test('BuildingFabrication2FacePlanModel: a curved face samples one continuous curved picker path', () => {
    const a = { x: 18, z: 8 };
    const b = { x: 12, z: 14 };
    const path = buildFacePlanPath({
        a,
        b,
        arc: { bulge: Math.SQRT2 - 1, segments: 18 }
    });

    assert.equal(path.length, 19);
    assert.deepEqual(path[0], a);
    assert.ok(Math.hypot(path.at(-1).x - b.x, path.at(-1).z - b.z) < 1e-9);
    const midpoint = path[Math.floor(path.length / 2)];
    assert.ok(Math.hypot(midpoint.x - 15, midpoint.z - 11) > 1, 'arc midpoint must not collapse to the endpoint chord');
});

test('BuildingFabrication2FacePlanModel: face labels anchor halfway along straight and curved runs', () => {
    const straightPath = buildFacePlanPath({ a: { x: 0, z: 0 }, b: { x: 12, z: 6 } });
    const straightAnchor = resolveFacePlanLabelAnchor(straightPath);
    assert.deepEqual(straightAnchor?.point, { x: 6, z: 3 });
    assert.deepEqual(straightAnchor?.tangentStart, straightPath[0]);
    assert.deepEqual(straightAnchor?.tangentEnd, straightPath[1]);

    const curvedPath = buildFacePlanPath({
        a: { x: 18, z: 8 },
        b: { x: 12, z: 14 },
        arc: { bulge: Math.SQRT2 - 1, segments: 17 }
    });
    const curvedAnchor = resolveFacePlanLabelAnchor(curvedPath);
    assert.deepEqual(curvedAnchor?.point, {
        x: (curvedPath[8].x + curvedPath[9].x) * 0.5,
        z: (curvedPath[8].z + curvedPath[9].z) * 0.5
    });
    assert.deepEqual(curvedAnchor?.tangentStart, curvedPath[7]);
    assert.deepEqual(curvedAnchor?.tangentEnd, curvedPath[10]);
});

test('BuildingFabrication2FacePlanModel: curve controls map outward direction and sweep to canonical bulge', () => {
    const arc = createFaceArcMetadata({
        direction: 'outward',
        outwardBulgeSign: -1,
        sweepDegrees: 90,
        segments: 18
    });
    assert.ok(Math.abs(arc.bulge + (Math.SQRT2 - 1)) < 1e-12);
    assert.equal(arc.segments, 18);

    const state = resolveFaceCurveUiState({ arc, outwardBulgeSign: -1 });
    assert.equal(state.enabled, true);
    assert.equal(state.direction, 'outward');
    assert.ok(Math.abs(state.sweepDegrees - 90) < 1e-9);
    assert.equal(state.segments, 18);
});

test('BuildingFabrication2FacePlanModel: straight faces seed a safe outward quarter-curve authoring state', () => {
    const state = resolveFaceCurveUiState({ arc: null, outwardBulgeSign: 1 });
    assert.deepEqual(state, {
        enabled: false,
        direction: 'outward',
        sweepDegrees: 90
    });
});
