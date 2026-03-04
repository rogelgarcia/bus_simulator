// Node unit tests: mesh fabrication deterministic topology snapshot (Section 19).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSemanticAuthoringDocument } from '../../../src/graphics/gui/mesh_fabrication/semanticMeshCompiler.js';

const FIXTURE_PATH = new URL('../../fixtures/mesh_fabrication/box_authoring_fixture.handoff.v2.json', import.meta.url);
const GOLDEN_PATH = new URL('../../fixtures/mesh_fabrication/box_authoring_fixture.golden.json', import.meta.url);

const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const GOLDEN = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));

function compileFixtureObject() {
    const materialsById = new Map(Object.keys(FIXTURE.materials).map((id) => [id, {}]));
    const compiled = compileSemanticAuthoringDocument(FIXTURE.authoring, { materialsById });
    const object = compiled.objects[0];
    return Object.freeze({
        objectId: object.objectId,
        vertexIds: [...object.vertexIds],
        edgeIds: [...object.edgeIds],
        faceIds: [...object.faceIds],
        canonicalFaceLabels: [...object.faceCanonicalLabels]
    });
}

test('MeshFabrication topology snapshot: fixture matches golden canonical IDs', () => {
    const snapshot = compileFixtureObject();
    assert.deepEqual(snapshot, GOLDEN);
});

test('MeshFabrication topology snapshot: repeated compiles are deterministic', () => {
    const first = compileFixtureObject();
    const second = compileFixtureObject();
    assert.deepEqual(first, second);
});
