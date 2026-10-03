// Stages arbitrarily large edit footprints as bounded units and returns one unpublished manifest revision.
// @ts-check
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { LANDSCAPE_EDIT_CAPABILITY, LANDSCAPE_ADVANCED_EDIT_CAPABILITY, validateLandscapeEditBatch } from './LandscapeEditSchema.js';
import { landscapeRegionBounds, landscapeRegionIntersectsBounds } from './LandscapeRegions.js';
import { validateLandscapeNativeSeams } from './LandscapeAcquisition.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId } from './internal/LandscapeValidation.js';
import { evaluateLandscapeNativeUnit, readLandscapeEditChunk } from './internal/LandscapeEditWorkUnit.js';
import { rebuildLandscapeAncestorsStreamed } from './internal/LandscapeStreamedAncestors.js';

export const LANDSCAPE_STREAMED_EDIT_WORKING_BYTE_LIMIT = 8 * 1024 * 1024;

/**
 * @typedef {object} LandscapeStreamedEditOptions
 * @property {(id:string,options:{descriptor:any,signal?:AbortSignal})=>Promise<any>} readChunk Reads the exact supplied immutable descriptor without retaining earlier decoded units.
 * @property {(chunk:{descriptor:any,heights:Float32Array,landCover:Uint8Array},progress:object)=>Promise<any>} stageChunk Persists height before resolving its channel descriptor; must not retain sample buffers.
 * @property {string} newRevision
 * @property {AbortSignal} [signal]
 * @property {number} [maxWorkingBytes]
 * @property {'forward'|'reverse'} [chunkOrder] Reverses independent work visitation without changing evaluation order.
 */

function workingBuffers(manifest, batch) {
    const n = manifest.grid.chunkIntervals + 1, samples = n * n;
    let radiusX = 1, radiusZ = 1, smooth = false;
    for (const operation of batch.operations) if (operation.type === 'smooth') {
        radiusX = Math.max(radiusX, Math.floor(operation.radiusMeters / manifest.grid.spacingX));
        radiusZ = Math.max(radiusZ, Math.floor(operation.radiusMeters / manifest.grid.spacingZ)); smooth = true;
    }
    const haloSamples = (n + radiusX * 2) * (n + radiusZ * 2);
    const buffers = {
        nativeHaloBytes: haloSamples * 5,
        smoothingScratchBytes: smooth ? (n + radiusZ * 2) * n * 8 : 0,
        outputHeightBytes: samples * 4, retainedCoverBytes: samples,
        sourceDecodeBytes: samples * 5, callbackStagingBytes: samples * 4 * 3,
        ancestorBytes: samples * 27,
        haloRadiusSamples: { x: radiusX, z: radiusZ }
    };
    return { ...buffers, total: Math.max(buffers.ancestorBytes, buffers.nativeHaloBytes + buffers.smoothingScratchBytes
        + buffers.outputHeightBytes + buffers.retainedCoverBytes + buffers.sourceDecodeBytes + buffers.callbackStagingBytes) };
}

function affectedBounds(operations) {
    const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const operation of operations) {
        const value = landscapeRegionBounds(operation.region);
        bounds.minX = Math.min(bounds.minX, value.minX); bounds.maxX = Math.max(bounds.maxX, value.maxX);
        bounds.minZ = Math.min(bounds.minZ, value.minZ); bounds.maxZ = Math.max(bounds.maxZ, value.maxZ);
    }
    return bounds;
}

