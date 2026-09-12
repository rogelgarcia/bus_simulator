// Owns one cancellable worker per receiver package; completion never leaves a worker alive.
// @ts-check

/** @param {{url: string, descriptor: any, options: any, signal: AbortSignal}} request */
export function loadReceiverPackage({ url, descriptor, options, signal }) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./ReceiverPackageWorker.js', import.meta.url), { type: 'module' });
        const finish = (error, result) => {
            signal.removeEventListener('abort', abort); worker.terminate();
            if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data);
        worker.onerror = event => { event.preventDefault(); finish(new Error(event.message)); };
        worker.onmessageerror = () => finish(new Error('Receiver worker result could not be decoded'));
        try { worker.postMessage({ url, descriptor, options }); } catch (error) { finish(error); }
    });
}
