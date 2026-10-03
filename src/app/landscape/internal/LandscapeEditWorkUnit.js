// Evaluates one native operation against an immutable descriptor snapshot and explicit neighbor halo.
// @ts-check
import { validateAcquiredLandscapeChunk } from '../LandscapeAcquisition.js';
import { landscapeRegionWeight } from '../LandscapeRegions.js';
import { clonePlainData, freezeData, requireCondition, requireId, requireRelativeUrl, requireSha256 } from './LandscapeValidation.js';

export function landscapeHeightExtrema(values) {
    let min = Infinity, max = -Infinity;
    for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
    return { min, max };
}

export async function readLandscapeEditChunk(context, descriptor) {
    context.signal?.throwIfAborted();
    const chunk = await context.readChunk(descriptor.id, { descriptor, signal: context.signal });
    context.signal?.throwIfAborted();
    validateAcquiredLandscapeChunk({ ...context.manifest, chunks: [descriptor] }, chunk, { nativeOnly: false });
    context.readCount++;
    if (descriptor.level === context.manifest.grid.maxLevel) context.acquiredNativeChunkIds.add(descriptor.id);
    return chunk;
}

export async function stageLandscapeEditChunk(context, chunk, progress) {
    context.signal?.throwIfAborted();
    const channel = clonePlainData(await context.stageChunk(chunk, { ...progress, signal: context.signal, workingBytes: context.workingBytes, workingByteLimit: context.maxWorkingBytes }), 'staged height channel');
    context.signal?.throwIfAborted();
    requireCondition(channel.encoding === 'float32-le' && channel.byteLength === chunk.heights.byteLength && channel.decodedByteLength === chunk.heights.byteLength, 'stageChunk must return a complete float32-le height channel');
    requireId(channel.revision, 'staged height revision');
    requireRelativeUrl(channel.url, 'staged height URL');
    requireSha256(channel.sha256, 'staged height SHA-256');
    const descriptor = clonePlainData(chunk.descriptor);
    descriptor.channels.height = channel;
    return freezeData(descriptor);
}

function smoothRadius(manifest, operation) {
    return operation.type === 'smooth'
        ? { x: Math.floor(operation.radiusMeters / manifest.grid.spacingX), z: Math.floor(operation.radiusMeters / manifest.grid.spacingZ) }
        : { x: 1, z: 1 };
}

async function acquireHalo(context, snapshot, descriptor, radius) {
    const grid = context.manifest.grid, intervals = grid.chunkIntervals, tileCount = 2 ** grid.maxLevel;
    const columns = descriptor.columns + radius.x * 2, rows = descriptor.rows + radius.z * 2;
    const startColumn = descriptor.startColumn - radius.x, startRow = descriptor.startRow - radius.z;
    const minColumn = Math.max(0, startColumn), minRow = Math.max(0, startRow);
    const maxColumn = Math.min(grid.columns - 1, startColumn + columns - 1), maxRow = Math.min(grid.rows - 1, startRow + rows - 1);
    const heights = new Float32Array(columns * rows).fill(NaN), cover = new Uint8Array(heights.length);
    let landCover = null;
    const firstColumn = Math.max(0, Math.ceil(minColumn / intervals) - 1), firstRow = Math.max(0, Math.ceil(minRow / intervals) - 1);
    const lastColumn = Math.min(tileCount - 1, Math.floor(maxColumn / intervals)), lastRow = Math.min(tileCount - 1, Math.floor(maxRow / intervals));
    let reads = 0;
    for (let tileRow = firstRow; tileRow <= lastRow; tileRow++) for (let tileColumn = firstColumn; tileColumn <= lastColumn; tileColumn++) {
        const source = await readLandscapeEditChunk(context, snapshot.get(`l${grid.maxLevel}/c${tileColumn}/r${tileRow}`));
        const tile = source.descriptor;
        if (tile.id === descriptor.id) landCover = source.landCover;
        reads++;
        for (let row = Math.max(minRow, tile.startRow); row <= Math.min(maxRow, tile.startRow + intervals); row++) {
            for (let column = Math.max(minColumn, tile.startColumn); column <= Math.min(maxColumn, tile.startColumn + intervals); column++) {
                const from = (row - tile.startRow) * tile.columns + column - tile.startColumn;
                const to = (row - startRow) * columns + column - startColumn;
                if (Number.isNaN(heights[to])) { heights[to] = source.heights[from]; cover[to] = source.landCover[from]; }
                else requireCondition(Object.is(heights[to], source.heights[from]) && cover[to] === source.landCover[from], `native seam mismatch in halo of ${descriptor.id} at column ${column}, row ${row}`);
            }
        }
    }
    requireCondition(!!landCover, `halo did not acquire target ${descriptor.id}`);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        if (!Number.isNaN(heights[i])) continue;
        const clampedColumn = Math.max(minColumn, Math.min(maxColumn, startColumn + column));
        const clampedRow = Math.max(minRow, Math.min(maxRow, startRow + row));
        const source = (clampedRow - startRow) * columns + clampedColumn - startColumn;
        requireCondition(!Number.isNaN(heights[source]), `missing authoritative halo sample for ${descriptor.id}`);
        heights[i] = heights[source]; cover[i] = cover[source];
    }
    return { heights, cover, landCover, columns, rows, reads };
}

