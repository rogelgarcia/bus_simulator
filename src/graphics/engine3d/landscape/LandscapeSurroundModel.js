// Declares the render-only far-field surround contract (AI 596 D5): its sidecar, its binding to the authoritative landscape, its residency share and its water extent.
// @ts-check
// The surround is a standalone saved landscape document (coarser, larger, no appearance or fields) published beside the authoritative landscape as
// `surround/manifest.json`. Its provenance carries a `preparation.surround` block that binds it to one landscape id and revision; a surround bound to
// another revision is stale and is reported, never drawn, so a terrain edit can never show a surround of the terrain before it. At runtime it streams
// through a second LandscapeStreamer in render-only mode and is never picked, queried, edited or counted as the landscape. Its tiles reserve inside the
// shared residency ledger under one kind, bounded by its own share, so it can degrade to its coarse root but never take the authoritative stream's room.

export const LANDSCAPE_SURROUND = Object.freeze({
    id: 'landscape-surround-v1',
    // the one residency kind of every surround reservation in the shared ledger (its stream reserves nothing under another kind)
    kind: 'landscape-surround',
    sidecar: 'surround/manifest.json',
    // the viewer's landscapeSurround option: auto loads the sidecar when it exists, off never loads it; any other value is a manifest URL
    modes: Object.freeze(['auto', 'off']),
    defaultMode: 'auto',
    // a coarser screen-error goal than the authoritative 1.5 px: the surround is a horizon backdrop, not inspected ground
    targetErrorPixels: 3,
    // how far below the reference surface a straddling tile's inside vertices sit, so the authoritative tiles and their LOD skirts cover them
    skirtDepthMeters: 1.5,
    // the wall hanging from the surround's edge along the landscape boundary, deeper than the native relief between 15.625 m samples (max 3.4 m on v3),
    // so a grazing ray from inside never passes under the edge; below the authoritative surface it is never seen
    boundaryWallMeters: 4.5,
    workers: 1,
    // the share of the shared ledger the surround may hold (reservations beyond it are denied and the surround keeps coarser coverage): room for the
    // four 4 km natives under the camera, their twelve level-2 neighbours and the hidden ancestors (about 20 tiles of 4-6 MB CPU / 3.7 MB GPU) plus
    // build peaks; LANDSCAPE_STREAMING_BUDGETS and the surface cache profile grew by exactly this share
    budgets: Object.freeze({ cpuBytes: 128 * 1024 * 1024, gpuBytes: 96 * 1024 * 1024 }),
    statuses: Object.freeze(['off', 'loading', 'active', 'absent', 'stale', 'unbound', 'invalid', 'failed'])
});

const SHA256 = /^[a-f0-9]{64}$/;
const bytesInput = (value, label) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`[LandscapeSurround] ${label} must be a nonnegative safe byte count`);
    return value;
};
const nearly = (a, b) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
const sameBounds = (a, b) => ['minX', 'maxX', 'minZ', 'maxZ'].every(key => nearly(a[key], b[key]));
const boundsInput = (bounds, label) => {
    if (!bounds || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(bounds[key])) || !(bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ)) throw new Error(`[LandscapeSurround] ${label} must be finite bounds with positive area`);
    return Object.freeze({ minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ });
};

/**
 * Resolves the viewer's landscapeSurround option: 'auto' (the sidecar beside the landscape manifest), 'off', or a manifest URL.
 * @param {string|null|undefined} value @returns {Readonly<{mode:'auto'|'off'|'url',url:string|null}>}
 */
export function landscapeSurroundOption(value) {
    if (value === null || value === undefined || value === '') return Object.freeze({ mode: 'auto', url: null });
    if (typeof value !== 'string') throw new Error('[LandscapeSurround] landscapeSurround must be auto, off or a manifest URL');
    if (value === 'auto' || value === 'off') return Object.freeze({ mode: value, url: null });
    if (!/\.json$/.test(value) || /\s/.test(value)) throw new Error(`[LandscapeSurround] landscapeSurround must be auto, off or a manifest URL ending in .json; received ${value}`);
    return Object.freeze({ mode: 'url', url: value });
}

/**
 * The surround manifest URL of a loaded landscape: its option's URL, or the sidecar beside the landscape manifest (a pinned manifest.<sha>.json snapshot
 * resolves to the same directory). @param {string} manifestUrl @param {ReturnType<typeof landscapeSurroundOption>} option
 */
