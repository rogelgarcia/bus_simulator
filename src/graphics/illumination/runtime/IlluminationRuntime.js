// Composes package fetch/verification, staged resources, and the sole app-owned frame-boundary controller.
// @ts-check

import {
    parseIlluminationBinaryPackage,
    parseTransferredIlluminationBinaryPackage,
    transferIlluminationPackageOwnership
} from '../../../app/illumination/package/IlluminationBinaryPackage.js';
import { ILLUMINATION_MAX_PACKAGE_BYTES } from '../../../app/illumination/package/IlluminationPackageConstants.js';
import { IlluminationPackageError } from '../../../app/illumination/package/IlluminationPackageError.js';
import { createIlluminationModeController } from '../../../app/illumination/runtime/IlluminationModeController.js';
import { createIlluminationResourceLoader } from './IlluminationResourceLoader.js';
import { IlluminationRuntimeError, createRuntimeFailure } from './IlluminationRuntimeError.js';
import { sanitizeResourcePlan } from './ResourcePlan.js';
import {
    createIlluminationPackageChunkReader,
    createIlluminationPackageResourcePlan,
    decodeIlluminationPackageResource,
    hashIlluminationPackageResource
} from './IlluminationPackagePlan.js';

const MIB = 1024 * 1024;
const DEFAULT_MEMORY_LIMITS = Object.freeze({
    cpuBytes: 256 * MIB,
    gpuBytes: 256 * MIB,
    peakCpuBytes: 384 * MIB,
    peakGpuBytes: 384 * MIB
});
const DEFAULT_MAX_PACKAGE_BYTES = 64 * MIB;
const DEFENSIVE_PACKAGE_COPY_FACTOR = 3;
const TRANSFERRED_PACKAGE_COPY_FACTOR = 1;
const REQUIRED_RUNTIME_IDENTITY_FIELDS = Object.freeze([
    'cityId',
    'lightingProfileId',
    'selectedCapabilityProfileId',
    'resolvedSourceSha256'
]);
const RUNTIME_EXPECTATION_FIELDS = new Set([
    ...REQUIRED_RUNTIME_IDENTITY_FIELDS,
    'aggregateSha256',
    'compilerSignatureSha256',
    'profileSha256',
    'staticSunDepthSourceSha256'
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Explicitly certifies that every value returned by this fetcher is fresh,
 * exclusively owned, and may have its backing ArrayBuffer detached.
 * Cached, shared, or caller-retained byte views must not use this marker.
 * @template {Function} T
 * @param {T} fetchPackage
 * @returns {T}
 */
export function markIlluminationPackageFetcherAsTransferOwned(fetchPackage) {
    if (typeof fetchPackage !== 'function') {
        throw new TypeError('Illumination runtime fetchPackage must be a function');
    }
    Object.defineProperty(fetchPackage, 'transferOwnership', {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false
    });
    return fetchPackage;
}

/**
 * @param {{
 *   initialMode?: 'current' | 'baked' | 'auto',
 *   cacheInactiveResources?: boolean,
 *   fetchPackage?: (request: Readonly<Record<string, any>>, context: {signal: AbortSignal}) => unknown | Promise<unknown>,
 *   createResource: (decoded: unknown, descriptor: Readonly<Record<string, any>>, context: Readonly<Record<string, any>>) => unknown | Promise<unknown>,
 *   validateResourcePlan?: (plan: Readonly<Record<string, any>>) => unknown,
 *   prewarm?: (resources: Readonly<Record<string, any>>, context: Readonly<Record<string, any>>) => unknown | Promise<unknown>,
 *   commitSnapshot?: (snapshot: Readonly<Record<string, any>>) => unknown,
 *   waitUntilSafeToDispose?: (resourceSet: object, context: Readonly<Record<string, any>>) => unknown | Promise<unknown>,
 *   capabilities?: Record<string, boolean> | Iterable<string>,
 *   expectations?: Record<string, string>,
 *   memoryLimits?: {cpuBytes?: number | null, gpuBytes?: number | null, peakCpuBytes?: number | null, peakGpuBytes?: number | null},
 *   baselineMemory?: {cpuBytes?: number, gpuBytes?: number},
 *   residentCpuPolicy?: 'release' | 'retain',
 *   prewarmMemory?: {cpuBytes?: number, gpuBytes?: number},
 *   maximumPackageBytes?: number,
 *   now?: () => number
 * }} options
 */
export function createIlluminationRuntime(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Illumination runtime options are required');
    if (typeof options.createResource !== 'function') throw new TypeError('Illumination runtime requires createResource');
    const maximumPackageBytes = normalizeMaximumPackageBytes(options.maximumPackageBytes);
    const fetchPackage = options.fetchPackage ?? null;
    if (fetchPackage !== null && typeof fetchPackage !== 'function') {
        throw new TypeError('Illumination runtime fetchPackage must be a function');
    }
    const transfersFetchOwnership = fetchPackage === null
        || /** @type {any} */ (fetchPackage).transferOwnership === true;
    const packageCopyFactor = transfersFetchOwnership
        ? TRANSFERRED_PACKAGE_COPY_FACTOR
        : DEFENSIVE_PACKAGE_COPY_FACTOR;
    const prewarm = options.prewarm ?? (() => undefined);
    const commitSnapshot = options.commitSnapshot ?? (() => true);
    const validateResourcePlan = options.validateResourcePlan
        ?? options.createResource.validatePlan
        ?? (() => undefined);
    if (typeof prewarm !== 'function' || typeof commitSnapshot !== 'function' || typeof validateResourcePlan !== 'function') {
        throw new TypeError('Illumination runtime prewarm, commitSnapshot, and validateResourcePlan must be functions');
    }
    const capabilities = normalizeCapabilities(options.capabilities);
    const memoryLimits = normalizeRuntimeMemoryLimits(options.memoryLimits);
    const baselineMemory = normalizeRuntimeMemoryPair(options.baselineMemory, 'baselineMemory');
    const residentCpuPolicy = options.residentCpuPolicy ?? 'release';
    const prewarmMemory = Object.freeze({ cpuBytes: 0, gpuBytes: 0, ...(options.prewarmMemory ?? {}) });
    const configuredExpectations = normalizeRuntimeExpectations(options.expectations, 'runtime expectations');
    const cacheInactiveResources = options.cacheInactiveResources ?? false;
    if (typeof cacheInactiveResources !== 'boolean') {
        throw new TypeError('Illumination runtime cacheInactiveResources must be boolean');
    }
    let currentResourceLoader = null;
    let lastParsedIdentity = null;
    const liveResourceSets = new Set();
    const inFlightLoadReservations = new Set();

    const controller = createIlluminationModeController({
        initialMode: options.initialMode ?? 'current',
        cacheInactiveResources,
        now: options.now,
        async loadStagedResources(request, hooks) {
            if (typeof request.url !== 'string' || !request.url) {
                throw loadOutcome('unavailable', 'not_configured', 'configure_payload');
            }
            const expectations = requireRuntimeExpectations({
                ...configuredExpectations,
                ...normalizeRuntimeExpectations(request.expectations, 'load expectations')
            });
            const loadReservation = { cpuBytes: 0, gpuBytes: 0 };
            inFlightLoadReservations.add(loadReservation);
            try {
                const fetchBaselineMemory = getConcurrentBaselineMemory(
                    baselineMemory,
                    liveResourceSets,
                    inFlightLoadReservations,
                    loadReservation
                );
                const maximumLoadPackageBytes = maximumPackageBytesForWorkingSet(
                    maximumPackageBytes,
                    memoryLimits.peakCpuBytes,
                    fetchBaselineMemory.cpuBytes,
                    packageCopyFactor
                );
                if (maximumLoadPackageBytes <= 0) {
                    throw packageWorkingSetFailure('locating', {
                        baselineCpuBytes: fetchBaselineMemory.cpuBytes,
                        peakCpuBytes: memoryLimits.peakCpuBytes
                    });
                }
                loadReservation.cpuBytes = multiplyByteCount(
                    maximumLoadPackageBytes,
                    packageCopyFactor
                );
                let packageBytes;
                let fetchedValue;
                const fetchStarted = now(options.now);
                hooks.reportPhase('fetching');
                try {
                    fetchedValue = await (fetchPackage
                        ? fetchPackage(request, { signal: hooks.signal })
                        : fetchPackageWithBrowserFetch(request, { signal: hooks.signal }, maximumLoadPackageBytes, {
                            limitCode: maximumLoadPackageBytes < maximumPackageBytes
                                ? 'package_working_set_exceeded'
                                : 'package_size_exceeded'
                        }));
                    packageBytes = normalizePackageBytes(fetchedValue);
                    fetchedValue = null;
                } catch (error) {
                    if (hooks.signal.aborted) throw error;
                    if (error instanceof IlluminationRuntimeError) throw error;
                    if (isPackageSizeError(error)) {
                        if (error.code === 'package_working_set_exceeded') {
                            throw packageWorkingSetFailure('fetching', {
                                actual: error.actual ?? null,
                                maximum: error.maximum ?? maximumLoadPackageBytes
                            });
                        }
                        throw loadOutcome('failed', 'validation_failure', 'payload_change', 'package_size_exceeded');
                    }
                    if (isMissingPackageError(error)) {
                        throw loadOutcome('unavailable', 'package_missing', 'asset_available');
                    }
                    throw loadOutcome('failed', 'fetch_failure', 'explicit_retry', errorCode(error));
                }
                if (packageBytes.byteLength > maximumPackageBytes) {
                    throw loadOutcome('failed', 'validation_failure', 'payload_change', 'package_size_exceeded');
                }
                if (packageBytes.byteLength > maximumLoadPackageBytes) {
                    throw packageWorkingSetFailure('fetching', {
                        actual: packageBytes.byteLength,
                        maximum: maximumLoadPackageBytes
                    });
                }
                const packageByteLength = packageBytes.byteLength;
                const packageBackingByteLength = packageBytes.buffer.byteLength;
                let transferredPackageLease = null;
                let packageResidentCpuBytes = packageByteLength;
                let trustBoundaryReservationCpuBytes;
                if (transfersFetchOwnership) {
                    transferredPackageLease = transferIlluminationPackageOwnership(packageBytes);
                    packageBytes = null;
                    packageResidentCpuBytes = transferredPackageLease.backingByteLength;
                    trustBoundaryReservationCpuBytes = transferredPackageLease.transferPeakCpuBytes;
                } else {
                    trustBoundaryReservationCpuBytes = addByteCounts(
                        packageBackingByteLength,
                        packageByteLength,
                        packageByteLength
                    );
                }
                const trustBoundaryBaselineMemory = getConcurrentBaselineMemory(
                    baselineMemory,
                    liveResourceSets,
                    inFlightLoadReservations,
                    loadReservation
                );
                const trustBoundaryPeakCpuBytes = addByteCounts(
                    trustBoundaryBaselineMemory.cpuBytes,
                    trustBoundaryReservationCpuBytes
                );
                if (memoryLimits.peakCpuBytes !== null
                    && trustBoundaryPeakCpuBytes > memoryLimits.peakCpuBytes) {
                    throw packageWorkingSetFailure('fetching', {
                        actual: trustBoundaryPeakCpuBytes,
                        maximum: memoryLimits.peakCpuBytes,
                        packageByteLength,
                        packageBackingByteLength
                    });
                }
                loadReservation.cpuBytes = trustBoundaryReservationCpuBytes;
                const packageFetchMs = elapsed(options.now, fetchStarted);
                hooks.reportPhase('validating');
                const validateStarted = now(options.now);
                let parsed;
                try {
                    const parseOptions = {
                        expectations,
                        runtimeCapabilities: capabilities.ids
                    };
                    parsed = transferredPackageLease
                        ? await parseTransferredIlluminationBinaryPackage(
                            transferredPackageLease,
                            parseOptions
                        )
                        : await parseIlluminationBinaryPackage(packageBytes, parseOptions);
                } catch (error) {
                    throw mapPackageError(error);
                } finally {
                    packageBytes = null;
                    transferredPackageLease = null;
                }
                const packageValidateMs = elapsed(options.now, validateStarted);
                lastParsedIdentity = freezeParsedIdentity(parsed);
                let plan;
                try {
                    plan = createIlluminationPackageResourcePlan(parsed, {
                        residentCpuPolicy,
                        prewarmMemory
                    });
                } catch (error) {
                    if (error instanceof IlluminationRuntimeError) throw error;
                    throw createRuntimeFailure('package_plan_failed', 'Verified illumination package could not form a resource plan.', {
                        state: 'failed',
                        phase: 'validating',
                        reason: 'validation_failure',
                        cause: error
                    });
                }
                try {
                    validateResourcePlan(plan);
                } catch (error) {
                    throw createRuntimeFailure('resource_plan_unsupported', 'Illumination resource plan exceeds runtime device capabilities.', {
                        state: 'unavailable',
                        phase: 'locating',
                        reason: 'unsupported_capability',
                        context: {
                            capabilityCode: 'webgl2_resource_plan',
                            detail: errorCode(error)
                        },
                        cause: error
                    });
                }
                const estimatedPlanMemory = sanitizeResourcePlan(plan).estimatedMemory;
                const stagingExternalBaselineMemory = getConcurrentBaselineMemory(
                    baselineMemory,
                    liveResourceSets,
                    inFlightLoadReservations,
                    loadReservation
                );
                const stagingBaselineMemory = addRuntimeMemory(stagingExternalBaselineMemory, {
                    cpuBytes: packageResidentCpuBytes,
                    gpuBytes: 0
                });
                loadReservation.cpuBytes = addByteCounts(
                    packageResidentCpuBytes,
                    estimatedPlanMemory.peakCpuBytes
                );
                loadReservation.gpuBytes = estimatedPlanMemory.peakGpuBytes;
                hooks.reportPhase('decoding');
                const reader = createIlluminationPackageChunkReader(parsed);
                const resourceLoader = createIlluminationResourceLoader({
                    fetchResource: reader.fetchResource,
                    hashResource: hashIlluminationPackageResource,
                    decodeResource: decodeIlluminationPackageResource,
                    createResource: options.createResource,
                    prewarm,
                    now: options.now
                });
                currentResourceLoader = resourceLoader;
                let stage;
                try {
                    stage = await resourceLoader.load(plan, {
                        signal: hooks.signal,
                        capabilities: capabilities.map,
                        memoryLimits,
                        baselineMemory: stagingBaselineMemory
                    });
                } catch (error) {
                    if (error instanceof IlluminationRuntimeError) throw error;
                    throw createRuntimeFailure('resource_stage_failed', 'Illumination resources did not finish staging.', {
                        state: 'failed',
                        phase: 'uploading',
                        reason: 'upload_failure',
                        cause: error
                    });
                } finally {
                    reader.dispose();
                }
                if (!stage) throw loadOutcome('unavailable', 'package_missing', 'asset_available');
                liveResourceSets.add(stage);
                const diagnostics = stage.getDiagnostics();
                const packagePeakCpuBytes = Math.max(
                    trustBoundaryPeakCpuBytes,
                    diagnostics.memory.peakWithBaseline.cpuBytes
                );
                return {
                    complete: true,
                    compatible: true,
                    resourceSet: stage,
                    cacheKey: cacheInactiveResources ? createRuntimeCacheKey(request) : null,
                    ...plan.identity,
                    timings: {
                        fetchReadMs: packageFetchMs + diagnostics.timingsMs.fetchMs,
                        hashMs: packageValidateMs + diagnostics.timingsMs.hashMs,
                        decodeMs: diagnostics.timingsMs.decodeMs,
                        cpuStagingMs: diagnostics.timingsMs.cpuStagingMs,
                        gpuUploadMs: diagnostics.timingsMs.uploadMs,
                        activationMs: 0,
                        disposalMs: 0
                    },
                    memory: {
                        residentCpuBytes: diagnostics.memory.resident.cpuBytes,
                        residentGpuBytes: diagnostics.memory.resident.gpuBytes,
                        peakCpuBytes: packagePeakCpuBytes,
                        peakGpuBytes: diagnostics.memory.peakWithBaseline.gpuBytes
                    }
                };
            } finally {
                inFlightLoadReservations.delete(loadReservation);
            }
        },
        commitResources(snapshot) {
            if (snapshot.mode === 'current') {
                return commitSnapshot(Object.freeze({
                    mode: 'current',
                    generation: snapshot.generation,
                    resources: null,
                    retainResources: snapshot.retainResources === true
                }));
            }
            const stage = /** @type {{commitPrepared?: (callback: (value: unknown) => unknown) => unknown}} */ (snapshot.resourceSet);
            if (snapshot.reuseResources === true) {
                const reusableStage = /** @type {{disposition?: string, activationSnapshot?: unknown}} */ (stage);
                if (reusableStage.disposition !== 'committed' || !reusableStage.activationSnapshot) {
                    throw new Error('Cached baked resources are not in a reusable committed state');
                }
                return commitSnapshot(Object.freeze({
                    mode: 'baked',
                    generation: snapshot.generation,
                    resources: reusableStage.activationSnapshot,
                    reused: true
                }));
            }
            if (typeof stage?.commitPrepared !== 'function') {
                throw new TypeError('Baked frame-boundary commit requires a prepared resource set');
            }
            return stage.commitPrepared((activationSnapshot) => commitSnapshot(Object.freeze({
                mode: 'baked',
                generation: snapshot.generation,
                resources: activationSnapshot
            })));
        },
        waitUntilSafeToDispose: options.waitUntilSafeToDispose,
        async disposeResources(resourceSet, context) {
            const disposable = /** @type {{dispose?: (reason: string) => unknown}} */ (resourceSet);
            try {
                return await disposable.dispose?.(context.reason);
            } finally {
                liveResourceSets.delete(resourceSet);
            }
        }
    });

    async function load(request = {}) {
        const snapshot = controller.getSnapshot();
        if (snapshot.requestedMode === 'current') return snapshot;
        return controller.load(request);
    }

    async function setMode(mode, request = null) {
        if (mode === 'current') {
            return controller.deactivate('current_requested', {
                retainResources: cacheInactiveResources
            });
        }
        if (request !== null && cacheInactiveResources) {
            const cacheKey = createRuntimeCacheKey(request);
            if (controller.activateCached(cacheKey, mode)) return controller.getSnapshot();
            controller.discardCached('cache_mismatch');
        }
        const snapshot = controller.setRequestedMode(mode);
        if (request === null) return snapshot;
        return load(request);
    }

    async function teardown() {
        currentResourceLoader = null;
        await controller.teardown();
    }

    return Object.freeze({
        setMode,
        load,
        commitFrameBoundary: controller.commitFrameBoundary,
        deactivate: controller.deactivate,
        cancel: controller.cancelLoad,
        teardown,
        waitForIdle: controller.waitForIdle,
        getSnapshot: controller.getSnapshot,
        getDiagnostics() {
            return Object.freeze({
                controller: controller.getDiagnostics(),
                resources: currentResourceLoader?.getDiagnostics() ?? null,
                package: lastParsedIdentity
            });
        },
        getActiveResourceSet: controller.getActiveResourceSet
    });
}

/** @param {Record<string, any>} request */
function createRuntimeCacheKey(request) {
    const clone = cloneRuntimeCacheValue(request, 'Illumination cache request');
    return JSON.stringify(clone);
}

/** @param {unknown} value @param {string} label */
function cloneRuntimeCacheValue(value, label) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError(label + ' contains a non-finite number');
        return value;
    }
    if (Array.isArray(value)) return value.map((entry) => cloneRuntimeCacheValue(entry, label));
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.keys(value).sort().map((key) => {
            const entry = value[key];
            if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol' || typeof entry === 'bigint') {
                throw new TypeError(label + ' contains a non-JSON value at "' + key + '"');
            }
            return [key, cloneRuntimeCacheValue(entry, label)];
        }));
    }
    throw new TypeError(label + ' must contain only JSON-compatible values');
}

