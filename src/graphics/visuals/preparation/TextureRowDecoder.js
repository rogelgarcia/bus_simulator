// One cancellable worker supplies bounded pixel strips without repeated DOM-image GPU readback.
// @ts-check
export class TextureRowDecoder {
    constructor() {
        this.worker = new Worker(new URL('./TextureRowWorker.js', import.meta.url), { type: 'module' });
        this.pending = new Map(); this.sequence = 0; this.generation = 0;
        this.worker.onmessage = ({ data }) => {
            const pending = this.pending.get(data.request);
            if (!pending) return;
            this.pending.delete(data.request);
            if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data);
        };
        this.worker.onerror = event => {
            this.failure = new Error(event.message); this.worker.terminate();
            for (const pending of this.pending.values()) pending.reject(this.failure);
            this.pending.clear();
        };
    }

    request(generation, message) {
        if (this.failure) return Promise.reject(this.failure);
        const request = ++this.sequence;
        return new Promise((resolve, reject) => {
            this.pending.set(request, { generation, resolve, reject });
            this.worker.postMessage({ ...message, request, generation });
        });
    }

    /** @param {HTMLImageElement | HTMLCanvasElement} image */
    open(image) {
        const generation = ++this.generation;
        let cancelled = false;
        const source = image instanceof HTMLCanvasElement
            ? new Promise((resolve, reject) => image.toBlob(blob => blob ? resolve({ blob }) : reject(new Error('Canvas encoding failed')), 'image/png'))
            : Promise.resolve({ url: image.currentSrc || image.src });
        const opened = source.then(value => {
            if (cancelled) throw new Error('Texture decoding cancelled');
            return this.request(generation, { type: 'open', ...value });
        });
        opened.catch(() => {});
        return {
            read: async (y, rows, flipY, premultiplyAlpha) => {
                await opened;
                if (cancelled) throw new Error('Texture decoding cancelled');
                return this.request(generation, { type: 'read', y, rows, flipY, premultiplyAlpha });
            },
            cancel: () => {
                cancelled = true;
                this.worker.postMessage({ type: 'close', generation });
                for (const [id, pending] of this.pending) if (pending.generation === generation) {
                    pending.reject(new Error('Texture decoding cancelled')); this.pending.delete(id);
                }
            }
        };
    }

    /** Stops only this preparation worker and rejects its pending work. */
    dispose() {
        this.worker.terminate();
        for (const pending of this.pending.values()) pending.reject(new Error('Texture decoder disposed'));
        this.pending.clear();
    }
}
