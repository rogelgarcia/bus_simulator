// Shared normalization and execution helpers for boolean command modules.

import { executeBooleanOperation } from '../../../meshBooleanEngine.js';
import { BOOLEAN_KERNEL, COMMAND_TYPE } from '../commandTypes.js';
import {
    assertObject,
    assertString,
    normalizeBoolean,
    normalizeOutputPolicy,
    normalizeSubtractMode,
    sanitizeToken
} from './commandCommon.js';
import { applyOverrideToObject } from './runtimeObjectState.js';

export function normalizeBooleanArgs(args, label, type, commandId) {
    const targetObjectId = assertString(
        args.targetObjectId ?? args.targetId ?? args.objectId,
        `${label}.targetObjectId`
    );
    const toolObjectId = assertString(
        args.toolObjectId ?? args.toolId ?? args.cutterObjectId,
        `${label}.toolObjectId`
    );

    const out = {
        targetObjectId,
        toolObjectId,
        outputPolicy: normalizeOutputPolicy(args.outputPolicy, `${label}.outputPolicy`),
        keepTool: normalizeBoolean(args.keepTool)
    };
    if (type === COMMAND_TYPE.BOOLEAN_SUBTRACT) {
        out.subtractMode = normalizeSubtractMode(args.subtractMode ?? args.mode, `${label}.subtractMode`);
    }
    if (args.resultObjectId !== undefined) {
        out.resultObjectId = assertString(args.resultObjectId, `${label}.resultObjectId`);
    }
    if (args.opId !== undefined) {
        out.opId = sanitizeToken(assertString(args.opId, `${label}.opId`), commandId);
    }
    return out;
}

export function executeBooleanCommand({
    command,
    operationId,
    runtime,
    runtimeContractVersion
}) {
    const args = command.args ?? {};
    const targetObjectId = assertString(args.targetObjectId, `${command.commandId}.args.targetObjectId`);
    const toolObjectId = assertString(args.toolObjectId, `${command.commandId}.args.toolObjectId`);
    const targetIds = Object.freeze([targetObjectId, toolObjectId]);

    const targetObjectBase = runtime.mutableObjects.get(targetObjectId);
    const toolObjectBase = runtime.mutableObjects.get(toolObjectId);
    if (!targetObjectBase) {
        return Object.freeze({
            status: 'rejected',
            message: `Unknown target object "${targetObjectId}".`,
            targetIds,
            outputIds: Object.freeze([]),
            markers: Object.freeze([])
        });
    }
    if (!toolObjectBase) {
        return Object.freeze({
            status: 'rejected',
            message: `Unknown tool object "${toolObjectId}".`,
            targetIds,
            outputIds: Object.freeze([]),
            markers: Object.freeze([])
        });
    }

    if (runtime.booleanKernel !== BOOLEAN_KERNEL.MANIFOLD) {
        throw new Error(
            `[MeshCommandPipeline] Runtime boolean kernel "${runtime.booleanKernel}" is unsupported.`
        );
    }

    runtime.ensureBooleanKernelReady();
    const targetEffective = applyOverrideToObject(targetObjectBase, runtime.overridesMutable.get(targetObjectId));
    const toolEffective = applyOverrideToObject(toolObjectBase, runtime.overridesMutable.get(toolObjectId));

    const subtractMode = command.type === COMMAND_TYPE.BOOLEAN_SUBTRACT
        ? normalizeSubtractMode(args.subtractMode, `${command.commandId}.args.subtractMode`)
        : 'subtract_through';
    const outputPolicy = normalizeOutputPolicy(args.outputPolicy, `${command.commandId}.args.outputPolicy`);
    const opToken = sanitizeToken(args.opId ?? command.commandId, operationId);
    const resultObjectId = args.resultObjectId === undefined
        ? ''
        : assertString(args.resultObjectId, `${command.commandId}.args.resultObjectId`);
    const keepTool = normalizeBoolean(args.keepTool);

    const boolResult = executeBooleanOperation({
        type: command.type,
        opId: opToken,
        targetObject: targetEffective,
        toolObject: toolEffective,
        outputPolicy,
        resultObjectId,
        subtractMode,
        keepTool
    });

    for (const removedId of boolResult.removedObjectIds) {
        runtime.mutableObjects.delete(removedId);
        runtime.overridesMutable.delete(removedId);
    }

    runtime.mutableObjects.set(boolResult.resultObject.id, boolResult.resultObject);
    runtime.overridesMutable.delete(boolResult.resultObject.id);
    runtime.overridesMutable.delete(targetObjectId);
    if (!keepTool) {
        runtime.overridesMutable.delete(toolObjectId);
    }

    return Object.freeze({
        status: 'applied',
        message: `Boolean ${command.type} applied (${boolResult.stats.faceCount} faces, ${boolResult.stats.vertexCount} vertices).`,
        targetIds,
        outputIds: Object.freeze([boolResult.resultObject.id]),
        markers: Object.freeze(['boolean_kernel_applied']),
        metadata: Object.freeze({
            booleanKernel: BOOLEAN_KERNEL.MANIFOLD,
            runtimeContractVersion,
            fallbackPolicy: 'none',
            ...assertObject(boolResult.metadata ?? {}, 'boolResult.metadata')
        })
    });
}
