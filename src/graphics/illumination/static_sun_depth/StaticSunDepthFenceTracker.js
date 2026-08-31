// Tracks the latest GPU-use fence per static-sun generation and retires conservatively.
// @ts-check

export const STATIC_SUN_DEPTH_FENCE_TIMEOUT_MS = 5000;

export class StaticSunDepthFenceTracker {
    constructor({
        getContext,
        now = () => performance.now(),
        schedule = (callback) => setTimeout(callback, 0),
        timeoutMs = STATIC_SUN_DEPTH_FENCE_TIMEOUT_MS,
        onError = () => {}
    }) {
        if (typeof getContext !== 'function') throw new TypeError('Static-sun fence tracker requires getContext.');
        if (typeof now !== 'function' || typeof schedule !== 'function' || typeof onError !== 'function') {
            throw new TypeError('Static-sun fence tracker callbacks must be functions.');
        }
        if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
            throw new TypeError('Static-sun fence timeout must be finite and non-negative.');
        }
        this._getContext = getContext;
        this._now = now;
        this._schedule = schedule;
        this._timeoutMs = timeoutMs;
        this._onError = onError;
        this._fences = new Map();
    }

    record(generation) {
        let gl;
        try {
            gl = this._getContext();
        } catch (error) {
            this._onError(error);
            return false;
        }
        if (!gl) return false;
        const previous = this._fences.get(generation);
        let fence = null;
        try {
            if (typeof gl.fenceSync === 'function' && typeof gl.flush === 'function') {
                fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
                if (!fence) throw new Error('Static-sun GPU fence creation returned null.');
                gl.flush();
            }
        } catch (error) {
            this._onError(error);
            if (fence && typeof gl.deleteSync === 'function') {
                try {
                    gl.deleteSync(fence);
                } catch (cleanupError) {
                    this._onError(cleanupError);
                }
            }
            fence = null;
        }

        // A fence from an earlier frame cannot protect this frame. Clear it on
        // every replacement failure so wait() is forced through gl.finish().
        if (previous) this._delete(generation, gl);
        if (!fence) return false;
        this._fences.set(generation, fence);
        return true;
    }

    wait(generation) {
        const gl = this._getContext();
        if (!gl) throw new Error('Static-sun GPU context is unavailable during retirement.');
        const fence = this._fences.get(generation);
        if (!fence || typeof gl.clientWaitSync !== 'function') {
            this._finish(generation, gl);
            return undefined;
        }
        const started = this._now();
        return new Promise((resolve, reject) => {
            const finishFallback = () => {
                try {
                    this._finish(generation, gl);
                    resolve(undefined);
                } catch (error) {
                    reject(error);
                }
            };
            const poll = () => {
                let status;
                try {
                    status = gl.clientWaitSync(fence, 0, 0);
                } catch {
                    finishFallback();
                    return;
                }
                if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
                    this._delete(generation, gl);
                    resolve(undefined);
                    return;
                }
                if (status === gl.WAIT_FAILED) {
                    finishFallback();
                    return;
                }
                if (this._now() - started > this._timeoutMs) {
                    reject(new Error('Static-sun GPU retirement fence did not complete safely.'));
                    return;
                }
                this._schedule(poll);
            };
            poll();
        });
    }

    dispose() {
        let gl = null;
        try {
            gl = this._getContext();
        } catch (error) {
            this._onError(error);
        }
        for (const generation of [...this._fences.keys()]) this._delete(generation, gl);
    }

    getSnapshot() {
        return Object.freeze({
            count: this._fences.size,
            generations: Object.freeze([...this._fences.keys()].sort((left, right) => left - right))
        });
    }

    _finish(generation, gl) {
        if (typeof gl?.finish !== 'function') {
            throw new Error('Static-sun GPU retirement requires fenceSync/clientWaitSync or gl.finish().');
        }
        gl.finish();
        this._delete(generation, gl);
    }

    _delete(generation, gl) {
        const fence = this._fences.get(generation);
        if (!fence) return false;
        this._fences.delete(generation);
        if (typeof gl?.deleteSync === 'function') {
            try {
                gl.deleteSync(fence);
            } catch (error) {
                this._onError(error);
            }
        }
        return true;
    }
}
