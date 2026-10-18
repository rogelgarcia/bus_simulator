// Rasterizes world polygons with a deterministic even-odd scanline fill and measures exact signed distances to their boundaries.
// @ts-check
// Samples are tested at their exact world positions with the half-open crossing rule, so the fill agrees with ray-casting containment
// away from the boundary and never depends on edge order. Signed distances are exact Euclidean distances to the nearest edge, positive
// inside (like landscapeRegionSignedDistance); polygons are small (at most 128 vertices), so the per-sample edge scan stays cheap.

/** @typedef {import('./Distance.mjs').SynthesisGrid} SynthesisGrid */

/** Vertex mean of a polygon (the v2 generator's district center). @param {ReadonlyArray<ReadonlyArray<number>>} polygon */
export function polygonCentroid(polygon) {
    let x = 0, z = 0;
    for (const point of polygon) { x += point[0]; z += point[1]; }
    return [x / polygon.length, z / polygon.length];
}

/** @param {ReadonlyArray<ReadonlyArray<number>>} polygon */
export function polygonBounds(polygon) {
    const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const [x, z] of polygon) { bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x); bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z); }
    return bounds;
}

/** Even-odd containment of one world position. @param {ReadonlyArray<ReadonlyArray<number>>} polygon @param {number} x @param {number} z */
export function polygonContains(polygon, x, z) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [ax, az] = polygon[j], [bx, bz] = polygon[i];
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside;
}

/**
 * Writes `value` into every sample inside the polygon (even-odd rule at the sample position), one scanline per grid row. Returns the sample count.
 * @param {SynthesisGrid} grid @param {ReadonlyArray<ReadonlyArray<number>>} polygon @param {Float32Array|Uint8Array} target @param {number} value
 */
export function rasterizePolygon(grid, polygon, target, value) {
    const { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, bounds = polygonBounds(polygon), crossings = [];
    const firstRow = Math.max(0, Math.ceil((maxZ - bounds.maxZ) / spacingZ)), lastRow = Math.min(rows - 1, Math.floor((maxZ - bounds.minZ) / spacingZ));
    let count = 0;
    for (let row = firstRow; row <= lastRow; row++) {
        const z = maxZ - row * spacingZ;
        crossings.length = 0;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [ax, az] = polygon[j], [bx, bz] = polygon[i];
            if ((az > z) !== (bz > z)) crossings.push((bx - ax) * (z - az) / (bz - az) + ax);
        }
        crossings.sort((a, b) => a - b);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
            // the even-odd test is x < crossing: a sample exactly on the left crossing is inside, one on the right crossing is outside
            const first = Math.max(0, Math.ceil((crossings[k] - minX) / spacingX)), last = Math.min(columns - 1, Math.ceil((crossings[k + 1] - minX) / spacingX) - 1);
            for (let column = first; column <= last; column++) { target[row * columns + column] = value; count++; }
        }
    }
    return count;
}

/**
 * Exact signed Euclidean distance (meters) to the polygon boundary at every sample, positive inside, written into `target`; optionally the
 * nearest boundary point of every sample into `nearestX`/`nearestZ` (ties resolve to the first edge in polygon order).
 * @param {SynthesisGrid} grid @param {ReadonlyArray<ReadonlyArray<number>>} polygon @param {Float32Array} target @param {Float32Array} [nearestX] @param {Float32Array} [nearestZ]
 */
export function polygonSignedDistance(grid, polygon, target, nearestX, nearestZ) {
    const { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, count = polygon.length;
    const ex = new Float64Array(count), ez = new Float64Array(count), dx = new Float64Array(count), dz = new Float64Array(count), inverse = new Float64Array(count);
    for (let i = 0, j = count - 1; i < count; j = i++) {
        ex[i] = polygon[j][0]; ez[i] = polygon[j][1]; dx[i] = polygon[i][0] - ex[i]; dz[i] = polygon[i][1] - ez[i];
        inverse[i] = 1 / (dx[i] * dx[i] + dz[i] * dz[i]);
    }
    for (let row = 0; row < rows; row++) {
        const z = maxZ - row * spacingZ, base = row * columns;
        for (let column = 0; column < columns; column++) {
            const x = minX + column * spacingX;
            let nearest = Infinity, inside = false, qx = x, qz = z;
            for (let i = 0; i < count; i++) {
                const t = Math.max(0, Math.min(1, ((x - ex[i]) * dx[i] + (z - ez[i]) * dz[i]) * inverse[i]));
                const px = x - ex[i] - t * dx[i], pz = z - ez[i] - t * dz[i], distance = px * px + pz * pz;
                if (distance < nearest) { nearest = distance; qx = ex[i] + t * dx[i]; qz = ez[i] + t * dz[i]; }
                const az = ez[i], bz = ez[i] + dz[i];
                if ((az > z) !== (bz > z) && x < dx[i] * (z - az) / dz[i] + ex[i]) inside = !inside;
            }
            target[base + column] = inside ? Math.sqrt(nearest) : -Math.sqrt(nearest);
            if (nearestX) { nearestX[base + column] = qx; nearestZ[base + column] = qz; }
        }
    }
}
