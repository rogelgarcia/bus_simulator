// src/graphics/gui/mesh_fabrication/meshCommandPipeline.js
// Deterministic AI instruction normalization + command execution + operation logging.
import { executeBooleanOperation } from './meshBooleanEngine.js';

export const MESH_COMMAND_SCHEMA_VERSION = 'mesh-command.v1';
export const MESH_OPERATION_LOG_SCHEMA_VERSION = 'mesh-operation-log.v1';

const COMMAND_TYPE = Object.freeze({
    TRANSLATE_OBJECT: 'translate_object',
    SET_OBJECT_TRANSFORM: 'set_object_transform',
    SET_OBJECT_MATERIAL: 'set_object_material',
    BOOLEAN_UNION: 'boolean_union',
    BOOLEAN_SUBTRACT: 'boolean_subtract',
    BOOLEAN_INTERSECT: 'boolean_intersect',
    TOPOLOGY_IMPRINT: 'imprint_topology',
    TOPOLOGY_SLICE: 'slice_topology',
    NEEDS_CLARIFICATION: 'needs_clarification'
});

const BOOLEAN_COMMAND_TYPES = new Set([
    COMMAND_TYPE.BOOLEAN_UNION,
    COMMAND_TYPE.BOOLEAN_SUBTRACT,
    COMMAND_TYPE.BOOLEAN_INTERSECT
]);