/** @param {unknown} value @param {string} label */
function normalizeRuntimeExpectations(value, label) {
    if (value === undefined) return Object.freeze({});
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(label + ' must be an object');
    }
    const result = {};
    for (const [key, expectation] of Object.entries(value)) {
        if (!RUNTIME_EXPECTATION_FIELDS.has(key)) throw new TypeError(label + ' has unknown key "' + key + '"');
        if (typeof expectation !== 'string' || !expectation) {
            throw new TypeError(label + ' values must be non-empty strings');
        }
        if (key.endsWith('Sha256') && !SHA256_PATTERN.test(expectation)) {
            throw new TypeError(label + ' "' + key + '" must be a lowercase SHA-256');
        }
        result[key] = expectation;
    }
    return Object.freeze(result);
}

/** @param {Record<string, string>} expectations */
function requireRuntimeExpectations(expectations) {
    const missing = REQUIRED_RUNTIME_IDENTITY_FIELDS.filter((field) => !expectations[field]);
    if (missing.length > 0) {
        throw loadOutcome('unavailable', 'not_configured', 'configuration_change', 'missing_identity:' + missing.join(','));
    }
    return Object.freeze({ ...expectations });
}

/** @param {Readonly<Record<string, any>>} request @param {{signal: AbortSignal}} context */
async function fetchPackageWithBrowserFetch(request, context, maximumPackageBytes, options = {}) {
    if (typeof globalThis.fetch !== 'function') throw new Error('fetch_unavailable');
    const response = await globalThis.fetch(request.url, { signal: context.signal });
    if (!response.ok) {
        const error = new Error(`package_http_${response.status}`);
        error.status = response.status;
        throw error;
    }
    const lengthHeader = response.headers.get('content-length');
    const declaredLength = lengthHeader === null ? null : Number(lengthHeader);
    if (declaredLength !== null && Number.isSafeInteger(declaredLength) && declaredLength > maximumPackageBytes) {
        throw packageSizeError(declaredLength, maximumPackageBytes, options.limitCode);
    }
    if (declaredLength !== null && Number.isSafeInteger(declaredLength) && declaredLength >= 0) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== declaredLength) {
            throw packageContentLengthError(bytes.byteLength, declaredLength);
        }
        return bytes;
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
        const error = new Error('A bounded streaming response body is required for illumination packages.');
        error.code = 'package_streaming_unavailable';
        throw error;
    }
    const reader = response.body.getReader();
    const declaredCapacity = declaredLength !== null && Number.isSafeInteger(declaredLength) && declaredLength >= 0
        ? declaredLength
        : maximumPackageBytes;
    const buffer = new Uint8Array(declaredCapacity);
    let byteLength = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
            byteLength += chunk.byteLength;
            if (byteLength > maximumPackageBytes) {
                await reader.cancel('illumination_package_size_exceeded');
                throw packageSizeError(byteLength, maximumPackageBytes, options.limitCode);
            }
            if (byteLength > buffer.byteLength) {
                await reader.cancel('illumination_package_content_length_mismatch');
                throw packageContentLengthError(byteLength, buffer.byteLength);
            }
            buffer.set(chunk, byteLength - chunk.byteLength);
        }
    } finally {
        reader.releaseLock();
    }
    if (declaredLength !== null && Number.isSafeInteger(declaredLength) && byteLength !== declaredLength) {
        throw packageContentLengthError(byteLength, declaredLength);
    }
    return buffer.slice(0, byteLength);
}