async function nativeImpact(context, current) {
    const native = context.manifest.chunks.filter(chunk => chunk.level === context.manifest.grid.maxLevel);
    const ids = [], delta = { min: Infinity, max: -Infinity }, before = { min: Infinity, max: -Infinity }, after = { min: Infinity, max: -Infinity };
    const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    let changedVertexOccurrences = 0;
    for (const original of native) {
        const descriptor = current.get(original.id);
        if (descriptor === original) continue;
        if (descriptor.channels.height.sha256 === original.channels.height.sha256) { current.set(original.id, original); continue; }
        const source = await readLandscapeEditChunk(context, original), edited = await readLandscapeEditChunk(context, descriptor);
        let changed = false;
        for (let i = 0; i < source.heights.length; i++) {
            const a = source.heights[i], b = edited.heights[i];
            if (Object.is(a, b)) continue;
            changed = true; changedVertexOccurrences++;
            delta.min = Math.min(delta.min, b - a); delta.max = Math.max(delta.max, b - a);
            before.min = Math.min(before.min, a); before.max = Math.max(before.max, a);
            after.min = Math.min(after.min, b); after.max = Math.max(after.max, b);
            const x = context.manifest.bounds.minX + (original.startColumn + i % original.columns) * context.manifest.grid.spacingX;
            const z = context.manifest.bounds.maxZ - (original.startRow + Math.floor(i / original.columns)) * context.manifest.grid.spacingZ;
            bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
            bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
        }
        if (changed) ids.push(original.id); else current.set(original.id, original);
    }
    return { ids, changedVertexOccurrences, heightDeltaRange: ids.length ? delta : null, changedHeightRange: ids.length ? { before, after } : null,
        changedSampleBounds: ids.length ? bounds : null, maxNativeDelta: ids.length ? Math.max(Math.abs(delta.min), Math.abs(delta.max)) : 0 };
}

async function validateNativeBorders(context, current, ids) {
    const count = 2 ** context.manifest.grid.maxLevel;
    for (const id of ids) {
        const descriptor = current.get(id), chunk = await readLandscapeEditChunk(context, descriptor);
        for (let row = Math.max(0, descriptor.row - 1); row <= Math.min(count - 1, descriptor.row + 1); row++) {
            for (let column = Math.max(0, descriptor.column - 1); column <= Math.min(count - 1, descriptor.column + 1); column++) {
                const neighborId = `l${descriptor.level}/c${column}/r${row}`;
                if (neighborId === id) continue;
                const neighbor = await readLandscapeEditChunk(context, current.get(neighborId));
                validateLandscapeNativeSeams([chunk, neighbor]);
            }
        }
    }
}

function appendAuthoring(manifest, batch, current, revision) {
    const draft = clonePlainData(manifest);
    draft.revision = revision;
    draft.chunks = manifest.chunks.map(chunk => clonePlainData(current.get(chunk.id)));
    draft.regions.push(...clonePlainData(batch.regions ?? []));
    for (const capability of [LANDSCAPE_EDIT_CAPABILITY, LANDSCAPE_ADVANCED_EDIT_CAPABILITY]) if (!draft.capabilities.includes(capability)) draft.capabilities.push(capability);
    for (const operation of batch.operations) {
        const record = { ...clonePlainData(operation), batchId: batch.id, sequence: draft.operations.length };
        draft.operations.push(record);
        if (record.type === 'assign-soil') draft.soil.overrides.push({ id: record.id, batchId: batch.id, sequence: record.sequence, soilId: record.soilId, region: clonePlainData(record.region) });
    }
    draft.editHistory = { batchIds: [...(manifest.editHistory?.batchIds ?? []), batch.id], lastBatchId: batch.id, previousManifestUrl: null };
    return draft;
}

