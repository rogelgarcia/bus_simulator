// WebGL GPU frame time measurement via disjoint timer queries.
// @ts-check

const MAX_PENDING_QUERIES = 24;
const MAX_COMPLETED_SAMPLES = 512;

/** @typedef {{ sequence: number, submissionSequence: number, ms: number, completedAtMs: number }} GpuFrameTimerSample */
/** @typedef {{ isSupported: boolean, backend: string, active: boolean, sampleSequence: number, sampleCount: number, submissionSequence: number, pendingQueryCount: number, disjointCount: number, lastMs: number|null, lastCompletedAtMs: number|null, disabledReason: string|null }} GpuFrameTimerDiagnostics */
/** @typedef {{ isSupported: boolean, beginFrame: () => void, endFrame: () => void, poll: () => void, getLastMs: () => (number|null), getDiagnostics: () => GpuFrameTimerDiagnostics, getSamplesSince: (sequence: number) => GpuFrameTimerSample[], resetSamples: () => boolean }} GpuFrameTimer */

const clockNowMs = () => {
    const value = globalThis.performance?.now?.();
    return Number.isFinite(value) ? value : Date.now();
};

/** @returns {GpuFrameTimer} */
function createNoopTimer(reason = 'timer-query-extension-unavailable') {
    return Object.freeze({
        isSupported: false,
        beginFrame() {},
        endFrame() {},
        poll() {},
        getLastMs() { return null; },
        getDiagnostics() {
            return {
                isSupported: false,
                backend: 'unsupported',
                active: false,
                sampleSequence: 0,
                sampleCount: 0,
                submissionSequence: 0,
                pendingQueryCount: 0,
                disjointCount: 0,
                lastMs: null,
                lastCompletedAtMs: null,
                disabledReason: reason
            };
        },
        getSamplesSince() { return []; },
        resetSamples() { return true; }
    });
}

function getWebGlContextFromRenderer(renderer) {
    const r = renderer && typeof renderer === 'object' ? renderer : null;
    if (!r || typeof r.getContext !== 'function') return null;
    try {
        return r.getContext?.() ?? null;
    } catch {
        return null;
    }
}

function safeGetError(gl) {
    if (!gl || typeof gl.getError !== 'function') return null;
    try {
        return gl.getError();
    } catch {
        return null;
    }
}

function clearGlErrors(gl, maxChecks = 8) {
    const noError = Number(gl?.NO_ERROR);
    if (!Number.isFinite(noError) || typeof gl?.getError !== 'function') return;
    for (let i = 0; i < maxChecks; i++) {
        let err = null;
        try {
            err = gl.getError();
        } catch {
            return;
        }
        if (Number(err) === noError) return;
    }
}

function glCallHasNoError(gl, fn) {
    clearGlErrors(gl, 4);
    try {
        fn();
    } catch {
        return false;
    }
    const err = safeGetError(gl);
    if (err === null) return true;
    return Number(err) === Number(gl.NO_ERROR);
}

function hasNoGlError(gl) {
    const err = safeGetError(gl);
    if (err === null) return true;
    return Number(err) === Number(gl.NO_ERROR);
}

