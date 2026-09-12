// Fetch, decompress and authenticate off the render thread; at most two jobs.
import { STREAMED_SHADOW_LIMITS } from '../../../app/illumination/static_sun_depth/StreamedShadowPages.js';
const jobs = new Map();
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
async function bounded(stream, maximum) {
    const reader = stream.getReader(), chunks = []; let length = 0;
    try {
        while (true) {
            const {value, done} = await reader.read(); if (done) break;
            length += value.length;
            if (length > maximum) throw new Error('Shadow page exceeds authenticated byte bound');
            chunks.push(value);
        }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
}
self.onmessage = async ({data}) => {
    if (data.cancel) { for (const controller of jobs.values()) controller.abort(); jobs.clear(); return; }
    const {id, url, page} = data;
    if (jobs.has(id) || jobs.size >= STREAMED_SHADOW_LIMITS.concurrency) return;
    const controller = new AbortController(); jobs.set(id, controller);
    try {
        const start = performance.now(), response = await fetch(url, {signal: controller.signal});
        if (!response.ok) throw new Error(`Shadow page HTTP ${response.status}`);
        const packed = await bounded(response.body, page.compressedBytes);
        const fetched = performance.now();
        if (packed.length !== page.compressedBytes || await hash(packed) !== page.compressedSha256) throw new Error('Shadow compressed page integrity failure');
        const raw = await bounded(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')), page.byteLength);
        const decoded = performance.now();
        if (raw.length !== page.byteLength || await hash(raw) !== page.sha256) throw new Error('Shadow decoded page integrity failure');
        controller.signal.throwIfAborted();
        self.postMessage({id, raw, timings: {fetchMs: fetched - start, decodeMs: decoded - fetched, hashMs: performance.now() - decoded}}, [raw.buffer]);
    } catch (error) { if (!controller.signal.aborted) self.postMessage({id, error: error.message}); }
    finally { if (jobs.get(id) === controller) jobs.delete(id); }
};
