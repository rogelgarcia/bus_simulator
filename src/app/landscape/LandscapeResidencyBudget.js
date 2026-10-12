// Accounts terrain working sets and protects resources held by independent consumers.
// @ts-check
// AI 596 D5: 640 MiB CPU / 352 MiB GPU, the pre-D5 512/256 MiB plus the render-only surround's 128/96 MiB share (LANDSCAPE_SURROUND.budgets), so the
// authoritative streams keep the room they had while the surround streams beside them; measured in LANDSCAPE_PERFORMANCE.md "Far-field surround".
// AI 597 D1: 672 / 416 MiB, the D5 profile plus the animated ocean's 32 / 64 MiB share (LANDSCAPE_OCEAN.budgets), which the view holds in the
// ledger as one reservation while the ocean draws (createLandscapeReservedShare), so a rebuilt ocean can never be denied by the streams.
// AI 597 D2: 688 / 416 MiB, the ocean share grew to 48 / 64 MiB (the extent field carries the shore-wave channels and the travel time)
// AI 597 D4: 688 / 432 MiB, the ocean share grew to 48 / 80 MiB (the swash sheet's native beach band)
export const LANDSCAPE_STREAMING_BUDGETS = Object.freeze({ cpuBytes: 688 * 1024 * 1024, gpuBytes: 432 * 1024 * 1024, ioConcurrency: 2, uploadsPerFrame: 1, uploadBytesPerFrame: 8 * 1024 * 1024 });

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

/**
 * A reserved share of a shared residency budget (AI 597 the ocean): the whole share is reserved in the shared budget at once, as one entry of the
 * share's kind, and the consumer's own reservations are accounted inside it without touching the shared budget again, so the consumer can be
 * rebuilt any number of times while other consumers (the streams, which expand into free room) can never take its share. dispose() releases
 * the standing reservation. Leases are not offered inside a reserved share.
 * @param {LandscapeResidencyBudget|any} shared @param {{kind:string,limits:{cpuBytes:number,gpuBytes:number},label?:string}} options
 */
export function createLandscapeReservedShare(shared, { kind, limits, label = 'LandscapeResidency' }) {
    if (!shared || typeof shared.reserve !== 'function' || typeof shared.release !== 'function') throw new Error(`[${label}] The reserved share wraps a residency budget`);
    if (typeof kind !== 'string' || !kind.length) throw new Error(`[${label}] The share kind is required`);
    const input = (value, name) => {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error(`[${label}] ${name} must be a nonnegative safe byte count`);
        return value;
    };
    const share = Object.freeze({ cpuBytes: input(limits?.cpuBytes, 'cpu share'), gpuBytes: input(limits?.gpuBytes, 'gpu share') });
    const standingKey = `${kind}/share/${++reservedShareSerial}`;
    const admission = shared.reserve(standingKey, { cpuBytes: share.cpuBytes, gpuBytes: share.gpuBytes, kind });
    if (!admission.admitted) throw new Error(`[${label}] The ${kind} share of ${share.cpuBytes} / ${share.gpuBytes} bytes cannot fit the shared ledger: ${admission.reason}`);
    const entries = new Map();
    let cpuBytes = 0, gpuBytes = 0, peakCpuBytes = 0, peakGpuBytes = 0, denied = 0, disposed = false;
    const sizes = (resources, previous) => ({ cpuBytes: input(resources.cpuBytes ?? previous.cpuBytes, 'cpuBytes'), gpuBytes: input(resources.gpuBytes ?? previous.gpuBytes, 'gpuBytes') });
    const admit = (key, next, previous) => {
        if (disposed) throw new Error(`[${label}] The ${kind} share is disposed`);
        const cpu = cpuBytes - previous.cpuBytes + next.cpuBytes, gpu = gpuBytes - previous.gpuBytes + next.gpuBytes;
        const reason = cpu > share.cpuBytes ? 'cpu-budget' : gpu > share.gpuBytes ? 'gpu-budget' : null;
        if (reason) { denied++; return Object.freeze({ admitted: false, reason }); }
        cpuBytes = cpu; gpuBytes = gpu;
        peakCpuBytes = Math.max(peakCpuBytes, cpuBytes); peakGpuBytes = Math.max(peakGpuBytes, gpuBytes);
        entries.set(key, next);
        return Object.freeze({ admitted: true, reason: null });
    };
    const nothing = Object.freeze({ cpuBytes: 0, gpuBytes: 0 });
    return Object.freeze({
        kind,
        limits: share,
        standingKey,
        reserve(key, resources) {
            if (typeof key !== 'string' || !key.length) throw new Error(`[${label}] resource key must be a nonempty string`);
            if (entries.has(key)) throw new Error(`[${label}] duplicate reservation ${key}`);
            return admit(key, sizes(resources, nothing), nothing);
        },
        update(key, resources) {
            const previous = entries.get(key);
            if (!previous) throw new Error(`[${label}] missing reservation ${key}`);
            return admit(key, sizes(resources, previous), previous);
        },
        release(key) {
            const previous = entries.get(key);
            if (!previous) return true;
            cpuBytes -= previous.cpuBytes; gpuBytes -= previous.gpuBytes;
            entries.delete(key);
            return true;
        },
        has(key) { return entries.has(key); },
        acquireLease() { throw new Error(`[${label}] A reserved share offers no leases`); },
        snapshot() { return shared.snapshot(); },
        /** The share's own accounting inside its standing reservation. */
        shareSnapshot() { return Object.freeze({ kind, cpuBytes, gpuBytes, peakCpuBytes, peakGpuBytes, limits: share, denied, entries: entries.size, reserved: !disposed }); },
        /** Releases the standing reservation (the consumer's own entries must be released first). */
        dispose() {
            if (disposed) return true;
            if (entries.size) throw new Error(`[${label}] The ${kind} share still holds ${entries.size} reservation(s)`);
            disposed = true;
            return shared.release(standingKey);
        }
    });
}

