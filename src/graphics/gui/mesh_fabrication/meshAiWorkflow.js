// src/graphics/gui/mesh_fabrication/meshAiWorkflow.js
// Workflow contracts + safety guardrails for AI-driven mesh authoring interactions.
import { buildDeterministicCommandPlan } from './meshCommandPipeline.js';

export const MESH_AI_WORKFLOW_VERSION = 'mesh-ai-workflow.v1';
export const MESH_AI_INTERACTION_VERSION = 'mesh-ai-interaction.v1';
export const MESH_AI_OPERATION_SCOPE_VERSION = 'mesh-ai-operation-scope.v1';
export const MESH_AI_ARCH_BOUNDARIES_VERSION = 'mesh-ai-architecture-boundaries.v1';
export const MESH_AI_QUALITY_CONSTRAINTS_VERSION = 'mesh-ai-quality-constraints.v1';

export const MESH_AI_OPERATION_SCOPE_V1 = Object.freeze({
    version: MESH_AI_OPERATION_SCOPE_VERSION,
    families: Object.freeze([
        Object.freeze({
            familyId: 'creation',
            mode: 'hook',
            commands: Object.freeze([
                'create_primitive',
                'duplicate_object',
                'delete_object'
            ])
        }),
        Object.freeze({
            familyId: 'transform',
            mode: 'active',
            commands: Object.freeze([
                'translate_object',
                'set_object_transform'
            ])
        }),
        Object.freeze({
            familyId: 'material_uv',
            mode: 'active',
            commands: Object.freeze([
                'set_object_material'
            ]),
            hooks: Object.freeze([
                'set_uv_projection',
                'set_uv_transform'
            ])
        }),
        Object.freeze({
            familyId: 'extrusion_bevel',
            mode: 'hook',
            commands: Object.freeze([
                'extrude_face',
                'bevel_edge'
            ])
        }),
        Object.freeze({
            familyId: 'boolean',
            mode: 'active',
            commands: Object.freeze([
                'boolean_union',
                'boolean_subtract',
                'boolean_intersect'
            ])
        }),
        Object.freeze({
            familyId: 'topology_cut',
            mode: 'hook',
            commands: Object.freeze([
                'imprint_topology',
                'slice_topology'
            ])
        })
    ])
});

export const MESH_AI_ARCHITECTURE_BOUNDARIES_V1 = Object.freeze({
    version: MESH_AI_ARCH_BOUNDARIES_VERSION,
    stages: Object.freeze([
        Object.freeze({
            stageId: 'instruction_parsing_planning',
            owner: 'meshCommandPipeline.buildDeterministicCommandPlan',
            responsibility: 'Normalize freeform instructions into deterministic command schema.'
        }),
        Object.freeze({
            stageId: 'mesh_operation_execution',
            owner: 'meshCommandPipeline.runMeshCommandPipeline',
            responsibility: 'Execute supported commands and emit operation log + object overrides.'
        }),
        Object.freeze({
            stageId: 'validation_guardrails',
            owner: 'meshAiWorkflow',
            responsibility: 'Validate batch size/scope and enforce acceptance constraints.'
        }),
        Object.freeze({
            stageId: 'scene_integration',
            owner: 'MeshFabricationView',
            responsibility: 'Apply preview/accepted batches to the rendered live-mesh document.'
        })
    ])
});

export const MESH_AI_QUALITY_CONSTRAINTS_V1 = Object.freeze({
    version: MESH_AI_QUALITY_CONSTRAINTS_VERSION,
    maxDraftChars: 2400,
    maxDraftInstructions: 24,
    maxAcceptedBatches: 64,
    maxTotalSessionInstructions: 240,
    acceptRequiresNoRejectedOrErrorOrClarification: true,
    deterministicCommandOrdering: true
});

const COMMAND_MODE_BY_ID = (() => {
    const out = new Map();
    for (const family of MESH_AI_OPERATION_SCOPE_V1.families) {
        for (const cmd of family.commands ?? []) {
            out.set(cmd, family.mode);
        }
        for (const hook of family.hooks ?? []) {
            out.set(hook, 'hook');
        }
    }
    out.set('needs_clarification', 'clarification');
    return out;
})();