/** @param {unknown} value */
function normalizePackageBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value && typeof value === 'object' && 'bytes' in value) return normalizePackageBytes(value.bytes);
    throw new TypeError('Package fetch must return binary bytes');
}

/** @param {number | undefined} value */
function normalizeMaximumPackageBytes(value) {
    const maximum = value ?? DEFAULT_MAX_PACKAGE_BYTES;
    if (!Number.isSafeInteger(maximum) || maximum <= 0 || maximum > ILLUMINATION_MAX_PACKAGE_BYTES) {
        throw new RangeError(`maximumPackageBytes must be between 1 and ${ILLUMINATION_MAX_PACKAGE_BYTES}`);
    }
    return maximum;
}

/** @param {{cpuBytes?: number, gpuBytes?: number} | undefined} value @param {string} label */
function normalizeRuntimeMemoryPair(value, label) {
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
        throw new TypeError(label + ' must be an object');
    }
    const source = value ?? {};
    const result = {
        cpuBytes: source.cpuBytes ?? 0,
        gpuBytes: source.gpuBytes ?? 0
    };
    for (const [key, bytes] of Object.entries(result)) {
        if (!Number.isSafeInteger(bytes) || bytes < 0) {
            throw new TypeError(`${label}.${key} must be a non-negative safe integer`);
        }
    }
    return Object.freeze(result);
}

