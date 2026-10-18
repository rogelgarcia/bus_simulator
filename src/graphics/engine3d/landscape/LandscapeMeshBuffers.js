// Builds transferable terrain buffers off the render thread; edge morphs preserve the parent surface.
// @ts-check
import { createLandscapeNaturalPresentation } from './LandscapeNaturalPresentation.js';
import { LANDSCAPE_SOIL_SLOTS } from './LandscapeCoverageSlots.js';

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

/**
 * The land-cover catalog colours per soil as the fallback vertex colours carry them (linear, the byte quantization of the colour attribute, the last
 * catalog entry of a soil deciding), for a stream in soil-palette mode (AI 596 D5) to show the same colours until an appearance palette replaces them.
 * @param {any} manifest @returns {Record<string, number[]>} soilId → [r, g, b] in 0..1
 */
export function landscapeCatalogSoilPalette(manifest) {
    return Object.fromEntries(manifest.landCover.catalog.map(entry => [entry.soilId, linearColor(entry.color).map(component => component / 255)]));
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

const EXCLUSION_EDGE_TOLERANCE = 1e-3;
const OUTSIDE = 0, BOUNDARY = 1, INSIDE = 2;

/**
 * Validates a mesh exclusion (AI 596 D5, the render-only surround): tiles inside its bounds are never built, and tiles straddling it take the
 * reference surface inside (lowered by the skirt depth) so the authoritative landscape covers them, with a wall hanging wallDepth below the
 * boundary line so no ray from inside passes under the surround's edge.
 * @param {{bounds:{minX:number,maxX:number,minZ:number,maxZ:number},skirtDepth:number,wallDepth?:number,reference?:any}} exclusion reference is a decoded chunk
 *   (descriptor, heights) covering the bounds, the authoritative overview; without one the tile's own heights are the reference; wallDepth defaults to the skirt depth
 * @returns {Readonly<{bounds:Readonly<{minX:number,maxX:number,minZ:number,maxZ:number}>,skirtDepth:number,wallDepth:number,reference:any}>}
 */
export function landscapeMeshExclusion(exclusion) {
    const bounds = exclusion?.bounds;
    if (!bounds || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(bounds[key])) || !(bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ)) throw new Error('[Landscape] A mesh exclusion needs finite bounds with positive area');
    if (!Number.isFinite(exclusion.skirtDepth) || exclusion.skirtDepth <= 0) throw new Error('[Landscape] A mesh exclusion needs a positive skirt depth');
    const wallDepth = exclusion.wallDepth ?? exclusion.skirtDepth;
    if (!Number.isFinite(wallDepth) || wallDepth <= 0) throw new Error('[Landscape] A mesh exclusion needs a positive wall depth');
    const reference = exclusion.reference ?? null;
    if (reference !== null) {
        const { descriptor, heights } = reference;
        if (!(heights instanceof Float32Array) || !descriptor || heights.length !== descriptor.columns * descriptor.rows) throw new Error('[Landscape] A mesh exclusion reference must be a decoded chunk');
        const covered = descriptor.bounds.minX <= bounds.minX && descriptor.bounds.maxX >= bounds.maxX && descriptor.bounds.minZ <= bounds.minZ && descriptor.bounds.maxZ >= bounds.maxZ;
        if (!covered) throw new Error('[Landscape] A mesh exclusion reference must cover the exclusion bounds');
    }
    return Object.freeze({ bounds: Object.freeze({ minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }), skirtDepth: exclusion.skirtDepth, wallDepth, reference });
}

/**
 * Admission allowance of the wall a mesh exclusion may add to a tile beyond estimateLandscapeMeshBuffers: at most one lowered copy (31 bytes of
 * attributes) and one boundary edge (four triangles) per vertex of the boundary ring the tile can hold, so the estimate stays an upper bound even
 * for a sliver of the exclusion whose dropped cells do not pay for its wall. @param {any} descriptor @returns {number}
 */
export function estimateLandscapeMeshExclusionBytes(descriptor) {
    const ring = 2 * (descriptor.columns + descriptor.rows);
    return ring * (12 + 3 + 6 + 6 + 4) + ring * 4 * 3 * 4;
}

/** Whether a tile lies entirely inside the exclusion bounds (its boundary included): such a tile is never built. @param {any} tileBounds @param {any} exclusionBounds */
export function landscapeMeshBoundsExcluded(tileBounds, exclusionBounds) {
    return tileBounds.minX >= exclusionBounds.minX - EXCLUSION_EDGE_TOLERANCE && tileBounds.maxX <= exclusionBounds.maxX + EXCLUSION_EDGE_TOLERANCE
        && tileBounds.minZ >= exclusionBounds.minZ - EXCLUSION_EDGE_TOLERANCE && tileBounds.maxZ <= exclusionBounds.maxZ + EXCLUSION_EDGE_TOLERANCE;
}

