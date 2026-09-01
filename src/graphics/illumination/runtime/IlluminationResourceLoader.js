// Loads verified illumination plans into complete inactive resource sets without renderer-specific dependencies.
// @ts-check

import {
    createRuntimeFailure,
    IlluminationRuntimeError,
    serializeIlluminationRuntimeError
} from './IlluminationRuntimeError.js';
import { createResourceDisposalRegistry } from './ResourceDisposal.js';
import {
    assertActualMemoryFits,
    assertEstimatedMemoryFits,
    defaultCapabilityCheck,
    sanitizeLoadOptions,
    sanitizeResourcePlan
} from './ResourcePlan.js';
import { createRuntimeDiagnostics } from './RuntimeDiagnostics.js';
import { createStagedIlluminationResources } from './StagedIlluminationResources.js';
import { isTrustedIlluminationPackageSegmentedBytes } from './IlluminationPackagePlan.js';

export const ILLUMINATION_RUNTIME_STATES = Object.freeze([
    'unavailable',
    'loading',
    'active',
    'stale',
    'failed',
    'fallback'
]);

export const ILLUMINATION_RUNTIME_PHASES = Object.freeze([
    'locating',
    'fetching',
    'validating',
    'decoding',
    'uploading',
    'prewarming',
    'ready_to_commit',
    'committed',
    'retiring',
    'disposed'
]);

function defaultNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
}

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`Illumination resource loader requires a ${name} function.`);
    return value;
}

function bytesFrom(value, resourceId) {
    if (isTrustedIlluminationPackageSegmentedBytes(value)) return value;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw createRuntimeFailure('fetch_result_invalid', `Fetch result for '${resourceId}' did not provide binary bytes.`, {
        phase: 'fetching',
        reason: 'fetch_failure',
        context: { resourceId }
    });
}

function normalizeFetchResult(value, resourceId) {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'bytes')) {
        if (value.dispose !== undefined && typeof value.dispose !== 'function') {
            throw createRuntimeFailure('fetch_result_invalid', `Fetch result disposer for '${resourceId}' is invalid.`, {
                phase: 'fetching',
                reason: 'fetch_failure',
                context: { resourceId }
            });
        }
        const bytes = bytesFrom(value.bytes, resourceId);
        const cpuBytes = value.cpuBytes ?? bytes.byteLength;
        if (!Number.isSafeInteger(cpuBytes) || cpuBytes < 0) {
            throw createRuntimeFailure('fetch_result_invalid', `Fetch result CPU byte count for '${resourceId}' is invalid.`, {
                phase: 'fetching',
                reason: 'fetch_failure',
                context: { resourceId, actual: cpuBytes ?? null }
            });
        }
        return Object.freeze({
            bytes,
            cpuBytes,
            ownership: value.ownership ?? 'owned-fetch-snapshot-v1',
            dispose: value.dispose ?? null
        });
    }
    const bytes = bytesFrom(value, resourceId);
    return Object.freeze({
        bytes,
        cpuBytes: bytes.byteLength,
        ownership: 'owned-fetch-snapshot-v1',
        dispose: null
    });
}

function normalizeDecodeResult(value, descriptor) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, 'decoded')) {
        throw createRuntimeFailure('decode_result_invalid', `Decoder result for '${descriptor.id}' must expose decoded data and CPU bytes.`, {
            phase: 'decoding',
            reason: 'decode_failure',
            context: { resourceId: descriptor.id }
        });
    }
    if (!Number.isSafeInteger(value.cpuBytes) || value.cpuBytes < 0) {
        throw createRuntimeFailure('decode_result_invalid', `Decoder CPU byte count for '${descriptor.id}' is invalid.`, {
            phase: 'decoding',
            reason: 'decode_failure',
            context: { resourceId: descriptor.id, actual: value.cpuBytes ?? null }
        });
    }
    if (value.dispose !== undefined && typeof value.dispose !== 'function') {
        throw createRuntimeFailure('decode_result_invalid', `Decoder disposer for '${descriptor.id}' is invalid.`, {
            phase: 'decoding',
            reason: 'decode_failure',
            context: { resourceId: descriptor.id }
        });
    }
    return Object.freeze({
        decoded: value.decoded,
        cpuBytes: value.cpuBytes,
        dispose: value.dispose ?? null
    });
}

