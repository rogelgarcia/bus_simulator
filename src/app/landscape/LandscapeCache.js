// Locates the local landscape cache and reports, without throwing, whether a manifest and its startup payloads are installed.
// The cache is generated or installed by tools/bake.mjs and is never tracked by Git or Git LFS (AI 595).
// @ts-check
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { LANDSCAPE_MANIFEST_BYTE_LIMIT } from './LandscapePayload.js';
import { readBoundedResponse, resolveLandscapeUrl, verifyLandscapeHash } from './internal/LandscapePayloadIO.js';
import { requireCondition } from './internal/LandscapeValidation.js';

/** Repository-relative root of every generated landscape directory (gitignored as a whole). */
export const LANDSCAPE_CACHE_ROOT = 'assets/public/landscape';

/** Cache directory of the coastal landscape that the viewer, server and landscape bake/authoring tools open by default. */
export const LANDSCAPE_DEFAULT_DIRECTORY = `${LANDSCAPE_CACHE_ROOT}/coastal-city`;

/** Where a developer or deployment learns to generate, install or restore the cache. */
export const LANDSCAPE_CACHE_GUIDE = 'tools/bake_landscape/README.md ("Local landscape cache")';

/** Availability states: only `available` loads; every other state is a fallback condition, not a boot failure. */
export const LANDSCAPE_CACHE_STATUS = Object.freeze({
    available: 'available',
    missing: 'missing',
    stale: 'stale',
    incomplete: 'incomplete',
    invalid: 'invalid',
    unreachable: 'unreachable'
});

const ACTIONS = Object.freeze({
    missing: `Generate it with the landscape bake leaves or install a cache bundle with node tools/bake.mjs --target landscape/cache-install; see ${LANDSCAPE_CACHE_GUIDE}.`,
    stale: `Regenerate or install a cache that retains the pinned manifest, or review the terrain change and explicitly rebind; see ${LANDSCAPE_CACHE_GUIDE}.`,
    incomplete: `Reinstall the cache (landscape/cache-install) or rerun the bake leaf that publishes it; see ${LANDSCAPE_CACHE_GUIDE}.`,
    invalid: `Reinstall the cache from a verified bundle or regenerate it; see ${LANDSCAPE_CACHE_GUIDE}.`,
    unreachable: 'Check that the local server is running and serves the landscape cache.'
});

const CONTENT_ADDRESSED_MANIFEST = /(?:^|\/)manifest\.([a-f0-9]{64})\.json$/;

/** @param {string} landscapeId @returns {string} repository-relative directory of one landscape */
export function landscapeCacheDirectory(landscapeId) {
    requireCondition(typeof landscapeId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(landscapeId), 'landscapeId must name one cache directory');
    return `${LANDSCAPE_CACHE_ROOT}/${landscapeId}`;
}

/**
 * @typedef {{available:true,status:'available',manifestUrl:string,manifest:import('./LandscapeManifest.js').LandscapeManifest,revision:string}} LandscapeCacheAvailable
 * @typedef {{available:false,status:'missing'|'stale'|'incomplete'|'invalid'|'unreachable',manifestUrl:string,reason:string,action:string,currentRevision?:string}} LandscapeCacheUnavailable
 * @typedef {LandscapeCacheAvailable|LandscapeCacheUnavailable} LandscapeCacheAvailability
 */

/** @param {string} status @param {string} manifestUrl @param {string} reason @param {object} [extra] @returns {LandscapeCacheUnavailable} */
function unavailable(status, manifestUrl, reason, extra = {}) {
    return Object.freeze({ available: false, status, manifestUrl, reason, action: ACTIONS[status], ...extra });
}

/** Fetches one cache file; an absent file (404/410) and an unreachable server are reported, never thrown. */
async function fetchCacheFile(url, limit, exact, label, { fetchImpl, signal }) {
    let response;
    try { response = await fetchImpl(url, { signal, cache: 'no-store' }); }
    catch (error) {
        if (error?.name === 'AbortError') throw error;
        return { state: 'unreachable', reason: `${label} could not be fetched: ${error?.message ?? error}` };
    }
    if (response.status === 404 || response.status === 410) {
        await response.body?.cancel?.().catch(() => {});
        return { state: 'absent', reason: `${label} returned HTTP ${response.status}` };
    }
    if (!response.ok) {
        await response.body?.cancel?.().catch(() => {});
        return { state: 'unreachable', reason: `${label} returned HTTP ${response.status}` };
    }
    try { return { state: 'ok', bytes: await readBoundedResponse(response, limit, exact, label) }; }
    catch (error) {
        if (error?.name === 'AbortError') throw error;
        return { state: 'invalid', reason: error.message };
    }
}

