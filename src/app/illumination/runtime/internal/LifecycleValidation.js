// Validates and snapshots the JSON-like boundary data used by illumination lifecycle control.
// @ts-check

import {
    ILLUMINATION_MEMORY_KEYS,
    ILLUMINATION_MODES,
    ILLUMINATION_STATES,
    ILLUMINATION_TIMING_KEYS,
    assertIlluminationCauseState,
    assertIlluminationMode
} from '../IlluminationLifecycleCatalog.js';

/** @typedef {Record<string, unknown>} JsonRecord */

/** @param {Record<string, unknown>} options */
export function sanitizeControllerOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Illumination mode-controller options must be an object');
    }
    const initialMode = options.initialMode ?? ILLUMINATION_MODES.current;
    assertIlluminationMode(initialMode);
    assertOptionalFunction(options.loadStagedResources, 'loadStagedResources');
    assertOptionalFunction(options.commitResources, 'commitResources');
    assertOptionalFunction(options.waitUntilSafeToDispose, 'waitUntilSafeToDispose');
    assertOptionalFunction(options.disposeResources, 'disposeResources');
    assertOptionalFunction(options.now, 'now');
    return {
        initialMode,
        loadStagedResources: options.loadStagedResources ?? null,
        commitResources: options.commitResources ?? (() => undefined),
        waitUntilSafeToDispose: options.waitUntilSafeToDispose ?? (() => undefined),
        disposeResources: options.disposeResources ?? defaultDisposeResources,
        now: options.now ?? defaultNow
    };
}

/** @param {Record<string, unknown>} result @param {number} generation */
export function sanitizeStagingResult(result, generation) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new TypeError('Illumination staging result must be an object');
    }
    if (result.complete !== true) throw new TypeError('Illumination staging result must be complete');
    if (result.compatible !== true) throw new TypeError('Illumination staging result must be compatible');
    if (!result.resourceSet || (typeof result.resourceSet !== 'object' && typeof result.resourceSet !== 'function')) {
        throw new TypeError('Illumination staging result must contain a resource set');
    }
    const identity = sanitizeIdentity(result, 'Illumination staging result');
    const timings = sanitizeMetricInput(result.timings, ILLUMINATION_TIMING_KEYS, 'Illumination staging timing');
    const memory = sanitizeMetricInput(result.memory, ILLUMINATION_MEMORY_KEYS, 'Illumination staging memory', true);
    return Object.freeze({
        ...identity,
        resourceSet: /** @type {object} */ (result.resourceSet),
        generation,
        timings,
        memory
    });
}

/** @param {Record<string, unknown>} source @param {string} label */
export function sanitizeIdentity(source, label) {
    return Object.freeze({
        packageId: optionalString(source.packageId, label + ' packageId'),
        profileId: optionalString(source.profileId, label + ' profileId'),
        cityId: optionalString(source.cityId, label + ' cityId'),
        compilerSignature: optionalString(source.compilerSignature, label + ' compilerSignature'),
        selectedChannels: freezeStringArray(source.selectedChannels, label + ' selectedChannels'),
        sourceHashes: deepFreeze(cloneJsonRecord(source.sourceHashes ?? {}, label + ' sourceHashes')),
        integrityHashes: deepFreeze(cloneJsonRecord(source.integrityHashes ?? {}, label + ' integrityHashes'))
    });
}

/** @param {Record<string, unknown>} outcome */
export function sanitizeLoadOutcome(outcome) {
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
        throw new TypeError('Illumination load outcome must be an object');
    }
    assertIlluminationCauseState(outcome.state);
    assertReason(outcome.reason, 'Illumination load outcome reason');
    return Object.freeze({
        state: outcome.state,
        reason: outcome.reason,
        capabilityCode: optionalString(outcome.capabilityCode, 'Illumination capability code'),
        failureCode: optionalString(outcome.failureCode, 'Illumination failure code'),
        retryTrigger: optionalString(outcome.retryTrigger, 'Illumination retry trigger')
    });
}

/** @param {unknown} error */
export function normalizeThrownOutcome(error) {
    if (error && typeof error === 'object' && !Array.isArray(error)) {
        try {
            return sanitizeLoadOutcome(/** @type {Record<string, unknown>} */ (error));
        } catch {
            return {
                state: ILLUMINATION_STATES.failed,
                reason: 'load_failure',
                failureCode: errorCode(error),
                retryTrigger: 'explicit_retry'
            };
        }
    }
    return {
        state: ILLUMINATION_STATES.failed,
        reason: 'load_failure',
        failureCode: errorCode(error),
        retryTrigger: 'explicit_retry'
    };
}

/** @param {Record<string, number>} target @param {Readonly<Record<string, number>>} source @param {readonly string[]} keys */
export function mergeMetrics(target, source, keys) {
    for (const key of keys) target[key] += source[key] ?? 0;
}