/** @param {{cpuBytes?: number | null, gpuBytes?: number | null, peakCpuBytes?: number | null, peakGpuBytes?: number | null} | undefined} value */
function normalizeRuntimeMemoryLimits(value) {
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
        throw new TypeError('memoryLimits must be an object');
    }
    const source = value ?? {};
    const result = {};
    for (const key of ['cpuBytes', 'gpuBytes', 'peakCpuBytes', 'peakGpuBytes']) {
        const configured = source[key];
        const limit = configured === undefined ? DEFAULT_MEMORY_LIMITS[key] : configured;
        if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) {
            throw new TypeError(`memoryLimits.${key} must be null or a non-negative safe integer`);
        }
        result[key] = limit;
    }
    return Object.freeze(result);
}

/** @param {{cpuBytes: number, gpuBytes: number}} left @param {{cpuBytes: number, gpuBytes: number}} right */
function addRuntimeMemory(left, right) {
    return Object.freeze({
        cpuBytes: addByteCounts(left.cpuBytes, right.cpuBytes),
        gpuBytes: addByteCounts(left.gpuBytes, right.gpuBytes)
    });
}

/** @param {Set<any>} liveResourceSets */
function getLiveResourceMemory(liveResourceSets) {
    let memory = Object.freeze({ cpuBytes: 0, gpuBytes: 0 });
    for (const resourceSet of liveResourceSets) {
        const diagnostics = resourceSet.getDiagnostics();
        const current = diagnostics.memory.current;
        memory = addRuntimeMemory(memory, current);
    }
    return memory;
}

