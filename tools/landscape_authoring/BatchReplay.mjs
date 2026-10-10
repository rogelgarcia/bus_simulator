// Replays the accepted edit batches of a previous landscape revision onto a regenerated landscape through the authoring store (AI 596 D4).
// @ts-check
// Explicit edits are never baked into a synthesis recipe: after a regeneration the saved landscape is rebuilt from the recipe, and this
// module re-applies each accepted batch of the previous landscape (world geometry, parameters, soil overrides and named regions) in its
// acceptance order through the store's bounded apply, so every batch is validated, staged, rebuilds its ancestors and is published
// atomically exactly as it was the first time. A batch the new terrain invalidates (region outside the target bounds, smoothing radius
// invalid at the target spacing, unknown soil, ...) is reported with its reason, never silently dropped; reverted batches are tombstones
// in the previous history and are reported, not replayed. Every replayed operation record carries a `replayedFrom` provenance.
import path from 'node:path';
import { landscapeRegionBounds, landscapeRegionsEqual, landscapeSmoothRadiusSampleLimit, validateLandscapeEditBatch } from '../../src/app/landscape/index.js';
import { authoringHash } from './AuthoringFiles.mjs';
import { readLandscapeFileManifest } from './LandscapeFileIO.mjs';
import { createLandscapeAuthoringStore } from './LandscapeAuthoringStore.mjs';

export const LANDSCAPE_REPLAY_FORMAT = 'landscape-edit-replay';

/** Reasons a batch is skipped; every other failure (I/O, staging, publication) aborts the replay and leaves the target at its last published revision. */
export const LANDSCAPE_REPLAY_SKIP_CODES = Object.freeze({
    alreadyRecorded: 'already-recorded', regionOutsideBounds: 'region-outside-bounds', gradeEndpointOutsideBounds: 'grade-endpoint-outside-bounds',
    smoothRadiusInvalid: 'smooth-radius-invalid', unknownSoil: 'unknown-soil', regionUnavailable: 'region-unavailable', invalid: 'invalid'
});

const boundsText = bounds => `[${bounds.minX}..${bounds.maxX}] × [${bounds.minZ}..${bounds.maxZ}]`;
const inside = (bounds, world) => bounds.minX >= world.minX && bounds.maxX <= world.maxX && bounds.minZ >= world.minZ && bounds.maxZ <= world.maxZ;

/**
 * Reconstructs the accepted batches of a manifest's authoring history in acceptance order: the batches of `editHistory.batchIds` that still
 * own operation records (a reverted batch keeps only its tombstone). Named regions carry no batch identity in the manifest; they are listed in
 * batch order, so each is attributed to the latest batch consistent with that order and with the first operation that references it.
 * @param {any} manifest a validated landscape manifest
 * @returns {{accepted:Array<{id:string,operations:any[],regions:any[]}>,tombstones:string[]}}
 */
export function collectAcceptedLandscapeBatches(manifest) {
    const history = manifest.editHistory?.batchIds ?? [], operations = manifest.operations ?? [], regions = manifest.regions ?? [];
    const byBatch = new Map();
    for (const [index, record] of operations.entries()) {
        if (record.sequence !== index) throw new Error(`[LandscapeReplay] Operation ${record.id} has sequence ${record.sequence} at position ${index}; the history is inconsistent`);
        if (!history.includes(record.batchId)) throw new Error(`[LandscapeReplay] Operation ${record.id} belongs to batch ${record.batchId}, which the history does not record`);
        if (!byBatch.has(record.batchId)) byBatch.set(record.batchId, []);
        byBatch.get(record.batchId).push(record);
    }
    const accepted = history.filter(id => byBatch.has(id)).map(id => ({ id, operations: byBatch.get(id), regions: [] }));
    for (let index = 1; index < accepted.length; index++) {
        if (accepted[index].operations[0].sequence < accepted[index - 1].operations[0].sequence) throw new Error('[LandscapeReplay] Batch acceptance order disagrees with the operation sequence');
    }
    if (regions.length && !accepted.length) throw new Error('[LandscapeReplay] Named regions exist without any accepted batch; the history is inconsistent');
    const firstReference = new Map();
    for (const [index, batch] of accepted.entries()) for (const operation of batch.operations) {
        if (operation.regionId !== undefined && !firstReference.has(operation.regionId)) firstReference.set(operation.regionId, index);
    }
    let latest = accepted.length - 1;
    for (let index = regions.length - 1; index >= 0; index--) {
        const region = regions[index], bound = firstReference.get(region.id);
        if (bound !== undefined && bound < latest) latest = bound;
        accepted[latest].regions.unshift(region);
    }
    return { accepted, tombstones: history.filter(id => !byBatch.has(id)) };
}

