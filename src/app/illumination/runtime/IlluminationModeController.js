// Coordinates optional baked-illumination loading and frame-boundary activation without rendering dependencies.
// @ts-check

import {
    ILLUMINATION_MEMORY_KEYS,
    ILLUMINATION_MODES,
    ILLUMINATION_PHASES,
    ILLUMINATION_STATES,
    ILLUMINATION_TIMING_KEYS,
    assertIlluminationMemoryKey,
    assertIlluminationMode,
    assertIlluminationPhase,
    assertIlluminationTimingKey
} from './IlluminationLifecycleCatalog.js';
import {
    assertByteCount,
    assertNonNegativeFinite,
    assertReason,
    cloneJsonRecord,
    createMetricRecord,
    deepFreeze,
    elapsed,
    errorCode,
    isThenable,
    mergeMemory,
    mergeMetrics,
    normalizeThrownOutcome,
    sanitizeControllerOptions,
    sanitizeIdentity,
    sanitizeLoadOutcome,
    sanitizeStagingResult
} from './internal/LifecycleValidation.js';

/**
 * @typedef {Record<string, unknown>} JsonRecord
 *
 * @typedef {{
 *   resourceSet: object,
 *   complete: true,
 *   compatible: true,
 *   packageId?: string | null,
 *   profileId?: string | null,
 *   cityId?: string | null,
 *   compilerSignature?: string | null,
 *   selectedChannels?: readonly string[],
 *   sourceHashes?: JsonRecord,
 *   integrityHashes?: JsonRecord,
 *   timings?: Partial<Record<string, number>>,
 *   memory?: Partial<Record<string, number>>
 * }} IlluminationStagingResult
 *
 * @typedef {{
 *   state: 'unavailable' | 'stale' | 'failed',
 *   reason: string,
 *   capabilityCode?: string | null,
 *   failureCode?: string | null,
 *   retryTrigger?: string | null
 * }} IlluminationLoadOutcome
 *
 * @typedef {{
 *   generation: number,
 *   signal: AbortSignal,
 *   isCurrent: () => boolean,
 *   reportPhase: (phase: string) => boolean,
 *   recordTiming: (key: string, milliseconds: number) => boolean,
 *   recordMemory: (key: string, bytes: number) => boolean,
 *   accept: (result: IlluminationStagingResult) => boolean,
 *   reject: (outcome: IlluminationLoadOutcome) => boolean
 * }} IlluminationLoadHooks
 *
 * @typedef {{
 *   initialMode?: 'current' | 'baked' | 'auto',
 *   cacheInactiveResources?: boolean,
 *   loadStagedResources?: (request: Readonly<JsonRecord>, hooks: IlluminationLoadHooks) => Promise<IlluminationStagingResult> | IlluminationStagingResult,
 *   commitResources?: (snapshot: Readonly<{mode: 'current' | 'baked', resourceSet: object | null, generation: number, retainResources?: boolean, reuseResources?: boolean}>) => void,
 *   waitUntilSafeToDispose?: (resourceSet: object, context: Readonly<{reason: string, generation: number}>) => Promise<void> | void,
 *   disposeResources?: (resourceSet: object, context: Readonly<{reason: string, generation: number}>) => Promise<void> | void,
 *   now?: () => number
 * }} CreateIlluminationModeControllerOptions
 */

const DEFAULT_CAUSE = Object.freeze({
    state: ILLUMINATION_STATES.unavailable,
    reason: 'not_configured',
    capabilityCode: null,
    failureCode: null,
    retryTrigger: 'configure_payload'
});

/**
 * @param {CreateIlluminationModeControllerOptions} [options]
 */