// classifies a vertex against the exclusion: outside, on its boundary (within a millimetre) or strictly inside
function exclusionClass(bounds, x, z) {
    const within = (value, min, max) => value >= min - EXCLUSION_EDGE_TOLERANCE && value <= max + EXCLUSION_EDGE_TOLERANCE;
    if (!within(x, bounds.minX, bounds.maxX) || !within(z, bounds.minZ, bounds.maxZ)) return OUTSIDE;
    const inside = (value, min, max) => value > min + EXCLUSION_EDGE_TOLERANCE && value < max - EXCLUSION_EDGE_TOLERANCE;
    return inside(x, bounds.minX, bounds.maxX) && inside(z, bounds.minZ, bounds.maxZ) ? INSIDE : BOUNDARY;
}

/**
 * @param {{chunk:any,parent?:any,root?:any,manifest:any,presentation?:any,naturalAt?:(column:number,row:number)=>number,exclusion?:any}} options naturalAt returns the resolved
 *   terrain-driven natural label of a local sample (-1: overview infill), so fallback colors show the same display soil as the masks; exclusion
 *   (landscapeMeshExclusion, AI 596 D5) makes a tile straddling the authoritative landscape take the reference surface on the boundary exactly and,
 *   lowered by the skirt depth, inside it (positions and parent heights alike, so no transition moves them), and drops every cell without a corner
 *   outside the bounds, so the surround ends on the boundary at the reference heights and never rises through the authoritative surface;
 *   soilPalette (AI 596 D5, the render-only surround) writes each vertex's display soil index into the red byte of the colour attribute instead of
 *   the catalog colour, for the stream's soil palette cells (LandscapeSoilPalette) to colour at draw time
 * @returns {any}
 */
