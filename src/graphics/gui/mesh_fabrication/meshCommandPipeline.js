// Deterministic AI instruction normalization + command execution + operation logging.

import {
    ensureManifoldBooleanKernelReady,
    getManifoldBooleanKernelStatus
} from './meshBooleanKernelManifold.js';
import { makeStableOperationId } from './id_policy/canonicalIdPolicy.js';
import {
    runCommandAuditLogStage,
    runCommandExecuteStage,
    runCommandNormalizeStage,
    runCommandParseStage
} from './command_pipeline/stages/index.js';
import {
    BOOLEAN_COMMAND_TYPES,
    BOOLEAN_KERNEL,
    COMMAND_TYPE,
    getCommandModule,
    getInstructionParserModules,
    getNeedsClarificationModule
} from './command_pipeline/commands/index.js';
import { buildNeedsClarificationCommand } from './command_pipeline/commands/needsClarificationCommand.js';
import {
    assertObject,
    assertString
} from './command_pipeline/commands/shared/commandCommon.js';
import {
    freezeObjectList,
    freezeObjectOverrides
} from './command_pipeline/commands/shared/runtimeObjectState.js';

export const MESH_COMMAND_SCHEMA_VERSION = 'mesh-command.v1';
export const MESH_OPERATION_LOG_SCHEMA_VERSION = 'mesh-operation-log.v1';
export const MESH_BOOLEAN_RUNTIME_CONTRACT_VERSION = 'mesh-boolean-runtime.v1';

function normalizeBooleanKernel(value, label = 'ai.booleanKernel') {
    if (value === undefined || value === null || String(value).trim() === '') {
        return BOOLEAN_KERNEL.MANIFOLD;
    }
    const kernelId = assertString(value, label);
    if (kernelId !== BOOLEAN_KERNEL.MANIFOLD) {
        throw new Error(
            `[MeshCommandPipeline] ${label} "${kernelId}" is unsupported. Runtime boolean kernel must be "${BOOLEAN_KERNEL.MANIFOLD}".`
        );
    }
    return kernelId;
}

function makeStableId(prefix, index) {
    return makeStableOperationId(index, prefix);
}

export function ensureBooleanKernelReady() {
    return ensureManifoldBooleanKernelReady();
}

export function getBooleanKernelStatus() {
    return getManifoldBooleanKernelStatus();
}

function parseRawAiInput(rawAi = null) {
    const ai = rawAi && typeof rawAi === 'object' ? rawAi : {};
    return Object.freeze({
        instructions: Object.freeze(Array.isArray(ai.instructions) ? [...ai.instructions] : []),
        commands: Object.freeze(Array.isArray(ai.commands) ? [...ai.commands] : []),
        booleanKernel: normalizeBooleanKernel(
            ai.booleanKernel ?? ai.workflow?.booleanKernel,
            'ai.booleanKernel'
        )
    });
}

function instructionToCommand(text, commandId, instructionIndex) {
    const raw = assertString(text, `instructions[${instructionIndex}]`);
    const compact = raw.replace(/\s+/g, ' ').trim();
    const parsers = getInstructionParserModules();
    for (let i = 0; i < parsers.length; i++) {
        const parsed = parsers[i].parseInstruction({
            compact,
            commandId,
            instructionIndex
        });
        if (parsed) return parsed;
    }

    return buildNeedsClarificationCommand({
        commandId,
        source: {
            kind: 'instruction',
            index: instructionIndex,
            text: compact
        },
        args: {
            rawText: compact,
            reason: 'unsupported_high_level_instruction'
        }
    });
}

function normalizeRawCommand(rawCommand, commandId, rawIndex) {
    const raw = assertObject(rawCommand, `commands[${rawIndex}]`);
    const type = assertString(raw.type, `commands[${rawIndex}].type`);
    const args = assertObject(raw.args ?? {}, `commands[${rawIndex}].args`);
    const module = getCommandModule(type);

    if (!module || typeof module.normalizeRaw !== 'function') {
        return buildNeedsClarificationCommand({
            commandId,
            source: {
                kind: 'command',
                index: rawIndex
            },
            args: {
                rawType: type,
                reason: 'unsupported_command_type'
            }
        });
    }

    return module.normalizeRaw({
        commandId,
        rawIndex,
        args
    });
}

function normalizeParsedPlanToCommandPlan({
    instructions,
    commands,
    booleanKernel
}) {
    const out = [];
    let serial = 0;
    for (let i = 0; i < instructions.length; i++) {
        const commandId = makeStableId('cmd', serial++);
        out.push(instructionToCommand(instructions[i], commandId, i));
    }
    for (let i = 0; i < commands.length; i++) {
        const commandId = makeStableId('cmd', serial++);
        out.push(normalizeRawCommand(commands[i], commandId, i));
    }
    return Object.freeze({
        version: MESH_COMMAND_SCHEMA_VERSION,
        booleanKernel,
        commands: Object.freeze(out)
    });
}