let reservedShareSerial = 0;

/**
 * A share of a shared residency budget for one consumer kind (AI 596 D5 the render-only surround, AI 597 the ocean): every reservation is tagged
 * with the share's kind and bounded by the share's limits before it reaches the shared budget, so a consumer can degrade inside its share but
 * never take another consumer's room. The wrapper keeps the budget's reserve/update/release/has/acquireLease/snapshot contract.
 * @param {LandscapeResidencyBudget|any} shared @param {{kind:string,limits:{cpuBytes:number,gpuBytes:number},label?:string}} options label prefixes its error messages
 */
export function createLandscapeResidencyShare(shared, { kind, limits, label = 'LandscapeResidency' }) {
    if (!shared || typeof shared.reserve !== 'function' || typeof shared.update !== 'function' || typeof shared.release !== 'function') throw new Error(`[${label}] The ${label === 'LandscapeResidency' ? 'share' : 'ledger'} wraps a residency budget`);
    if (typeof kind !== 'string' || !kind.length) throw new Error(`[${label}] The share kind is required`);
    const input = (value, name) => {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error(`[${label}] ${name} must be a nonnegative safe byte count`);
        return value;
    };
    const share = Object.freeze({ cpuBytes: input(limits?.cpuBytes, 'cpu share'), gpuBytes: input(limits?.gpuBytes, 'gpu share') });
    const entries = new Map();
    let cpuBytes = 0, gpuBytes = 0, peakCpuBytes = 0, peakGpuBytes = 0, denied = 0;
    const sizes = (resources, previous) => ({ cpuBytes: input(resources.cpuBytes ?? previous.cpuBytes, 'cpuBytes'), gpuBytes: input(resources.gpuBytes ?? previous.gpuBytes, 'gpuBytes') });
    const admit = (next, previous) => {
        const cpu = cpuBytes - previous.cpuBytes + next.cpuBytes, gpu = gpuBytes - previous.gpuBytes + next.gpuBytes;
        const reason = cpu > share.cpuBytes ? 'cpu-budget' : gpu > share.gpuBytes ? 'gpu-budget' : null;
        if (reason) { denied++; return Object.freeze({ admitted: false, reason }); }
        return null;
    };
    const apply = (key, next, previous) => {
        cpuBytes += next.cpuBytes - previous.cpuBytes; gpuBytes += next.gpuBytes - previous.gpuBytes;
        peakCpuBytes = Math.max(peakCpuBytes, cpuBytes); peakGpuBytes = Math.max(peakGpuBytes, gpuBytes);
        entries.set(key, next);
    };
    const nothing = Object.freeze({ cpuBytes: 0, gpuBytes: 0 });
    return Object.freeze({
        kind,
        limits: share,
        reserve(key, resources) {
            if (entries.has(key)) throw new Error(`[${label}] duplicate reservation ${key}`);
            const next = sizes(resources, nothing), refusal = admit(next, nothing);
            if (refusal) return refusal;
            const result = shared.reserve(key, { ...resources, kind });
            if (result.admitted) apply(key, next, nothing);
            return result;
        },
        update(key, resources) {
            const previous = entries.get(key);
            if (!previous) throw new Error(`[${label}] missing reservation ${key}`);
            const next = sizes(resources, previous), refusal = admit(next, previous);
            if (refusal) return refusal;
            const result = shared.update(key, { ...resources, ...(resources.kind !== undefined ? { kind } : {}) });
            if (result.admitted) apply(key, next, previous);
            return result;
        },
        release(key) {
            const previous = entries.get(key);
            const released = shared.release(key);
            if (released && previous) { cpuBytes -= previous.cpuBytes; gpuBytes -= previous.gpuBytes; entries.delete(key); }
            return released;
        },
        has(key) { return shared.has(key); },
        acquireLease(key, options) { return shared.acquireLease(key, options); },
        snapshot() { return shared.snapshot(); },
        /** The share's own accounting inside the shared ledger. */
        shareSnapshot() { return Object.freeze({ kind, cpuBytes, gpuBytes, peakCpuBytes, peakGpuBytes, limits: share, denied, entries: entries.size }); }
    });
}