/** @param {Set<{cpuBytes: number, gpuBytes: number}>} reservations @param {{cpuBytes: number, gpuBytes: number}} excluded */
function getOtherLoadReservationMemory(reservations, excluded) {
    let memory = Object.freeze({ cpuBytes: 0, gpuBytes: 0 });
    for (const reservation of reservations) {
        if (reservation === excluded) continue;
        memory = addRuntimeMemory(memory, reservation);
    }
    return memory;
}

/**
 * @param {{cpuBytes: number, gpuBytes: number}} configuredBaseline
 * @param {Set<any>} liveResourceSets
 * @param {Set<{cpuBytes: number, gpuBytes: number}>} reservations
 * @param {{cpuBytes: number, gpuBytes: number}} excluded
 */
function getConcurrentBaselineMemory(configuredBaseline, liveResourceSets, reservations, excluded) {
    return addRuntimeMemory(
        addRuntimeMemory(configuredBaseline, getLiveResourceMemory(liveResourceSets)),
        getOtherLoadReservationMemory(reservations, excluded)
    );
}

/** @param {number} maximumPackageBytes @param {number | null} peakCpuBytes @param {number} baselineCpuBytes @param {number} copyFactor */
function maximumPackageBytesForWorkingSet(
    maximumPackageBytes,
    peakCpuBytes,
    baselineCpuBytes,
    copyFactor
) {
    if (peakCpuBytes === null) return maximumPackageBytes;
    const available = peakCpuBytes - baselineCpuBytes;
    if (available <= 0) return 0;
    return Math.min(maximumPackageBytes, Math.floor(available / copyFactor));
}

