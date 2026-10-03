// Bounds acquisition/build concurrency and terminates obsolete work before reusing a worker.
// @ts-check
export class LandscapeWorkerPool {
    /** @param {{manifest:any,manifestUrl:string,root:any,size?:number}} options */
    constructor({ manifest, manifestUrl, root, size = 2 }) {
        this.context = { type: 'initialize', manifest, manifestUrl, root };
        this.slots = Array.from({ length: size }, () => ({ worker: null, job: null }));
        this.queue = [];
        this.sequence = 0;
        this.disposed = false;
        this.completed = 0;
        this.canceled = 0;
    }

    /** @param {any} payload @param {{priority?:number,signal?:AbortSignal}} options @returns {Promise<any>} */
    request(payload, { priority = 0, signal } = {}) {
        if (this.disposed || signal?.aborted) return Promise.reject(new DOMException('Terrain work canceled', 'AbortError'));
        return new Promise((resolve, reject) => {
            const job = { id: ++this.sequence, payload, priority, resolve, reject, signal, abort: null };
            job.abort = () => this.cancel(job);
            signal?.addEventListener('abort', job.abort, { once: true });
            this.queue.push(job);
            this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
            this.pump();
        });
    }

    createWorker(slot) {
        const worker = new Worker(new URL('./LandscapeMeshWorker.js', import.meta.url), { type: 'module' });
        worker.postMessage(this.context);
        worker.onmessage = ({ data }) => {
            if (slot.worker !== worker) return;
            const job = slot.job;
            if (!job || data.id !== job.id) return;
            slot.job = null;
            job.signal?.removeEventListener('abort', job.abort);
            if (data.error) job.reject(new Error(data.error));
            else { this.completed++; job.resolve(data); }
            this.pump();
        };
        worker.onerror = event => {
            if (slot.worker !== worker) return;
            const job = slot.job;
            slot.job = null;
            worker.terminate();
            slot.worker = null;
            if (job) { job.signal?.removeEventListener('abort', job.abort); job.reject(new Error(event.message || 'Terrain worker failed')); }
            this.pump();
        };
        return worker;
    }

    pump() {
        if (this.disposed) return;
        for (const slot of this.slots) {
            if (slot.job || !this.queue.length) continue;
            slot.worker ??= this.createWorker(slot);
            slot.job = this.queue.shift();
            slot.worker.postMessage({ id: slot.job.id, ...slot.job.payload });
        }
    }

    cancel(job) {
        const index = this.queue.indexOf(job);
        const slot = this.slots.find(value => value.job === job);
        if (index === -1 && !slot) return;
        if (index !== -1) this.queue.splice(index, 1);
        if (slot) { slot.worker.terminate(); slot.worker = null; slot.job = null; }
        job.signal?.removeEventListener('abort', job.abort);
        this.canceled++;
        job.reject(new DOMException('Terrain work canceled', 'AbortError'));
        this.pump();
    }

    snapshot() { return { active: this.slots.filter(slot => slot.job).length, queued: this.queue.length, completed: this.completed, canceled: this.canceled, workers: this.slots.filter(slot => slot.worker).length }; }

    dispose() {
        this.disposed = true;
        for (const job of [...this.queue, ...this.slots.map(slot => slot.job).filter(Boolean)]) this.cancel(job);
        for (const slot of this.slots) { slot.worker?.terminate(); slot.worker = null; }
        this.context = null;
    }
}