function createQueryTimer(gl, {
    backend,
    extensionName,
    timeElapsedTarget,
    gpuDisjointParam,
    createQuery,
    deleteQuery,
    beginQuery,
    endQuery,
    isResultAvailable,
    getResult
}) {
    let inFlight = null;
    const pending = [];
    const completed = [];
    let lastMs = null;
    let lastCompletedAtMs = null;
    let disabledReason = null;
    let sampleSequence = 0;
    let submissionSequence = 0;
    let disjointCount = 0;

    const deleteRecord = (record) => {
        try {
            deleteQuery(record?.query);
        } catch {
        }
    };

    const clearPending = () => {
        while (pending.length) deleteRecord(pending.shift());
    };

    const disableTimer = (reason) => {
        disabledReason = String(reason || 'timer-query-runtime-error');
        if (inFlight) {
            deleteRecord(inFlight);
            inFlight = null;
        }
        clearPending();
        lastMs = null;
        lastCompletedAtMs = null;
    };

    const hasActiveExtension = () => {
        if (disabledReason) return false;
        if (gl.isContextLost?.()) return false;
        try {
            const active = gl.getExtension(extensionName);
            if (!active) return false;
            return Number(active.TIME_ELAPSED_EXT) === timeElapsedTarget
                && Number(active.GPU_DISJOINT_EXT) === gpuDisjointParam;
        } catch {
            return false;
        }
    };

    return Object.freeze({
        isSupported: true,
        beginFrame() {
            if (disabledReason || inFlight) return;
            if (!hasActiveExtension()) {
                disableTimer('timer-query-extension-became-unavailable');
                return;
            }
            try {
                const query = createQuery();
                if (!query) return;
                const nextSubmissionSequence = submissionSequence + 1;
                const started = glCallHasNoError(gl, () => beginQuery(query));
                if (!started) {
                    deleteRecord({ query });
                    disableTimer('timer-query-begin-failed');
                    return;
                }
                submissionSequence = nextSubmissionSequence;
                inFlight = { query, submissionSequence };
            } catch {
                disableTimer('timer-query-begin-threw');
            }
        },
        endFrame() {
            if (disabledReason || !inFlight) return;
            const record = inFlight;
            inFlight = null;
            if (!hasActiveExtension()) {
                deleteRecord(record);
                disableTimer('timer-query-extension-became-unavailable');
                return;
            }
            const ended = glCallHasNoError(gl, () => endQuery());
            if (ended) {
                pending.push(record);
                while (pending.length > MAX_PENDING_QUERIES) deleteRecord(pending.shift());
            } else {
                deleteRecord(record);
                disableTimer('timer-query-end-failed');
            }
        },
        poll() {
            if (disabledReason || !pending.length) return;
            if (!hasActiveExtension()) {
                disableTimer('timer-query-extension-became-unavailable');
                return;
            }
            let disjoint = false;
            try {
                disjoint = !!gl.getParameter(gpuDisjointParam);
            } catch {
                disableTimer('timer-query-disjoint-read-failed');
                return;
            }
            if (!hasNoGlError(gl)) {
                disableTimer('timer-query-disjoint-gl-error');
                return;
            }
            if (disjoint) {
                disjointCount += 1;
                clearPending();
                lastMs = null;
                lastCompletedAtMs = null;
                return;
            }
            while (pending.length) {
                const record = pending[0];
                let available = false;
                try {
                    available = !!isResultAvailable(record.query);
                } catch {
                    disableTimer('timer-query-availability-read-failed');
                    return;
                }
                if (!hasNoGlError(gl)) {
                    disableTimer('timer-query-availability-gl-error');
                    return;
                }
                if (!available) break;
                pending.shift();
                try {
                    const ns = Number(getResult(record.query));
                    if (!hasNoGlError(gl)) {
                        disableTimer('timer-query-result-gl-error');
                        return;
                    }
                    const ms = ns / 1e6;
                    if (Number.isFinite(ms) && ms >= 0) {
                        lastMs = ms;
                        lastCompletedAtMs = clockNowMs();
                        sampleSequence += 1;
                        completed.push({
                            sequence: sampleSequence,
                            submissionSequence: record.submissionSequence,
                            ms,
                            completedAtMs: lastCompletedAtMs
                        });
                        while (completed.length > MAX_COMPLETED_SAMPLES) completed.shift();
                    }
                } catch {
                    disableTimer('timer-query-result-read-failed');
                    return;
                } finally {
                    deleteRecord(record);
                }
            }
        },
        getLastMs() {
            return Number.isFinite(lastMs) ? lastMs : null;
        },
        getDiagnostics() {
            return {
                isSupported: true,
                backend,
                active: !disabledReason,
                sampleSequence,
                sampleCount: sampleSequence,
                submissionSequence,
                pendingQueryCount: pending.length + Number(!!inFlight),
                disjointCount,
                lastMs: Number.isFinite(lastMs) ? lastMs : null,
                lastCompletedAtMs: Number.isFinite(lastCompletedAtMs) ? lastCompletedAtMs : null,
                disabledReason
            };
        },
        getSamplesSince(sequence) {
            const after = Math.max(0, Math.floor(Number(sequence) || 0));
            return completed
                .filter((sample) => sample.sequence > after)
                .map((sample) => ({ ...sample }));
        },
        resetSamples() {
            if (inFlight) return false;
            clearPending();
            completed.length = 0;
            lastMs = null;
            lastCompletedAtMs = null;
            sampleSequence = 0;
            submissionSequence = 0;
            disjointCount = 0;
            return true;
        }
    });
}