function executeNormalizedCommands(normalizedCommands, {
    objectsById,
    materialsById,
    now,
    booleanKernel
}) {
    const operations = [];
    const overridesMutable = new Map();
    const mutableObjects = new Map(objectsById);
    const needsClarificationModule = getNeedsClarificationModule();

    for (let i = 0; i < normalizedCommands.length; i++) {
        const command = normalizedCommands[i];
        const operationId = makeStableId('op', i);
        const timestamp = new Date(now()).toISOString();
        const module = getCommandModule(command.type) ?? needsClarificationModule;

        let status = 'applied';
        let message = '';
        let targetIds = [];
        let outputIds = [];
        let metadata = null;
        let markers = [];

        try {
            const result = module.execute({
                command,
                operationId,
                runtime: {
                    mutableObjects,
                    overridesMutable,
                    materialsById,
                    booleanKernel,
                    booleanRuntimeContractVersion: MESH_BOOLEAN_RUNTIME_CONTRACT_VERSION,
                    ensureBooleanKernelReady
                }
            });

            const safe = result && typeof result === 'object' ? result : {};
            status = String(safe.status ?? 'applied');
            message = String(safe.message ?? '');
            targetIds = Array.isArray(safe.targetIds) ? safe.targetIds : [];
            outputIds = Array.isArray(safe.outputIds) ? safe.outputIds : [];
            metadata = safe.metadata ?? null;
            markers = Array.isArray(safe.markers) ? safe.markers : [];
        } catch (err) {
            status = 'error';
            message = err?.message ?? String(err);
            if (module?.isBooleanCommand || BOOLEAN_COMMAND_TYPES.has(command.type)) {
                markers = Object.freeze(['boolean_kernel_error', 'no_fallback']);
                metadata = Object.freeze({
                    booleanKernel,
                    runtimeContractVersion: MESH_BOOLEAN_RUNTIME_CONTRACT_VERSION,
                    fallbackPolicy: 'none',
                    errorKind: 'boolean_kernel_failure'
                });
            }
        }

        operations.push(Object.freeze({
            operationId,
            timestamp,
            commandId: command.commandId,
            command: Object.freeze({
                type: command.type,
                args: command.args
            }),
            targetIds: Object.freeze([...targetIds]),
            outputIds: Object.freeze([...outputIds]),
            status,
            message,
            markers: Array.isArray(markers) ? Object.freeze([...markers]) : Object.freeze([]),
            metadata: metadata ?? undefined
        }));
    }

    return Object.freeze({
        objectOverrides: freezeObjectOverrides(overridesMutable),
        objects: freezeObjectList([...mutableObjects.values()]),
        operationLog: Object.freeze({
            version: MESH_OPERATION_LOG_SCHEMA_VERSION,
            booleanKernel,
            booleanRuntimeContractVersion: MESH_BOOLEAN_RUNTIME_CONTRACT_VERSION,
            fallbackPolicy: 'none',
            operations: Object.freeze(operations)
        })
    });
}

export function buildDeterministicCommandPlan(rawAi = null) {
    const parsedPlan = runCommandParseStage({
        rawAi,
        parse: (value) => parseRawAiInput(value)
    });

    return runCommandNormalizeStage({
        parsedPlan,
        normalize: normalizeParsedPlanToCommandPlan
    });
}

export function runMeshCommandPipeline(rawAi, { objects, materials }, { now = () => Date.now() } = {}) {
    const parsedPlan = runCommandParseStage({
        rawAi,
        parse: (value) => parseRawAiInput(value)
    });
    const commandPlan = runCommandNormalizeStage({
        parsedPlan,
        normalize: normalizeParsedPlanToCommandPlan
    });
    const executed = runCommandExecuteStage({
        normalizedPlan: commandPlan,
        execute: (plan) => {
            const objectMap = new Map((Array.isArray(objects) ? objects : []).map((obj) => [obj.id, obj]));
            const materialMap = materials instanceof Map ? materials : new Map();
            return executeNormalizedCommands(plan.commands, {
                objectsById: objectMap,
                materialsById: materialMap,
                now,
                booleanKernel: plan.booleanKernel
            });
        }
    });

    return runCommandAuditLogStage({
        executionResult: Object.freeze({ commandPlan, executed }),
        buildAuditLog: ({ commandPlan: plan, executed: execution }) => Object.freeze({
            commandPlan: plan,
            operationLog: execution.operationLog,
            objectOverrides: execution.objectOverrides,
            objects: execution.objects
        })
    });
}

export { COMMAND_TYPE };