/**
 * Probes a landscape manifest (the current `manifest.json` or a pinned content-addressed snapshot) and, unless `payloads` is false,
 * the two overview channels every consumer reads first. A content-addressed name must match the bytes; `expectedRevision` pins the revision.
 * @param {string|URL} manifestUrl
 * @param {{fetchImpl?:typeof fetch,signal?:AbortSignal,expectedRevision?:string,payloads?:boolean}} [options]
 * @returns {Promise<LandscapeCacheAvailability>}
 */
export async function probeLandscapeCache(manifestUrl, { fetchImpl = globalThis.fetch, signal, expectedRevision, payloads = true } = {}) {
    const url = resolveLandscapeUrl(manifestUrl);
    const options = { fetchImpl, signal };
    const fetched = await fetchCacheFile(url, LANDSCAPE_MANIFEST_BYTE_LIMIT, false, 'landscape manifest', options);
    if (fetched.state === 'absent') {
        const current = new URL('manifest.json', url).href;
        if (current === url) return unavailable('missing', url, `no landscape cache is installed (${fetched.reason})`);
        const pointer = await fetchCacheFile(current, LANDSCAPE_MANIFEST_BYTE_LIMIT, false, 'current landscape manifest', options);
        if (pointer.state !== 'ok') return unavailable('missing', url, `no landscape cache is installed (${pointer.reason})`);
        let currentRevision = 'unknown';
        try { currentRevision = String(JSON.parse(new TextDecoder().decode(pointer.bytes)).revision ?? 'unknown'); } catch { /* reported as unknown */ }
        return unavailable('stale', url, `the installed landscape cache (current revision ${currentRevision}) does not retain the pinned manifest ${url.slice(url.lastIndexOf('/') + 1)}`, { currentRevision });
    }
    if (fetched.state !== 'ok') return unavailable(fetched.state, url, fetched.reason);
    const pinnedHash = new URL(url).pathname.match(CONTENT_ADDRESSED_MANIFEST)?.[1];
    let manifest;
    try {
        if (pinnedHash) await verifyLandscapeHash(fetched.bytes, pinnedHash, 'content-addressed landscape manifest');
        manifest = validateLandscapeManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fetched.bytes)));
    } catch (error) { return unavailable('invalid', url, `the landscape manifest is invalid: ${error.message}`); }
    if (expectedRevision !== undefined && manifest.revision !== expectedRevision) {
        return unavailable('stale', url, `the landscape manifest revision ${manifest.revision} differs from the pinned revision ${expectedRevision}`, { currentRevision: manifest.revision });
    }
    if (payloads) {
        const overview = manifest.chunks.find(chunk => chunk.id === manifest.overviewId);
        for (const [name, channel] of Object.entries(overview.channels)) {
            const label = `overview ${name} payload`;
            const payload = await fetchCacheFile(new URL(channel.url, url).href, channel.byteLength, true, label, options);
            if (payload.state === 'absent') return unavailable('incomplete', url, `the cache is incomplete (${payload.reason})`);
            if (payload.state !== 'ok') return unavailable(payload.state, url, payload.reason);
            try { await verifyLandscapeHash(payload.bytes, channel.sha256, label); }
            catch (error) { return unavailable('invalid', url, error.message); }
        }
    }
    return Object.freeze({ available: true, status: 'available', manifestUrl: url, manifest, revision: manifest.revision });
}

/** One-line, user-facing description of an availability result. @param {LandscapeCacheAvailability|null|undefined} availability */
export function describeLandscapeCacheAvailability(availability) {
    if (!availability) return 'Landscape cache: checking…';
    if (availability.available) return `Landscape cache: available (revision ${availability.revision}).`;
    return `Landscape cache ${availability.status}: ${availability.reason}. ${availability.action}`;
}
