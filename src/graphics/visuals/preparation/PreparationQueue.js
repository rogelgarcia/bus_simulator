// Schedules resumable preparation with bounded submissions and explicit overruns.
// @ts-check

export class PreparationQueue {
    /** @param {{maxJobs?: number, clock?: () => number}} options */
    constructor({ maxJobs = 128, clock = () => performance.now() } = {}) {
        if (!Number.isInteger(maxJobs) || maxJobs < 1) throw new Error('Invalid preparation queue capacity');
        this.maxJobs = maxJobs; this.clock = clock; this.jobs = new Map();
        this.stats = { completed: 0, cancelled: 0, deferred: 0, overruns: 0, maxStepMs: 0, cpuMs: 0, bytes: 0, steps: 0 };
    }

    /** @param {any} key @param {{step: Function, cancel?: Function, priority: number, persistent?: boolean}} job */
    add(key, job) {
        if (this.jobs.has(key)) { this.jobs.get(key).priority = job.priority; return false; }
        if (this.jobs.size >= this.maxJobs) {
            let farthestKey, farthest = job.priority;
            for (const [candidate, value] of this.jobs) if (value.priority > farthest) {
                farthest = value.priority; farthestKey = candidate;
            }
            if (farthestKey === undefined) { this.stats.deferred++; return false; }
            this.cancel(farthestKey);
        }
        this.jobs.set(key, job); return true;
    }

    /** @param {any} key */
    cancel(key) {
        const job = this.jobs.get(key);
        if (!job) return;
        job.cancel?.(); this.jobs.delete(key); this.stats.cancelled++;
    }

    /** @param {{milliseconds: number, bytes: number, steps?: number}} budget */
    run({ milliseconds, bytes, steps = 4 }) {
        const start = this.clock();
        const frame = { cpuMs: 0, bytes: 0, steps: 0, pending: this.jobs.size };
        if (milliseconds <= 0 || bytes <= 0) return frame;
        const ordered = [...this.jobs.entries()].sort((a, b) => a[1].priority - b[1].priority);
        for (const [key, job] of ordered) {
            if (this.clock() - start >= milliseconds || frame.steps >= steps || frame.bytes >= bytes) break;
            const before = this.clock();
            const result = job.step(bytes - frame.bytes);
            const elapsed = this.clock() - before;
            this.stats.maxStepMs = Math.max(this.stats.maxStepMs, elapsed);
            if (this.clock() - start > milliseconds) this.stats.overruns++;
            if (!result.waiting) frame.steps++;
            frame.bytes += result.bytes ?? 0;
            if (result.done) { job.cancel?.(); this.jobs.delete(key); this.stats.completed++; }
            if (result.exclusive) break;
        }
        frame.cpuMs = this.clock() - start; frame.pending = this.jobs.size;
        this.stats.cpuMs += frame.cpuMs; this.stats.bytes += frame.bytes; this.stats.steps += frame.steps;
        return frame;
    }

    clear() { for (const key of this.jobs.keys()) this.cancel(key); }
}