function horizontalKernelSums(halo, columns, radius) {
    const sums = new Float64Array(columns * halo.rows);
    for (let row = 0; row < halo.rows; row++) {
        for (let column = 0; column < columns; column++) {
            let total = 0;
            for (let offset = 0; offset <= radius * 2; offset++) total += halo.heights[row * halo.columns + column + offset];
            sums[row * columns + column] = total;
        }
    }
    return sums;
}

function targetHeight(operation, height, x, z, sums, stride, column, row, radius) {
    if (operation.type === 'raise') return height + operation.deltaMeters;
    if (operation.type === 'set-height') return operation.heightMeters;
    if (operation.type === 'grade') {
        const dx = operation.end.x - operation.start.x, dz = operation.end.z - operation.start.z;
        const t = Math.max(0, Math.min(1, ((x - operation.start.x) * dx + (z - operation.start.z) * dz) / (dx * dx + dz * dz)));
        return operation.start.heightMeters + (operation.end.heightMeters - operation.start.heightMeters) * t;
    }
    let sum = 0;
    for (let offset = 0; offset <= radius.z * 2; offset++) sum += sums[(row + offset) * stride + column];
    const mean = sum / ((radius.x * 2 + 1) * (radius.z * 2 + 1));
    return height + (mean - height) * operation.strength;
}

/** @returns {Promise<{descriptor:any,changed:boolean,haloReads:number}>} */
export async function evaluateLandscapeNativeUnit(context, snapshot, descriptor, operation, progress) {
    const radius = smoothRadius(context.manifest, operation);
    const halo = await acquireHalo(context, snapshot, descriptor, radius);
    const sums = operation.type === 'smooth' ? horizontalKernelSums(halo, descriptor.columns, radius.x) : null;
    const heights = new Float32Array(descriptor.columns * descriptor.rows), grid = context.manifest.grid;
    let changed = false;
    for (let row = 0; row < descriptor.rows; row++) for (let column = 0; column < descriptor.columns; column++) {
        const i = row * descriptor.columns + column;
        const original = halo.heights[(row + radius.z) * halo.columns + column + radius.x];
        const x = context.manifest.bounds.minX + (descriptor.startColumn + column) * grid.spacingX;
        const z = context.manifest.bounds.maxZ - (descriptor.startRow + row) * grid.spacingZ;
        const weight = landscapeRegionWeight(operation.region, operation.falloff, x, z);
        const target = weight > 0 ? targetHeight(operation, original, x, z, sums, descriptor.columns, column, row, radius) : original;
        heights[i] = operation.type === 'raise' && weight > 0 ? Math.fround(original + operation.deltaMeters * weight)
            : weight === 1 ? Math.fround(target) : weight > 0 ? Math.fround(original + (target - original) * weight) : original;
        requireCondition(Number.isFinite(heights[i]), `operation ${operation.id} creates nonfinite elevation in ${descriptor.id}`);
        changed ||= !Object.is(heights[i], original);
    }
    if (!changed) return { descriptor, changed: false, haloReads: halo.reads };
    const range = landscapeHeightExtrema(heights);
    const next = { ...clonePlainData(descriptor), minHeight: range.min, maxHeight: range.max, revision: context.newRevision };
    return { descriptor: await stageLandscapeEditChunk(context, { descriptor: next, heights, landCover: halo.landCover }, progress), changed: true, haloReads: halo.reads };
}
