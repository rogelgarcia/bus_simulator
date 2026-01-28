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

/** @returns {GpuFrameTimer} */
function createWebGL2Timer(gl, ext) {
    /** @type {WebGLQuery|null} */
    let inFlight = null;
    /** @type {WebGLQuery[]} */
    const pending = [];
    /** @type {number|null} */
    let lastMs = null;

    const deleteQuery = (q) => {
        try {
            gl.deleteQuery?.(q);
        } catch {
        }
    };

    return {
        isSupported: true,
        beginFrame() {
            if (inFlight) return;
            if (gl.isContextLost?.()) return;
            try {
                const q = gl.createQuery();
                if (!q) return;
                gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
                inFlight = q;
            } catch {
                inFlight = null;
            }
        },
        endFrame() {
            if (!inFlight) return;
            const q = inFlight;
            inFlight = null;
            if (gl.isContextLost?.()) {
                deleteQuery(q);
                return;
            }
            try {
                gl.endQuery(ext.TIME_ELAPSED_EXT);
                pending.push(q);
                while (pending.length > MAX_PENDING_QUERIES) deleteQuery(pending.shift());
            } catch {
                deleteQuery(q);
            }
        },
        poll() {
            if (!pending.length) return;
            if (gl.isContextLost?.()) {
                while (pending.length) deleteQuery(pending.shift());
                lastMs = null;
                return;
            }

            let disjoint = false;
            try {
                disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
            } catch {
            }
            if (disjoint) {
                while (pending.length) deleteQuery(pending.shift());
                lastMs = null;
                return;
            }

            while (pending.length) {
                const q = pending[0];
                let available = false;
                try {
                    available = !!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
                } catch {
                    available = false;
                }
                if (!available) break;
                pending.shift();

                try {
                    const nsRaw = gl.getQueryParameter(q, gl.QUERY_RESULT);
                    const ns = Number(nsRaw);
                    const ms = ns / 1e6;
                    if (Number.isFinite(ms) && ms >= 0) lastMs = ms;
                } catch {
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
function createWebGL1Timer(gl, ext) {
    /** @type {any|null} */
    let inFlight = null;
    /** @type {any[]} */
    const pending = [];
    /** @type {number|null} */
    let lastMs = null;

    const deleteQuery = (q) => {
        try {
            ext.deleteQueryEXT?.(q);
        } catch {
        }
    };

    return {
        isSupported: true,
        beginFrame() {
            if (inFlight) return;
            if (gl.isContextLost?.()) return;
            try {
                const q = ext.createQueryEXT?.();
                if (!q) return;
                ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, q);
                inFlight = q;
            } catch {
                inFlight = null;
            }
        },
        endFrame() {
            if (!inFlight) return;
            const q = inFlight;
            inFlight = null;
            if (gl.isContextLost?.()) {
                deleteQuery(q);
                return;
            }
            try {
                ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
                pending.push(q);
                while (pending.length > MAX_PENDING_QUERIES) deleteQuery(pending.shift());
            } catch {
                deleteQuery(q);
            }
        },
        poll() {
            if (!pending.length) return;
            if (gl.isContextLost?.()) {
                while (pending.length) deleteQuery(pending.shift());
                lastMs = null;
                return;
            }

            let disjoint = false;
            try {
                disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
            } catch {
            }
            if (disjoint) {
                while (pending.length) deleteQuery(pending.shift());
                lastMs = null;
                return;
            }

            while (pending.length) {
                const q = pending[0];
                let available = false;
                try {
                    available = !!ext.getQueryObjectEXT(q, ext.QUERY_RESULT_AVAILABLE_EXT);
                } catch {
                    available = false;
                }
                if (!available) break;
                pending.shift();
                try {
                    const nsRaw = ext.getQueryObjectEXT(q, ext.QUERY_RESULT_EXT);
                    const ns = Number(nsRaw);
                    const ms = ns / 1e6;
                    if (Number.isFinite(ms) && ms >= 0) lastMs = ms;
                } catch {
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
            return createWebGL2Timer(gl, ext);
        }

        const ext = gl.getExtension('EXT_disjoint_timer_query');
        if (!ext) return createNoopTimer();
        return createWebGL1Timer(gl, ext);
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
