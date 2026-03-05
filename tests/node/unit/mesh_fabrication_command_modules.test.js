// Node unit tests: mesh fabrication command module registry and dispatch determinism.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    COMMAND_MODULES,
    listRegisteredCommandTypes
} from '../../../src/graphics/gui/mesh_fabrication/command_pipeline/commands/index.js';
import {
    buildDeterministicCommandPlan,
    runMeshCommandPipeline
} from '../../../src/graphics/gui/mesh_fabrication/meshCommandPipeline.js';

const EXPECTED_TYPES = Object.freeze([
    'translate_object',
    'set_object_transform',
    'set_object_material',
    'cut_face_slot',
    'boolean_union',
    'boolean_subtract',
    'boolean_intersect',
    'imprint_topology',
    'slice_topology',
    'needs_clarification'
]);

function makeBoxObject(id, materialId) {
    return Object.freeze({
        id,
        materialId,
        vertices: Object.freeze([
            Object.freeze([-1, -1, 1]),
            Object.freeze([1, -1, 1]),
            Object.freeze([1, 1, 1]),
            Object.freeze([-1, 1, 1]),
            Object.freeze([-1, -1, -1]),
            Object.freeze([1, -1, -1]),
            Object.freeze([1, 1, -1]),
            Object.freeze([-1, 1, -1])
        ]),
        vertexIds: Object.freeze(['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']),
        edges: Object.freeze([]),
        faces: Object.freeze([]),
        renderTriangles: Object.freeze([]),
        triangles: Object.freeze([]),
        position: Object.freeze([0, 0, 0]),
        rotation: Object.freeze([0, 0, 0]),
        scale: Object.freeze([1, 1, 1])
    });
}

test('CommandModules: registry contains required command types in deterministic order', () => {
    assert.deepEqual(listRegisteredCommandTypes(), EXPECTED_TYPES);
    assert.equal(COMMAND_MODULES.length, EXPECTED_TYPES.length);
    for (let i = 0; i < COMMAND_MODULES.length; i++) {
        const module = COMMAND_MODULES[i];
        assert.equal(module.type, EXPECTED_TYPES[i]);
        assert.equal(typeof module.execute, 'function');
    }
});

test('CommandModules: command-plan build remains deterministic under modular dispatch', () => {
    const rawAi = Object.freeze({
        instructions: Object.freeze([
            'translate object part.box by 1 2 3',
            'set position part.box to 0 1 0',
            'set material part.box to mat_default'
        ]),
        commands: Object.freeze([
            Object.freeze({
                type: 'set_object_transform',
                args: Object.freeze({
                    objectId: 'part.box',
                    rotation: Object.freeze([0, 0.5, 0])
                })
            })
        ])
    });

    const a = buildDeterministicCommandPlan(rawAi);
    const b = buildDeterministicCommandPlan(rawAi);
    assert.deepEqual(a, b);
    assert.equal(a.commands.length, 4);
});

test('CommandModules: runtime execution parity for transform/material command sequence', () => {
    const runtime = runMeshCommandPipeline(
        {
            commands: [
                {
                    type: 'translate_object',
                    args: {
                        objectId: 'part.box',
                        delta: [1, 0, 0]
                    }
                },
                {
                    type: 'set_object_transform',
                    args: {
                        objectId: 'part.box',
                        rotation: [0, 0.2, 0]
                    }
                },
                {
                    type: 'set_object_material',
                    args: {
                        objectId: 'part.box',
                        materialId: 'mat_other'
                    }
                }
            ]
        },
        {
            objects: [makeBoxObject('part.box', 'mat_default')],
            materials: new Map([
                ['mat_default', {}],
                ['mat_other', {}]
            ])
        }
    );

    assert.equal(runtime.operationLog.operations.length, 3);
    assert.equal(runtime.operationLog.operations.every((op) => op.status === 'applied'), true);
    const override = runtime.objectOverrides.get('part.box');
    assert.ok(override);
    assert.deepEqual(override.position, [1, 0, 0]);
    assert.deepEqual(override.rotation, [0, 0.2, 0]);
    assert.equal(override.materialId, 'mat_other');
});
