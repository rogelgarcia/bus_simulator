// Validates and normalizes verified illumination resource plans at the runtime boundary.
// @ts-check

import { createRuntimeFailure } from './IlluminationRuntimeError.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MEMORY_FIELDS = Object.freeze([
    'decodedCpuBytes',
    'residentCpuBytes',
    'residentGpuBytes'
]);
const LIMIT_FIELDS = Object.freeze([
    'cpuBytes',
    'gpuBytes',
    'peakCpuBytes',
    'peakGpuBytes'
]);

function requireRecord(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw createRuntimeFailure('resource_plan_invalid', `Runtime resource plan '${path}' must be an object.`, {
            reason: 'validation_failure',
            context: { path }
        });
    }
    return value;
}

function requireId(value, path) {
    if (typeof value !== 'string' || !value || value.trim() !== value || CONTROL_CHARACTER_PATTERN.test(value)) {
        throw createRuntimeFailure('resource_plan_invalid', `Runtime resource plan '${path}' must be a stable ID.`, {
            reason: 'validation_failure',
            context: { path, actual: value ?? null }
        });
    }
    return value;
}

function requireByteCount(value, path) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw createRuntimeFailure('resource_plan_invalid', `Runtime resource plan '${path}' must be a non-negative safe integer.`, {
            reason: 'validation_failure',
            context: { path, actual: value ?? null }
        });
    }
    return value;
}

function normalizedStringSet(value, path) {
    if (value === undefined) return Object.freeze([]);
    if (!Array.isArray(value)) {
        throw createRuntimeFailure('resource_plan_invalid', `Runtime resource plan '${path}' must be an array.`, {
            reason: 'validation_failure',
            context: { path }
        });
    }
    const normalized = value.map((entry, index) => requireId(entry, `${path}[${index}]`)).sort();
    for (let index = 1; index < normalized.length; index += 1) {
        if (normalized[index - 1] === normalized[index]) {
            throw createRuntimeFailure('resource_plan_invalid', `Runtime resource plan '${path}' contains duplicate ID '${normalized[index]}'.`, {
                reason: 'validation_failure',
                context: { path, id: normalized[index] }
            });
        }
    }
    return Object.freeze(normalized);
}

function normalizeResource(resource, index) {
    requireRecord(resource, `resources[${index}]`);
    const id = requireId(resource.id, `resources[${index}].id`);
    if (typeof resource.sha256 !== 'string' || !SHA256_PATTERN.test(resource.sha256)) {
        throw createRuntimeFailure('resource_plan_invalid', `Resource '${id}' must declare a lowercase SHA-256 digest.`, {
            reason: 'validation_failure',
            context: { path: `resources[${index}].sha256`, id }
        });
    }
    const memory = requireRecord(resource.memory, `resources[${index}].memory`);
    const normalizedMemory = Object.freeze(Object.fromEntries(MEMORY_FIELDS.map((field) => [
        field,
        requireByteCount(memory[field], `resources[${index}].memory.${field}`)
    ])));
    return Object.freeze({
        ...resource,
        id,
        sha256: resource.sha256,
        byteLength: requireByteCount(resource.byteLength, `resources[${index}].byteLength`),
        memory: normalizedMemory
    });
}

function computeEstimatedMemory(resources, prewarmMemory) {
    let residentCpuBytes = 0;
    let residentGpuBytes = 0;
    let peakCpuBytes = 0;
    let peakGpuBytes = 0;
    for (const descriptor of resources) {
        peakCpuBytes = Math.max(
            peakCpuBytes,
            residentCpuBytes
                + descriptor.byteLength
                + descriptor.memory.decodedCpuBytes
                + descriptor.memory.residentCpuBytes
        );
        residentCpuBytes += descriptor.memory.residentCpuBytes;
        residentGpuBytes += descriptor.memory.residentGpuBytes;
        peakGpuBytes = Math.max(peakGpuBytes, residentGpuBytes);
    }
    residentCpuBytes += prewarmMemory.cpuBytes;
    residentGpuBytes += prewarmMemory.gpuBytes;
    peakCpuBytes = Math.max(peakCpuBytes, residentCpuBytes);
    peakGpuBytes = Math.max(peakGpuBytes, residentGpuBytes);
    return Object.freeze({
        cpuBytes: residentCpuBytes,
        gpuBytes: residentGpuBytes,
        peakCpuBytes,
        peakGpuBytes
    });
}

function normalizeMemoryPair(value, path) {
    const source = value === undefined ? {} : requireRecord(value, path);
    return Object.freeze({
        cpuBytes: requireByteCount(source.cpuBytes ?? 0, `${path}.cpuBytes`),
        gpuBytes: requireByteCount(source.gpuBytes ?? 0, `${path}.gpuBytes`)
    });
}

function normalizeMemoryLimits(value) {
    const source = value === undefined ? {} : requireRecord(value, 'options.memoryLimits');
    return Object.freeze(Object.fromEntries(LIMIT_FIELDS.map((field) => {
        const limit = source[field];
        if (limit === undefined || limit === null) return [field, null];
        return [field, requireByteCount(limit, `options.memoryLimits.${field}`)];
    })));
}

function exceedsLimit(value, limit) {
    return limit !== null && value > limit;
}

