// Node unit tests: mesh fabrication command pipeline stage contracts (Section 19).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    runCommandAuditLogStage,
    runCommandExecuteStage,
    runCommandNormalizeStage,
    runCommandParseStage
} from '../../../src/graphics/gui/mesh_fabrication/command_pipeline/stages/index.js';
import {
    buildDeterministicCommandPlan,
    runMeshCommandPipeline
} from '../../../src/graphics/gui/mesh_fabrication/meshCommandPipeline.js';

test('CommandPipeline stages: parse -> normalize -> execute -> audit order is explicit', () => {
    const order = [];

    const parsed = runCommandParseStage({
        rawAi: { instructions: ['noop'] },
        parse: (rawAi) => {
            order.push('parse');
            return rawAi;
        }
    });

    const normalized = runCommandNormalizeStage({
        parsedPlan: parsed,
        normalize: (value) => {
            order.push('normalize');
            return Object.freeze({ ...value, normalized: true });
        }
    });

    const executed = runCommandExecuteStage({
        normalizedPlan: normalized,
        execute: (value) => {
            order.push('execute');
            return Object.freeze({ ...value, executed: true });
        }
    });

    const audited = runCommandAuditLogStage({
        executionResult: executed,
        buildAuditLog: (value) => {
            order.push('audit');
            return Object.freeze({ ...value, audited: true });
        }
    });

    assert.deepEqual(order, ['parse', 'normalize', 'execute', 'audit']);
    assert.equal(audited.audited, true);
});

test('CommandPipeline: deterministic plan generation remains stable across runs', () => {
    const rawAi = Object.freeze({
        booleanKernel: 'manifold-3d',
        instructions: Object.freeze([
            'translate object part.box by 1 2 3',
            'set material part.box to mat_default'
        ]),
        commands: Object.freeze([
            Object.freeze({
                type: 'set_object_transform',
                args: Object.freeze({
                    objectId: 'part.box',
                    position: Object.freeze([0, 1, 0])
                })
            })
        ])
    });

    const a = buildDeterministicCommandPlan(rawAi);
    const b = buildDeterministicCommandPlan(rawAi);
    assert.deepEqual(a, b);
    assert.equal(a.commands.length, 3);
});

test('CommandPipeline: staged execution keeps operation-log schema stable', () => {
    const rawAi = Object.freeze({
        instructions: Object.freeze([
            'translate object part.box by 1 0 0',
            'set rotation part.box to 0 1 0'
        ])
    });

    const baseObject = Object.freeze({
        id: 'part.box',
        materialId: 'mat_default',
        vertices: Object.freeze([
            Object.freeze([0, 0, 0]),
            Object.freeze([1, 0, 0]),
            Object.freeze([0, 1, 0])
        ]),
        vertexIds: Object.freeze(['v0', 'v1', 'v2']),
        edges: Object.freeze([]),
        faces: Object.freeze([]),
        triangles: Object.freeze([]),
        position: Object.freeze([0, 0, 0]),
        rotation: Object.freeze([0, 0, 0]),
        scale: Object.freeze([1, 1, 1])
    });

    const result = runMeshCommandPipeline(rawAi, {
        objects: Object.freeze([baseObject]),
        materials: new Map([['mat_default', {}]])
    }, {
        now: () => 1709500000000
    });

    assert.equal(result.operationLog.version, 'mesh-operation-log.v1');
    assert.equal(result.commandPlan.version, 'mesh-command.v1');
    assert.equal(result.operationLog.operations.length, 2);
    assert.equal(result.objects.length, 1);
    const override = result.objectOverrides.get('part.box');
    assert.ok(override);
    assert.deepEqual(override.position, [1, 0, 0]);
    assert.deepEqual(override.rotation, [0, 1, 0]);
});
