// Owns cancellable background hashing of an already extracted source snapshot.
// @ts-check

/** @param {any} input @param {any} context @param {AbortSignal} [signal] @param {(phase: string) => void} [onProgress] */
export function buildSourceIdentityInBackground(input, context, signal, onProgress = () => {}) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./BakeSourceIdentityWorker.js', import.meta.url), { type: 'module' });
        const finish = (error, result) => {
            signal?.removeEventListener('abort', abort); worker.terminate();
            if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(signal.reason);
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => {
            if (data.phase) { onProgress(data.phase); return; }
            finish(data.error ? new Error(data.error) : null, data);
        };
        worker.onerror = event => { event.preventDefault(); finish(new Error(event.message)); };
        worker.onmessageerror = () => finish(new Error('Bake source identity result could not be decoded'));
        try { worker.postMessage({ input, context }); } catch (error) { finish(error); }
    });
}
