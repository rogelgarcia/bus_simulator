// src/graphics/engine3d/perf/GpuFrameTimer.js
// WebGL GPU frame time measurement via disjoint timer queries.
// @ts-check

const MAX_PENDING_QUERIES = 6;

/** @typedef {{ isSupported: boolean, beginFrame: () => void, endFrame: () => void, poll: () => void, getLastMs: () => (number|null) }} GpuFrameTimer */

/** @returns {GpuFrameTimer} */
function createNoopTimer() {
    return Object.freeze({
        isSupported: false,
        beginFrame() {},
        endFrame() {},
        poll() {},
        getLastMs() { return null; }
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

/** @returns {GpuFrameTimer} */
function createWebGL2Timer(gl, ext, { timeElapsedTarget, gpuDisjointParam }) {
    /** @type {WebGLQuery|null} */
    let inFlight = null;
    /** @type {WebGLQuery[]} */
    const pending = [];
    /** @type {number|null} */
    let lastMs = null;
    let disabled = false;

    const deleteQuery = (q) => {
        try {
            gl.deleteQuery?.(q);
        } catch {
        }
    };

    const clearPending = () => {
        while (pending.length) deleteQuery(pending.shift());
    };

    const disableTimer = () => {
        disabled = true;
        if (inFlight) {
            deleteQuery(inFlight);
            inFlight = null;
        }
        clearPending();
        lastMs = null;
    };

    const hasActiveExtension = () => {
        if (disabled) return false;
        if (gl.isContextLost?.()) return false;
        if (!Number.isFinite(timeElapsedTarget) || !Number.isFinite(gpuDisjointParam)) return false;
        try {
            const active = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            if (!active) return false;
            return Number(active.TIME_ELAPSED_EXT) === timeElapsedTarget
                && Number(active.GPU_DISJOINT_EXT) === gpuDisjointParam;
        } catch {
            return false;
        }
    };

    return {
        isSupported: true,
        beginFrame() {
            if (disabled) return;
            if (inFlight) return;
            if (!hasActiveExtension()) {
                disableTimer();
                return;
            }
            try {
                const q = gl.createQuery();
                if (!q) return;
                const started = glCallHasNoError(gl, () => gl.beginQuery(timeElapsedTarget, q));
                if (!started) {
                    deleteQuery(q);
                    disableTimer();
                    return;
                }
                inFlight = q;
            } catch {
                disableTimer();
            }
        },
        endFrame() {
            if (disabled) return;
            if (!inFlight) return;
            const q = inFlight;
            inFlight = null;
            if (!hasActiveExtension()) {
                deleteQuery(q);
                disableTimer();
                return;
            }
            const ended = glCallHasNoError(gl, () => gl.endQuery(timeElapsedTarget));
            if (ended) {
                pending.push(q);
                while (pending.length > MAX_PENDING_QUERIES) deleteQuery(pending.shift());
            } else {
                deleteQuery(q);
                disableTimer();
            }
        },
        poll() {
            if (disabled) return;
            if (!pending.length) return;
            if (!hasActiveExtension()) {
                disableTimer();
                return;
            }

            let disjoint = false;
            try {
                disjoint = !!gl.getParameter(gpuDisjointParam);
            } catch {
                disableTimer();
                return;
            }
            if (!hasNoGlError(gl)) {
                disableTimer();
                return;
            }
            if (disjoint) {
                clearPending();
                lastMs = null;
                return;
            }

            while (pending.length) {
                const q = pending[0];
                let available = false;
                try {
                    available = !!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
                } catch {
                    disableTimer();
                    return;
                }
                if (!hasNoGlError(gl)) {
                    disableTimer();
                    return;
                }
                if (!available) break;
                pending.shift();

                try {
                    const nsRaw = gl.getQueryParameter(q, gl.QUERY_RESULT);
                    if (!hasNoGlError(gl)) {
                        disableTimer();
                        return;
                    }
                    const ns = Number(nsRaw);
                    const ms = ns / 1e6;
                    if (Number.isFinite(ms) && ms >= 0) lastMs = ms;
                } catch {
                    disableTimer();
                    return;
                } finally {
                    deleteQuery(q);
                }
            }
        },
        getLastMs() {
            return Number.isFinite(lastMs) ? lastMs : null;
        }
    };
}

/** @returns {GpuFrameTimer} */
function createWebGL1Timer(gl, ext, { timeElapsedTarget, gpuDisjointParam }) {
    /** @type {any|null} */
    let inFlight = null;
    /** @type {any[]} */
    const pending = [];
    /** @type {number|null} */
    let lastMs = null;
    let disabled = false;

    const deleteQuery = (q) => {
        try {
            ext.deleteQueryEXT?.(q);
        } catch {
        }
    };

    const clearPending = () => {
        while (pending.length) deleteQuery(pending.shift());
    };

    const disableTimer = () => {
        disabled = true;
        if (inFlight) {
            deleteQuery(inFlight);
            inFlight = null;
        }
        clearPending();
        lastMs = null;
    };

    const hasActiveExtension = () => {
        if (disabled) return false;
        if (gl.isContextLost?.()) return false;
        if (!Number.isFinite(timeElapsedTarget) || !Number.isFinite(gpuDisjointParam)) return false;
        try {
            const active = gl.getExtension('EXT_disjoint_timer_query');
            if (!active) return false;
            return Number(active.TIME_ELAPSED_EXT) === timeElapsedTarget
                && Number(active.GPU_DISJOINT_EXT) === gpuDisjointParam;
        } catch {
            return false;
        }
    };

    return {
        isSupported: true,
        beginFrame() {
            if (disabled) return;
            if (inFlight) return;
            if (!hasActiveExtension()) {
                disableTimer();
                return;
            }
            try {
                const q = ext.createQueryEXT?.();
                if (!q) return;
                const started = glCallHasNoError(gl, () => ext.beginQueryEXT(timeElapsedTarget, q));
                if (!started) {
                    deleteQuery(q);
                    disableTimer();
                    return;
                }
                inFlight = q;
            } catch {
                disableTimer();
            }
        },
        endFrame() {
            if (disabled) return;
            if (!inFlight) return;
            const q = inFlight;
            inFlight = null;
            if (!hasActiveExtension()) {
                deleteQuery(q);
                disableTimer();
                return;
            }
            const ended = glCallHasNoError(gl, () => ext.endQueryEXT(timeElapsedTarget));
            if (ended) {
                pending.push(q);
                while (pending.length > MAX_PENDING_QUERIES) deleteQuery(pending.shift());
            } else {
                deleteQuery(q);
                disableTimer();
            }
        },
        poll() {
            if (disabled) return;
            if (!pending.length) return;
            if (!hasActiveExtension()) {
                disableTimer();
                return;
            }

            let disjoint = false;
            try {
                disjoint = !!gl.getParameter(gpuDisjointParam);
            } catch {
                disableTimer();
                return;
            }
            if (!hasNoGlError(gl)) {
                disableTimer();
                return;
            }
            if (disjoint) {
                clearPending();
                lastMs = null;
                return;
            }

            while (pending.length) {
                const q = pending[0];
                let available = false;
                try {
                    available = !!ext.getQueryObjectEXT(q, ext.QUERY_RESULT_AVAILABLE_EXT);
                } catch {
                    disableTimer();
                    return;
                }
                if (!hasNoGlError(gl)) {
                    disableTimer();
                    return;
                }
                if (!available) break;
                pending.shift();
                try {
                    const nsRaw = ext.getQueryObjectEXT(q, ext.QUERY_RESULT_EXT);
                    if (!hasNoGlError(gl)) {
                        disableTimer();
                        return;
                    }
                    const ns = Number(nsRaw);
                    const ms = ns / 1e6;
                    if (Number.isFinite(ms) && ms >= 0) lastMs = ms;
                } catch {
                    disableTimer();
                    return;
                } finally {
                    deleteQuery(q);
                }
            }
        },
        getLastMs() {
            return Number.isFinite(lastMs) ? lastMs : null;
        }
    };
}

/** @returns {GpuFrameTimer} */
function createTimerForRenderer(renderer) {
    const gl = getWebGlContextFromRenderer(renderer);
    if (!gl || typeof gl.getExtension !== 'function') return createNoopTimer();

    try {
        const hasWebGL2Queries = typeof gl.createQuery === 'function' && typeof gl.beginQuery === 'function' && typeof gl.getQueryParameter === 'function';
        if (hasWebGL2Queries) {
            const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            if (!ext) return createNoopTimer();
            const timeElapsedTarget = Number(ext.TIME_ELAPSED_EXT);
            const gpuDisjointParam = Number(ext.GPU_DISJOINT_EXT);
            if (!Number.isFinite(timeElapsedTarget) || !Number.isFinite(gpuDisjointParam)) return createNoopTimer();
            return createWebGL2Timer(gl, ext, { timeElapsedTarget, gpuDisjointParam });
        }

        const ext = gl.getExtension('EXT_disjoint_timer_query');
        if (!ext) return createNoopTimer();
        const timeElapsedTarget = Number(ext.TIME_ELAPSED_EXT);
        const gpuDisjointParam = Number(ext.GPU_DISJOINT_EXT);
        if (!Number.isFinite(timeElapsedTarget) || !Number.isFinite(gpuDisjointParam)) return createNoopTimer();
        return createWebGL1Timer(gl, ext, { timeElapsedTarget, gpuDisjointParam });
    } catch {
        return createNoopTimer();
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
    if (!r) return createNoopTimer();
    const cached = TIMERS.get(r);
    if (cached) return cached;
    const timer = createTimerForRenderer(r);
    TIMERS.set(r, timer);
    return timer;
}