export function landscapeSurroundUrl(manifestUrl, option) {
    if (option.mode === 'off') return null;
    return option.mode === 'url' ? new URL(/** @type {string} */ (option.url), manifestUrl).href : new URL(LANDSCAPE_SURROUND.sidecar, manifestUrl).href;
}

/**
 * Checks that a validated surround manifest binds the loaded landscape: `provenance.preparation.surround` names the landscape id and the exact revision,
 * repeats its bounds as the extent and carries the boundary hash of the native boundary rows (so the publisher can prove which terrain it continued).
 * Nothing is thrown: a missing block is `unbound`, another landscape or revision is `stale`, a malformed block or bounds that do not contain the extent
 * are `invalid`; only `bound` is drawn.
 * @param {any} surround validated surround landscape manifest @param {{id:string,revision:string,bounds:any}} landscape
 * @returns {Readonly<{status:'bound'|'unbound'|'stale'|'invalid',reason:string|null,binding:Readonly<{landscapeId:string,revision:string,manifestSha256:string|null,extent:any,boundaryHash:string}>|null}>}
 */
export function landscapeSurroundBinding(surround, landscape) {
    const block = surround?.provenance?.preparation?.surround;
    if (block === undefined || block === null) return Object.freeze({ status: 'unbound', reason: 'the surround manifest has no provenance.preparation.surround block', binding: null });
    const invalid = reason => Object.freeze({ status: 'invalid', reason, binding: null });
    if (typeof block !== 'object' || Array.isArray(block)) return invalid('provenance.preparation.surround must be an object');
    if (typeof block.landscapeId !== 'string' || !block.landscapeId) return invalid('provenance.preparation.surround.landscapeId must be the landscape id');
    if (typeof block.revision !== 'string' || !block.revision) return invalid('provenance.preparation.surround.revision must be the landscape revision');
    if (block.manifestSha256 !== undefined && block.manifestSha256 !== null && !SHA256.test(block.manifestSha256)) return invalid('provenance.preparation.surround.manifestSha256 must be a lowercase SHA-256');
    if (typeof block.boundaryHash !== 'string' || !SHA256.test(block.boundaryHash)) return invalid('provenance.preparation.surround.boundaryHash must be the lowercase SHA-256 of the native boundary rows');
    let extent;
    try { extent = boundsInput(block.extent, 'provenance.preparation.surround.extent'); } catch (error) { return invalid(/** @type {Error} */ (error).message); }
    const binding = Object.freeze({ landscapeId: block.landscapeId, revision: block.revision, manifestSha256: block.manifestSha256 ?? null, extent, boundaryHash: block.boundaryHash });
    const bounds = surround.bounds;
    if (!(bounds.minX <= extent.minX && bounds.maxX >= extent.maxX && bounds.minZ <= extent.minZ && bounds.maxZ >= extent.maxZ)) return Object.freeze({ status: 'invalid', reason: 'the surround bounds do not contain its extent', binding });
    const stale = reason => Object.freeze({ status: 'stale', reason, binding });
    if (binding.landscapeId !== landscape.id) return stale(`the surround continues landscape ${binding.landscapeId}; ${landscape.id} is loaded`);
    if (binding.revision !== landscape.revision) return stale(`the surround continues revision ${binding.revision}; ${landscape.revision} is loaded`);
    if (!sameBounds(extent, landscape.bounds)) return stale(`the surround extent ${JSON.stringify(extent)} is not the landscape bounds ${JSON.stringify(landscape.bounds)}`);
    return Object.freeze({ status: 'bound', reason: null, binding });
}

/**
 * The water reference extent of a view: the surround bounds while a surround is active (the sea continues to its edge), else the landscape bounds.
 * @param {{bounds:any}} landscape @param {{status:string,bounds:any}|null|undefined} surround
 */
export function landscapeSurroundWaterBounds(landscape, surround) {
    const bounds = boundsInput(landscape.bounds, 'landscape bounds');
    if (!surround || surround.status !== 'active') return bounds;
    const extended = boundsInput(surround.bounds, 'surround bounds');
    if (!(extended.minX <= bounds.minX && extended.maxX >= bounds.maxX && extended.minZ <= bounds.minZ && extended.maxZ >= bounds.maxZ)) throw new Error('[LandscapeSurround] The surround bounds must contain the landscape bounds');
    return extended;
}

/**
 * Resident surround tiles by level and their totals from a terrain stream snapshot. @param {{residentLeafIds:string[]}} snapshot
 * @returns {{tiles:number,byLevel:Record<string, number>}}
 */
