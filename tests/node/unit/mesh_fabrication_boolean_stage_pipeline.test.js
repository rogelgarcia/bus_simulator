// Node unit tests: mesh fabrication boolean stage contracts (Section 19).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    runBooleanDeterministicRemapStage,
    runBooleanInputConversionStage,
    runBooleanKernelInvocationStage,
    runBooleanRegroupingStage,
    runBooleanTopologyValidationStage
} from '../../../src/graphics/gui/mesh_fabrication/operations/boolean/stages/index.js';

test('Boolean stage pipeline executes explicit staged callbacks in deterministic order', () => {
    const order = [];

    const stage0 = runBooleanInputConversionStage({
        type: 'boolean_subtract',
        opId: 'sub001',
        targetObject: { id: 'target' },
        toolObject: { id: 'tool' },
        convert: (input) => {
            order.push('input');
            return Object.freeze({ ...input, converted: true });
        }
    });

    const stage1 = runBooleanKernelInvocationStage({
        invocation: stage0,
        invokeKernel: (input) => {
            order.push('kernel');
            return Object.freeze({ ...input, polygons: [] });
        }
    });

    const stage2 = runBooleanRegroupingStage({
        kernelResult: stage1,
        regroup: (input) => {
            order.push('regroup');
            return Object.freeze({ ...input, regrouped: true });
        }
    });

    const stage3 = runBooleanDeterministicRemapStage({
        regroupedResult: stage2,
        remap: (input) => {
            order.push('remap');
            return Object.freeze({ ...input, remapped: true });
        }
    });

    const stage4 = runBooleanTopologyValidationStage({
        remappedResult: stage3,
        validate: () => {
            order.push('validate');
        }
    });

    assert.deepEqual(order, ['input', 'kernel', 'regroup', 'remap', 'validate']);
    assert.equal(stage4.remapped, true);
});
