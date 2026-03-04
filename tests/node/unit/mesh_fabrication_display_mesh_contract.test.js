import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DISPLAY_LOD_POLICY,
    DISPLAY_SMOOTHING_MODE,
    DISPLAY_WIRE_SOURCE,
    deriveDisplayTriangulation,
    normalizeDisplayMeshBuildConfig
} from '../../../src/graphics/gui/mesh_fabrication/displayMeshDerivation.js';

function createCanonicalObject() {
    return Object.freeze({
        id: 'part.box.main',
        vertices: Object.freeze([
            Object.freeze([-1, 1, 1]),
            Object.freeze([1, 1, 1]),
            Object.freeze([1, -1, 1]),
            Object.freeze([-1, -1, 1]),
            Object.freeze([-1, 1, -1]),
            Object.freeze([1, 1, -1]),
            Object.freeze([1, -1, -1]),
            Object.freeze([-1, -1, -1])
        ]),
        faces: Object.freeze([
            Object.freeze({ id: 'part.box.main.face.front' }),
            Object.freeze({ id: 'part.box.main.face.back' }),
            Object.freeze({ id: 'part.box.main.face.left' }),
            Object.freeze({ id: 'part.box.main.face.right' }),
            Object.freeze({ id: 'part.box.main.face.top' }),
            Object.freeze({ id: 'part.box.main.face.bottom' })
        ]),
        renderTriangles: Object.freeze([
            Object.freeze({ id: 'part.box.main.face.front.triangle.t000', faceId: 'part.box.main.face.front', indices: Object.freeze([0, 3, 2]) }),
            Object.freeze({ id: 'part.box.main.face.front.triangle.t001', faceId: 'part.box.main.face.front', indices: Object.freeze([0, 2, 1]) }),
            Object.freeze({ id: 'part.box.main.face.back.triangle.t000', faceId: 'part.box.main.face.back', indices: Object.freeze([4, 5, 6]) }),
            Object.freeze({ id: 'part.box.main.face.back.triangle.t001', faceId: 'part.box.main.face.back', indices: Object.freeze([4, 6, 7]) }),
            Object.freeze({ id: 'part.box.main.face.left.triangle.t000', faceId: 'part.box.main.face.left', indices: Object.freeze([4, 7, 3]) }),
            Object.freeze({ id: 'part.box.main.face.left.triangle.t001', faceId: 'part.box.main.face.left', indices: Object.freeze([4, 3, 0]) }),
            Object.freeze({ id: 'part.box.main.face.right.triangle.t000', faceId: 'part.box.main.face.right', indices: Object.freeze([1, 2, 6]) }),
            Object.freeze({ id: 'part.box.main.face.right.triangle.t001', faceId: 'part.box.main.face.right', indices: Object.freeze([1, 6, 5]) }),
            Object.freeze({ id: 'part.box.main.face.top.triangle.t000', faceId: 'part.box.main.face.top', indices: Object.freeze([4, 0, 1]) }),
            Object.freeze({ id: 'part.box.main.face.top.triangle.t001', faceId: 'part.box.main.face.top', indices: Object.freeze([4, 1, 5]) }),
            Object.freeze({ id: 'part.box.main.face.bottom.triangle.t000', faceId: 'part.box.main.face.bottom', indices: Object.freeze([3, 7, 6]) }),
            Object.freeze({ id: 'part.box.main.face.bottom.triangle.t001', faceId: 'part.box.main.face.bottom', indices: Object.freeze([3, 6, 2]) })
        ])
    });
}

function snapshotCanonicalState(objectDef) {
    return {
        vertices: objectDef.vertices.map((v) => [...v]),
        faces: objectDef.faces.map((f) => f.id),
        triangles: objectDef.renderTriangles.map((t) => ({
            id: t.id,
            faceId: t.faceId,
            indices: [...t.indices]
        }))
    };
}

function makeTriangleSnapshot(result) {
    return {
        vertices: result.vertices.map((v) => [...v]),
        triangles: result.triangles.map((tri) => ({
            a: tri.a,
            b: tri.b,
            c: tri.c,
            faceId: tri.faceId
        })),
        appliedSubdivisionLevel: result.appliedSubdivisionLevel
    };
}