/**
 * Builds the batch document that re-applies one accepted batch to the target: the same batch and operation ids, world geometry, parameters,
 * named regions and any notes the records carry, bound to the target landscape/revision, with a `replayedFrom` provenance on every operation
 * (a record replayed more than once keeps the chain of its earlier provenance). An operation the author bound to a named region is replayed
 * as that reference (validation resolves the geometry again, and the batch stays within the admission the original respected); its persisted
 * inline geometry is kept only when the target already holds a region of that id with other geometry, so the conflict is reported instead
 * of silently adopting the target's shape.
 * @param {{id:string,operations:any[],regions:any[]}} batch @param {{landscapeId:string,revision:string,manifestSha256:string}} previous
 * @param {{landscapeId:string,revision:string,regions?:readonly any[]}} target
 */
export function createReplayBatch(batch, previous, target) {
    const known = new Map([...(target.regions ?? []), ...batch.regions].map(region => [region.id, region.region]));
    const operations = batch.operations.map(record => {
        const { batchId, sequence, replayedFrom, ...operation } = structuredClone(record);
        if (operation.regionId !== undefined && operation.region !== undefined && known.has(operation.regionId) && landscapeRegionsEqual(known.get(operation.regionId), operation.region)) delete operation.region;
        return { ...operation, replayedFrom: { landscapeId: previous.landscapeId, revision: previous.revision, manifestSha256: previous.manifestSha256, batchId, sequence,
            ...(replayedFrom ? { replayedFrom } : {}) } };
    });
    return { format: 'landscape-edit-batch', schemaVersion: 1, id: batch.id, landscapeId: target.landscapeId, expectedRevision: target.revision,
        ...(batch.regions.length ? { regions: structuredClone(batch.regions) } : {}), operations };
}

/**
 * Explains why a batch cannot be replayed onto the target terrain, or returns null when it validates. The explicit checks name the terrain
 * change that invalidates the batch; the domain validator is the final word.
 * @param {any} manifest the target manifest @param {any} batch the replay batch @param {Map<string,string>} skippedRegions named regions lost with skipped batches
 */
export function explainReplaySkip(manifest, batch, skippedRegions = new Map()) {
    const world = manifest.bounds, codes = LANDSCAPE_REPLAY_SKIP_CODES;
    if ((manifest.editHistory?.batchIds ?? []).includes(batch.id)) return { code: codes.alreadyRecorded, reason: `batch ${batch.id} is already recorded in the target history (accepted or reverted)` };
    const available = new Set([...(manifest.regions ?? []).map(region => region.id), ...(batch.regions ?? []).map(region => region.id)]);
    for (const region of batch.regions ?? []) {
        const bounds = landscapeRegionBounds(region.region);
        if (!inside(bounds, world)) return { code: codes.regionOutsideBounds, reason: `named region ${region.id} ${boundsText(bounds)} lies outside the target bounds ${boundsText(world)}` };
    }
    for (const operation of batch.operations) {
        if (operation.regionId !== undefined && !available.has(operation.regionId)) {
            const lost = skippedRegions.get(operation.regionId);
            return { code: codes.regionUnavailable, reason: `operation ${operation.id} references named region ${operation.regionId}, which ${lost ? `skipped batch ${lost} would have introduced` : 'the target does not retain'}` };
        }
        if (operation.region !== undefined) {
            const bounds = landscapeRegionBounds(operation.region);
            if (!inside(bounds, world)) return { code: codes.regionOutsideBounds, reason: `operation ${operation.id} region ${boundsText(bounds)} lies outside the target bounds ${boundsText(world)}` };
        }
        if (operation.type === 'grade') for (const [name, point] of [['start', operation.start], ['end', operation.end]]) {
            if (!(point && point.x >= world.minX && point.x <= world.maxX && point.z >= world.minZ && point.z <= world.maxZ)) return { code: codes.gradeEndpointOutsideBounds, reason: `operation ${operation.id} grade ${name} (${point?.x}, ${point?.z}) lies outside the target bounds ${boundsText(world)}` };
        }
        if (operation.type === 'smooth') for (const spacing of [manifest.grid.spacingX, manifest.grid.spacingZ]) {
            const samples = Math.floor(operation.radiusMeters / spacing), limit = landscapeSmoothRadiusSampleLimit(spacing);
            if (!(samples >= 1 && samples <= limit)) return { code: codes.smoothRadiusInvalid, reason: `operation ${operation.id} smooth radius ${operation.radiusMeters} m spans ${samples} native samples at ${spacing} m spacing; 1..${limit} are valid (at most ${limit * spacing} m)` };
        }
        if (operation.type === 'assign-soil' && !manifest.soil.catalog.some(entry => entry.id === operation.soilId)) return { code: codes.unknownSoil, reason: `operation ${operation.id} assigns soil ${operation.soilId}, which the target catalog does not define` };
    }
    try { validateLandscapeEditBatch(manifest, batch); }
    catch (error) { return { code: codes.invalid, reason: /** @type {Error} */ (error).message }; }
    return null;
}

