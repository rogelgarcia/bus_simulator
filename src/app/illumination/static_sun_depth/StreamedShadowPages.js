// Authenticated optional detail pages. The complete V1 package remains the parent.
import { canonicalJsonBytes } from '../bake_source/CanonicalJson.js';
import { rawSha256Hex } from '../package/index.js';

export const STREAMED_SHADOW_SCHEMA = 'bus-sim-static-shadow-pages-v1';
export const STREAMED_SHADOW_LIMITS = Object.freeze({ slots: 16, concurrency: 2, retainedSeconds: 2,
    fadeSeconds: 0.35, maximumManifestBytes: 2 * 1024 * 1024, maximumPageBytes: 8 * 1024 * 1024 });
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const pair = (value, test) => Array.isArray(value) && value.length === 2 && value.every(test);

export function streamedShadowPrototypeOptions(search = '') {
    const query = new URLSearchParams(search), enabled = query.get('streamedShadowPrototype') !== '0';
    const requested = query.get('streamedShadowIndex');
    const local = typeof requested === 'string' && /^\/tests\/artifacts\/screens\/illumination_547\/[a-zA-Z0-9_/-]+\/streaming_index\.json$/.test(requested);
    return { enabled, indexUrl: query.get('streamedShadowPrototype') === '1' && local ? requested : '/assets/baked_lighting/shadows/streaming_index.json' };
}

export async function validateStreamedShadowManifest(value, parentDescriptor) {
    const fail = () => { throw new Error('Invalid or incompatible streamed shadow manifest'); };
    if (!value || value.schema !== STREAMED_SHADOW_SCHEMA || !sha(value.parentDescriptorSha256)
        || value.parentDescriptorSha256 !== await rawSha256Hex(canonicalJsonBytes(parentDescriptor))) fail();
    const parent = parentDescriptor.identity.layout;
    if (value.ratio !== 3 || value.interiorTexels !== 1020 || !Number.isInteger(value.guardTexels)
        || value.guardTexels < 4 || value.guardTexels > 512 || value.encoding !== 'rg8-packed-linear-depth-v1'
        || !pair(value.tileCount, v => Number.isSafeInteger(v) && v > 0 && v <= 256)
        || !pair(value.origin, Number.isFinite) || value.origin.some((v, i) => v !== parent.boundsLightMeters.min[i])
        || value.texelSizeMeters !== parent.texelSizeMeters / 3 || !Array.isArray(value.pages)
        || value.pages.length > value.tileCount[0] * value.tileCount[1]) fail();
    const diameter = value.angularDiameterDegrees;
    if (diameter !== 0.53) fail();
    const range = parentDescriptor.identity.encoding;
    const requiredGuard = Math.ceil((range.maxDepthMeters - range.minDepthMeters)
        * Math.tan(diameter * Math.PI / 360) / value.texelSizeMeters) + 2;
    if (value.guardTexels < requiredGuard) fail();
    for (let i = 0; i < 2; i++) {
        if (value.tileCount[i] !== Math.ceil(parent.interiorTexels[i] * parent.tileCount[i] * 3 / value.interiorTexels)) fail();
    }
    const size = value.interiorTexels + 2 * value.guardTexels, bytes = size * size * 2;
    if (bytes > STREAMED_SHADOW_LIMITS.maximumPageBytes) fail();
    const ids = new Set();
    for (const page of value.pages) {
        if (!Number.isSafeInteger(page.id) || page.id < 0 || page.id >= value.tileCount[0] * value.tileCount[1]
            || ids.has(page.id) || !sha(page.sha256) || page.byteLength !== bytes || typeof page.empty !== 'boolean') fail();
        ids.add(page.id);
        if (!page.empty && (!/^pages\/[0-9]+\.rg8\.gz$/.test(page.path)
            || !sha(page.compressedSha256) || !Number.isSafeInteger(page.compressedBytes)
            || page.compressedBytes <= 0 || page.compressedBytes > bytes + 65536)) fail();
        if (page.empty && (page.path !== null || page.sha256 !== await emptyPageHash(bytes))) fail();
    }
    return Object.freeze(structuredClone(value));
}

const emptyHashes = new Map();
async function emptyPageHash(bytes) {
    if (!emptyHashes.has(bytes)) emptyHashes.set(bytes, rawSha256Hex(new Uint8Array(bytes).fill(255)));
    return emptyHashes.get(bytes);
}

export function streamedPageAt(manifest, x, y) {
    const edge = manifest.interiorTexels * manifest.texelSizeMeters;
    const column = Math.floor((x - manifest.origin[0]) / edge), row = Math.floor((y - manifest.origin[1]) / edge);
    return column < 0 || row < 0 || column >= manifest.tileCount[0] || row >= manifest.tileCount[1]
        ? -1 : row * manifest.tileCount[0] + column;
}

// A conservative half-resolution evaluator for the far-level experiment.
// RG encodes nearest distance: averaging could introduce light leaks.
export function reduceShadowDepth2x(source, width, height) {
    if (!(source instanceof Uint8Array) || width % 2 || height % 2 || width < 2 || height < 2
        || source.length !== width * height * 2) throw new Error('Even, complete RG8 depth input required');
    const output = new Uint8Array(source.length / 4);
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
        let nearest = 65535;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const i = ((y + dy) * width + x + dx) * 2;
            nearest = Math.min(nearest, source[i] * 256 + source[i + 1]);
        }
        const i = ((y / 2) * (width / 2) + x / 2) * 2;
        output[i] = nearest >> 8; output[i + 1] = nearest & 255;
    }
    return output;
}

// Small deterministic LRU. Visible leases cannot be evicted for prefetch.
export class ShadowPageResidency {
    constructor(capacity = STREAMED_SHADOW_LIMITS.slots) {
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > STREAMED_SHADOW_LIMITS.slots) throw new Error('Invalid shadow pool capacity');
        this.capacity = capacity; this.entries = new Map(); this.wanted = new Set(); this.evictions = 0;
    }
    select(ids, seconds) {
        this.wanted = new Set(ids);
        for (const id of ids) { const entry = this.entries.get(id); if (entry) entry.lastUsed = seconds; }
    }
    admit(id, seconds) {
        if (this.entries.has(id)) return this.entries.get(id);
        let slot = Array.from({length: this.capacity}, (_, i) => i).find(i => ![...this.entries.values()].some(e => e.slot === i));
        let evicted = null;
        if (slot === undefined) {
            const eligible = [...this.entries.values()].filter(e => !this.wanted.has(e.id)
                && seconds - e.lastUsed >= STREAMED_SHADOW_LIMITS.retainedSeconds)
                .sort((a, b) => a.lastUsed - b.lastUsed || a.id - b.id);
            if (!eligible.length) return null;
            evicted = eligible[0].id; slot = eligible[0].slot; this.entries.delete(evicted); this.evictions++;
        }
        const entry = {id, slot, loadedAt: seconds, lastUsed: seconds, evicted};
        this.entries.set(id, entry); return entry;
    }
    clear() { this.entries.clear(); this.wanted.clear(); }
}