function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[MeshCommandPipeline] ${label} must be an object.`);
    }
    return value;
}

function assertString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`[MeshCommandPipeline] ${label} must be a non-empty string.`);
    }
    return value.trim();
}

function assertFiniteNumber(value, label) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`[MeshCommandPipeline] ${label} must be a finite number.`);
    }
    return num;
}

function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
    return false;
}

function normalizeVec3(value, label) {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error(`[MeshCommandPipeline] ${label} must be a [x,y,z] array.`);
    }
    return [
        assertFiniteNumber(value[0], `${label}[0]`),
        assertFiniteNumber(value[1], `${label}[1]`),
        assertFiniteNumber(value[2], `${label}[2]`)
    ];
}

function sanitizeToken(value, fallback = 'op001') {
    const raw = String(value ?? '').trim();
    const token = raw.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return token || fallback;
}

function normalizeOutputPolicy(value, label) {
    if (value === undefined || value === null) return 'replace_target';
    const policy = assertString(value, label);
    if (policy !== 'replace_target' && policy !== 'new_object') {
        throw new Error(`[MeshCommandPipeline] ${label} must be "replace_target" or "new_object".`);
    }
    return policy;
}

function normalizeSubtractMode(value, label) {
    if (value === undefined || value === null) return 'subtract_through';
    const mode = assertString(value, label);
    if (mode !== 'subtract_through' && mode !== 'subtract_clamped') {
        throw new Error(`[MeshCommandPipeline] ${label} must be "subtract_through" or "subtract_clamped".`);
    }
    return mode;
}

function normalizeBooleanArgs(args, label, type, commandId) {
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

function makeStableId(prefix, index) {
    return `${prefix}_${String(index + 1).padStart(6, '0')}`;
}

function freezeCommand(command) {
    return Object.freeze({
        ...command,
        args: Object.freeze({ ...(command.args ?? {}) }),
        source: Object.freeze({ ...(command.source ?? {}) })
    });
}

function instructionToCommand(text, commandId, instructionIndex) {
    const raw = assertString(text, `instructions[${instructionIndex}]`);
    const compact = raw.replace(/\s+/g, ' ').trim();

    // Deterministic parser patterns. If not matched, emit explicit clarification request.
    let m = compact.match(/^translate\s+object\s+([a-zA-Z0-9._:-]+)\s+by\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i);
    if (m) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.TRANSLATE_OBJECT,
            args: {
                objectId: m[1],
                delta: [Number(m[2]), Number(m[3]), Number(m[4])]
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    }

    m = compact.match(/^set\s+position\s+([a-zA-Z0-9._:-]+)\s+to\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i);
    if (m) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.SET_OBJECT_TRANSFORM,
            args: {
                objectId: m[1],
                position: [Number(m[2]), Number(m[3]), Number(m[4])]
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    }

    m = compact.match(/^set\s+rotation\s+([a-zA-Z0-9._:-]+)\s+to\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i);
    if (m) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.SET_OBJECT_TRANSFORM,
            args: {
                objectId: m[1],
                rotation: [Number(m[2]), Number(m[3]), Number(m[4])]
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    }

    m = compact.match(/^set\s+scale\s+([a-zA-Z0-9._:-]+)\s+to\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i);
    if (m) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.SET_OBJECT_TRANSFORM,
            args: {
                objectId: m[1],
                scale: [Number(m[2]), Number(m[3]), Number(m[4])]
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    }

    m = compact.match(/^set\s+material\s+([a-zA-Z0-9._:-]+)\s+to\s+([a-zA-Z0-9._:-]+)$/i);
    if (m) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.SET_OBJECT_MATERIAL,
            args: {
                objectId: m[1],
                materialId: m[2]
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    }

    m = compact.match(/^boolean\s+subtract\s+([a-zA-Z0-9._:-]+)\s+by\s+([a-zA-Z0-9._:-]+)(?:\s+mode\s+(through|clamped))?$/i);
    if (m) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.BOOLEAN_SUBTRACT,
            args: {
                targetObjectId: m[1],
                toolObjectId: m[2],
                subtractMode: m[3] && m[3].toLowerCase() === 'clamped' ? 'subtract_clamped' : 'subtract_through',
                outputPolicy: 'replace_target'
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    }

    m = compact.match(/^boolean\s+union\s+([a-zA-Z0-9._:-]+)\s+with\s+([a-zA-Z0-9._:-]+)$/i);
    if (m) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.BOOLEAN_UNION,
            args: {
                targetObjectId: m[1],
                toolObjectId: m[2],
                outputPolicy: 'replace_target'
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    }

    m = compact.match(/^boolean\s+intersect\s+([a-zA-Z0-9._:-]+)\s+with\s+([a-zA-Z0-9._:-]+)$/i);
    if (m) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.BOOLEAN_INTERSECT,
            args: {
                targetObjectId: m[1],
                toolObjectId: m[2],
                outputPolicy: 'replace_target'
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    }

    return freezeCommand({
        commandId,
        type: COMMAND_TYPE.NEEDS_CLARIFICATION,
        args: {
            rawText: compact,
            reason: 'unsupported_high_level_instruction'
        },
        source: {
            kind: 'instruction',
            index: instructionIndex,
            text: compact
        }
    });
}

function normalizeRawCommand(rawCommand, commandId, rawIndex) {
    const raw = assertObject(rawCommand, `commands[${rawIndex}]`);
    const type = assertString(raw.type, `commands[${rawIndex}].type`);
    const args = assertObject(raw.args ?? {}, `commands[${rawIndex}].args`);

    if (type === COMMAND_TYPE.TRANSLATE_OBJECT) {
        return freezeCommand({
            commandId,
            type,
            args: {
                objectId: assertString(args.objectId, `commands[${rawIndex}].args.objectId`),
                delta: normalizeVec3(args.delta, `commands[${rawIndex}].args.delta`)
            },
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    }

    if (type === COMMAND_TYPE.SET_OBJECT_TRANSFORM) {
        const out = {
            objectId: assertString(args.objectId, `commands[${rawIndex}].args.objectId`)
        };
        if (args.position !== undefined) out.position = normalizeVec3(args.position, `commands[${rawIndex}].args.position`);
        if (args.rotation !== undefined) out.rotation = normalizeVec3(args.rotation, `commands[${rawIndex}].args.rotation`);
        if (args.scale !== undefined) out.scale = normalizeVec3(args.scale, `commands[${rawIndex}].args.scale`);
        if (!out.position && !out.rotation && !out.scale) {
            throw new Error(`[MeshCommandPipeline] commands[${rawIndex}] set_object_transform requires position/rotation/scale.`);
        }
        return freezeCommand({
            commandId,
            type,
            args: out,
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    }

    if (type === COMMAND_TYPE.SET_OBJECT_MATERIAL) {
        return freezeCommand({
            commandId,
            type,
            args: {
                objectId: assertString(args.objectId, `commands[${rawIndex}].args.objectId`),
                materialId: assertString(args.materialId, `commands[${rawIndex}].args.materialId`)
            },
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    }

    if (BOOLEAN_COMMAND_TYPES.has(type)) {
        return freezeCommand({
            commandId,
            type,
            args: normalizeBooleanArgs(args, `commands[${rawIndex}].args`, type, commandId),
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    }

    if (type === COMMAND_TYPE.TOPOLOGY_IMPRINT || type === COMMAND_TYPE.TOPOLOGY_SLICE) {
        return freezeCommand({
            commandId,
            type,
            args: {
                targetObjectId: assertString(
                    args.targetObjectId ?? args.targetId ?? args.objectId,
                    `commands[${rawIndex}].args.targetObjectId`
                ),
                toolObjectId: assertString(
                    args.toolObjectId ?? args.toolId ?? args.cutterObjectId,
                    `commands[${rawIndex}].args.toolObjectId`
                )
            },
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    }

    return freezeCommand({
        commandId,
        type: COMMAND_TYPE.NEEDS_CLARIFICATION,
        args: {
            rawType: type,
            reason: 'unsupported_command_type'
        },
        source: {
            kind: 'command',
            index: rawIndex
        }
    });
}

function freezeParsedObject(objectDef) {
    return Object.freeze({
        ...objectDef,
        vertices: Object.freeze((objectDef.vertices ?? []).map((v) => Object.freeze([v[0], v[1], v[2]]))),
        vertexIds: Object.freeze([...(objectDef.vertexIds ?? [])]),
        edges: Object.freeze((objectDef.edges ?? []).map((edge) => Object.freeze({
            ...edge,
            vertexIds: Object.freeze([...(edge.vertexIds ?? [])]),
            vertexIndices: Object.freeze([...(edge.vertexIndices ?? [])])
        }))),
        faces: Object.freeze((objectDef.faces ?? []).map((face) => Object.freeze({
            ...face,
            vertexIds: Object.freeze([...(face.vertexIds ?? [])]),
            vertexIndices: Object.freeze([...(face.vertexIndices ?? [])]),
            edgeIds: Object.freeze([...(face.edgeIds ?? [])])
        }))),
        renderTriangles: Object.freeze((objectDef.renderTriangles ?? []).map((tri) => Object.freeze({
            ...tri,
            indices: Object.freeze([...(tri.indices ?? [])])
        }))),
        triangles: Object.freeze((objectDef.triangles ?? []).map((tri) => Object.freeze([...(tri ?? [])])),
        ),
        position: Object.freeze([...(objectDef.position ?? [0, 0, 0])]),
        rotation: Object.freeze([...(objectDef.rotation ?? [0, 0, 0])]),
        scale: Object.freeze([...(objectDef.scale ?? [1, 1, 1])])
    });
}

function freezeObjectList(objectsMutable) {
    return Object.freeze(objectsMutable.map((obj) => freezeParsedObject(obj)));
}

function freezeObjectOverrides(overridesMutable) {
    const out = new Map();
    for (const [objectId, override] of overridesMutable.entries()) {
        const normalized = {
            objectId
        };
        if (override.materialId) normalized.materialId = override.materialId;
        if (override.position) normalized.position = Object.freeze([...override.position]);
        if (override.rotation) normalized.rotation = Object.freeze([...override.rotation]);
        if (override.scale) normalized.scale = Object.freeze([...override.scale]);
        out.set(objectId, Object.freeze(normalized));
    }
    return out;
}

function ensureOverride(overrides, objectId) {
    const existing = overrides.get(objectId);
    if (existing) return existing;
    const created = { objectId };
    overrides.set(objectId, created);
    return created;
}

function applyOverrideToObject(baseObject, override) {
    if (!baseObject) return null;
    if (!override) return baseObject;
    return Object.freeze({
        ...baseObject,
        materialId: override.materialId ?? baseObject.materialId,
        position: Object.freeze([...(override.position ?? baseObject.position)]),
        rotation: Object.freeze([...(override.rotation ?? baseObject.rotation)]),
        scale: Object.freeze([...(override.scale ?? baseObject.scale)])
    });
}

function executeNormalizedCommands(normalizedCommands, { objectsById, materialsById, now }) {
    const operations = [];
    const overridesMutable = new Map();
    const mutableObjects = new Map(objectsById);

    for (let i = 0; i < normalizedCommands.length; i++) {
        const command = normalizedCommands[i];
        const operationId = makeStableId('op', i);
        const timestamp = new Date(now()).toISOString();
        let status = 'applied';
        let message = '';
        let targetIds = [];
        let outputIds = [];

        try {
            if (command.type === COMMAND_TYPE.NEEDS_CLARIFICATION) {
                status = 'needs_clarification';
                message = command.args.reason ?? 'unrecognized instruction';
            } else if (command.type === COMMAND_TYPE.TRANSLATE_OBJECT) {
                const objectId = assertString(command.args.objectId, `${command.commandId}.args.objectId`);
                const delta = normalizeVec3(command.args.delta, `${command.commandId}.args.delta`);
                targetIds = [objectId];

                const object = mutableObjects.get(objectId);
                if (!object) {
                    status = 'rejected';
                    message = `Unknown object "${objectId}".`;
                } else {
                    const override = ensureOverride(overridesMutable, objectId);
                    const base = override.position ?? object.position;
                    override.position = [
                        base[0] + delta[0],
                        base[1] + delta[1],
                        base[2] + delta[2]
                    ];
                    outputIds = [objectId];
                }
            } else if (command.type === COMMAND_TYPE.SET_OBJECT_TRANSFORM) {
                const objectId = assertString(command.args.objectId, `${command.commandId}.args.objectId`);
                targetIds = [objectId];

                const object = mutableObjects.get(objectId);
                if (!object) {
                    status = 'rejected';
                    message = `Unknown object "${objectId}".`;
                } else {
                    const override = ensureOverride(overridesMutable, objectId);
                    if (command.args.position !== undefined) {
                        override.position = normalizeVec3(command.args.position, `${command.commandId}.args.position`);
                    }
                    if (command.args.rotation !== undefined) {
                        override.rotation = normalizeVec3(command.args.rotation, `${command.commandId}.args.rotation`);
                    }
                    if (command.args.scale !== undefined) {
                        override.scale = normalizeVec3(command.args.scale, `${command.commandId}.args.scale`);
                    }
                    outputIds = [objectId];
                }
            } else if (command.type === COMMAND_TYPE.SET_OBJECT_MATERIAL) {
                const objectId = assertString(command.args.objectId, `${command.commandId}.args.objectId`);
                const materialId = assertString(command.args.materialId, `${command.commandId}.args.materialId`);
                targetIds = [objectId];

                const object = mutableObjects.get(objectId);
                if (!object) {
                    status = 'rejected';
                    message = `Unknown object "${objectId}".`;
                } else if (!materialsById.has(materialId)) {
                    status = 'rejected';
                    message = `Unknown material "${materialId}".`;
                } else {
                    const override = ensureOverride(overridesMutable, objectId);
                    override.materialId = materialId;
                    outputIds = [objectId];
                }
            } else if (BOOLEAN_COMMAND_TYPES.has(command.type)) {
                const args = command.args ?? {};
                const targetObjectId = assertString(args.targetObjectId, `${command.commandId}.args.targetObjectId`);
                const toolObjectId = assertString(args.toolObjectId, `${command.commandId}.args.toolObjectId`);
                targetIds = [targetObjectId, toolObjectId];

                const targetObjectBase = mutableObjects.get(targetObjectId);
                const toolObjectBase = mutableObjects.get(toolObjectId);
                if (!targetObjectBase) {
                    status = 'rejected';
                    message = `Unknown target object "${targetObjectId}".`;
                } else if (!toolObjectBase) {
                    status = 'rejected';
                    message = `Unknown tool object "${toolObjectId}".`;
                } else {
                    const targetEffective = applyOverrideToObject(targetObjectBase, overridesMutable.get(targetObjectId));
                    const toolEffective = applyOverrideToObject(toolObjectBase, overridesMutable.get(toolObjectId));
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
                        mutableObjects.delete(removedId);
                        overridesMutable.delete(removedId);
                    }

                    mutableObjects.set(boolResult.resultObject.id, boolResult.resultObject);
                    overridesMutable.delete(boolResult.resultObject.id);
                    overridesMutable.delete(targetObjectId);
                    if (!keepTool) {
                        overridesMutable.delete(toolObjectId);
                    }

                    outputIds = [boolResult.resultObject.id];
                    message = `Boolean ${command.type} applied (${boolResult.stats.faceCount} faces, ${boolResult.stats.vertexCount} vertices).`;
                }
            } else if (command.type === COMMAND_TYPE.TOPOLOGY_IMPRINT || command.type === COMMAND_TYPE.TOPOLOGY_SLICE) {
                status = 'needs_clarification';
                message = 'topology_cut_operation_defined_but_not_executable';
            } else {
                status = 'rejected';
                message = `Unsupported command "${command.type}".`;
            }
        } catch (err) {
            status = 'error';
            message = err?.message ?? String(err);
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
            message
        }));
    }

    return Object.freeze({
        objectOverrides: freezeObjectOverrides(overridesMutable),
        objects: freezeObjectList([...mutableObjects.values()]),
        operationLog: Object.freeze({
            version: MESH_OPERATION_LOG_SCHEMA_VERSION,
            operations: Object.freeze(operations)
        })
    });
}

export function buildDeterministicCommandPlan(rawAi = null) {
    const ai = rawAi && typeof rawAi === 'object' ? rawAi : {};
    const instructions = Array.isArray(ai.instructions) ? ai.instructions : [];
    const commands = Array.isArray(ai.commands) ? ai.commands : [];
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
        commands: Object.freeze(out)
    });
}

export function runMeshCommandPipeline(rawAi, { objects, materials }, { now = () => Date.now() } = {}) {
    const objectMap = new Map((Array.isArray(objects) ? objects : []).map((obj) => [obj.id, obj]));
    const materialMap = materials instanceof Map ? materials : new Map();
    const commandPlan = buildDeterministicCommandPlan(rawAi);
    const executed = executeNormalizedCommands(commandPlan.commands, {
        objectsById: objectMap,
        materialsById: materialMap,
        now
    });

    return Object.freeze({
        commandPlan,
        operationLog: executed.operationLog,
        objectOverrides: executed.objectOverrides,
        objects: executed.objects
    });
}