/**
 * Re-applies the accepted batches of the previous landscape (its current manifest history) to the target landscape directory through the
 * authoring store's bounded apply, in acceptance order. Each replayed batch publishes a new target revision; a skipped batch leaves the
 * target unchanged and is reported with its reason. Any other failure aborts after the last published revision.
 * @param {{previousDirectory:string,directory:string,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function replayAcceptedBatches({ previousDirectory, directory, signal, log }) {
    signal?.throwIfAborted();
    if (typeof previousDirectory !== 'string' || !previousDirectory.trim() || typeof directory !== 'string' || !directory.trim()) throw new Error('[LandscapeReplay] previousDirectory and directory are required');
    const previousBase = path.resolve(previousDirectory), targetBase = path.resolve(directory);
    if (previousBase === targetBase) throw new Error('[LandscapeReplay] The previous landscape and the target must be different directories');
    const previousRead = await readLandscapeFileManifest(previousBase, 'manifest.json', { signal });
    const previous = { directory: previousBase, landscapeId: previousRead.manifest.id, revision: previousRead.manifest.revision, manifestSha256: authoringHash(previousRead.bytes) };
    const { accepted, tombstones } = collectAcceptedLandscapeBatches(previousRead.manifest);
    const store = createLandscapeAuthoringStore({ directory: targetBase });
    const start = await store.readState();
    const replayed = [], skipped = [], revisions = [start.revision], skippedRegions = new Map();
    log?.(`[LandscapeReplay] ${accepted.length} accepted batch${accepted.length === 1 ? '' : 'es'} (${tombstones.length} reverted) of ${previous.landscapeId} ${previous.revision} -> ${start.landscapeId} ${start.revision}`);
    for (const batch of accepted) {
        signal?.throwIfAborted();
        const state = await store.readState();
        const manifest = (await readLandscapeFileManifest(targetBase, 'manifest.json', { signal })).manifest;
        const document = createReplayBatch(batch, previous, { landscapeId: state.landscapeId, revision: state.revision, regions: manifest.regions });
        const skip = explainReplaySkip(manifest, document, skippedRegions);
        if (skip) {
            for (const region of batch.regions) skippedRegions.set(region.id, batch.id);
            skipped.push({ batchId: batch.id, code: skip.code, reason: skip.reason, operations: batch.operations.length, regions: batch.regions.map(region => region.id) });
            log?.(`[LandscapeReplay] skipped ${batch.id}: ${skip.reason}`);
            continue;
        }
        const started = performance.now();
        const applied = await store.apply(document, { signal });
        const seconds = (performance.now() - started) / 1000;
        replayed.push({ batchId: batch.id, beforeRevision: applied.beforeRevision, revision: applied.revision, operations: batch.operations.length, regions: batch.regions.map(region => region.id),
            channels: applied.summary.channels, changedNativeIds: applied.summary.changedNativeIds, changedAncestorIds: applied.summary.changedAncestorIds,
            changedVertexOccurrences: applied.summary.changedVertexOccurrences, heightDeltaRange: applied.summary.heightDeltaRange, seconds });
        revisions.push(applied.revision);
        log?.(`[LandscapeReplay] replayed ${batch.id} -> ${applied.revision} (${applied.summary.changedNativeIds.length} natives, ${applied.summary.changedAncestorIds.length} ancestors, ${seconds.toFixed(2)} s)`);
    }
    const end = await store.readState();
    return Object.freeze({ format: LANDSCAPE_REPLAY_FORMAT, schemaVersion: 1,
        previous: { ...previous, batchIds: [...(previousRead.manifest.editHistory?.batchIds ?? [])], accepted: accepted.map(batch => batch.id), tombstones },
        target: { directory: targetBase, landscapeId: end.landscapeId, startRevision: start.revision, revision: end.revision },
        replayed, skipped, revisions });
}