function cloneDocument(value) {
    if (!value || typeof value !== 'object') return null;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function sanitizeInstructionLine(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseInstructionDraft(inputText) {
    const text = String(inputText ?? '').replace(/\r\n/g, '\n');
    return text
        .split('\n')
        .map((line) => sanitizeInstructionLine(line))
        .filter((line) => line.length > 0);
}

export function flattenAcceptedInstructionBatches(acceptedBatches) {
    const out = [];
    if (!Array.isArray(acceptedBatches)) return out;
    for (const batch of acceptedBatches) {
        if (!batch || typeof batch !== 'object') continue;
        if (!Array.isArray(batch.instructions)) continue;
        for (const line of batch.instructions) {
            const sanitized = sanitizeInstructionLine(line);
            if (sanitized) out.push(sanitized);
        }
    }
    return out;
}

function countChars(lines) {
    let total = 0;
    for (const line of lines) total += line.length;
    return total;
}

export function validateInstructionDraft(draftText, {
    acceptedBatches = [],
    constraints = MESH_AI_QUALITY_CONSTRAINTS_V1
} = {}) {
    const lines = parseInstructionDraft(draftText);
    const acceptedInstructions = flattenAcceptedInstructionBatches(acceptedBatches);
    const issues = [];
    const draftChars = countChars(lines);

    if (!lines.length) {
        issues.push({
            severity: 'error',
            code: 'empty_draft',
            message: 'Enter at least one instruction.'
        });
    }
    if (draftChars > constraints.maxDraftChars) {
        issues.push({
            severity: 'error',
            code: 'draft_too_large',
            message: `Draft exceeds ${constraints.maxDraftChars} characters.`
        });
    }
    if (lines.length > constraints.maxDraftInstructions) {
        issues.push({
            severity: 'error',
            code: 'too_many_draft_instructions',
            message: `Draft exceeds ${constraints.maxDraftInstructions} instructions.`
        });
    }
    if (Array.isArray(acceptedBatches) && acceptedBatches.length >= constraints.maxAcceptedBatches) {
        issues.push({
            severity: 'error',
            code: 'too_many_batches',
            message: `Undo stack limit reached (${constraints.maxAcceptedBatches} accepted batches).`
        });
    }
    if ((acceptedInstructions.length + lines.length) > constraints.maxTotalSessionInstructions) {
        issues.push({
            severity: 'error',
            code: 'session_instruction_limit',
            message: `Session instruction limit exceeded (${constraints.maxTotalSessionInstructions}).`
        });
    }

    return Object.freeze({
        lines: Object.freeze(lines),
        acceptedInstructions: Object.freeze(acceptedInstructions),
        hasError: issues.some((issue) => issue.severity === 'error'),
        issues: Object.freeze(issues)
    });
}

export function buildAiWorkflowDocument(sourceDocument, {
    acceptedBatches = [],
    previewBatch = null
} = {}) {
    const source = cloneDocument(sourceDocument);
    if (!source || typeof source !== 'object') {
        throw new Error('[MeshAiWorkflow] sourceDocument must be an object.');
    }

    const acceptedInstructions = flattenAcceptedInstructionBatches(acceptedBatches);
    const previewInstructions = Array.isArray(previewBatch?.instructions)
        ? previewBatch.instructions.map((line) => sanitizeInstructionLine(line)).filter(Boolean)
        : [];

    const baseAi = source.ai && typeof source.ai === 'object' ? source.ai : {};
    const baseInstructions = Array.isArray(baseAi.instructions)
        ? baseAi.instructions.map((line) => sanitizeInstructionLine(line)).filter(Boolean)
        : [];
    const baseCommands = Array.isArray(baseAi.commands) ? baseAi.commands : [];

    const mergedInstructions = [
        ...baseInstructions,
        ...acceptedInstructions,
        ...previewInstructions
    ];

    source.ai = {
        ...baseAi,
        instructions: mergedInstructions,
        commands: baseCommands,
        workflow: {
            version: MESH_AI_WORKFLOW_VERSION,
            acceptedBatchCount: Array.isArray(acceptedBatches) ? acceptedBatches.length : 0,
            previewInstructionCount: previewInstructions.length
        }
    };

    return Object.freeze({
        document: source,
        window: Object.freeze({
            baseInstructionCount: baseInstructions.length,
            acceptedInstructionStart: baseInstructions.length,
            acceptedInstructionCount: acceptedInstructions.length,
            previewInstructionStart: baseInstructions.length + acceptedInstructions.length,
            previewInstructionCount: previewInstructions.length,
            totalInstructionCount: mergedInstructions.length,
            totalCommandCount: mergedInstructions.length + baseCommands.length
        })
    });
}

export function classifyCommandScope(commandType) {
    return COMMAND_MODE_BY_ID.get(commandType) ?? 'unsupported';
}

export function summarizeCommandWindow(commandPlan, start, count) {
    const commands = Array.isArray(commandPlan?.commands) ? commandPlan.commands : [];
    const from = Math.max(0, Number(start) || 0);
    const to = Math.min(commands.length, from + Math.max(0, Number(count) || 0));
    const window = commands.slice(from, to);

    let active = 0;
    let hook = 0;
    let clarification = 0;
    let unsupported = 0;

    for (const command of window) {
        const mode = classifyCommandScope(command?.type);
        if (mode === 'active') active += 1;
        else if (mode === 'hook') hook += 1;
        else if (mode === 'clarification') clarification += 1;
        else unsupported += 1;
    }

    return Object.freeze({
        total: window.length,
        active,
        hook,
        clarification,
        unsupported
    });
}

export function summarizeOperationWindow(operationLog, start, count) {
    const operations = Array.isArray(operationLog?.operations) ? operationLog.operations : [];
    const from = Math.max(0, Number(start) || 0);
    const to = Math.min(operations.length, from + Math.max(0, Number(count) || 0));
    const window = operations.slice(from, to);

    let applied = 0;
    let rejected = 0;
    let needsClarification = 0;
    let error = 0;
    let other = 0;

    for (const op of window) {
        const status = String(op?.status ?? '').trim();
        if (status === 'applied') applied += 1;
        else if (status === 'rejected') rejected += 1;
        else if (status === 'needs_clarification') needsClarification += 1;
        else if (status === 'error') error += 1;
        else other += 1;
    }

    return Object.freeze({
        total: window.length,
        applied,
        rejected,
        needsClarification,
        error,
        other
    });
}

export function canAcceptPreview({
    commandScopeSummary,
    operationSummary,
    constraints = MESH_AI_QUALITY_CONSTRAINTS_V1
}) {
    if (!operationSummary || operationSummary.total < 1) return false;
    if ((commandScopeSummary?.hook ?? 0) > 0) return false;
    if ((commandScopeSummary?.unsupported ?? 0) > 0) return false;

    if (constraints.acceptRequiresNoRejectedOrErrorOrClarification) {
        if ((operationSummary.rejected ?? 0) > 0) return false;
        if ((operationSummary.error ?? 0) > 0) return false;
        if ((operationSummary.needsClarification ?? 0) > 0) return false;
    }
    return true;
}

export function createInstructionBatch(instructions, serial) {
    const safeSerial = Math.max(1, Number(serial) || 1);
    const sanitized = Array.isArray(instructions)
        ? instructions.map((line) => sanitizeInstructionLine(line)).filter(Boolean)
        : [];
    return Object.freeze({
        batchId: `ai_batch_${String(safeSerial).padStart(6, '0')}`,
        createdAtMs: Date.now(),
        instructions: Object.freeze(sanitized)
    });
}

export function buildPreviewEvaluation({ draftText, acceptedBatches }) {
    const validation = validateInstructionDraft(draftText, { acceptedBatches });
    if (validation.hasError) return validation;

    const commandPlan = buildDeterministicCommandPlan({
        instructions: validation.lines,
        commands: []
    });
    const commandScopeSummary = summarizeCommandWindow(commandPlan, 0, commandPlan.commands.length);

    return Object.freeze({
        ...validation,
        commandPlan,
        commandScopeSummary
    });
}