/** @param {any} input @param {unknown} batchInput @param {LandscapeStreamedEditOptions} options @returns {Promise<{manifestDraft:any,summary:any}>} */
export async function applyLandscapeEditBatchStreamed(input, batchInput, { readChunk, stageChunk, newRevision, signal, maxWorkingBytes = LANDSCAPE_STREAMED_EDIT_WORKING_BYTE_LIMIT, chunkOrder = 'forward' }) {
    const manifest = validateLandscapeManifest(input), batch = validateLandscapeEditBatch(manifest, batchInput);
    requireId(newRevision, 'newRevision');
    requireCondition(newRevision !== manifest.revision, 'newRevision must differ from the expected input revision');
    requireCondition(typeof readChunk === 'function' && typeof stageChunk === 'function', 'streamed editing requires descriptor-bound readChunk and persistent stageChunk callbacks');
    requireCondition(['forward', 'reverse'].includes(chunkOrder), 'chunkOrder must be forward or reverse');
    requireFinite(maxWorkingBytes, 'maxWorkingBytes');
    requireCondition(maxWorkingBytes > 0 && maxWorkingBytes <= LANDSCAPE_STREAMED_EDIT_WORKING_BYTE_LIMIT, 'streamed edit working budget must be positive and at most 8 MiB');
    const buffers = workingBuffers(manifest, batch);
    requireCondition(buffers.total <= maxWorkingBytes, `streamed edit working buffers need ${buffers.total} bytes; budget ${maxWorkingBytes}`);
    signal?.throwIfAborted();
    const context = { manifest, readChunk, stageChunk, newRevision, signal, maxWorkingBytes, workingBytes: buffers.total, acquiredNativeChunkIds: new Set(), readCount: 0 };
    let current = new Map(manifest.chunks.map(chunk => [chunk.id, chunk])), nativeWorkUnits = 0, haloReads = 0;
    for (const operation of batch.operations) {
        signal?.throwIfAborted();
        if (operation.type === 'assign-soil') continue;
        const snapshot = current, next = new Map(snapshot);
        const targets = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel && landscapeRegionIntersectsBounds(operation.region, chunk.bounds));
        targets.sort((a, b) => a.row - b.row || a.column - b.column);
        if (chunkOrder === 'reverse') targets.reverse();
        for (const [index, target] of targets.entries()) {
            const result = await evaluateLandscapeNativeUnit(context, snapshot, snapshot.get(target.id), operation,
                { phase: 'native', operationId: operation.id, completed: index + 1, total: targets.length });
            next.set(target.id, result.descriptor); nativeWorkUnits++; haloReads += result.haloReads;
        }
        current = next;
    }
    const impact = await nativeImpact(context, current);
    await validateNativeBorders(context, current, impact.ids);
    const ancestorIds = await rebuildLandscapeAncestorsStreamed(context, current, impact.ids, impact.maxNativeDelta);
    const manifestDraft = appendAuthoring(manifest, batch, current, newRevision);
    if (ancestorIds.length && manifestDraft.hierarchy) manifestDraft.hierarchy.errorPolicy = 'conservative-after-edit';
    let minHeight = Infinity, maxHeight = -Infinity;
    for (const descriptor of current.values()) if (descriptor.level === manifest.grid.maxLevel) {
        minHeight = Math.min(minHeight, descriptor.minHeight); maxHeight = Math.max(maxHeight, descriptor.maxHeight);
    }
    signal?.throwIfAborted();
    const summary = freezeData({ batchId: batch.id, beforeRevision: manifest.revision, revision: newRevision,
        affectedBounds: affectedBounds(batch.operations), changedSampleBounds: impact.changedSampleBounds,
        channels: [...(impact.ids.length ? ['height'] : []), ...(batch.operations.some(operation => operation.type === 'assign-soil') ? ['soil'] : [])],
        regionIds: [...new Set([...(batch.regions ?? []).map(region => region.id), ...batch.operations.map(operation => operation.regionId).filter(Boolean)])],
        changedChunkIds: [...impact.ids, ...ancestorIds], changedNativeIds: impact.ids, changedAncestorIds: ancestorIds,
        heightDeltaRange: impact.heightDeltaRange, changedHeightRange: impact.changedHeightRange, maxNativeDelta: impact.maxNativeDelta,
        changedVertexOccurrences: impact.changedVertexOccurrences, minHeight, maxHeight,
        acquiredNativeChunkIds: [...context.acquiredNativeChunkIds].sort(), readCount: context.readCount, nativeWorkUnits, haloReads,
        workingBytes: buffers.total, workingByteLimit: maxWorkingBytes, workingBuffers: buffers, maxSimultaneousDecodedChunks: 2,
        overviewErrorIsConservative: ancestorIds.length > 0 });
    return Object.freeze({ manifestDraft, summary });
}