export function landscapeSurroundResidency(snapshot) {
    const byLevel = {};
    for (const id of snapshot.residentLeafIds) { const level = /^l(\d+)\//.exec(id)?.[1] ?? '?'; byLevel[level] = (byLevel[level] ?? 0) + 1; }
    return { tiles: snapshot.residentLeafIds.length, byLevel };
}

/**
 * A view of the shared residency ledger that bounds one surround's reservations to its share: every reservation is forwarded under the surround kind
 * and counted against the share's own limits before the shared ledger admits it, so a denial reads like the shared ledger's (`cpu-budget`,
 * `gpu-budget`; the stream then prunes and retries) while the authoritative stream keeps the rest of the ledger. Leases and snapshots pass through.
 * @param {any} shared the LandscapeResidencyBudget of the view @param {{cpuBytes:number,gpuBytes:number}} [limits]
 */
export function createLandscapeSurroundLedger(shared, limits = LANDSCAPE_SURROUND.budgets) {
    if (!shared || typeof shared.reserve !== 'function' || typeof shared.update !== 'function' || typeof shared.release !== 'function') throw new Error('[LandscapeSurround] The surround ledger wraps a residency budget');
    const share = Object.freeze({ cpuBytes: bytesInput(limits?.cpuBytes, 'cpu share'), gpuBytes: bytesInput(limits?.gpuBytes, 'gpu share') });
    const entries = new Map();
    let cpuBytes = 0, gpuBytes = 0, peakCpuBytes = 0, peakGpuBytes = 0, denied = 0;
    const sizes = (resources, previous) => ({ cpuBytes: bytesInput(resources.cpuBytes ?? previous.cpuBytes, 'cpuBytes'), gpuBytes: bytesInput(resources.gpuBytes ?? previous.gpuBytes, 'gpuBytes') });
    const admit = (next, previous) => {
        const cpu = cpuBytes - previous.cpuBytes + next.cpuBytes, gpu = gpuBytes - previous.gpuBytes + next.gpuBytes;
        const reason = cpu > share.cpuBytes ? 'cpu-budget' : gpu > share.gpuBytes ? 'gpu-budget' : null;
        if (reason) { denied++; return Object.freeze({ admitted: false, reason }); }
        return null;
    };
    const apply = (key, next, previous) => {
        cpuBytes += next.cpuBytes - previous.cpuBytes; gpuBytes += next.gpuBytes - previous.gpuBytes;
        peakCpuBytes = Math.max(peakCpuBytes, cpuBytes); peakGpuBytes = Math.max(peakGpuBytes, gpuBytes);
        entries.set(key, next);
    };
    const nothing = Object.freeze({ cpuBytes: 0, gpuBytes: 0 });
    return Object.freeze({
        kind: LANDSCAPE_SURROUND.kind,
        limits: share,
        reserve(key, resources) {
            if (entries.has(key)) throw new Error(`[LandscapeSurround] duplicate reservation ${key}`);
            const next = sizes(resources, nothing), refusal = admit(next, nothing);
            if (refusal) return refusal;
            const result = shared.reserve(key, { ...resources, kind: LANDSCAPE_SURROUND.kind });
            if (result.admitted) apply(key, next, nothing);
            return result;
        },
        update(key, resources) {
            const previous = entries.get(key);
            if (!previous) throw new Error(`[LandscapeSurround] missing reservation ${key}`);
            const next = sizes(resources, previous), refusal = admit(next, previous);
            if (refusal) return refusal;
            const result = shared.update(key, { ...resources, ...(resources.kind !== undefined ? { kind: LANDSCAPE_SURROUND.kind } : {}) });
            if (result.admitted) apply(key, next, previous);
            return result;
        },
        release(key) {
            const previous = entries.get(key);
            const released = shared.release(key);
            if (released && previous) { cpuBytes -= previous.cpuBytes; gpuBytes -= previous.gpuBytes; entries.delete(key); }
            return released;
        },
        has(key) { return shared.has(key); },
        acquireLease(key, options) { return shared.acquireLease(key, options); },
        snapshot() { return shared.snapshot(); },
        /** The surround's own accounting inside the shared ledger. */
        shareSnapshot() { return Object.freeze({ kind: LANDSCAPE_SURROUND.kind, cpuBytes, gpuBytes, peakCpuBytes, peakGpuBytes, limits: share, denied, entries: entries.size }); }
    });
}
