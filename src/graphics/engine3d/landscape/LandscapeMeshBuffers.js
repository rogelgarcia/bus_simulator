// Builds transferable terrain buffers off the render thread; edge morphs preserve the parent surface.
// @ts-check
import { resolveLandscapeSoil } from '../../../app/landscape/LandscapeSoil.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** @param {any} chunk @param {number} x @param {number} z @returns {number} */
export function sampleLandscapeMeshHeight(chunk, x, z) {
    const { columns, rows, bounds } = chunk.descriptor;
    const column = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * (columns - 1), 0, columns - 1);
    const row = clamp((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * (rows - 1), 0, rows - 1);
    const c = Math.min(columns - 2, Math.floor(column)), r = Math.min(rows - 2, Math.floor(row));
    const u = column - c, v = row - r, i = r * columns + c;
    const a = chunk.heights[i], b = chunk.heights[i + 1], sw = chunk.heights[i + columns], d = chunk.heights[i + columns + 1];
    return a + (u >= v ? b - a : d - sw) * u + (u >= v ? d - b : sw - a) * v;
}

function sampleNormal(chunk, x, z) {
    const { bounds, columns, rows } = chunk.descriptor;
    const dx = (bounds.maxX - bounds.minX) / (columns - 1), dz = (bounds.maxZ - bounds.minZ) / (rows - 1);
    const x0 = Math.max(bounds.minX, x - dx), x1 = Math.min(bounds.maxX, x + dx);
    const z0 = Math.max(bounds.minZ, z - dz), z1 = Math.min(bounds.maxZ, z + dz);
    const nx = -(sampleLandscapeMeshHeight(chunk, x1, z) - sampleLandscapeMeshHeight(chunk, x0, z)) / (x1 - x0);
    const nz = -(sampleLandscapeMeshHeight(chunk, x, z1) - sampleLandscapeMeshHeight(chunk, x, z0)) / (z1 - z0);
    const length = Math.hypot(nx, 1, nz);
    return [nx / length, 1 / length, nz / length];
}