/** @param {Record<string, number>} target @param {Readonly<Record<string, number>>} source */
export function mergeMemory(target, source) {
    for (const key of ILLUMINATION_MEMORY_KEYS) {
        const value = source[key];
        if (value === undefined) continue;
        target[key] = key.startsWith('peak') ? Math.max(target[key], value) : value;
    }
}

/** @param {readonly string[]} keys */
export function createMetricRecord(keys) {
    return Object.fromEntries(keys.map((key) => [key, 0]));
}

/** @param {unknown} value @param {string} label */
export function cloneJsonRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be an object');
    return /** @type {JsonRecord} */ (cloneJsonValue(value, label, new Set()));
}

/** @param {unknown} value */
export function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const entry of Object.values(value)) deepFreeze(entry);
    return Object.freeze(value);
}

/** @param {unknown} value @param {string} label */
export function assertReason(value, label) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(label + ' must be a non-empty string');
}

/** @param {unknown} value */
export function isThenable(value) {
    const candidate = /** @type {{then?: unknown} | null} */ (
        value && (typeof value === 'object' || typeof value === 'function') ? value : null
    );
    return typeof candidate?.then === 'function';
}

/** @param {unknown} error */
export function errorCode(error) {
    if (error instanceof Error && error.message) return error.message;
    return String(error);
}

/** @param {() => number} now @param {number} started */
export function elapsed(now, started) {
    const duration = now() - started;
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

/** @param {unknown} value @param {string} label */
function optionalString(value, label) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(label + ' must be a non-empty string or null');
    return value;
}

/** @param {unknown} value @param {string} label */
function freezeStringArray(value, label) {
    if (value === undefined) return Object.freeze([]);
    if (!Array.isArray(value)) throw new TypeError(label + ' must be an array');
    const result = value.map((entry, index) => {
        if (typeof entry !== 'string' || entry.length === 0) throw new TypeError(label + '[' + index + '] must be a non-empty string');
        return entry;
    });
    if (new Set(result).size !== result.length) throw new TypeError(label + ' must not contain duplicate values');
    return Object.freeze(result);
}

/** @param {unknown} value @param {string} label @param {Set<object>} ancestors */
function cloneJsonValue(value, label, ancestors) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError(label + ' contains a non-finite number');
        return value;
    }
    if (Array.isArray(value)) {
        if (ancestors.has(value)) throw new TypeError(label + ' must not contain cycles');
        ancestors.add(value);
        const result = value.map((entry) => cloneJsonValue(entry, label, ancestors));
        ancestors.delete(value);
        return result;
    }
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        if (ancestors.has(value)) throw new TypeError(label + ' must not contain cycles');
        ancestors.add(value);
        const result = /** @type {JsonRecord} */ ({});
        for (const [key, entry] of Object.entries(value)) {
            if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol' || typeof entry === 'bigint') {
                throw new TypeError(label + ' contains a non-JSON value at "' + key + '"');
            }
            result[key] = cloneJsonValue(entry, label, ancestors);
        }
        ancestors.delete(value);
        return result;
    }
    throw new TypeError(label + ' must contain only JSON-compatible values');
}

/** @param {unknown} input @param {readonly string[]} keys @param {string} label @param {boolean} [integer] */
function sanitizeMetricInput(input, keys, label, integer = false) {
    const result = /** @type {Record<string, number>} */ ({});
    if (input === undefined) return Object.freeze(result);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError(label + ' must be an object');
    for (const [key, value] of Object.entries(input)) {
        if (!keys.includes(key)) throw new TypeError(label + ' has unknown key "' + key + '"');
        if (integer) assertByteCount(value, label + ' "' + key + '"');
        else assertNonNegativeFinite(value, label + ' "' + key + '"');
        result[key] = /** @type {number} */ (value);
    }
    return Object.freeze(result);
}

/** @param {unknown} value @param {string} label */
function assertOptionalFunction(value, label) {
    if (value !== undefined && typeof value !== 'function') throw new TypeError(label + ' must be a function');
}

/** @param {unknown} value @param {string} label */
export function assertNonNegativeFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new RangeError(label + ' must be a non-negative finite number');
}

/** @param {unknown} value @param {string} label */
export function assertByteCount(value, label) {
    if (!Number.isSafeInteger(value) || /** @type {number} */ (value) < 0) throw new RangeError(label + ' must be a non-negative safe integer');
}

function defaultNow() {
    return globalThis.performance?.now?.() ?? Date.now();
}

/** @param {object} resourceSet */
function defaultDisposeResources(resourceSet) {
    const disposable = /** @type {{dispose?: () => void}} */ (resourceSet);
    return disposable.dispose?.();
}
