// Resolves the natural display soil of planning-only samples: terrain-driven labels from published natural-soil pages, or the overview infill.
// @ts-check
// natural-terrain-inference-v1 labels come from the terrain-fields sidecar (one uint8 label per aligned chunk sample, row 0 north, no halo);
// a chunk of any level holds the native labels at its aligned samples, so every level reads identical labels at shared positions. The
// policy is decided per native chunk: while the sidecar is active, a native whose height or land-cover channel changed since the bake
// (stale) uses the natural-overview-infill-v1 fallback for exactly its own samples, and an inactive request (absent, disabled, invalid,
// mismatched or all-stale sidecar) uses the fallback everywhere. A sample belongs to the native chunk min(n - 1, floor(index / intervals))
// on each axis, the ownership rule of the mask halos, so pages of every level and their halos choose the same policy for a shared sample.
// Requests are plain data so workers receive exactly the policy the main thread planned and the fine-page identity hashed.
import { requireCondition, requireInteger, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';

export const LANDSCAPE_NATURAL_SOIL = Object.freeze({
    format: 'landscape-natural-soil-request',
    terrain: 'natural-terrain-inference-v1',
    overview: 'natural-overview-infill-v1',
    // one page in flight plus its streamed fetch buffer while a worker reads pages one owner at a time
    transientPages: 2,
    // content-addressed pages the appearance worker keeps between mask jobs: one full 3 x 3 owner neighborhood
    appearanceWorkerPages: 9
});

const NATIVE_ID = /^l(\d{1,2})\/c(\d{1,7})\/r(\d{1,7})$/;

/** Catalog indices a natural label may take: the soils of non-planning land-cover classes. @param {any} manifest */
export function landscapeNaturalSoilIndices(manifest) {
    const soilIds = manifest.soil.catalog.map(soil => soil.id), planning = new Set(manifest.landCover.catalog.filter(entry => entry.planningOnly).map(entry => entry.id));
    return Object.freeze([...new Set(manifest.soil.landCoverMapping.filter(entry => !planning.has(entry.landCoverId)).map(entry => soilIds.indexOf(entry.soilId)))]
        .filter(index => index >= 0).sort((a, b) => a - b));
}

/** Natural-soil page bytes of one chunk (one label per sample). @param {{columns:number,rows:number}} chunk */
export function landscapeNaturalSoilPageBytes(chunk) { return chunk.columns * chunk.rows; }

/** Transient worker bytes of a job that reads natural-soil pages serially: one page and its fetch buffer. @param {{columns:number,rows:number}} chunk */
export function landscapeNaturalSoilTransientBytes(chunk) { return LANDSCAPE_NATURAL_SOIL.transientPages * landscapeNaturalSoilPageBytes(chunk); }

/**
 * Validates one authenticated natural-soil page against its chunk: one label per aligned sample, each a natural catalog soil.
 * @param {any} manifest @param {{id:string,columns:number,rows:number}} chunk @param {Uint8Array} bytes @param {readonly number[]} [allowed]
 */
export function validateLandscapeNaturalSoilPage(manifest, chunk, bytes, allowed = landscapeNaturalSoilIndices(manifest)) {
    requireCondition(bytes instanceof Uint8Array && bytes.length === landscapeNaturalSoilPageBytes(chunk), `natural soil page ${chunk.id} must hold ${landscapeNaturalSoilPageBytes(chunk)} labels`);
    const valid = new Uint8Array(256);
    for (const index of allowed) valid[index] = 1;
    for (let i = 0; i < bytes.length; i++) if (valid[bytes[i]] !== 1) requireCondition(false, `natural soil page ${chunk.id} label ${bytes[i]} at ${i} is not a natural catalog soil`);
    return bytes;
}

function nativeAddress(manifest, id) {
    const match = typeof id === 'string' ? NATIVE_ID.exec(id) : null, side = 2 ** manifest.grid.maxLevel;
    requireCondition(!!match && Number(match[1]) === manifest.grid.maxLevel && Number(match[2]) < side && Number(match[3]) < side && id === `l${match[1]}/c${match[2]}/r${match[3]}`,
        `natural soil native ${id} is not a native chunk of this landscape`);
    return { column: Number(match[2]), row: Number(match[3]) };
}

function normalizeRequest(manifest, request) {
    if (request === null || request === undefined) return { active: false, url: null, overviewNatives: [], pages: new Map() };
    requireCondition(!!request && typeof request === 'object' && request.format === LANDSCAPE_NATURAL_SOIL.format && request.policy === LANDSCAPE_NATURAL_SOIL.terrain
        && typeof request.active === 'boolean', 'natural soil request must be a landscape-natural-soil-request of natural-terrain-inference-v1');
    requireCondition(Array.isArray(request.overviewNatives) && !!request.pages && typeof request.pages === 'object' && !Array.isArray(request.pages), 'natural soil request needs overview natives and pages');
    for (const id of request.overviewNatives) nativeAddress(manifest, id);
    const pages = new Map();
    if (request.active) {
        requireCondition(typeof request.url === 'string' && /^https?:\/\//.test(request.url), 'an active natural soil request needs the absolute terrain-fields manifest URL');
        const byId = new Map(manifest.chunks.map(chunk => [chunk.id, chunk]));
        for (const [id, entry] of Object.entries(request.pages)) {
            const chunk = byId.get(id);
            requireCondition(!!chunk, `natural soil request names unknown chunk ${id}`);
            if (entry !== null) {
                requireCondition(!!entry && typeof entry === 'object', `natural soil page ${id} must be a descriptor or null`);
                requireRelativeUrl(entry.url, `natural soil page ${id} url`); requireSha256(entry.sha256, `natural soil page ${id} sha256`);
                requireInteger(entry.byteLength, 1, 2 * 1024 * 1024, `natural soil page ${id} byteLength`);
                requireCondition(entry.byteLength === landscapeNaturalSoilPageBytes(chunk), `natural soil page ${id} must hold one label per sample`);
            }
            pages.set(id, entry);
        }
    }
    return { active: request.active, url: request.active ? request.url : null, overviewNatives: request.overviewNatives, pages };
}

/**
 * Request-scoped resolver of terrain-driven natural labels. `label` returns the published label of an aligned global sample, or -1 where the
 * overview infill applies (inactive request, stale native or no published page). Pages load one at a time through the injected loader.
 * @param {any} manifest validated landscape manifest @param {any} [request] landscape-natural-soil-request or null (overview everywhere)
 */
export function createLandscapeNaturalSoilResolver(manifest, request = null) {
    const normalized = normalizeRequest(manifest, request), grid = manifest.grid, side = 2 ** grid.maxLevel, allowed = landscapeNaturalSoilIndices(manifest);
    // stale natives are few: a set keyed by native index (row * side + column), consulted only while the request is active
    const stale = new Set(normalized.overviewNatives.map(id => { const { column, row } = nativeAddress(manifest, id); return row * side + column; }));
    const fallback = index => !normalized.active || stale.size > 0 && stale.has(index);
    const nativeIndex = (globalColumn, globalRow) => Math.min(side - 1, Math.floor(globalRow / grid.chunkIntervals)) * side + Math.min(side - 1, Math.floor(globalColumn / grid.chunkIntervals));

    /** Whether the planning samples of an aligned global sample use the overview infill. @param {number} globalColumn @param {number} globalRow */
    function usesOverview(globalColumn, globalRow) { return fallback(nativeIndex(globalColumn, globalRow)); }

    /** @param {string} id native chunk id */
    function nativeUsesOverview(id) { const { column, row } = nativeAddress(manifest, id); return fallback(row * side + column); }

    /** Published page descriptor of a chunk the request covers (null: none published or inactive). @param {{id:string}} chunk */
    function entry(chunk) {
        if (!normalized.active) return null;
        requireCondition(normalized.pages.has(chunk.id), `natural soil request does not cover chunk ${chunk.id}`);
        return normalized.pages.get(chunk.id);
    }

    /** A page is read only when it is published and at least one native inside the chunk keeps the terrain policy. @param {any} chunk */
    function needsPage(chunk) {
        if (!entry(chunk)) return false;
        const span = 2 ** (grid.maxLevel - chunk.level);
        if (stale.size < span * span) return true;
        for (let row = chunk.row * span; row < (chunk.row + 1) * span; row++) for (let column = chunk.column * span; column < (chunk.column + 1) * span; column++) {
            if (!stale.has(row * side + column)) return true;
        }
        return false;
    }

    /** @param {any} chunk @param {(entry:{url:string,sha256:string,byteLength:number},url:string)=>Promise<Uint8Array>} loadPage @returns {Promise<Uint8Array|null>} */
    async function load(chunk, loadPage) {
        if (!needsPage(chunk)) return null;
        requireCondition(typeof loadPage === 'function', 'natural soil pages need an authenticated loader');
        return validateLandscapeNaturalSoilPage(manifest, chunk, await loadPage(entry(chunk), normalized.url), allowed);
    }

    /** @param {Uint8Array|null} labels page of `chunk` @param {any} chunk @param {number} globalColumn aligned sample of the chunk @param {number} globalRow */
    function label(labels, chunk, globalColumn, globalRow) {
        if (!labels || usesOverview(globalColumn, globalRow)) return -1;
        const stride = chunk.sampleStride, column = (globalColumn - chunk.startColumn) / stride, row = (globalRow - chunk.startRow) / stride;
        if (!(Number.isInteger(column) && Number.isInteger(row) && column >= 0 && row >= 0 && column < chunk.columns && row < chunk.rows)) requireCondition(false, `sample ${globalColumn},${globalRow} is not aligned in ${chunk.id}`);
        return labels[row * chunk.columns + column];
    }

    /** Fine-page identity entries of native owners: the policy and the content address of the labels they read. @param {string[]} nativeIds */
    function identity(nativeIds) {
        return nativeIds.map(id => nativeUsesOverview(id) ? { id, policy: LANDSCAPE_NATURAL_SOIL.overview }
            : { id, policy: LANDSCAPE_NATURAL_SOIL.terrain, sha256: entry({ id })?.sha256 ?? null });
    }

    return Object.freeze({ active: normalized.active, url: normalized.url, usesOverview, nativeUsesOverview, entry, needsPage, load, label, identity, allowed });
}

/**
 * Fine-page identity entries of native owners for a request (null or absent: every owner uses the overview infill).
 * @param {any} manifest @param {any} request @param {string[]} nativeIds
 */
export function landscapeNaturalSoilIdentity(manifest, request, nativeIds) { return createLandscapeNaturalSoilResolver(manifest, request).identity(nativeIds); }