function linearColor(hex) {
    const value = parseInt(hex.replace('#', ''), 16);
    return [value >>> 16, (value >>> 8) & 255, value & 255].map(component => {
        const s = component / 255;
        return Math.round((s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * 255);
    });
}

/** @param {any} descriptor @returns {{vertices:number,geometryBytes:number,wireBytes:number,wireIndexBytes:number,boundaryBytes:number}} */
export function estimateLandscapeMeshBuffers(descriptor) {
    const { columns, rows } = descriptor;
    const surfaceCount = columns * rows;
    const perimeterCount = 2 * columns + 2 * rows - 4;
    const vertices = surfaceCount + perimeterCount;
    const indexCount = (columns - 1) * (rows - 1) * 6 + perimeterCount * 6;
    const wireIndexCount = 2 * (rows * (columns - 1) + columns * (rows - 1) + (columns - 1) * (rows - 1));
    return {
        vertices,
        geometryBytes: vertices * (12 + 3 + 6 + 6 + 4) + indexCount * 4,
        wireBytes: vertices * 16 + wireIndexCount * 4,
        wireIndexBytes: wireIndexCount * 4,
        boundaryBytes: perimeterCount * 16
    };
}

/** @param {{chunk:any,parent?:any,root?:any,manifest:any}} options @returns {any} */
export function buildLandscapeMeshBuffers({ chunk, parent = chunk, root = chunk, manifest }) {
    const { descriptor, heights, landCover } = chunk;
    const { columns, rows, bounds } = descriptor;
    if (!(heights instanceof Float32Array) || !(landCover instanceof Uint8Array) || heights.length !== columns * rows || landCover.length !== heights.length) throw new Error('Terrain mesh requires complete bounded decoded channels');
    const estimate = estimateLandscapeMeshBuffers(descriptor);
    const positions = new Float32Array(estimate.vertices * 3);
    const colors = new Uint8Array(estimate.vertices * 3);
    const normals = new Int16Array(estimate.vertices * 3);
    const parentNormals = new Int16Array(estimate.vertices * 3);
    const parentHeights = new Float32Array(estimate.vertices);
    const indices = new Uint32Array((columns - 1) * (rows - 1) * 6 + (estimate.vertices - heights.length) * 6);
    const wireIndices = new Uint32Array(estimate.wireIndexBytes / 4);
    const palette = new Map(manifest.landCover.catalog.map(entry => [entry.id, linearColor(entry.color)]));
    const coverSoils = new Map(manifest.soil.landCoverMapping.map(entry => [entry.landCoverId, entry.soilId]));
    const soilPalette = new Map(manifest.landCover.catalog.map(entry => [entry.soilId, linearColor(entry.color)]));
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            const x = bounds.minX + column * (bounds.maxX - bounds.minX) / (columns - 1);
            const z = bounds.maxZ - row * (bounds.maxZ - bounds.minZ) / (rows - 1);
            positions.set([x, heights[i], z], i * 3);
            parentHeights[i] = sampleLandscapeMeshHeight(parent, x, z);
            const normal = sampleNormal(chunk, x, z);
            const parentNormal = sampleNormal(parent, x, z);
            const edgeDistance = Math.min(column, row, columns - 1 - column, rows - 1 - row);
            const edgeWeight = Math.max(0, 1 - edgeDistance / 3);
            const referenceNormal = edgeWeight > 0 ? sampleNormal(root, x, z) : normal;
            const mixed = normal.map((value, axis) => value * (1 - edgeWeight) + referenceNormal[axis] * edgeWeight);
            const mixedLength = Math.hypot(...mixed);
            normals.set(mixed.map(value => Math.round(value / mixedLength * 32767)), i * 3);
            const parentMixed = parentNormal.map((value, axis) => value * (1 - edgeWeight) + referenceNormal[axis] * edgeWeight);
            const parentLength = Math.hypot(...parentMixed);
            parentNormals.set(parentMixed.map(value => Math.round(value / parentLength * 32767)), i * 3);
            const soil = manifest.soil.overrides.length ? resolveLandscapeSoil(manifest, x, z, landCover[i]) : coverSoils.get(landCover[i]);
            colors.set(soil !== coverSoils.get(landCover[i]) ? soilPalette.get(soil) ?? palette.get(landCover[i]) : palette.get(landCover[i]), i * 3);
        }
    }
    let cursor = 0, wireCursor = 0;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const a = row * columns + column;
            if (column < columns - 1) { wireIndices.set([a, a + 1], wireCursor); wireCursor += 2; }
            if (row < rows - 1) { wireIndices.set([a, a + columns], wireCursor); wireCursor += 2; }
            if (row < rows - 1 && column < columns - 1) {
                const b = a + 1, c = a + columns, d = c + 1;
                indices.set([a, d, c, a, b, d], cursor); cursor += 6;
                wireIndices.set([a, d], wireCursor); wireCursor += 2;
            }
        }
    }
    const perimeter = [];
    for (let column = 0; column < columns; column++) perimeter.push(column);
    for (let row = 1; row < rows; row++) perimeter.push(row * columns + columns - 1);
    for (let column = columns - 2; column >= 0; column--) perimeter.push((rows - 1) * columns + column);
    for (let row = rows - 2; row > 0; row--) perimeter.push(row * columns);
    const skirtDepth = Math.max(1, parent.descriptor.geometricError * 2 + .25);
    const boundaryPositions = new Float32Array(perimeter.length * 3);
    const boundaryParents = new Float32Array(perimeter.length);
    for (let index = 0; index < perimeter.length; index++) {
        const source = perimeter[index], target = heights.length + index;
        positions.set(positions.subarray(source * 3, source * 3 + 3), target * 3);
        positions[target * 3 + 1] -= skirtDepth;
        colors.set(colors.subarray(source * 3, source * 3 + 3), target * 3);
        normals.set(normals.subarray(source * 3, source * 3 + 3), target * 3);
        parentNormals.set(parentNormals.subarray(source * 3, source * 3 + 3), target * 3);
        parentHeights[target] = parentHeights[source] - skirtDepth;
        boundaryPositions.set(positions.subarray(source * 3, source * 3 + 3), index * 3);
        boundaryParents[index] = parentHeights[source];
        const next = (index + 1) % perimeter.length;
        indices.set([source, target, heights.length + next, source, heights.length + next, perimeter[next]], cursor); cursor += 6;
    }
    return { descriptor, positions, colors, normals, parentNormals, parentHeights, indices, wireIndices, boundaryPositions, boundaryParents, skirtDepth, surfaceTriangles: (columns - 1) * (rows - 1) * 2, geometryBytes: estimate.geometryBytes };
}

/** @param {any} buffers @returns {ArrayBuffer[]} */
export function landscapeMeshTransferList(buffers) {
    return Object.values(buffers).filter(value => ArrayBuffer.isView(value)).map(value => value.buffer);
}
