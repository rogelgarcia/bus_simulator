// Rebuilds affected prepared ancestors directly from changed native samples while preserving unrelated resources.
// @ts-check
import { validateAcquiredLandscapeChunk } from './LandscapeAcquisition.js';
import { requireCondition } from './internal/LandscapeValidation.js';

/** @param {any} manifest @param {any[]} nativeDescriptors */
export function landscapeAffectedAncestors(manifest, nativeDescriptors) {
    const byId = new Map(manifest.chunks.map(chunk => [chunk.id, chunk])), ancestors = new Set();
    for (const native of nativeDescriptors) {
        let node = native;
        while (node.parentId) { ancestors.add(node.parentId); node = byId.get(node.parentId); }
    }
    return [...ancestors].map(id => byId.get(id)).sort((a, b) => b.level - a.level || a.row - b.row || a.column - b.column);
}

/** @param {any} manifest @param {any} draft @param {any[]} changedNative @param {{readChunk:Function,newRevision:string,maxNativeDelta:number,signal?:AbortSignal}} options */
export async function rebuildLandscapeAncestors(manifest, draft, changedNative, { readChunk, newRevision, maxNativeDelta, signal }) {
    const updated = [], draftById = new Map(draft.chunks.map(chunk => [chunk.id, chunk]));
    for (const original of landscapeAffectedAncestors(manifest, changedNative.map(chunk => chunk.descriptor))) {
        signal?.throwIfAborted();
        const source = await readChunk(original.id, { signal });
        signal?.throwIfAborted();
        validateAcquiredLandscapeChunk(manifest, source, { nativeOnly: false });
        const descriptor = draftById.get(original.id), heights = source.heights.slice();
        for (const changed of changedNative) {
            const native = changed.descriptor;
            for (let row = 0; row < native.rows; row++) {
                const localRow = native.startRow + row - descriptor.startRow;
                if (localRow < 0 || localRow > (descriptor.rows - 1) * descriptor.sampleStride || localRow % descriptor.sampleStride) continue;
                for (let column = 0; column < native.columns; column++) {
                    const localColumn = native.startColumn + column - descriptor.startColumn;
                    if (localColumn < 0 || localColumn > (descriptor.columns - 1) * descriptor.sampleStride || localColumn % descriptor.sampleStride) continue;
                    heights[localRow / descriptor.sampleStride * descriptor.columns + localColumn / descriptor.sampleStride] = changed.heights[row * native.columns + column];
                }
            }
        }
        let maximumDelta = 0;
        for (let index = 0; index < heights.length; index++) maximumDelta = Math.max(maximumDelta, Math.abs(heights[index] - source.heights[index]));
        const ratio = 2 ** (manifest.grid.maxLevel - descriptor.level);
        const descendants = draft.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel
            && Math.floor(chunk.column / ratio) === descriptor.column && Math.floor(chunk.row / ratio) === descriptor.row);
        descriptor.minHeight = Math.min(...descendants.map(chunk => chunk.minHeight));
        descriptor.maxHeight = Math.max(...descendants.map(chunk => chunk.maxHeight));
        descriptor.geometricError = original.geometricError + maxNativeDelta + maximumDelta;
        requireCondition(Number.isFinite(descriptor.geometricError), `edited ancestor ${descriptor.id} error is nonfinite`);
        descriptor.revision = newRevision;
        updated.push(Object.freeze({ descriptor, heights, landCover: source.landCover }));
    }
    if (updated.length && draft.hierarchy) draft.hierarchy.errorPolicy = 'conservative-after-edit';
    return updated;
}