function normalizeCreatedResource(value, resourceId, phase = 'uploading') {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, 'resource')) {
        throw createRuntimeFailure('resource_factory_result_invalid', `Resource factory result for '${resourceId}' must expose a resource.`, {
            phase,
            reason: phase === 'prewarming' ? 'program_preparation_failure' : 'upload_failure',
            context: { resourceId }
        });
    }
    if (typeof value.dispose !== 'function') {
        throw createRuntimeFailure('resource_factory_result_invalid', `Resource factory result for '${resourceId}' requires an explicit disposer.`, {
            phase,
            reason: phase === 'prewarming' ? 'program_preparation_failure' : 'upload_failure',
            context: { resourceId }
        });
    }
    for (const field of ['cpuBytes', 'gpuBytes']) {
        if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
            throw createRuntimeFailure('resource_factory_result_invalid', `Resource factory byte count '${field}' for '${resourceId}' is invalid.`, {
                phase,
                reason: phase === 'prewarming' ? 'program_preparation_failure' : 'upload_failure',
                context: { resourceId, field, actual: value[field] ?? null }
            });
        }
    }
    return Object.freeze({
        resource: value.resource,
        cpuBytes: value.cpuBytes,
        gpuBytes: value.gpuBytes,
        dispose: value.dispose
    });
}

function normalizeOwnedCreatedResource(value, resourceId, phase = 'uploading') {
    try {
        return normalizeCreatedResource(value, resourceId, phase);
    } catch (error) {
        disposeRejectedCreatedResource(value, phase);
        throw error;
    }
}

function disposeRejectedCreatedResource(value, phase) {
    if (!value || typeof value !== 'object') return;
    let dispose;
    try {
        dispose = value.dispose;
    } catch {
        return;
    }
    if (typeof dispose !== 'function') return;
    try {
        const completion = dispose(phase === 'prewarming' ? 'invalid_prewarm_result' : 'invalid_resource_result');
        if (completion && typeof completion.then === 'function') Promise.resolve(completion).catch(() => {});
    } catch {
        // Preserve the validation failure that rejected this malformed allocation.
    }
}

function normalizeCapabilityResult(value, requiredCapabilities) {
    if (typeof value === 'boolean') {
        return Object.freeze({
            supported: value,
            capabilityCode: value ? null : requiredCapabilities[0] ?? 'runtime_capability',
            missing: value ? Object.freeze([]) : requiredCapabilities
        });
    }
    if (!value || typeof value !== 'object' || typeof value.supported !== 'boolean') {
        throw createRuntimeFailure('capability_check_invalid', 'Capability check must return a boolean or a supported result.', {
            reason: 'validation_failure'
        });
    }
    const missing = value.missing === undefined ? [] : value.missing;
    if (!Array.isArray(missing) || missing.some((id) => typeof id !== 'string')) {
        throw createRuntimeFailure('capability_check_invalid', 'Capability check missing inventory must contain capability IDs.', {
            reason: 'validation_failure'
        });
    }
    return Object.freeze({
        supported: value.supported,
        capabilityCode: value.capabilityCode ?? (value.supported ? null : missing[0] ?? 'runtime_capability'),
        missing: Object.freeze([...missing]),
        details: value.details ?? null
    });
}

function cancellationReason(value) {
    return value === 'superseded' ? 'superseded' : 'cancelled';
}

function createLinkedAbortSignal(externalSignal) {
    const controller = new AbortController();
    let reason = 'cancelled';
    const abortFromExternal = () => {
        reason = cancellationReason(externalSignal?.reason);
        if (!controller.signal.aborted) controller.abort(reason);
    };
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
    return Object.freeze({
        signal: controller.signal,
        abort(nextReason) {
            reason = cancellationReason(nextReason);
            if (!controller.signal.aborted) controller.abort(reason);
        },
        getReason: () => reason,
        detach: () => externalSignal?.removeEventListener('abort', abortFromExternal)
    });
}

