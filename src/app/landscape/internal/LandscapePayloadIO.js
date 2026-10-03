// Shares bounded HTTP reads and content authentication across independent landscape channels.
// @ts-check
import { requireCondition } from './LandscapeValidation.js';

export async function readBoundedResponse(response, limit, exact, label) {
    requireCondition(response.ok, `${label} HTTP ${response.status}`);
    const declared = response.headers?.get('content-length');
    if (declared !== null && declared !== undefined) requireCondition(Number(declared) <= limit, `${label} Content-Length exceeds ${limit} bytes`);
    requireCondition(response.body && typeof response.body.getReader === 'function', `${label} requires a bounded streaming response`);
    const reader = response.body.getReader();
    const output = new Uint8Array(limit);
    let offset = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            requireCondition(value instanceof Uint8Array, `${label} returned a non-byte response`);
            requireCondition(offset + value.length <= limit, `${label} exceeds ${limit} bytes`);
            output.set(value, offset);
            offset += value.length;
        }
        requireCondition(!exact || offset === limit, `${label} is truncated: ${offset}/${limit} bytes`);
        return output.subarray(0, offset);
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
}

export async function verifyLandscapeHash(bytes, expected, label) {
    requireCondition(!!globalThis.crypto?.subtle, 'SHA-256 verification requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    requireCondition(actual === expected, `${label} SHA-256 mismatch`);
}

export function resolveLandscapeUrl(manifestUrl) {
    requireCondition(typeof manifestUrl === 'string' || manifestUrl instanceof URL, 'manifestUrl is required');
    const url = new URL(manifestUrl, globalThis.location?.href);
    requireCondition(url.protocol === 'http:' || url.protocol === 'https:', 'runtime landscape loading requires HTTP(S)');
    return url.href;
}

