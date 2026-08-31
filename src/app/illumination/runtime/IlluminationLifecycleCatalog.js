// Defines the fixed public vocabulary for optional baked-illumination lifecycle control.
// @ts-check

export const ILLUMINATION_MODES = Object.freeze({
    current: 'current',
    baked: 'baked',
    auto: 'auto'
});

export const ILLUMINATION_STATES = Object.freeze({
    unavailable: 'unavailable',
    loading: 'loading',
    active: 'active',
    stale: 'stale',
    failed: 'failed',
    fallback: 'fallback'
});

export const ILLUMINATION_PHASES = Object.freeze({
    locating: 'locating',
    fetching: 'fetching',
    validating: 'validating',
    decoding: 'decoding',
    uploading: 'uploading',
    prewarming: 'prewarming',
    readyToCommit: 'ready_to_commit',
    committed: 'committed',
    retiring: 'retiring',
    disposed: 'disposed'
});

export const ILLUMINATION_TIMING_KEYS = Object.freeze([
    'fetchReadMs',
    'hashMs',
    'decodeMs',
    'cpuStagingMs',
    'gpuUploadMs',
    'activationMs',
    'disposalMs'
]);

export const ILLUMINATION_MEMORY_KEYS = Object.freeze([
    'residentCpuBytes',
    'residentGpuBytes',
    'peakCpuBytes',
    'peakGpuBytes'
]);

const MODE_SET = new Set(Object.values(ILLUMINATION_MODES));
const PHASE_SET = new Set(Object.values(ILLUMINATION_PHASES));
const CAUSE_STATE_SET = new Set([
    ILLUMINATION_STATES.unavailable,
    ILLUMINATION_STATES.stale,
    ILLUMINATION_STATES.failed
]);
const TIMING_KEY_SET = new Set(ILLUMINATION_TIMING_KEYS);
const MEMORY_KEY_SET = new Set(ILLUMINATION_MEMORY_KEYS);

/**
 * @param {unknown} value
 * @returns {asserts value is 'current' | 'baked' | 'auto'}
 */
export function assertIlluminationMode(value) {
    if (!MODE_SET.has(value)) {
        throw new TypeError('Illumination mode must be "current", "baked", or "auto"');
    }
}

/**
 * @param {unknown} value
 * @returns {asserts value is string}
 */
export function assertIlluminationPhase(value) {
    if (!PHASE_SET.has(value)) throw new TypeError('Unknown illumination load phase: ' + String(value));
}

/**
 * @param {unknown} value
 * @returns {asserts value is 'unavailable' | 'stale' | 'failed'}
 */
export function assertIlluminationCauseState(value) {
    if (!CAUSE_STATE_SET.has(value)) {
        throw new TypeError('Illumination failure state must be "unavailable", "stale", or "failed"');
    }
}

/**
 * @param {unknown} value
 * @returns {asserts value is string}
 */
export function assertIlluminationTimingKey(value) {
    if (!TIMING_KEY_SET.has(value)) throw new TypeError('Unknown illumination timing key: ' + String(value));
}

/**
 * @param {unknown} value
 * @returns {asserts value is string}
 */
export function assertIlluminationMemoryKey(value) {
    if (!MEMORY_KEY_SET.has(value)) throw new TypeError('Unknown illumination memory key: ' + String(value));
}