/** @param {number} value @param {number} factor */
function multiplyByteCount(value, factor) {
    const product = value * factor;
    if (!Number.isSafeInteger(product) || product < 0) {
        throw new RangeError('Illumination memory calculation exceeded safe integer range');
    }
    return product;
}

/** @param {...number} values */
function addByteCounts(...values) {
    const sum = values.reduce((total, value) => total + value, 0);
    if (!Number.isSafeInteger(sum) || sum < 0) throw new RangeError('Illumination memory calculation exceeded safe integer range');
    return sum;
}

/** @param {string} phase @param {Record<string, unknown>} details */
function packageWorkingSetFailure(phase, details) {
    return createRuntimeFailure('package_working_set_exceeded', 'Illumination package exceeds the bounded runtime CPU working set.', {
        state: 'unavailable',
        phase,
        reason: 'unsupported_capability',
        context: {
            capabilityCode: 'memory_budget',
            ...details
        }
    });
}

/** @param {number} actual @param {number} maximum */
function packageSizeError(actual, maximum, code = 'package_size_exceeded') {
    const error = new Error(`Illumination package exceeds the runtime limit of ${maximum} bytes.`);
    error.code = code;
    error.actual = actual;
    error.maximum = maximum;
    return error;
}

/** @param {number} actual @param {number} declared */
function packageContentLengthError(actual, declared) {
    const error = new Error(`Illumination package Content-Length declared ${declared} bytes but streamed ${actual}.`);
    error.code = 'package_content_length_mismatch';
    error.actual = actual;
    error.declared = declared;
    return error;
}