/** @param {Record<string, any>} plan */
export function sanitizeResourcePlan(plan) {
    requireRecord(plan, 'plan');
    const id = requireId(plan.id, 'id');
    if (!Array.isArray(plan.resources)) {
        throw createRuntimeFailure('resource_plan_invalid', `Runtime resource plan '${id}' must declare a resources array.`, {
            reason: 'validation_failure',
            context: { planId: id }
        });
    }
    const resources = plan.resources.map(normalizeResource).sort((left, right) => (
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    ));
    const resourceIds = new Set();
    for (const descriptor of resources) {
        if (resourceIds.has(descriptor.id)) {
            throw createRuntimeFailure('resource_plan_invalid', `Runtime resource plan '${id}' contains duplicate resource '${descriptor.id}'.`, {
                reason: 'validation_failure',
                context: { planId: id, resourceId: descriptor.id }
            });
        }
        resourceIds.add(descriptor.id);
    }
    const requiredResourceIds = plan.requiredResourceIds === undefined
        ? Object.freeze(resources.map((descriptor) => descriptor.id))
        : normalizedStringSet(plan.requiredResourceIds, 'requiredResourceIds');
    for (const resourceId of requiredResourceIds) {
        if (!resourceIds.has(resourceId)) {
            throw createRuntimeFailure('resource_plan_invalid', `Required resource '${resourceId}' is absent from plan '${id}'.`, {
                reason: 'validation_failure',
                context: { planId: id, resourceId }
            });
        }
    }
    const prewarmMemory = normalizeMemoryPair(plan.prewarmMemory, 'prewarmMemory');
    return Object.freeze({
        id,
        identity: plan.identity === undefined ? Object.freeze({}) : Object.freeze({ ...requireRecord(plan.identity, 'identity') }),
        metadata: plan.metadata === undefined ? Object.freeze({}) : Object.freeze({ ...requireRecord(plan.metadata, 'metadata') }),
        resources: Object.freeze(resources),
        requiredResourceIds,
        requiredCapabilities: normalizedStringSet(plan.requiredCapabilities, 'requiredCapabilities'),
        prewarmMemory,
        estimatedMemory: computeEstimatedMemory(resources, prewarmMemory)
    });
}

/** @param {Record<string, any>} [options] */
export function sanitizeLoadOptions(options = {}) {
    requireRecord(options, 'options');
    const signal = options.signal ?? null;
    if (signal !== null && (typeof signal !== 'object' || typeof signal.addEventListener !== 'function' || typeof signal.aborted !== 'boolean')) {
        throw new TypeError('Load option signal must be an AbortSignal.');
    }
    return Object.freeze({
        signal,
        capabilities: options.capabilities ?? Object.freeze({}),
        baselineMemory: normalizeMemoryPair(options.baselineMemory, 'options.baselineMemory'),
        memoryLimits: normalizeMemoryLimits(options.memoryLimits)
    });
}

/** @param {Record<string, any>} plan @param {Record<string, any>} options */
export function assertEstimatedMemoryFits(plan, options) {
    const estimated = plan.estimatedMemory;
    const baseline = options.baselineMemory;
    const limits = options.memoryLimits;
    const exceeded = [];
    if (exceedsLimit(estimated.cpuBytes, limits.cpuBytes)) exceeded.push('cpuBytes');
    if (exceedsLimit(estimated.gpuBytes, limits.gpuBytes)) exceeded.push('gpuBytes');
    if (exceedsLimit(estimated.peakCpuBytes + baseline.cpuBytes, limits.peakCpuBytes)) exceeded.push('peakCpuBytes');
    if (exceedsLimit(estimated.peakGpuBytes + baseline.gpuBytes, limits.peakGpuBytes)) exceeded.push('peakGpuBytes');
    if (exceeded.length > 0) {
        throw createRuntimeFailure('unsupported_memory_budget', `Resource plan '${plan.id}' exceeds the runtime memory budget.`, {
            state: 'unavailable',
            reason: 'unsupported_capability',
            context: {
                capabilityCode: 'memory_budget',
                exceeded,
                estimated,
                baseline,
                limits
            }
        });
    }
}

/** @param {Record<string, any>} snapshot @param {string} planId */
export function assertActualMemoryFits(snapshot, planId) {
    const { current, resident, peakWithBaseline, limits } = snapshot.memory;
    const exceeded = [];
    if (exceedsLimit(resident.cpuBytes, limits.cpuBytes)) exceeded.push('cpuBytes');
    if (exceedsLimit(resident.gpuBytes, limits.gpuBytes)) exceeded.push('gpuBytes');
    if (exceedsLimit(peakWithBaseline.cpuBytes, limits.peakCpuBytes)) exceeded.push('peakCpuBytes');
    if (exceedsLimit(peakWithBaseline.gpuBytes, limits.peakGpuBytes)) exceeded.push('peakGpuBytes');
    if (exceeded.length > 0) {
        throw createRuntimeFailure('resource_allocation_budget_exceeded', `Resource plan '${planId}' exceeded the runtime memory budget while staging.`, {
            phase: 'uploading',
            reason: 'allocation_failure',
            context: { planId, exceeded, current, resident, peakWithBaseline, limits }
        });
    }
}

/** @param {readonly string[]} requiredCapabilities @param {unknown} capabilities */
export function defaultCapabilityCheck(requiredCapabilities, capabilities) {
    const available = capabilities instanceof Set
        ? capabilities
        : new Set(Array.isArray(capabilities)
            ? capabilities
            : Object.entries(capabilities ?? {}).filter(([, supported]) => supported === true).map(([id]) => id));
    const missing = requiredCapabilities.filter((id) => !available.has(id));
    return Object.freeze({
        supported: missing.length === 0,
        capabilityCode: missing.length === 0 ? null : missing[0],
        missing: Object.freeze(missing)
    });
}