test('DisplayMeshDerivation: canonical topology IDs remain authoritative across display settings', () => {
    const canonicalObject = createCanonicalObject();
    const before = snapshotCanonicalState(canonicalObject);
    const canonicalFaceIdSet = new Set(before.faces);

    const configFlat = normalizeDisplayMeshBuildConfig({
        smoothingMode: DISPLAY_SMOOTHING_MODE.FLAT,
        subdivisionLevel: 0,
        wireSource: DISPLAY_WIRE_SOURCE.CANONICAL,
        lodPolicy: DISPLAY_LOD_POLICY.MEDIUM
    });
    const flat = deriveDisplayTriangulation(
        canonicalObject,
        configFlat.resolvedSubdivisionLevel,
        configFlat.triangleBudget
    );

    const configSubdiv = normalizeDisplayMeshBuildConfig({
        smoothingMode: DISPLAY_SMOOTHING_MODE.SUBDIVISION_PREVIEW,
        subdivisionLevel: 2,
        wireSource: DISPLAY_WIRE_SOURCE.DISPLAY,
        lodPolicy: DISPLAY_LOD_POLICY.NEAR
    });
    const subdiv = deriveDisplayTriangulation(
        canonicalObject,
        configSubdiv.resolvedSubdivisionLevel,
        configSubdiv.triangleBudget
    );

    const after = snapshotCanonicalState(canonicalObject);
    assert.deepEqual(after, before, 'Display derivation must not mutate canonical topology data.');

    assert.equal(flat.triangles.length, before.triangles.length);
    assert.ok(subdiv.triangles.length > flat.triangles.length);
    assert.ok(subdiv.triangles.every((tri) => canonicalFaceIdSet.has(tri.faceId)));
});

test('DisplayMeshDerivation: derived display topology is deterministic for identical inputs', () => {
    const canonicalObject = createCanonicalObject();
    const config = normalizeDisplayMeshBuildConfig({
        smoothingMode: DISPLAY_SMOOTHING_MODE.SUBDIVISION_PREVIEW,
        subdivisionLevel: 2,
        wireSource: DISPLAY_WIRE_SOURCE.DISPLAY,
        lodPolicy: DISPLAY_LOD_POLICY.MEDIUM
    });

    const a = deriveDisplayTriangulation(canonicalObject, config.resolvedSubdivisionLevel, config.triangleBudget);
    const b = deriveDisplayTriangulation(canonicalObject, config.resolvedSubdivisionLevel, config.triangleBudget);

    assert.deepEqual(makeTriangleSnapshot(a), makeTriangleSnapshot(b));
});

test('DisplayMeshDerivation: normalization keeps canonical defaults and explicit display overrides', () => {
    const defaults = normalizeDisplayMeshBuildConfig({});
    assert.equal(defaults.smoothingMode, DISPLAY_SMOOTHING_MODE.FLAT);
    assert.equal(defaults.wireSource, DISPLAY_WIRE_SOURCE.CANONICAL);
    assert.equal(defaults.lodPolicy, DISPLAY_LOD_POLICY.MEDIUM);

    const explicit = normalizeDisplayMeshBuildConfig({
        smoothingMode: DISPLAY_SMOOTHING_MODE.SUBDIVISION_PREVIEW,
        wireSource: DISPLAY_WIRE_SOURCE.DISPLAY,
        lodPolicy: DISPLAY_LOD_POLICY.NEAR,
        subdivisionLevel: 2,
        adaptiveSubdivisionEnabled: true,
        adaptiveErrorBudgetPx: 12
    });
    assert.equal(explicit.smoothingMode, DISPLAY_SMOOTHING_MODE.SUBDIVISION_PREVIEW);
    assert.equal(explicit.wireSource, DISPLAY_WIRE_SOURCE.DISPLAY);
    assert.equal(explicit.lodPolicy, DISPLAY_LOD_POLICY.NEAR);
    assert.equal(explicit.subdivisionLevel, 2);
    assert.equal(explicit.resolvedSubdivisionLevel, 2);
    assert.equal(explicit.adaptiveSubdivisionEnabled, true);
});