/** @param {unknown} error */
function isPackageSizeError(error) {
    return Boolean(error && typeof error === 'object' && 'code' in error
        && (error.code === 'package_size_exceeded' || error.code === 'package_working_set_exceeded'));
}

/** @param {Readonly<Record<string, any>>} parsed */
function freezeParsedIdentity(parsed) {
    return Object.freeze({
        aggregateSha256: parsed.aggregateSha256,
        cityId: parsed.manifest.cityId,
        lightingProfileId: parsed.manifest.lightingProfileId,
        capabilityProfileId: parsed.manifest.selectedCapabilityProfileId,
        resolvedSourceSha256: parsed.manifest.source.resolvedSourceSha256,
        compilerSignatureSha256: parsed.manifest.compiler.signatureSha256,
        selectedChunkIds: Object.freeze([...parsed.compatibility.selectedChunkIds]),
        skippedOptionalChannelIds: Object.freeze([...parsed.compatibility.skippedOptionalChannelIds])
    });
}

/** @param {Record<string, boolean> | Iterable<string> | undefined} value */
function normalizeCapabilities(value) {
    if (value === undefined) return Object.freeze({ ids: Object.freeze([]), map: Object.freeze({}) });
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Set)
        && typeof value[Symbol.iterator] !== 'function') {
        for (const [id, supported] of Object.entries(value)) {
            if (!id || typeof supported !== 'boolean') {
                throw new TypeError('Illumination capability maps require non-empty IDs and boolean values');
            }
        }
        const map = Object.freeze({ ...value });
        return Object.freeze({
            ids: Object.freeze(Object.entries(map).filter(([, supported]) => supported === true).map(([id]) => id).sort()),
            map
        });
    }
    if (typeof value === 'string' || value === null || typeof value[Symbol.iterator] !== 'function') {
        throw new TypeError('Illumination capabilities must be a boolean map or an iterable of capability IDs');
    }
    const providedIds = [...value];
    for (const id of providedIds) {
        if (typeof id !== 'string' || !id) {
            throw new TypeError('Illumination capability inventories require non-empty string IDs');
        }
    }
    const ids = Object.freeze([...new Set(providedIds)].sort());
    return Object.freeze({ ids, map: Object.freeze(Object.fromEntries(ids.map((id) => [id, true]))) });
}