function throwIfAborted(signal, getReason, phase, planId) {
    if (!signal.aborted) return;
    const reason = getReason();
    throw createRuntimeFailure(reason === 'superseded' ? 'resource_load_superseded' : 'resource_load_cancelled', `Resource load '${planId}' was ${reason}.`, {
        state: 'fallback',
        phase,
        reason,
        context: { planId }
    });
}

function unexpectedFailure(error, phase, planId) {
    if (error instanceof IlluminationRuntimeError) return error;
    const reasonByPhase = Object.freeze({
        locating: 'validation_failure',
        fetching: 'fetch_failure',
        validating: 'integrity_failure',
        decoding: 'decode_failure',
        uploading: 'upload_failure',
        prewarming: 'program_preparation_failure',
        ready_to_commit: 'activation_failure'
    });
    return createRuntimeFailure(`resource_${phase}_failed`, `Resource load '${planId}' failed during ${phase}.`, {
        phase,
        reason: reasonByPhase[phase] ?? 'runtime_failure',
        context: { planId },
        cause: error
    });
}

function frozenStatus({ generation, planId, state, phase, reason, causeState = null, capabilityCode = null, error = null }) {
    return Object.freeze({
        generation,
        planId,
        state,
        phase,
        reason,
        causeState,
        capabilityCode,
        effectiveMode: state === 'active' ? 'baked' : 'current',
        error: error ? serializeIlluminationRuntimeError(error) : null
    });
}

/**
 * @param {{
 *   fetchResource: (descriptor: Readonly<Record<string, any>>, context: Readonly<Record<string, any>>) => unknown | Promise<unknown>,
 *   hashResource: (bytes: unknown, context: Readonly<Record<string, any>>) => string | Promise<string>,
 *   decodeResource: (bytes: unknown, descriptor: Readonly<Record<string, any>>, context: Readonly<Record<string, any>>) => unknown | Promise<unknown>,
 *   createResource: (decoded: unknown, descriptor: Readonly<Record<string, any>>, context: Readonly<Record<string, any>>) => unknown | Promise<unknown>,
 *   prewarm: (resources: Readonly<Record<string, any>>, context: Readonly<Record<string, any>>) => unknown | Promise<unknown>,
 *   checkCapabilities?: (required: readonly string[], available: unknown, context: Readonly<Record<string, any>>) => unknown | Promise<unknown>,
 *   now?: () => number
 * }} dependencies
 */
