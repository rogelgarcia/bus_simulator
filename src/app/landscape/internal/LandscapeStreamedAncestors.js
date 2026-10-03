// Rebuilds one affected ancestor at a time from immutable immediate-child payloads.
// @ts-check
import { landscapeAffectedAncestors } from '../LandscapeAncestorUpdates.js';
import { clonePlainData, freezeData, requireCondition } from './LandscapeValidation.js';
import { readLandscapeEditChunk, stageLandscapeEditChunk } from './LandscapeEditWorkUnit.js';

async function rebuildAncestor(context, current, original, children, maxNativeDelta, progress) {
    const source = await readLandscapeEditChunk(context, original);
    const heights = source.heights.slice(), seen = new Uint8Array(heights.length);
    let minHeight = Infinity, maxHeight = -Infinity;
    for (const childId of children) {
        const child = await readLandscapeEditChunk(context, current.get(childId));
        const descriptor = child.descriptor;
        minHeight = Math.min(minHeight, descriptor.minHeight); maxHeight = Math.max(maxHeight, descriptor.maxHeight);
        for (let row = 0; row < descriptor.rows; row++) {
            const worldRow = descriptor.startRow + row * descriptor.sampleStride - original.startRow;
            if (worldRow % original.sampleStride) continue;
            for (let column = 0; column < descriptor.columns; column++) {
                const worldColumn = descriptor.startColumn + column * descriptor.sampleStride - original.startColumn;
                if (worldColumn % original.sampleStride) continue;
                const i = worldRow / original.sampleStride * original.columns + worldColumn / original.sampleStride;
                const value = child.heights[row * descriptor.columns + column];
                requireCondition(!seen[i] || Object.is(heights[i], value), `derived child seam mismatch rebuilding ${original.id}`);
                heights[i] = value; seen[i] = 1;
            }
        }
    }
    requireCondition(seen.every(value => value === 1), `incomplete child sample coverage rebuilding ${original.id}`);
    let maximumDelta = 0, payloadChanged = false;
    for (let i = 0; i < heights.length; i++) {
        maximumDelta = Math.max(maximumDelta, Math.abs(heights[i] - source.heights[i]));
        payloadChanged ||= !Object.is(heights[i], source.heights[i]);
    }
    const descriptor = { ...clonePlainData(original), minHeight, maxHeight, revision: context.newRevision,
        geometricError: original.geometricError + maxNativeDelta + maximumDelta };
    requireCondition(Number.isFinite(descriptor.geometricError), `edited ancestor ${original.id} error is nonfinite`);
    return payloadChanged ? stageLandscapeEditChunk(context, { descriptor, heights, landCover: source.landCover }, progress) : freezeData(descriptor);
}

export async function rebuildLandscapeAncestorsStreamed(context, current, nativeIds, maxNativeDelta) {
    const ancestors = landscapeAffectedAncestors(context.manifest, nativeIds.map(id => current.get(id)));
    const children = new Map(context.manifest.chunks.map(chunk => [chunk.id, []]));
    for (const chunk of context.manifest.chunks) if (chunk.parentId) children.get(chunk.parentId).push(chunk.id);
    for (const [index, original] of ancestors.entries()) {
        const descriptor = await rebuildAncestor(context, current, original, children.get(original.id), maxNativeDelta,
            { phase: 'ancestor', operationId: null, completed: index + 1, total: ancestors.length });
        current.set(original.id, descriptor);
    }
    return ancestors.map(chunk => chunk.id);
}
