// Node unit tests: mesh fabrication foundation modules (Section 19).
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatQuantizedNumber, stableEdgeKey, vectorQuantizedKey } from '../../../src/graphics/gui/mesh_fabrication/math/quantization.js';
import { arrayAlmostEqual, crossVec3, dotVec3, normalizeVec3 } from '../../../src/graphics/gui/mesh_fabrication/math/vector3.js';
import { formatDeterministicValidationError } from '../../../src/graphics/gui/mesh_fabrication/validators/assertions.js';
import { makeStableOperationId, sanitizeToken } from '../../../src/graphics/gui/mesh_fabrication/id_policy/canonicalIdPolicy.js';
import { MESH_FABRICATION_ERROR_CODE } from '../../../src/graphics/gui/mesh_fabrication/errors/meshFabricationErrorCodes.js';
import { MeshFabricationError, toUiErrorMessage } from '../../../src/graphics/gui/mesh_fabrication/errors/meshFabricationErrors.js';

test('Math modules: quantization and vector helpers are deterministic', () => {
    assert.equal(formatQuantizedNumber(1.23456789, 4), '1.2346');
    assert.equal(stableEdgeKey(7, 2), '2|7');
    assert.equal(vectorQuantizedKey([1.2, -0.55, 9], 2), '1.20|-0.55|9.00');

    const normal = normalizeVec3(crossVec3([1, 0, 0], [0, 1, 0]));
    assert.ok(arrayAlmostEqual(normal, [0, 0, 1], 1e-8));
    assert.equal(dotVec3([1, 2, 3], [4, 5, 6]), 32);
});

test('ID policy: stable IDs and token sanitization are canonical', () => {
    assert.equal(sanitizeToken('part tire:outer', 'x'), 'part_tire_outer');
    assert.equal(makeStableOperationId(0, 'op'), 'op_000001');
    assert.equal(makeStableOperationId(14, 'bool'), 'bool_000015');
});

test('Errors/validators: deterministic error payload and UI message mapping', () => {
    const err = new MeshFabricationError(
        MESH_FABRICATION_ERROR_CODE.LOADER_TRANSPORT_FAILED,
        'Transport failed'
    );
    assert.equal(toUiErrorMessage(err), 'Live mesh transport failed.');

    const formatted = formatDeterministicValidationError(err);
    assert.equal(formatted.code, MESH_FABRICATION_ERROR_CODE.LOADER_TRANSPORT_FAILED);
    assert.equal(formatted.message, 'Transport failed');
});
