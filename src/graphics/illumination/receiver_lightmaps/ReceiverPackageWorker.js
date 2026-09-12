// Authenticates receiver packages off the render thread and transfers their owned bytes.
// @ts-check
import { parseTransferredIlluminationBinaryPackage, transferIlluminationPackageOwnership } from '../../../app/illumination/package/IlluminationBinaryPackage.js';

async function boundedBytes(stream, length) {
    const bytes = new Uint8Array(length), reader = stream.getReader(); let offset = 0;
    try {
        while (true) {
            const { value, done } = await reader.read(); if (done) break;
            if (offset + value.length > length) throw new Error('Receiver transport exceeds declared length');
            bytes.set(value, offset); offset += value.length;
        }
        if (offset !== length) throw new Error('Receiver transport length mismatch');
        return bytes;
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
}

self.onmessage = async ({ data: { url, descriptor, options } }) => {
    try {
        for (const size of [descriptor.bytes, descriptor.compressedBytes]) {
            if (!Number.isSafeInteger(size) || size < 1 || size > 512 * 1024 * 1024) throw new Error('Receiver transport budget exceeded');
        }
        const start = performance.now(), response = await fetch(url);
        if (!response.ok) throw new Error('Receiver package HTTP ' + response.status);
        const packed = await boundedBytes(response.body, descriptor.compressedBytes), downloaded = performance.now();
        const raw = await boundedBytes(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')), descriptor.bytes);
        const inflated = performance.now();
        const parsed = await parseTransferredIlluminationBinaryPackage(transferIlluminationPackageOwnership(raw), options);
        const buffers = [...new Set(parsed.chunks.map(chunk => chunk.data.buffer))];
        self.postMessage({ parsed, timings: { downloadMs: downloaded - start, inflateMs: inflated - downloaded,
            validateMs: performance.now() - inflated } }, buffers);
    } catch (error) { self.postMessage({ error: error.message }); }
};
