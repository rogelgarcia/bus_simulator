// Authenticates a saved candidate and its shared samples with a constant two-chunk working set.
// @ts-check
import { createLandscapeChunkId, validateLandscapeManifest } from '../../src/app/landscape/index.js';
import { readLandscapeFileChunk } from './LandscapeFileIO.mjs';

function sameSample(a, aIndex, b, bIndex, label) {
    if (!Object.is(a.heights[aIndex], b.heights[bIndex]) || a.landCover[aIndex] !== b.landCover[bIndex]) throw new Error(`[LandscapeAuthoring] Candidate ${label} mismatch: ${a.descriptor.id} / ${b.descriptor.id}`);
}

function compareEdge(a, b, direction) {
    const count = direction === 'east' ? a.descriptor.rows : a.descriptor.columns;
    for (let index = 0; index < count; index++) {
        const aIndex = direction === 'east' ? index * a.descriptor.columns + a.descriptor.columns - 1 : (a.descriptor.rows - 1) * a.descriptor.columns + index;
        const bIndex = direction === 'east' ? index * b.descriptor.columns : index;
        sameSample(a, aIndex, b, bIndex, `${direction} seam`);
    }
}

function compareParent(child, parent) {
    const c = child.descriptor, p = parent.descriptor;
    if (p.minHeight > c.minHeight || p.maxHeight < c.maxHeight) throw new Error(`[LandscapeAuthoring] Candidate parent envelope excludes ${c.id}`);
    for (let row = 0; row < c.rows; row++) for (let column = 0; column < c.columns; column++) {
        const x = c.startColumn + column * c.sampleStride - p.startColumn;
        const z = c.startRow + row * c.sampleStride - p.startRow;
        if (x % p.sampleStride || z % p.sampleStride) continue;
        sameSample(child, row * c.columns + column, parent, z / p.sampleStride * p.columns + x / p.sampleStride, 'aligned parent sample');
    }
}

/** @param {string} directory @param {any} input @param {{maxWorkingBytes:number,signal?:AbortSignal,onProgress?:(event:any)=>unknown}} options */
export async function validateLandscapePublication(directory, input, { maxWorkingBytes, signal, onProgress }) {
    signal?.throwIfAborted();
    const manifest = validateLandscapeManifest(input), byId = new Map(manifest.chunks.map(chunk => [chunk.id, chunk]));
    const largestSamples = Math.max(...manifest.chunks.map(chunk => chunk.columns * chunk.rows));
    const workingBytes = largestSamples * 18 + 2;
    if (!Number.isSafeInteger(maxWorkingBytes) || maxWorkingBytes < workingBytes) throw new Error(`[LandscapeAuthoring] Candidate validation needs ${workingBytes} working bytes; limit is ${maxWorkingBytes}`);
    let reads = 0, decodedBytesRead = 0, seams = 0, parentPairs = 0;
    async function read(id) {
        signal?.throwIfAborted();
        const chunk = await readLandscapeFileChunk(directory, manifest, id, { signal });
        reads++; decodedBytesRead += chunk.heights.byteLength + chunk.landCover.byteLength;
        return chunk;
    }
    for (let index = 0; index < manifest.chunks.length; index++) {
        const descriptor = manifest.chunks[index], chunk = await read(descriptor.id);
        if (descriptor.level === manifest.grid.maxLevel) {
            let min = Infinity, max = -Infinity;
            for (const height of chunk.heights) { min = Math.min(min, height); max = Math.max(max, height); }
            if (min !== descriptor.minHeight || max !== descriptor.maxHeight) throw new Error(`[LandscapeAuthoring] Candidate native envelope is not exact: ${descriptor.id}`);
        }
        for (const [direction, column, row] of [['east', descriptor.column + 1, descriptor.row], ['south', descriptor.column, descriptor.row + 1]]) {
            if (column >= 2 ** descriptor.level || row >= 2 ** descriptor.level) continue;
            const neighborId = createLandscapeChunkId(descriptor.level, column, row);
            if (!byId.has(neighborId)) continue;
            const neighbor = await read(neighborId);
            compareEdge(chunk, neighbor, direction); seams++;
        }
        if (descriptor.parentId) {
            const parent = await read(descriptor.parentId);
            compareParent(chunk, parent); parentPairs++;
        }
        await onProgress?.(Object.freeze({ type: 'candidate-validated', chunkId: descriptor.id, completed: index + 1,
            total: manifest.chunks.length, workingBytes, workingByteLimit: maxWorkingBytes }));
        signal?.throwIfAborted();
    }
    return Object.freeze({ chunks: manifest.chunks.length, reads, decodedBytesRead, seams, parentPairs, workingBytes, workingByteLimit: maxWorkingBytes });
}