export function createIlluminationModeController(options = {}) {
    const config = sanitizeControllerOptions(/** @type {Record<string, unknown>} */ (options));
    let requestedMode = config.initialMode;
    let effectiveMode = ILLUMINATION_MODES.current;
    let state = ILLUMINATION_STATES.unavailable;
    let phase = ILLUMINATION_PHASES.disposed;
    let reason = DEFAULT_CAUSE.reason;
    let causeState = /** @type {string | null} */ (null);
    let capabilityCode = /** @type {string | null} */ (null);
    let failureCode = /** @type {string | null} */ (null);
    let retryTrigger = DEFAULT_CAUSE.retryTrigger;
    let generation = 0;
    let currentLoad = /** @type {ReturnType<typeof createLoadRecord> | null} */ (null);
    let staged = /** @type {ReturnType<typeof sanitizeStagingResult> | null} */ (null);
    let active = /** @type {ReturnType<typeof sanitizeStagingResult> | null} */ (null);
    let cached = /** @type {ReturnType<typeof sanitizeStagingResult> | null} */ (null);
    let retainActiveOnCurrent = false;
    let pendingTransition = /** @type {'current' | 'baked' | null} */ (null);
    let destroyed = false;
    let teardownPromise = /** @type {Promise<void> | null} */ (null);
    let disposedCount = 0;
    let retiringCount = 0;
    const disposalErrors = /** @type {string[]} */ ([]);
    const scheduledResources = new WeakSet();
    const retainedResources = new Set();
    const invalidatedGenerationReasons = new Map();
    const disposalTasks = new Set();
    const loadTasks = new Set();
    const timings = createMetricRecord(ILLUMINATION_TIMING_KEYS);
    const memory = createMetricRecord(ILLUMINATION_MEMORY_KEYS);

    if (requestedMode !== ILLUMINATION_MODES.current) publishFallback(DEFAULT_CAUSE);

    function getSnapshot() {
        const identity = staged ?? active ?? cached ?? currentLoad?.identity ?? null;
        return deepFreeze({
            requestedMode,
            effectiveMode,
            state,
            phase,
            reason,
            causeState,
            capabilityCode,
            failureCode,
            retryTrigger,
            generation,
            loadGeneration: currentLoad?.generation ?? null,
            load: currentLoad ? {
                generation: currentLoad.generation,
                phase: currentLoad.phase,
                packageId: currentLoad.identity.packageId,
                profileId: currentLoad.identity.profileId,
                cityId: currentLoad.identity.cityId
            } : null,
            packageId: identity?.packageId ?? null,
            profileId: identity?.profileId ?? null,
            cityId: identity?.cityId ?? null,
            compilerSignature: identity?.compilerSignature ?? null,
            selectedChannels: [...(identity?.selectedChannels ?? [])],
            sourceHashes: identity?.sourceHashes ?? {},
            integrityHashes: identity?.integrityHashes ?? {},
            timings: { ...timings },
            memory: { ...memory },
            resources: {
                staging: staged ? 'staged' : 'none',
                active: active && effectiveMode === ILLUMINATION_MODES.baked ? 'active' : 'none',
                cached: cached ? 'cached' : 'none',
                retiring: retiringCount,
                retained: retainedResources.size,
                disposed: disposedCount,
                disposalErrors: [...disposalErrors]
            },
            pendingTransition,
            destroyed
        });
    }

    function getActiveResourceSet() {
        return effectiveMode === ILLUMINATION_MODES.baked ? active?.resourceSet ?? null : null;
    }

    /** @param {'current' | 'baked' | 'auto'} mode */
    function setRequestedMode(mode) {
        assertUsable();
        assertIlluminationMode(mode);
        requestedMode = mode;
        if (mode === ILLUMINATION_MODES.current) {
            retainActiveOnCurrent = false;
            cancelPendingWork('current_requested', false);
            discardCachedInternal('current_requested');
            pendingTransition = 'current';
            if (!active) {
                state = ILLUMINATION_STATES.unavailable;
                phase = ILLUMINATION_PHASES.readyToCommit;
                reason = 'current_requested';
                clearCause();
            }
            return getSnapshot();
        }
        if (staged) {
            pendingTransition = 'baked';
            state = ILLUMINATION_STATES.loading;
            phase = ILLUMINATION_PHASES.readyToCommit;
            reason = null;
        } else if (active) {
            pendingTransition = null;
            state = ILLUMINATION_STATES.active;
            phase = ILLUMINATION_PHASES.committed;
            reason = null;
            clearCause();
        } else if (currentLoad) {
            state = ILLUMINATION_STATES.loading;
            phase = currentLoad.phase;
            reason = null;
        } else {
            pendingTransition = null;
            publishFallback(DEFAULT_CAUSE);
        }
        return getSnapshot();
    }

    /** @param {string} cacheKey @param {'baked' | 'auto'} [mode] */
    function activateCached(cacheKey, mode = ILLUMINATION_MODES.auto) {
        assertUsable();
        assertReason(cacheKey, 'Illumination cache key');
        assertIlluminationMode(mode);
        if (mode === ILLUMINATION_MODES.current) {
            throw new TypeError('Cached illumination activation mode cannot be "current"');
        }
        if (!config.cacheInactiveResources || !cached || cached.cacheKey !== cacheKey
            || currentLoad || staged) return false;
        requestedMode = mode;
        retainActiveOnCurrent = false;
        pendingTransition = 'baked';
        state = ILLUMINATION_STATES.loading;
        phase = ILLUMINATION_PHASES.readyToCommit;
        reason = null;
        clearCause();
        return true;
    }

    /** @param {string} [discardReason] */
    function discardCached(discardReason = 'cache_discarded') {
        assertUsable();
        assertReason(discardReason, 'Illumination cache-discard reason');
        return discardCachedInternal(discardReason);
    }

    /** @param {JsonRecord} [request] */
    function startLoad(request = {}) {
        assertUsable();
        if (requestedMode === ILLUMINATION_MODES.current) {
            throw new Error('Cannot load baked illumination while requested mode is "current"');
        }
        const identity = sanitizeIdentity(request, 'Illumination load request');
        supersedePendingLoad();
        generation += 1;
        const record = createLoadRecord(generation, identity);
        currentLoad = record;
        if (!active) {
            state = ILLUMINATION_STATES.loading;
            phase = ILLUMINATION_PHASES.locating;
            reason = null;
            clearCause();
        }
        return createLoadHooks(record);
    }

    /** @param {JsonRecord} [request] */
    async function load(request = {}) {
        assertUsable();
        if (!config.loadStagedResources) {
            throw new Error('No illumination staged-resource loader was configured');
        }
        const immutableRequest = /** @type {Readonly<JsonRecord>} */ (deepFreeze(cloneJsonRecord(request, 'Illumination load request')));
        const hooks = startLoad(immutableRequest);
        const record = currentLoad;
        const task = Promise.resolve()
            .then(() => config.loadStagedResources(immutableRequest, hooks))
            .then(
                (result) => hooks.accept(result),
                (error) => {
                    if (!hooks.signal.aborted && hooks.isCurrent()) {
                        hooks.reject(normalizeThrownOutcome(error));
                    }
                }
            );
        if (record) record.promise = task;
        loadTasks.add(task);
        try {
            await task;
        } finally {
            loadTasks.delete(task);
            invalidatedGenerationReasons.delete(hooks.generation);
        }
        return getSnapshot();
    }

    /** @param {number} targetGeneration @param {string} nextPhase */
    function reportLoadPhase(targetGeneration, nextPhase) {
        assertIlluminationPhase(nextPhase);
        if (!isGenerationCurrent(targetGeneration)) return false;
        if (nextPhase === ILLUMINATION_PHASES.readyToCommit
            || nextPhase === ILLUMINATION_PHASES.committed
            || nextPhase === ILLUMINATION_PHASES.retiring
            || nextPhase === ILLUMINATION_PHASES.disposed) {
            throw new TypeError('Loaders cannot publish controller-owned phase "' + nextPhase + '"');
        }
        currentLoad.phase = nextPhase;
        if (!active) phase = nextPhase;
        return true;
    }

    /** @param {number} targetGeneration @param {string} key @param {number} milliseconds */
    function recordTiming(targetGeneration, key, milliseconds) {
        assertIlluminationTimingKey(key);
        assertNonNegativeFinite(milliseconds, 'Illumination timing');
        if (!isGenerationCurrent(targetGeneration)) return false;
        timings[key] += milliseconds;
        return true;
    }

    /** @param {number} targetGeneration @param {string} key @param {number} bytes */
    function recordMemory(targetGeneration, key, bytes) {
        assertIlluminationMemoryKey(key);
        assertByteCount(bytes, 'Illumination memory');
        if (!isGenerationCurrent(targetGeneration)) return false;
        memory[key] = key.startsWith('peak') ? Math.max(memory[key], bytes) : bytes;
        return true;
    }

    /** @param {number} targetGeneration @param {IlluminationStagingResult} result */
    function acceptStagingResult(targetGeneration, result) {
        const accepted = sanitizeStagingResult(result, targetGeneration);
        if (scheduledResources.has(accepted.resourceSet)) {
            throw new Error('Illumination staging resource set is already scheduled for disposal');
        }
        if (!isGenerationCurrent(targetGeneration)
            || requestedMode === ILLUMINATION_MODES.current
            || destroyed) {
            const dispositionReason = invalidatedGenerationReasons.get(targetGeneration) ?? 'superseded';
            invalidatedGenerationReasons.delete(targetGeneration);
            queueDisposal(accepted.resourceSet, dispositionReason, targetGeneration);
            return false;
        }
        if (staged) queueDisposal(staged.resourceSet, 'superseded', staged.generation);
        mergeMetrics(timings, accepted.timings, ILLUMINATION_TIMING_KEYS);
        mergeMemory(memory, accepted.memory);
        staged = accepted;
        currentLoad = null;
        pendingTransition = 'baked';
        if (!active) state = ILLUMINATION_STATES.loading;
        phase = ILLUMINATION_PHASES.readyToCommit;
        reason = null;
        clearCause();
        return true;
    }

    /** @param {number} targetGeneration @param {IlluminationLoadOutcome} outcome */
    function rejectLoad(targetGeneration, outcome) {
        const failure = sanitizeLoadOutcome(outcome);
        if (!isGenerationCurrent(targetGeneration) || destroyed) return false;
        if (currentLoad) {
            currentLoad.abortController.abort(failure.reason);
        }
        currentLoad = null;
        if (staged) {
            queueDisposal(staged.resourceSet, failure.reason, staged.generation);
            staged = null;
        }
        pendingTransition = active ? 'current' : null;
        rememberCause(failure);
        if (!active) {
            state = failure.state;
            phase = ILLUMINATION_PHASES.disposed;
            reason = failure.reason;
        }
        return true;
    }

    /** @param {string} [cancelReason] */
    function cancelLoad(cancelReason = 'cancelled') {
        assertUsable();
        assertReason(cancelReason, 'Illumination cancellation reason');
        const hadPending = Boolean(currentLoad || staged);
        cancelPendingWork(cancelReason, false);
        if (!hadPending) return false;
        const outcome = {
            state: ILLUMINATION_STATES.unavailable,
            reason: cancelReason,
            capabilityCode: null,
            failureCode: null,
            retryTrigger: 'explicit_retry'
        };
        rememberCause(outcome);
        pendingTransition = active ? 'current' : null;
        if (!active) publishFallback(outcome);
        return true;
    }

    function commitFrameBoundary() {
        assertUsable();
        if (pendingTransition === 'baked' && (staged || cached)) return commitBaked();
        if (pendingTransition === 'current') return commitCurrent();
        if (!active && requestedMode !== ILLUMINATION_MODES.current
            && (state === ILLUMINATION_STATES.unavailable
                || state === ILLUMINATION_STATES.stale
                || state === ILLUMINATION_STATES.failed)) {
            publishFallback({
                state,
                reason: reason ?? 'unavailable',
                capabilityCode,
                failureCode,
                retryTrigger
            });
        }
        return getSnapshot();
    }

    /** @param {string} [deactivationReason] @param {{retainResources?: boolean}} [options] */
    function deactivate(deactivationReason = 'deactivated', options = {}) {
        assertUsable();
        assertReason(deactivationReason, 'Illumination deactivation reason');
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('Illumination deactivation options must be an object');
        }
        if (options.retainResources !== undefined && typeof options.retainResources !== 'boolean') {
            throw new TypeError('Illumination retainResources must be boolean');
        }
        const retainResources = options.retainResources === true && config.cacheInactiveResources;
        requestedMode = ILLUMINATION_MODES.current;
        retainActiveOnCurrent = retainResources;
        cancelPendingWork(deactivationReason, false);
        if (!retainResources) discardCachedInternal(deactivationReason);
        pendingTransition = 'current';
        reason = deactivationReason;
        clearCause();
        return getSnapshot();
    }

    function teardown() {
        if (teardownPromise) return teardownPromise;
        destroyed = true;
        requestedMode = ILLUMINATION_MODES.current;
        if (currentLoad) {
            invalidatedGenerationReasons.set(currentLoad.generation, 'teardown');
            currentLoad.abortController.abort('teardown');
        }
        currentLoad = null;
        pendingTransition = null;
        try {
            tryCommit({ mode: ILLUMINATION_MODES.current, resourceSet: null, generation });
        } catch (error) {
            disposalErrors.push('teardown_commit:' + errorCode(error));
        }
        if (staged) queueDisposal(staged.resourceSet, 'teardown', staged.generation);
        if (active) queueDisposal(active.resourceSet, 'teardown', active.generation);
        if (cached) queueDisposal(cached.resourceSet, 'teardown', cached.generation);
        staged = null;
        active = null;
        cached = null;
        retainActiveOnCurrent = false;
        effectiveMode = ILLUMINATION_MODES.current;
        state = ILLUMINATION_STATES.unavailable;
        phase = ILLUMINATION_PHASES.disposed;
        reason = 'teardown';
        clearCause();
        teardownPromise = waitForIdle();
        return teardownPromise;
    }

    async function waitForIdle() {
        while (loadTasks.size > 0) await Promise.allSettled(Array.from(loadTasks));
        await waitForDisposals();
    }

    function commitBaked() {
        const next = staged ?? cached;
        if (!next) return getSnapshot();
        const fromCache = next === cached;
        const started = config.now();
        try {
            tryCommit({
                mode: ILLUMINATION_MODES.baked,
                resourceSet: next.resourceSet,
                generation: next.generation,
                reuseResources: fromCache
            });
        } catch (error) {
            timings.activationMs += elapsed(config.now, started);
            queueDisposal(next.resourceSet, 'activation_failure', next.generation);
            if (fromCache) cached = null;
            else staged = null;
            pendingTransition = active ? 'current' : null;
            const outcome = {
                state: ILLUMINATION_STATES.failed,
                reason: 'activation_failure',
                capabilityCode: null,
                failureCode: errorCode(error),
                retryTrigger: 'explicit_retry'
            };
            rememberCause(outcome);
            if (!active) {
                effectiveMode = ILLUMINATION_MODES.current;
                state = ILLUMINATION_STATES.failed;
                phase = ILLUMINATION_PHASES.disposed;
                reason = outcome.reason;
            }
            return getSnapshot();
        }
        timings.activationMs += elapsed(config.now, started);
        const previous = active;
        const previousCache = fromCache ? null : cached;
        active = next;
        staged = null;
        cached = null;
        pendingTransition = null;
        effectiveMode = ILLUMINATION_MODES.baked;
        state = ILLUMINATION_STATES.active;
        phase = ILLUMINATION_PHASES.committed;
        reason = null;
        clearCause();
        if (previous && previous.resourceSet !== next.resourceSet) {
            queueDisposal(previous.resourceSet, 'replaced', previous.generation);
        }
        if (previousCache && previousCache.resourceSet !== next.resourceSet) {
            queueDisposal(previousCache.resourceSet, 'replaced', previousCache.generation);
        }
        return getSnapshot();
    }

    function commitCurrent() {
        const previous = active;
        const retainResources = Boolean(
            config.cacheInactiveResources
            && retainActiveOnCurrent
            && (previous || cached)
        );
        const started = config.now();
        try {
            tryCommit({
                mode: ILLUMINATION_MODES.current,
                resourceSet: null,
                generation,
                retainResources
            });
        } catch (error) {
            timings.activationMs += elapsed(config.now, started);
            failureCode = errorCode(error);
            return getSnapshot();
        }
        timings.activationMs += elapsed(config.now, started);
        active = null;
        retainActiveOnCurrent = false;
        effectiveMode = ILLUMINATION_MODES.current;
        pendingTransition = null;
        if (previous && retainResources) {
            if (cached && cached.resourceSet !== previous.resourceSet) {
                queueDisposal(cached.resourceSet, 'cache_replaced', cached.generation);
            }
            cached = previous;
        } else if (previous) {
            queueDisposal(previous.resourceSet, reason ?? 'deactivated', previous.generation);
        }
        if (requestedMode === ILLUMINATION_MODES.current) {
            state = ILLUMINATION_STATES.unavailable;
            phase = ILLUMINATION_PHASES.committed;
            reason = reason ?? 'current_requested';
            clearCause();
        } else {
            publishFallback({
                state: causeState ?? ILLUMINATION_STATES.unavailable,
                reason: reason ?? 'unavailable',
                capabilityCode,
                failureCode,
                retryTrigger
            });
        }
        return getSnapshot();
    }

    /** @param {ReturnType<typeof createLoadRecord>} record */
    function createLoadHooks(record) {
        return Object.freeze({
            generation: record.generation,
            signal: record.abortController.signal,
            isCurrent: () => isGenerationCurrent(record.generation),
            reportPhase: (nextPhase) => reportLoadPhase(record.generation, nextPhase),
            recordTiming: (key, milliseconds) => recordTiming(record.generation, key, milliseconds),
            recordMemory: (key, bytes) => recordMemory(record.generation, key, bytes),
            accept: (result) => acceptStagingResult(record.generation, result),
            reject: (outcome) => rejectLoad(record.generation, outcome)
        });
    }

    /** @param {object} resourceSet @param {string} disposalReason @param {number} resourceGeneration */
    function queueDisposal(resourceSet, disposalReason, resourceGeneration) {
        if (scheduledResources.has(resourceSet)) return;
        scheduledResources.add(resourceSet);
        retiringCount += 1;
        const context = Object.freeze({ reason: disposalReason, generation: resourceGeneration });
        const task = Promise.resolve().then(async () => {
            const started = config.now();
            try {
                await config.waitUntilSafeToDispose(resourceSet, context);
            } catch (error) {
                disposalErrors.push('retirement:' + errorCode(error));
                timings.disposalMs += elapsed(config.now, started);
                retiringCount -= 1;
                retainedResources.add(resourceSet);
                return;
            }
            try {
                await config.disposeResources(resourceSet, context);
            } catch (error) {
                disposalErrors.push('disposal:' + errorCode(error));
            } finally {
                timings.disposalMs += elapsed(config.now, started);
                retiringCount -= 1;
                disposedCount += 1;
                if (!active && !staged && !cached && retiringCount === 0 && retainedResources.size === 0) {
                    memory.residentCpuBytes = 0;
                    memory.residentGpuBytes = 0;
                }
            }
        });
        disposalTasks.add(task);
        task.finally(() => disposalTasks.delete(task));
    }

    /** @param {string} discardReason */
    function discardCachedInternal(discardReason) {
        if (!cached) return false;
        const previous = cached;
        cached = null;
        queueDisposal(previous.resourceSet, discardReason, previous.generation);
        return true;
    }

    async function waitForDisposals() {
        while (disposalTasks.size > 0) await Promise.allSettled(Array.from(disposalTasks));
    }

    function supersedePendingLoad() {
        if (currentLoad) {
            invalidatedGenerationReasons.set(currentLoad.generation, 'superseded');
            currentLoad.abortController.abort('superseded');
        }
        currentLoad = null;
        if (staged) {
            queueDisposal(staged.resourceSet, 'superseded', staged.generation);
            staged = null;
        }
        pendingTransition = null;
    }

    /** @param {string} cancellationReason @param {boolean} publish */
    function cancelPendingWork(cancellationReason, publish) {
        if (currentLoad) {
            invalidatedGenerationReasons.set(currentLoad.generation, cancellationReason);
            currentLoad.abortController.abort(cancellationReason);
        }
        currentLoad = null;
        if (staged) {
            queueDisposal(staged.resourceSet, cancellationReason, staged.generation);
            staged = null;
        }
        if (publish) publishFallback({ ...DEFAULT_CAUSE, reason: cancellationReason });
    }

    /** @param {IlluminationLoadOutcome | typeof DEFAULT_CAUSE} outcome */
    function rememberCause(outcome) {
        causeState = outcome.state;
        reason = outcome.reason;
        capabilityCode = outcome.capabilityCode ?? null;
        failureCode = outcome.failureCode ?? null;
        retryTrigger = outcome.retryTrigger ?? null;
    }

    /** @param {IlluminationLoadOutcome | typeof DEFAULT_CAUSE} outcome */
    function publishFallback(outcome) {
        rememberCause(outcome);
        state = ILLUMINATION_STATES.fallback;
        phase = ILLUMINATION_PHASES.committed;
        effectiveMode = ILLUMINATION_MODES.current;
    }

    function clearCause() {
        causeState = null;
        capabilityCode = null;
        failureCode = null;
        retryTrigger = null;
    }

    /** @param {number} targetGeneration */
    function isGenerationCurrent(targetGeneration) {
        return !destroyed
            && currentLoad?.generation === targetGeneration
            && !currentLoad.abortController.signal.aborted;
    }

    function assertUsable() {
        if (destroyed) throw new Error('Illumination mode controller has been torn down');
    }

    /** @param {{mode: 'current' | 'baked', resourceSet: object | null, generation: number, retainResources?: boolean, reuseResources?: boolean}} snapshot */
    function tryCommit(snapshot) {
        const result = config.commitResources(Object.freeze(snapshot));
        if (isThenable(result)) throw new TypeError('Illumination frame-boundary commits must be synchronous');
    }

    return Object.freeze({
        getSnapshot,
        getDiagnostics: getSnapshot,
        getActiveResourceSet,
        setRequestedMode,
        activateCached,
        discardCached,
        startLoad,
        load,
        reportLoadPhase,
        recordTiming,
        recordMemory,
        acceptStagingResult,
        rejectLoad,
        cancelLoad,
        commitFrameBoundary,
        deactivate,
        teardown,
        waitForIdle
    });
}

/** @param {number} generation @param {ReturnType<typeof sanitizeIdentity>} identity */
function createLoadRecord(generation, identity) {
    return {
        generation,
        identity,
        abortController: new AbortController(),
        phase: ILLUMINATION_PHASES.locating,
        promise: /** @type {Promise<unknown> | null} */ (null)
    };
}
