// Accounts terrain working sets and protects resources held by independent consumers.
// @ts-check
export const LANDSCAPE_STREAMING_BUDGETS = Object.freeze({ cpuBytes: 512 * 1024 * 1024, gpuBytes: 256 * 1024 * 1024, ioConcurrency: 2, uploadsPerFrame: 1, uploadBytesPerFrame: 8 * 1024 * 1024 });

function bytes(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`[LandscapeResidency] ${label} must be a nonnegative safe byte count`);
    return value;
}

function keyInput(key) {
    if (typeof key !== 'string' || !key.length || key.length > 2048) throw new Error('[LandscapeResidency] resource key must be a nonempty bounded string');
}

function resourcesInput(input) {
    if (!input || typeof input.kind !== 'string' || !input.kind.length) throw new Error('[LandscapeResidency] resource kind is required');
    return { cpuBytes: bytes(input.cpuBytes, 'cpuBytes'), gpuBytes: bytes(input.gpuBytes, 'gpuBytes'), kind: input.kind, pinned: input.pinned === true };
}

/** Reservations include resources still being fetched, decoded, built or uploaded, not just visible meshes. */
export class LandscapeResidencyBudget {
    #limits;
    #entries = new Map();
    #cpuBytes = 0;
    #gpuBytes = 0;
    #peakCpuBytes = 0;
    #peakGpuBytes = 0;
    #leaseSerial = 0;
    #denied = 0;
    #disposed = false;

    /** @param {{cpuBytes?:number,gpuBytes?:number}} [options] */
    constructor(options = {}) {
        this.#limits = Object.freeze({ cpuBytes: bytes(options.cpuBytes ?? LANDSCAPE_STREAMING_BUDGETS.cpuBytes, 'CPU limit'), gpuBytes: bytes(options.gpuBytes ?? LANDSCAPE_STREAMING_BUDGETS.gpuBytes, 'GPU limit') });
        Object.freeze(this);
    }

    #active() {
        if (this.#disposed) throw new Error('[LandscapeResidency] budget is disposed');
    }

    #admit(next, previous = { cpuBytes: 0, gpuBytes: 0 }) {
        const cpu = this.#cpuBytes - previous.cpuBytes + next.cpuBytes;
        const gpu = this.#gpuBytes - previous.gpuBytes + next.gpuBytes;
        const reason = cpu > this.#limits.cpuBytes ? 'cpu-budget' : gpu > this.#limits.gpuBytes ? 'gpu-budget' : null;
        if (reason) {
            this.#denied++;
            return Object.freeze({ admitted: false, reason });
        }
        this.#cpuBytes = cpu;
        this.#gpuBytes = gpu;
        this.#peakCpuBytes = Math.max(this.#peakCpuBytes, cpu);
        this.#peakGpuBytes = Math.max(this.#peakGpuBytes, gpu);
        return Object.freeze({ admitted: true, reason: null });
    }

    /** @param {string} key @param {{cpuBytes:number,gpuBytes:number,kind:string,pinned?:boolean}} resources */
    reserve(key, resources) {
        this.#active();
        keyInput(key);
        if (this.#entries.has(key)) throw new Error(`[LandscapeResidency] duplicate reservation ${key}`);
        const next = resourcesInput(resources);
        const result = this.#admit(next);
        if (result.admitted) this.#entries.set(key, { ...next, leases: new Map() });
        return result;
    }

    /** Replaces the accounted size atomically; a denied growth preserves the old reservation. */
    update(key, resources) {
        this.#active();
        const entry = this.#entries.get(key);
        if (!entry) throw new Error(`[LandscapeResidency] missing reservation ${key}`);
        const next = resourcesInput({ ...entry, ...resources });
        const result = this.#admit(next, entry);
        if (result.admitted) Object.assign(entry, next);
        return result;
    }

    has(key) { return this.#entries.has(key); }

    /** Release fails while pinned or held by any camera, edit, shadow, query or future collision consumer. */
    release(key) {
        const entry = this.#entries.get(key);
        if (!entry) return true;
        if (entry.pinned || entry.leases.size) return false;
        this.#cpuBytes -= entry.cpuBytes;
        this.#gpuBytes -= entry.gpuBytes;
        this.#entries.delete(key);
        return true;
    }

    /** @param {string} key @param {{consumer:string,priority?:number,accuracy?:string}} options */
    acquireLease(key, options) {
        this.#active();
        const entry = this.#entries.get(key);
        if (!entry) throw new Error(`[LandscapeResidency] cannot lease missing resource ${key}`);
        keyInput(options?.consumer);
        const priority = options.priority ?? 0;
        if (!Number.isFinite(priority)) throw new Error('[LandscapeResidency] lease priority must be finite');
        const accuracy = options.accuracy ?? 'approximate';
        if (!['approximate', 'authoritative'].includes(accuracy)) throw new Error('[LandscapeResidency] invalid lease accuracy');
        const id = ++this.#leaseSerial;
        entry.leases.set(id, Object.freeze({ id, consumer: options.consumer, priority, accuracy }));
        let released = false;
        return Object.freeze({ id, key, release: () => {
            if (!released) entry.leases.delete(id);
            released = true;
        } });
    }

    snapshot() {
        const entries = [...this.#entries].map(([key, entry]) => Object.freeze({ key, cpuBytes: entry.cpuBytes, gpuBytes: entry.gpuBytes, kind: entry.kind, pinned: entry.pinned, refCount: entry.leases.size, leases: Object.freeze([...entry.leases.values()]) }));
        return Object.freeze({
            cpuBytes: this.#cpuBytes, gpuBytes: this.#gpuBytes, peakCpuBytes: this.#peakCpuBytes, peakGpuBytes: this.#peakGpuBytes,
            limits: this.#limits, denied: this.#denied, leaseCount: entries.reduce((sum, entry) => sum + entry.refCount, 0),
            entries: Object.freeze(entries), disposed: this.#disposed
        });
    }

    dispose() {
        for (const entry of this.#entries.values()) entry.leases.clear();
        this.#entries.clear();
        this.#cpuBytes = 0;
        this.#gpuBytes = 0;
        this.#disposed = true;
    }
}