export function buildLandscapeMeshBuffers({ chunk, parent = chunk, root = chunk, manifest, presentation = createLandscapeNaturalPresentation(manifest, root), naturalAt = () => -1, exclusion = null, soilPalette = false }) {
    const { descriptor, heights, landCover } = chunk;
    const { columns, rows, bounds } = descriptor;
    if (!(heights instanceof Float32Array) || !(landCover instanceof Uint8Array) || heights.length !== columns * rows || landCover.length !== heights.length) throw new Error('Terrain mesh requires complete bounded decoded channels');
    if (typeof soilPalette !== 'boolean') throw new Error('[Landscape] soilPalette must be boolean');
    const estimate = estimateLandscapeMeshBuffers(descriptor);
    const soilIds = manifest.soil.catalog.map(entry => entry.id);
    if (soilPalette && soilIds.length > LANDSCAPE_SOIL_SLOTS) throw new Error(`[Landscape] The soil palette holds ${LANDSCAPE_SOIL_SLOTS} soils; the landscape declares ${soilIds.length}`);
    const catalogPalette = new Map(manifest.landCover.catalog.map(entry => [entry.soilId, linearColor(entry.color)]));
    const vertexColor = soilPalette ? soil => [soil, 0, 0] : soil => catalogPalette.get(soilIds[soil]);
    // the exclusion touches this tile only when their bounds overlap; its vertices are classified first, since the wall along the boundary line
    // (one lowered copy per boundary vertex, a quad per boundary edge) adds vertices and triangles beyond the regular grid and its perimeter skirt
    const excluding = exclusion && !(bounds.maxX < exclusion.bounds.minX || bounds.minX > exclusion.bounds.maxX || bounds.maxZ < exclusion.bounds.minZ || bounds.minZ > exclusion.bounds.maxZ) ? landscapeMeshExclusion(exclusion) : null;
    const classes = excluding ? new Uint8Array(heights.length) : null;
    const vertexX = column => bounds.minX + column * (bounds.maxX - bounds.minX) / (columns - 1), vertexZ = row => bounds.maxZ - row * (bounds.maxZ - bounds.minZ) / (rows - 1);
    const wallEdges = [], wallCopy = new Map();
    if (excluding) {
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) classes[row * columns + column] = exclusionClass(excluding.bounds, vertexX(column), vertexZ(row));
        const wallVertex = index => { if (!wallCopy.has(index)) wallCopy.set(index, estimate.vertices + wallCopy.size); return wallCopy.get(index); };
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (classes[i] !== BOUNDARY) continue;
            if (column < columns - 1 && classes[i + 1] === BOUNDARY) wallEdges.push([i, i + 1, wallVertex(i), wallVertex(i + 1)]);
            if (row < rows - 1 && classes[i + columns] === BOUNDARY) wallEdges.push([i, i + columns, wallVertex(i), wallVertex(i + columns)]);
        }
    }
    const vertexCount = estimate.vertices + wallCopy.size;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Uint8Array(vertexCount * 3);
    const normals = new Int16Array(vertexCount * 3);
    const parentNormals = new Int16Array(vertexCount * 3);
    const parentHeights = new Float32Array(vertexCount);
    let indices = new Uint32Array((columns - 1) * (rows - 1) * 6 + (estimate.vertices - heights.length) * 6 + wallEdges.length * 12);
    let wireIndices = new Uint32Array(estimate.wireIndexBytes / 4);
    const referenceHeight = (x, z) => sampleLandscapeMeshHeight(excluding.reference ?? chunk, x, z);
    let modified = 0;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            const x = vertexX(column);
            const z = vertexZ(row);
            let height = heights[i], parentHeight = sampleLandscapeMeshHeight(parent, x, z);
            if (excluding) {
                const where = classes[i];
                if (where !== OUTSIDE) { height = referenceHeight(x, z) - (where === INSIDE ? excluding.skirtDepth : 0); parentHeight = height; modified++; }
            }
            positions.set([x, height, z], i * 3);
            parentHeights[i] = parentHeight;
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
            colors.set(vertexColor(presentation.sample(x, z, landCover[i], naturalAt(column, row)) >> 4), i * 3);
        }
    }
    // a cell with no corner outside the exclusion is not triangulated: the surround ends exactly on the boundary line (the authoritative landscape draws
    // inside it), so it never overlaps the authoritative surface where the native relief dips below the boundary chord (an apron one cell deep showed
    // the surround over the authoritative at grazing views within 300 m); a wire edge stays while a cell beside it is kept
    const keepCell = (column, row) => !modified || column < 0 || row < 0 || column >= columns - 1 || row >= rows - 1
        || classes[row * columns + column] === OUTSIDE || classes[row * columns + column + 1] === OUTSIDE || classes[(row + 1) * columns + column] === OUTSIDE || classes[(row + 1) * columns + column + 1] === OUTSIDE;
    let cursor = 0, wireCursor = 0, surfaceTriangles = 0;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const a = row * columns + column;
            if (column < columns - 1 && (keepCell(column, row) || keepCell(column, row - 1))) { wireIndices.set([a, a + 1], wireCursor); wireCursor += 2; }
            if (row < rows - 1 && (keepCell(column, row) || keepCell(column - 1, row))) { wireIndices.set([a, a + columns], wireCursor); wireCursor += 2; }
            if (row < rows - 1 && column < columns - 1 && keepCell(column, row)) {
                const b = a + 1, c = a + columns, d = c + 1;
                indices.set([a, d, c, a, b, d], cursor); cursor += 6; surfaceTriangles += 2;
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
    if (modified) {
        // the wall along the boundary line: each boundary vertex gets a copy wallDepth below it (colours and normals of the source, parent height
        // lowered alike so transitions never move it) and every boundary edge a quad in both windings, so a ray passing under the surround's edge
        // from inside meets the wall instead of the backdrop; below the authoritative surface the wall is never seen
        for (const [source, copy] of wallCopy) {
            positions.set(positions.subarray(source * 3, source * 3 + 3), copy * 3);
            positions[copy * 3 + 1] -= excluding.wallDepth;
            colors.set(colors.subarray(source * 3, source * 3 + 3), copy * 3);
            normals.set(normals.subarray(source * 3, source * 3 + 3), copy * 3);
            parentNormals.set(parentNormals.subarray(source * 3, source * 3 + 3), copy * 3);
            parentHeights[copy] = parentHeights[source] - excluding.wallDepth;
        }
        for (const [p, q, pLow, qLow] of wallEdges) { indices.set([p, q, qLow, p, qLow, pLow, p, qLow, q, p, pLow, qLow], cursor); cursor += 12; }
        // dropped cells leave the index arrays shorter than the estimate (still the admission bound); the displayed heights are kept so the
        // picking restore (withLandscapeMorphedPositions) returns to them, not to the source samples the exclusion replaced
        indices = indices.slice(0, cursor);
        wireIndices = wireIndices.slice(0, wireCursor);
        const exclusionHeights = new Float32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) exclusionHeights[i] = positions[i * 3 + 1];
        const geometryBytes = positions.byteLength + colors.byteLength + normals.byteLength + parentNormals.byteLength + parentHeights.byteLength + indices.byteLength;
        return { descriptor, positions, colors, normals, parentNormals, parentHeights, indices, wireIndices, boundaryPositions, boundaryParents, skirtDepth, surfaceTriangles, geometryBytes, exclusionHeights,
            exclusion: { bounds: excluding.bounds, skirtDepth: excluding.skirtDepth, wallDepth: excluding.wallDepth, modifiedVertices: modified, droppedCells: (columns - 1) * (rows - 1) - surfaceTriangles / 2, wallVertices: wallCopy.size, wallTriangles: wallEdges.length * 4 } };
    }
    return { descriptor, positions, colors, normals, parentNormals, parentHeights, indices, wireIndices, boundaryPositions, boundaryParents, skirtDepth, surfaceTriangles, geometryBytes: estimate.geometryBytes };
}

/** @param {any} buffers @returns {ArrayBuffer[]} */
export function landscapeMeshTransferList(buffers) {
    return Object.values(buffers).filter(value => ArrayBuffer.isView(value)).map(value => value.buffer);
}