export function createIlluminationResourceLoader({
    fetchResource,
    hashResource,
    decodeResource,
    createResource,
    prewarm,
    checkCapabilities = defaultCapabilityCheck,
    now = defaultNow
}) {
    const fetchBinary = requireFunction(fetchResource, 'fetchResource');
    const hashBinary = requireFunction(hashResource, 'hashResource');
    const decodeBinary = requireFunction(decodeResource, 'decodeResource');
    const createGpuResource = requireFunction(createResource, 'createResource');
    const prewarmResources = requireFunction(prewarm, 'prewarm');
    const capabilityCheck = requireFunction(checkCapabilities, 'checkCapabilities');
    const clock = requireFunction(now, 'now');
    const ownedStages = new Set();
    let generation = 0;
    let currentOperation = null;
    let disposed = false;
    let lastDiagnostics = null;
    let status = frozenStatus({
        generation,
        planId: null,
        state: 'unavailable',
        phase: 'locating',
        reason: 'package_not_configured'
    });

    function publishDiagnostics(operation, error = null) {
        lastDiagnostics = operation.diagnostics.snapshot();
        if (currentOperation !== operation) return;
        status = frozenStatus({
            generation: operation.generation,
            planId: operation.plan.id,
            state: lastDiagnostics.state,
            phase: lastDiagnostics.phase,
            reason: lastDiagnostics.reason,
            causeState: lastDiagnostics.causeState,
            capabilityCode: lastDiagnostics.capabilityCode,
            error
        });
    }

    function supersedeCurrent() {
        const operation = currentOperation;
        if (!operation) return;
        if (!operation.stage) operation.abort.abort('superseded');
        else if (operation.stage.disposition === 'ready_to_commit') {
            operation.stage.dispose('superseded').catch(() => {});
        }
    }

    async function runLoad(operation) {
        const { plan, options, diagnostics, registry, abort } = operation;
        const entries = [];
        const entryIds = new Set();
        try {
            await diagnostics.measure('locateMs', async () => {
                throwIfAborted(abort.signal, abort.getReason, 'locating', plan.id);
                assertEstimatedMemoryFits(plan, options);
                const checked = normalizeCapabilityResult(
                    await capabilityCheck(plan.requiredCapabilities, options.capabilities, {
                        plan,
                        signal: abort.signal
                    }),
                    plan.requiredCapabilities
                );
                throwIfAborted(abort.signal, abort.getReason, 'locating', plan.id);
                if (!checked.supported) {
                    throw createRuntimeFailure('unsupported_runtime_capability', `Resource plan '${plan.id}' requires unsupported runtime capabilities.`, {
                        state: 'unavailable',
                        reason: 'unsupported_capability',
                        context: {
                            planId: plan.id,
                            capabilityCode: checked.capabilityCode,
                            missing: checked.missing,
                            details: checked.details ?? null
                        }
                    });
                }
            });

            for (const descriptor of plan.resources) {
                const required = plan.requiredResourceIds.includes(descriptor.id);
                diagnostics.recordResource(descriptor.id, { required, disposition: 'fetching' });
                diagnostics.setLifecycle({ phase: 'fetching' });
                throwIfAborted(abort.signal, abort.getReason, 'fetching', plan.id);
                const fetched = normalizeFetchResult(await diagnostics.measure('fetchMs', () => fetchBinary(descriptor, {
                    plan,
                    signal: abort.signal
                })), descriptor.id);
                const fetchAllocation = diagnostics.allocate({
                    id: `fetch/${descriptor.id}`,
                    cpuBytes: fetched.cpuBytes,
                    gpuBytes: 0,
                    resident: false
                });
                const fetchHandle = registry.register({
                    id: `fetch/${descriptor.id}`,
                    dispose: fetched.dispose,
                    allocationToken: fetchAllocation
                });
                diagnostics.recordResource(descriptor.id, {
                    fetchedBytes: fetched.bytes.byteLength,
                    fetchedCpuBytes: fetched.cpuBytes,
                    fetchOwnership: fetched.ownership
                });
                assertActualMemoryFits(diagnostics.snapshot(), plan.id);
                if (fetched.cpuBytes !== descriptor.memory.fetchedCpuBytes) {
                    throw createRuntimeFailure('fetched_memory_mismatch', `Fetched CPU bytes for '${descriptor.id}' do not match its verified plan.`, {
                        phase: 'fetching',
                        reason: 'validation_failure',
                        context: {
                            planId: plan.id,
                            resourceId: descriptor.id,
                            expected: descriptor.memory.fetchedCpuBytes,
                            actual: fetched.cpuBytes
                        }
                    });
                }
                if (fetched.bytes.byteLength !== descriptor.byteLength) {
                    throw createRuntimeFailure('resource_byte_length_mismatch', `Fetched byte length for '${descriptor.id}' does not match its verified plan.`, {
                        phase: 'validating',
                        reason: 'integrity_failure',
                        context: {
                            planId: plan.id,
                            resourceId: descriptor.id,
                            expected: descriptor.byteLength,
                            actual: fetched.bytes.byteLength
                        }
                    });
                }

                diagnostics.setLifecycle({ phase: 'validating' });
                const digest = await diagnostics.measure('hashMs', () => hashBinary(fetched.bytes, {
                    algorithm: 'sha256',
                    descriptor,
                    plan,
                    signal: abort.signal
                }));
                throwIfAborted(abort.signal, abort.getReason, 'validating', plan.id);
                if (typeof digest !== 'string' || digest !== descriptor.sha256) {
                    throw createRuntimeFailure('resource_hash_mismatch', `SHA-256 mismatch for resource '${descriptor.id}'.`, {
                        phase: 'validating',
                        reason: 'integrity_failure',
                        context: {
                            planId: plan.id,
                            resourceId: descriptor.id,
                            expected: descriptor.sha256,
                            actual: typeof digest === 'string' ? digest : null
                        }
                    });
                }

                diagnostics.setLifecycle({ phase: 'decoding' });
                const decoded = normalizeDecodeResult(await diagnostics.measure('decodeMs', () => decodeBinary(fetched.bytes, descriptor, {
                    plan,
                    signal: abort.signal
                })), descriptor);
                throwIfAborted(abort.signal, abort.getReason, 'decoding', plan.id);
                const decodeAllocation = diagnostics.allocate({
                    id: `decode/${descriptor.id}`,
                    cpuBytes: decoded.cpuBytes,
                    gpuBytes: 0,
                    resident: false
                });
                const decodeHandle = registry.register({
                    id: `decode/${descriptor.id}`,
                    dispose: decoded.dispose,
                    allocationToken: decodeAllocation
                });
                diagnostics.recordResource(descriptor.id, { decodedCpuBytes: decoded.cpuBytes });
                assertActualMemoryFits(diagnostics.snapshot(), plan.id);
                if (decoded.cpuBytes !== descriptor.memory.decodedCpuBytes) {
                    throw createRuntimeFailure('decoded_memory_mismatch', `Decoded CPU bytes for '${descriptor.id}' do not match its verified plan.`, {
                        phase: 'decoding',
                        reason: 'validation_failure',
                        context: {
                            planId: plan.id,
                            resourceId: descriptor.id,
                            expected: descriptor.memory.decodedCpuBytes,
                            actual: decoded.cpuBytes
                        }
                    });
                }

                diagnostics.setLifecycle({ phase: 'uploading' });
                const created = normalizeOwnedCreatedResource(await diagnostics.measure('uploadMs', () => createGpuResource(decoded.decoded, descriptor, {
                    plan,
                    signal: abort.signal
                })), descriptor.id);
                await diagnostics.measure('cpuStagingMs', async () => {
                    const resourceAllocation = diagnostics.allocate({
                        id: `resource/${descriptor.id}`,
                        cpuBytes: created.cpuBytes,
                        gpuBytes: created.gpuBytes,
                        resident: true
                    });
                    registry.register({
                        id: `resource/${descriptor.id}`,
                        dispose: created.dispose,
                        allocationToken: resourceAllocation
                    });
                    entries.push({
                        id: descriptor.id,
                        required,
                        kind: 'resource',
                        resource: created.resource
                    });
                    entryIds.add(descriptor.id);
                    diagnostics.recordResource(descriptor.id, {
                        disposition: 'staged',
                        residentCpuBytes: created.cpuBytes,
                        residentGpuBytes: created.gpuBytes
                    });
                    if (created.cpuBytes !== descriptor.memory.residentCpuBytes
                        || created.gpuBytes !== descriptor.memory.residentGpuBytes) {
                        throw createRuntimeFailure('resident_memory_mismatch', `Resident bytes for '${descriptor.id}' do not match its verified plan.`, {
                            phase: 'uploading',
                            reason: 'allocation_failure',
                            context: {
                                planId: plan.id,
                                resourceId: descriptor.id,
                                expected: {
                                    cpuBytes: descriptor.memory.residentCpuBytes,
                                    gpuBytes: descriptor.memory.residentGpuBytes
                                },
                                actual: { cpuBytes: created.cpuBytes, gpuBytes: created.gpuBytes }
                            }
                        });
                    }
                    assertActualMemoryFits(diagnostics.snapshot(), plan.id);
                    await decodeHandle.dispose('uploaded');
                    await fetchHandle.dispose('decoded');
                });
                throwIfAborted(abort.signal, abort.getReason, 'uploading', plan.id);
            }

            for (const requiredId of plan.requiredResourceIds) {
                if (!entryIds.has(requiredId)) {
                    throw createRuntimeFailure('required_resource_missing', `Required resource '${requiredId}' was not staged.`, {
                        phase: 'uploading',
                        reason: 'validation_failure',
                        context: { planId: plan.id, resourceId: requiredId }
                    });
                }
            }

            diagnostics.setLifecycle({ phase: 'prewarming' });
            let prewarmCpuBytes = 0;
            let prewarmGpuBytes = 0;
            const prewarmView = Object.freeze({
                planId: plan.id,
                resources: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
                getResource: (id) => entries.find((entry) => entry.id === id)?.resource,
                hasResource: (id) => entryIds.has(id)
            });
            const registerPreparedResource = (id, value) => {
                if (typeof id !== 'string' || !id || id.trim() !== id || /[\u0000-\u001f\u007f]/.test(id)) {
                    disposeRejectedCreatedResource(value, 'prewarming');
                    throw new TypeError('Prepared resource requires a stable ID.');
                }
                if (entryIds.has(id)) {
                    disposeRejectedCreatedResource(value, 'prewarming');
                    throw new Error(`Duplicate staged resource ID '${id}'.`);
                }
                const prepared = normalizeOwnedCreatedResource(value, id, 'prewarming');
                const allocationToken = diagnostics.allocate({
                    id: `prewarm/${id}`,
                    cpuBytes: prepared.cpuBytes,
                    gpuBytes: prepared.gpuBytes,
                    resident: true
                });
                registry.register({
                    id: `prewarm/${id}`,
                    dispose: prepared.dispose,
                    allocationToken
                });
                prewarmCpuBytes += prepared.cpuBytes;
                prewarmGpuBytes += prepared.gpuBytes;
                entryIds.add(id);
                entries.push({ id, required: true, kind: 'prewarm', resource: prepared.resource });
                diagnostics.recordResource(id, {
                    required: true,
                    disposition: 'staged',
                    residentCpuBytes: prepared.cpuBytes,
                    residentGpuBytes: prepared.gpuBytes
                });
                assertActualMemoryFits(diagnostics.snapshot(), plan.id);
                return prepared.resource;
            };
            await diagnostics.measure('prewarmMs', () => prewarmResources(prewarmView, {
                plan,
                signal: abort.signal,
                registerResource: registerPreparedResource
            }));
            throwIfAborted(abort.signal, abort.getReason, 'prewarming', plan.id);
            if (prewarmCpuBytes !== plan.prewarmMemory.cpuBytes || prewarmGpuBytes !== plan.prewarmMemory.gpuBytes) {
                throw createRuntimeFailure('prewarm_memory_mismatch', `Prewarm bytes for '${plan.id}' do not match its verified plan.`, {
                    phase: 'prewarming',
                    reason: 'program_preparation_failure',
                    context: {
                        planId: plan.id,
                        expected: plan.prewarmMemory,
                        actual: { cpuBytes: prewarmCpuBytes, gpuBytes: prewarmGpuBytes }
                    }
                });
            }

            diagnostics.setLifecycle({ state: 'loading', phase: 'ready_to_commit', reason: null, causeState: null });
            const stage = createStagedIlluminationResources({
                generation: operation.generation,
                plan,
                entries,
                registry,
                diagnostics,
                onLifecycle(event, details) {
                    if (event === 'disposed') ownedStages.delete(stage);
                    if (currentOperation !== operation) return;
                    if (event === 'committed') publishDiagnostics(operation);
                    else if (event === 'retiring' || event === 'disposed') publishDiagnostics(operation);
                    else if (event === 'handoff_failed') publishDiagnostics(operation, details.error);
                }
            });
            operation.stage = stage;
            ownedStages.add(stage);
            publishDiagnostics(operation);
            return stage;
        } catch (caught) {
            const phase = diagnostics.snapshot().phase;
            const error = abort.signal.aborted
                ? createRuntimeFailure(abort.getReason() === 'superseded' ? 'resource_load_superseded' : 'resource_load_cancelled', `Resource load '${plan.id}' was ${abort.getReason()}.`, {
                    state: 'fallback',
                    phase,
                    reason: abort.getReason(),
                    context: { planId: plan.id }
                })
                : unexpectedFailure(caught, phase, plan.id);
            diagnostics.setLifecycle({
                state: error.state,
                reason: error.reason,
                causeState: error.state,
                capabilityCode: error.context.capabilityCode ?? null,
                phase: 'retiring'
            });
            const errors = await diagnostics.measure('disposalMs', () => registry.disposeAll(error.reason));
            for (const entry of entries) diagnostics.recordResource(entry.id, { disposition: 'disposed' });
            diagnostics.setLifecycle({ phase: 'disposed' });
            if (errors.length > 0) error.context.disposalErrorCount = errors.length;
            publishDiagnostics(operation, error);
            throw error;
        } finally {
            abort.detach();
        }
    }

    function load(rawPlan, rawOptions = {}) {
        if (disposed) return Promise.reject(new Error('Illumination resource loader is disposed.'));
        supersedeCurrent();
        generation += 1;
        if (rawPlan === null || rawPlan === undefined) {
            currentOperation = null;
            lastDiagnostics = null;
            status = frozenStatus({
                generation,
                planId: null,
                state: 'unavailable',
                phase: 'locating',
                reason: 'package_not_configured'
            });
            return Promise.resolve(null);
        }
        let plan;
        let options;
        try {
            plan = sanitizeResourcePlan(rawPlan);
            options = sanitizeLoadOptions(rawOptions);
        } catch (error) {
            const runtimeError = unexpectedFailure(error, 'locating', rawPlan?.id ?? 'unknown');
            currentOperation = null;
            lastDiagnostics = null;
            status = frozenStatus({
                generation,
                planId: rawPlan?.id ?? null,
                state: runtimeError.state,
                phase: runtimeError.phase,
                reason: runtimeError.reason,
                causeState: runtimeError.state,
                error: runtimeError
            });
            return Promise.reject(runtimeError);
        }
        const abort = createLinkedAbortSignal(options.signal);
        const diagnostics = createRuntimeDiagnostics({
            now: clock,
            generation,
            planId: plan.id,
            baselineMemory: options.baselineMemory,
            estimatedMemory: plan.estimatedMemory,
            memoryLimits: options.memoryLimits
        });
        const operation = {
            generation,
            plan,
            options,
            abort,
            diagnostics,
            registry: createResourceDisposalRegistry({ diagnostics }),
            stage: null,
            promise: null
        };
        currentOperation = operation;
        status = frozenStatus({
            generation,
            planId: plan.id,
            state: 'loading',
            phase: 'locating',
            reason: null
        });
        operation.promise = runLoad(operation);
        operation.promise.catch(() => {});
        return operation.promise;
    }

    function cancel(reason = 'cancelled') {
        const normalizedReason = cancellationReason(reason);
        const operation = currentOperation;
        if (!operation) return false;
        if (!operation.stage) {
            operation.abort.abort(normalizedReason);
            return true;
        }
        if (operation.stage.disposition === 'ready_to_commit') {
            operation.stage.dispose(normalizedReason).catch(() => {});
            return true;
        }
        return false;
    }

    async function dispose(reason = 'deactivated') {
        if (disposed) return;
        disposed = true;
        const operation = currentOperation;
        if (operation && !operation.stage) operation.abort.abort('cancelled');
        await Promise.all(Array.from(ownedStages, (stage) => stage.dispose(reason)));
        if (operation?.promise) await operation.promise.catch(() => {});
        status = frozenStatus({
            generation,
            planId: operation?.plan.id ?? null,
            state: 'unavailable',
            phase: 'disposed',
            reason
        });
    }

    return Object.freeze({
        load,
        cancel,
        dispose,
        getStatus: () => status,
        getDiagnostics: () => currentOperation?.diagnostics.snapshot() ?? lastDiagnostics,
        get isDisposed() {
            return disposed;
        }
    });
}
