// Evaluates bounded native edits and prepares unpublished source and affected-ancestor replacements.
// @ts-check
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { LANDSCAPE_EDIT_CAPABILITY, validateLandscapeEditBatch } from './LandscapeEditSchema.js';
import { LANDSCAPE_MAX_NATIVE_CHUNKS, LANDSCAPE_QUERY_BYTE_LIMIT, planLandscapeRegion, validateAcquiredLandscapeChunk, validateLandscapeNativeSeams } from './LandscapeAcquisition.js';
import { landscapeRegionBounds, landscapeRegionWeight } from './LandscapeRegions.js';
import { clonePlainData, freezeData, requireCondition, requireId } from './internal/LandscapeValidation.js';
import { landscapeAffectedAncestors, rebuildLandscapeAncestors } from './LandscapeAncestorUpdates.js';

export const LANDSCAPE_EDIT_WORKING_BYTE_LIMIT = 8 * 1024 * 1024;

function extrema(values) {
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
    return { min, max };
}

function combinedBounds(regions) {
    const bounds = regions.map(landscapeRegionBounds);
    return {
        minX: Math.min(...bounds.map((entry) => entry.minX)), maxX: Math.max(...bounds.map((entry) => entry.maxX)),
        minZ: Math.min(...bounds.map((entry) => entry.minZ)), maxZ: Math.max(...bounds.map((entry) => entry.maxZ))
    };
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} input @param {unknown} batchInput @param {import('./LandscapeAcquisition.js').LandscapeAcquisitionOptions & {newRevision:string}} options @returns {Promise<object>} */
export async function applyLandscapeEditBatch(input, batchInput, { readChunk, newRevision, signal, maxNativeChunks = LANDSCAPE_MAX_NATIVE_CHUNKS, maxDecodedBytes = LANDSCAPE_QUERY_BYTE_LIMIT }) {
    const manifest = validateLandscapeManifest(input);
    const batch = validateLandscapeEditBatch(manifest, batchInput);
    requireId(newRevision, 'newRevision');
    requireCondition(newRevision !== manifest.revision, 'newRevision must differ from the expected input revision');
    requireCondition(typeof readChunk === 'function', 'readChunk is required');
    const chunkIds = new Set();
    for (const operation of batch.operations) {
        const plan = planLandscapeRegion(manifest, operation.region, { maxNativeChunks, maxDecodedBytes });
        requireCondition(plan.status === 'ready', `operation ${operation.id} has unavailable native coverage`);
        for (const id of plan.chunkIds) chunkIds.add(id);
    }
    requireCondition(chunkIds.size <= maxNativeChunks, `edit batch needs ${chunkIds.size} native chunks; D2 limit is ${maxNativeChunks}; split or reduce the footprint`);
    const hasHeightOperation = batch.operations.some((operation) => operation.type !== 'assign-soil');
    const hasSoilOperation = batch.operations.some((operation) => operation.type === 'assign-soil');
    const descriptors = [...chunkIds].map((id) => manifest.chunks.find((chunk) => chunk.id === id));
    const inputBytes = descriptors.reduce((sum, chunk) => sum + chunk.channels.height.decodedByteLength + chunk.channels.landCover.decodedByteLength, 0);
    requireCondition(inputBytes <= maxDecodedBytes, `edit batch needs ${inputBytes} decoded bytes; budget ${maxDecodedBytes}`);
    const copiedBytes = hasHeightOperation ? descriptors.reduce((sum, chunk) => sum + chunk.channels.height.decodedByteLength, 0) : 0;
    const ancestors = hasHeightOperation ? landscapeAffectedAncestors(manifest, descriptors) : [];
    const ancestorBytes = ancestors.reduce((sum, chunk) => sum + chunk.channels.height.decodedByteLength + chunk.channels.landCover.decodedByteLength, 0)
        + Math.max(0, ...ancestors.map(chunk => chunk.channels.height.decodedByteLength));
    const largestChannel = Math.max(...descriptors.map((chunk) => chunk.channels.height.byteLength));
    const workingBytes = inputBytes + copiedBytes + ancestorBytes + largestChannel * 3;
    requireCondition(workingBytes <= LANDSCAPE_EDIT_WORKING_BYTE_LIMIT, `edit working buffers need ${workingBytes} bytes; budget ${LANDSCAPE_EDIT_WORKING_BYTE_LIMIT}`);
    const sourceChunks = [];
    for (const id of chunkIds) {
        signal?.throwIfAborted();
        const chunk = await readChunk(id, { signal });
        signal?.throwIfAborted();
        validateAcquiredLandscapeChunk(manifest, chunk);
        sourceChunks.push(chunk);
    }
    validateLandscapeNativeSeams(sourceChunks);
    const manifestDraft = clonePlainData(manifest);
    manifestDraft.revision = newRevision;
    const draftById = new Map(manifestDraft.chunks.map((chunk) => [chunk.id, chunk]));
    const changedChunks = [];
    let maxNativeDelta = 0;
    let changedVertexOccurrences = 0;
    for (const source of sourceChunks) {
        signal?.throwIfAborted();
        if (!hasHeightOperation) continue;
        const descriptor = draftById.get(source.descriptor.id);
        const heights = source.heights.slice();
        let changed = false;
        for (let row = 0; row < descriptor.rows; row++) for (let column = 0; column < descriptor.columns; column++) {
            const i = row * descriptor.columns + column;
            const x = manifest.bounds.minX + (descriptor.startColumn + column) * manifest.grid.spacingX;
            const z = manifest.bounds.maxZ - (descriptor.startRow + row) * manifest.grid.spacingZ;
            for (const operation of batch.operations) {
                if (operation.type === 'assign-soil') continue;
                const weight = landscapeRegionWeight(operation.region, operation.falloff, x, z);
                if (weight === 0) continue;
                const value = operation.type === 'raise' ? heights[i] + operation.deltaMeters * weight
                    : weight === 1 ? operation.heightMeters : heights[i] + (operation.heightMeters - heights[i]) * weight;
                heights[i] = Math.fround(value);
                requireCondition(Number.isFinite(heights[i]), `operation ${operation.id} creates nonfinite elevation in ${descriptor.id}`);
            }
            if (!Object.is(heights[i], source.heights[i])) {
                changed = true;
                changedVertexOccurrences++;
                maxNativeDelta = Math.max(maxNativeDelta, Math.abs(heights[i] - source.heights[i]));
            }
        }
        if (!changed) continue;
        const range = extrema(heights);
        descriptor.minHeight = range.min;
        descriptor.maxHeight = range.max;
        descriptor.revision = newRevision;
        changedChunks.push(Object.freeze({ descriptor, heights, landCover: source.landCover }));
    }
    validateLandscapeNativeSeams(sourceChunks.map((chunk) => changedChunks.find((changed) => changed.descriptor.id === chunk.descriptor.id) ?? chunk));
    const changedNativeIds = changedChunks.map((chunk) => chunk.descriptor.id);
    const changedAncestors = await rebuildLandscapeAncestors(manifest, manifestDraft, changedChunks, { readChunk, newRevision, maxNativeDelta, signal });
    changedChunks.push(...changedAncestors);
    if (!manifestDraft.capabilities.includes(LANDSCAPE_EDIT_CAPABILITY)) manifestDraft.capabilities.push(LANDSCAPE_EDIT_CAPABILITY);
    for (const operation of batch.operations) {
        const record = { ...clonePlainData(operation), batchId: batch.id, sequence: manifestDraft.operations.length };
        manifestDraft.operations.push(record);
        if (operation.type === 'assign-soil') manifestDraft.soil.overrides.push({ id: record.id, batchId: batch.id, sequence: record.sequence, soilId: record.soilId, region: clonePlainData(record.region) });
    }
    manifestDraft.editHistory = {
        batchIds: [...(manifest.editHistory?.batchIds ?? []), batch.id],
        lastBatchId: batch.id, previousManifestUrl: null
    };
    const allNative = manifestDraft.chunks.filter((chunk) => chunk.level === manifest.grid.maxLevel);
    const summary = freezeData({
        batchId: batch.id, beforeRevision: manifest.revision, revision: newRevision,
        affectedBounds: combinedBounds(batch.operations.map((operation) => operation.region)),
        channels: [...(changedNativeIds.length ? ['height'] : []), ...(hasSoilOperation ? ['soil'] : [])],
        changedChunkIds: changedChunks.map((chunk) => chunk.descriptor.id), changedNativeIds, changedAncestorIds: changedAncestors.map(chunk => chunk.descriptor.id),
        changedVertexOccurrences, maxNativeDelta,
        minHeight: Math.min(...allNative.map((chunk) => chunk.minHeight)), maxHeight: Math.max(...allNative.map((chunk) => chunk.maxHeight)),
        acquiredNativeChunkIds: [...chunkIds], workingBytes, workingByteLimit: LANDSCAPE_EDIT_WORKING_BYTE_LIMIT,
        overviewErrorIsConservative: changedNativeIds.length > 0 && manifest.grid.maxLevel > 0
    });
    return Object.freeze({ manifestDraft, changedChunks: Object.freeze(changedChunks), summary });
}
