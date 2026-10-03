// Protects a small appearance allowance while accounting actual resources in the shared terrain ledger.
// @ts-check
const MIB = 1024 * 1024;

/** @param {number} resolution @param {number} channels @returns {number} */
export function landscapeTextureBytes(resolution, channels = 4) {
    if (!Number.isSafeInteger(resolution) || resolution < 1 || !Number.isSafeInteger(channels) || channels < 1) throw new Error('Invalid landscape texture dimensions');
    let bytes = 0;
    for (let size = resolution; size >= 1; size = Math.floor(size / 2)) bytes += size * size * channels;
    return bytes;
}

export class LandscapeAppearanceBudget {
    /** @param {any} shared @param {string} prefix */
    constructor(shared, prefix) {
        this.shared = shared;
        this.prefix = prefix;
        this.entries = new Map();
        const limits = shared.snapshot().limits;
        this.floor = { cpuBytes: Math.floor(Math.min(12 * MIB, limits.cpuBytes * 3 / 32)), gpuBytes: Math.floor(Math.min(8 * MIB, limits.gpuBytes / 8)) };
        this.baseFloor = { ...this.floor };
        this.limits = { cpuBytes: Math.floor(Math.min(40 * MIB, limits.cpuBytes / 2)), gpuBytes: Math.floor(Math.min(28 * MIB, limits.gpuBytes / 2)) };
        this.key = `${prefix}/appearance-headroom`;
        const admission = shared.reserve(this.key, { ...this.floor, kind: 'appearance-unused-reservation', pinned: true });
        if (!admission.admitted) throw new Error(`Appearance allowance cannot fit: ${admission.reason}`);
        this.peakCpuBytes = 0;
        this.peakGpuBytes = 0;
    }

    totals() {
        return [...this.entries.values()].reduce((sum, value) => ({ cpuBytes: sum.cpuBytes + value.cpuBytes, gpuBytes: sum.gpuBytes + value.gpuBytes }), { cpuBytes: 0, gpuBytes: 0 });
    }

    credit(totals) { return { cpuBytes: Math.max(0, this.floor.cpuBytes - totals.cpuBytes), gpuBytes: Math.max(0, this.floor.gpuBytes - totals.gpuBytes) }; }

    /** @param {{cpuBytes:number,gpuBytes:number}} demand */
    protectDemand(demand) {
        if (!['cpuBytes', 'gpuBytes'].every(key => Number.isSafeInteger(demand[key]) && demand[key] >= 0)) throw new Error('Appearance demand must contain nonnegative byte counts');
        const next = Object.fromEntries(['cpuBytes', 'gpuBytes'].map(key => [key, Math.max(this.baseFloor[key], Math.min(this.limits[key], demand[key]))]));
        const previous = this.floor;
        this.floor = next;
        const admission = this.shared.update(this.key, this.credit(this.totals()));
        if (!admission.admitted) this.floor = previous;
        this.demand = { requested: { ...demand }, protected: { ...this.floor }, admitted: admission.admitted, reason: admission.reason };
        return admission;
    }

    /** @param {string} key @param {{cpuBytes:number,gpuBytes:number,kind:string}} resources */
    reserve(key, resources) {
        if (this.entries.has(key)) throw new Error(`Duplicate appearance resource ${key}`);
        return this.replace(key, resources);
    }

    update(key, resources) {
        if (!this.entries.has(key)) throw new Error(`Missing appearance resource ${key}`);
        return this.replace(key, { ...this.entries.get(key), ...resources });
    }

    replace(key, resources) {
        const totals = this.totals(), old = this.entries.get(key) ?? { cpuBytes: 0, gpuBytes: 0 };
        const next = { cpuBytes: totals.cpuBytes - old.cpuBytes + resources.cpuBytes, gpuBytes: totals.gpuBytes - old.gpuBytes + resources.gpuBytes };
        const reason = next.cpuBytes > this.limits.cpuBytes ? 'appearance-cpu-budget' : next.gpuBytes > this.limits.gpuBytes ? 'appearance-gpu-budget' : null;
        if (reason) return { admitted: false, reason };
        const before = this.credit(totals), after = this.credit(next);
        this.shared.update(this.key, { cpuBytes: Math.min(before.cpuBytes, after.cpuBytes), gpuBytes: Math.min(before.gpuBytes, after.gpuBytes) });
        const admission = this.entries.has(key) ? this.shared.update(key, resources) : this.shared.reserve(key, resources);
        if (!admission.admitted) { this.shared.update(this.key, before); return admission; }
        this.entries.set(key, resources);
        const restored = this.shared.update(this.key, after);
        if (!restored.admitted) throw new Error('Appearance credit restoration exceeded its released reservation');
        this.peakCpuBytes = Math.max(this.peakCpuBytes, next.cpuBytes);
        this.peakGpuBytes = Math.max(this.peakGpuBytes, next.gpuBytes);
        return admission;
    }

    release(key) {
        if (!this.entries.has(key)) return true;
        if (!this.shared.release(key)) return false;
        this.entries.delete(key);
        const admission = this.shared.update(this.key, this.credit(this.totals()));
        if (!admission.admitted) throw new Error('Appearance release could not restore protected capacity');
        return true;
    }

    snapshot() { return { ...this.totals(), reserved: this.credit(this.totals()), demand: this.demand ?? null, limits: this.limits, peakCpuBytes: this.peakCpuBytes, peakGpuBytes: this.peakGpuBytes }; }

    dispose() {
        for (const key of [...this.entries.keys()]) if (!this.release(key)) throw new Error(`Appearance resource still leased at disposal: ${key}`);
        this.shared.update(this.key, { pinned: false });
        this.shared.release(this.key);
    }
}