/** @param {unknown} error */
function mapPackageError(error) {
    if (!(error instanceof IlluminationPackageError)) {
        return createRuntimeFailure('package_validation_failed', 'Illumination package validation failed.', {
            state: 'failed',
            phase: 'validating',
            reason: 'validation_failure',
            cause: error
        });
    }
    const schemaFailure = /(?:magic|version|schema|header|endian|flags|reserved|json|utf8|keys)/.test(error.code);
    return createRuntimeFailure(error.code, error.message, {
        state: 'failed',
        phase: 'validating',
        reason: schemaFailure ? 'schema_failure' : 'integrity_failure',
        context: error.details,
        cause: error
    });
}

/** @param {'unavailable' | 'stale' | 'failed'} state @param {string} reason @param {string} retryTrigger @param {string | null} [failureCode] */
function loadOutcome(state, reason, retryTrigger, failureCode = null) {
    return Object.freeze({ state, reason, retryTrigger, failureCode });
}

/** @param {unknown} error */
function isMissingPackageError(error) {
    return error && typeof error === 'object' && 'status' in error
        && (error.status === 404 || error.status === 410);
}

/** @param {unknown} error */
function errorCode(error) {
    if (error && typeof error === 'object' && 'code' in error) return String(error.code);
    return error instanceof Error ? error.message : String(error);
}

/** @param {(() => number) | undefined} clock */
function now(clock) {
    return clock?.() ?? globalThis.performance?.now?.() ?? Date.now();
}

/** @param {(() => number) | undefined} clock @param {number} started */
function elapsed(clock, started) {
    const value = now(clock) - started;
    return Number.isFinite(value) && value > 0 ? value : 0;
}
