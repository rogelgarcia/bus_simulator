// Assembles authenticated package views into private GPU staging arrays with bounded copy work.
// @ts-check

/** @param {AbortSignal} signal */
export function createReceiverBufferAssembly(signal) {
    const metrics = { bytes: 0, batches: 0, cpuMs: 0, maximumCopyMs: 0 };
    let budgetBytes = 0, budgetMs = 0;
    return Object.freeze({
        metrics,
        /** @param {Uint8Array} target @param {Uint8Array} source @param {number} offset */
        async copy(target, source, offset) {
            signal.throwIfAborted();
            if (!(target instanceof Uint8Array) || !(source instanceof Uint8Array)
                || !Number.isSafeInteger(offset) || offset < 0 || offset + source.byteLength > target.byteLength
                || target.buffer === source.buffer) throw new TypeError('Receiver assembly requires distinct, bounded byte views');
            for (let start = 0; start < source.byteLength; start += 1024 * 1024) {
                const part = source.subarray(start, Math.min(source.byteLength, start + 1024 * 1024));
                const began = performance.now();
                target.set(part, offset + start);
                const elapsed = performance.now() - began;
                metrics.bytes += part.byteLength; metrics.batches++; metrics.cpuMs += elapsed;
                metrics.maximumCopyMs = Math.max(metrics.maximumCopyMs, elapsed);
                budgetBytes += part.byteLength; budgetMs += elapsed;
                if (budgetBytes >= 8 * 1024 * 1024 || budgetMs >= 4) {
                    await (globalThis.scheduler?.yield() ?? new Promise(resolve => setTimeout(resolve, 0)));
                    signal.throwIfAborted(); budgetBytes = 0; budgetMs = 0;
                }
            }
        }
    });
}