/** @returns {GpuFrameTimer} */
function createTimerForRenderer(renderer) {
    const gl = getWebGlContextFromRenderer(renderer);
    if (!gl || typeof gl.getExtension !== 'function') return createNoopTimer('webgl-context-unavailable');

    try {
        const hasWebGL2Queries = typeof gl.createQuery === 'function'
            && typeof gl.beginQuery === 'function'
            && typeof gl.getQueryParameter === 'function';
        if (hasWebGL2Queries) {
            const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            if (!ext) return createNoopTimer('EXT_disjoint_timer_query_webgl2 unavailable');
            const timeElapsedTarget = Number(ext.TIME_ELAPSED_EXT);
            const gpuDisjointParam = Number(ext.GPU_DISJOINT_EXT);
            if (!Number.isFinite(timeElapsedTarget) || !Number.isFinite(gpuDisjointParam)) {
                return createNoopTimer('EXT_disjoint_timer_query_webgl2 constants unavailable');
            }
            return createQueryTimer(gl, {
                backend: 'webgl2_ext_disjoint_timer_query',
                extensionName: 'EXT_disjoint_timer_query_webgl2',
                timeElapsedTarget,
                gpuDisjointParam,
                createQuery: () => gl.createQuery(),
                deleteQuery: (query) => gl.deleteQuery?.(query),
                beginQuery: (query) => gl.beginQuery(timeElapsedTarget, query),
                endQuery: () => gl.endQuery(timeElapsedTarget),
                isResultAvailable: (query) => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE),
                getResult: (query) => gl.getQueryParameter(query, gl.QUERY_RESULT)
            });
        }

        const ext = gl.getExtension('EXT_disjoint_timer_query');
        if (!ext) return createNoopTimer('EXT_disjoint_timer_query unavailable');
        const timeElapsedTarget = Number(ext.TIME_ELAPSED_EXT);
        const gpuDisjointParam = Number(ext.GPU_DISJOINT_EXT);
        if (!Number.isFinite(timeElapsedTarget) || !Number.isFinite(gpuDisjointParam)) {
            return createNoopTimer('EXT_disjoint_timer_query constants unavailable');
        }
        return createQueryTimer(gl, {
            backend: 'webgl1_ext_disjoint_timer_query',
            extensionName: 'EXT_disjoint_timer_query',
            timeElapsedTarget,
            gpuDisjointParam,
            createQuery: () => ext.createQueryEXT?.(),
            deleteQuery: (query) => ext.deleteQueryEXT?.(query),
            beginQuery: (query) => ext.beginQueryEXT(timeElapsedTarget, query),
            endQuery: () => ext.endQueryEXT(timeElapsedTarget),
            isResultAvailable: (query) => ext.getQueryObjectEXT(query, ext.QUERY_RESULT_AVAILABLE_EXT),
            getResult: (query) => ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT)
        });
    } catch {
        return createNoopTimer('timer-query-initialization-failed');
    }
}

/** @type {WeakMap<object, GpuFrameTimer>} */
const TIMERS = new WeakMap();

/**
 * @param {object} renderer A THREE.WebGLRenderer-like object with getContext().
 * @returns {GpuFrameTimer}
 */
export function getOrCreateGpuFrameTimer(renderer) {
    const r = renderer && typeof renderer === 'object' ? renderer : null;
    if (!r) return createNoopTimer('renderer-unavailable');
    const cached = TIMERS.get(r);
    if (cached) return cached;
    const timer = createTimerForRenderer(r);
    TIMERS.set(r, timer);
    return timer;
}
