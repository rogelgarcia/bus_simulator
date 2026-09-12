// Transfers exclusive package storage to a verifier worker without weakening the parser contract.
// @ts-check
import { IlluminationPackageError } from './IlluminationPackageError.js';

function freezeStructure(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value)) return value;
    seen.add(value);
    for (const child of Object.values(value)) freezeStructure(child, seen);
    return Object.freeze(value);
}

/** @param {Uint8Array} bytes @param {any} options @param {AbortSignal} [signal] */
export function verifyPackageInBackground(bytes, options, signal) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./IlluminationPackageWorker.js', import.meta.url), { type: 'module' });
        const finish = (error, result) => {
            signal?.removeEventListener('abort', abort); worker.terminate();
            if (error) reject(error); else resolve(freezeStructure(result));
        };
        const abort = () => finish(signal.reason);
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => finish(data.error
            ? new IlluminationPackageError(data.error.code, data.error.message, data.error.details) : null, data.parsed);
        worker.onerror = event => { event.preventDefault(); finish(new Error(event.message)); };
        worker.onmessageerror = () => finish(new Error('Illumination verification result could not be decoded'));
        try { worker.postMessage({ bytes, options }, [bytes.buffer]); } catch (error) { finish(error); }
    });
}
