// Computes exact Euclidean distance transforms with nearest-feature propagation and rasterizes polylines with exact nearest-segment refinement.
// @ts-check
// The squared distance transform is Felzenszwalb & Huttenlocher's separable lower envelope of parabolas (2012): one pass along every
// column records the nearest feature row, one pass along every row combines the column costs, so every sample receives the exact
// squared Euclidean distance (in meters, anisotropic spacing allowed) and the index of one nearest feature sample; ties resolve by the
// fixed scan order. Polylines are rasterized with a DDA that writes their segment index into feature samples; the nearest rasterized
// sample is then refined to the exact distance to that segment and its polyline neighbors, so distances to roads and shorelines are
// exact to the design geometry while the global search stays linear in the grid.

/** @typedef {{columns:number,rows:number,spacingX:number,spacingZ:number,minX:number,maxZ:number}} SynthesisGrid */

function lowerEnvelope(f, n, scale, v, z, d, arg) {
    let first = 0;
    while (first < n && f[first] === Infinity) first++;
    if (first === n) { for (let q = 0; q < n; q++) { d[q] = Infinity; arg[q] = -1; } return; }
    let k = 0;
    v[0] = first; z[0] = -Infinity; z[1] = Infinity;
    for (let q = first + 1; q < n; q++) {
        if (f[q] === Infinity) continue;
        const pq = q * scale, cq = f[q] + pq * pq;
        let s = (cq - (f[v[k]] + (v[k] * scale) ** 2)) / (2 * (pq - v[k] * scale));
        while (s <= z[k]) {
            k--;
            s = (cq - (f[v[k]] + (v[k] * scale) ** 2)) / (2 * (pq - v[k] * scale));
        }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        const p = q * scale;
        while (z[k + 1] < p) k++;
        const dp = p - v[k] * scale;
        d[q] = dp * dp + f[v[k]]; arg[q] = v[k];
    }
}

/**
 * Exact Euclidean distance (meters) from every sample to the nearest feature sample, with that feature's index (-1 when there is none).
 * @param {SynthesisGrid} grid @param {Uint8Array} feature 1 at feature samples @param {import('../../terrain_fields/TerrainFieldsGrid.mjs').TerrainFieldMemory} memory @param {string} prefix tracked array prefix
 * @returns {{distance:Float32Array,nearest:Int32Array,release:()=>void}}
 */
export function exactDistanceTransform(grid, feature, memory, prefix) {
    const { columns, rows, spacingX, spacingZ } = grid, n = columns * rows, longest = Math.max(columns, rows);
    const columnCost = memory.allocate(`${prefix}/column-cost`, Float64Array, n), columnRow = memory.allocate(`${prefix}/column-row`, Int32Array, n);
    const distance = memory.allocate(`${prefix}/distance`, Float32Array, n), nearest = memory.allocate(`${prefix}/nearest`, Int32Array, n);
    const f = new Float64Array(longest), d = new Float64Array(longest), v = new Int32Array(longest), z = new Float64Array(longest + 1), arg = new Int32Array(longest);
    for (let column = 0; column < columns; column++) {
        for (let row = 0; row < rows; row++) f[row] = feature[row * columns + column] ? 0 : Infinity;
        lowerEnvelope(f, rows, spacingZ, v, z, d, arg);
        for (let row = 0; row < rows; row++) { columnCost[row * columns + column] = d[row]; columnRow[row * columns + column] = arg[row]; }
    }
    for (let row = 0; row < rows; row++) {
        const base = row * columns;
        for (let column = 0; column < columns; column++) f[column] = columnCost[base + column];
        lowerEnvelope(f, columns, spacingX, v, z, d, arg);
        for (let column = 0; column < columns; column++) {
            const c = arg[column];
            distance[base + column] = c < 0 ? Infinity : Math.sqrt(d[column]);
            nearest[base + column] = c < 0 ? -1 : columnRow[row * columns + c] * columns + c;
        }
    }
    memory.free(`${prefix}/column-cost`, `${prefix}/column-row`);
    return { distance, nearest, release: () => memory.free(`${prefix}/distance`, `${prefix}/nearest`) };
}

/**
 * Flat segment set of several world polylines: segment k runs a -> b and belongs to polyline line[k]; start[l]..start[l+1]-1 are line l's segments.
 * @param {ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>} polylines [[x, z], ...] per polyline (index 0 and the last index of each point are x and z)
 */
export function createPolylineSet(polylines) {
    let count = 0;
    for (const line of polylines) count += Math.max(0, line.length - 1);
    const ax = new Float64Array(count), az = new Float64Array(count), bx = new Float64Array(count), bz = new Float64Array(count), line = new Int32Array(count), start = new Int32Array(polylines.length + 1);
    let k = 0;
    polylines.forEach((points, l) => {
        start[l] = k;
        for (let i = 0; i + 1 < points.length; i++, k++) {
            ax[k] = points[i][0]; az[k] = points[i][points[i].length - 1]; bx[k] = points[i + 1][0]; bz[k] = points[i + 1][points[i + 1].length - 1]; line[k] = l;
        }
    });
    start[polylines.length] = k;
    return { count, lines: polylines.length, ax, az, bx, bz, line, start };
}

/**
 * Writes every polyline segment into the feature mask with a DDA at sample resolution (8-connected) and records the segment index per feature sample.
 * Later segments overwrite earlier ones at shared samples (fixed order).
 * @param {SynthesisGrid} grid @param {ReturnType<typeof createPolylineSet>} set @param {Uint8Array} feature @param {Int32Array} segment
 */
export function rasterizePolylineSet(grid, set, feature, segment) {
    const { columns, rows, spacingX, spacingZ, minX, maxZ } = grid;
    let written = 0;
    for (let k = 0; k < set.count; k++) {
        const c0 = (set.ax[k] - minX) / spacingX, r0 = (maxZ - set.az[k]) / spacingZ, c1 = (set.bx[k] - minX) / spacingX, r1 = (maxZ - set.bz[k]) / spacingZ;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0))));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps, column = Math.round(c0 + (c1 - c0) * t), row = Math.round(r0 + (r1 - r0) * t);
            if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
            const i = row * columns + column;
            if (!feature[i]) written++;
            feature[i] = 1; segment[i] = k;
        }
    }
    return written;
}

/**
 * Exact distance from a sample position to one segment and the clamped parameter of the closest point (written to out as [distance, t]).
 * @param {ReturnType<typeof createPolylineSet>} set @param {number} k @param {number} x @param {number} z @param {Float64Array} out
 */
export function segmentDistance(set, k, x, z, out) {
    const ax = set.ax[k], az = set.az[k], dx = set.bx[k] - ax, dz = set.bz[k] - az, length = dx * dx + dz * dz;
    const t = length > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
    const ex = x - ax - t * dx, ez = z - az - t * dz;
    out[0] = Math.sqrt(ex * ex + ez * ez); out[1] = t;
    return out;
}

const CANDIDATE_OFFSETS = Object.freeze([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]);

/**
 * Refines a rasterized nearest-feature field to the exact distance to the nearest segment among the candidates of the sample and its
 * eight neighbors (each candidate feature contributes its segment and the polyline neighbors of that segment). The result is exact
 * except where two polylines are nearly equidistant, where it is within half a sample diagonal of the farther of the two. Writes the
 * segment index and the parameter of the closest point so callers can interpolate per-vertex values.
 * @param {SynthesisGrid} grid @param {ReturnType<typeof createPolylineSet>} set @param {Int32Array} nearest nearest feature sample per sample
 * @param {Int32Array} featureSegment segment index at feature samples @param {Float32Array} distance output meters @param {Int32Array} segment output @param {Float32Array} parameter output t in 0..1
 */
export function refineNearestSegments(grid, set, nearest, featureSegment, distance, segment, parameter) {
    const { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, out = new Float64Array(2), tested = new Int32Array(CANDIDATE_OFFSETS.length * 3);
    for (let row = 0; row < rows; row++) {
        const z = maxZ - row * spacingZ, base = row * columns;
        for (let column = 0; column < columns; column++) {
            const i = base + column;
            if (nearest[i] < 0) { distance[i] = Infinity; segment[i] = -1; parameter[i] = 0; continue; }
            const x = minX + column * spacingX;
            let best = Infinity, bestSegment = -1, bestT = 0, count = 0;
            for (const [dr, dc] of CANDIDATE_OFFSETS) {
                const r = row + dr, c = column + dc;
                if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
                const feature = nearest[r * columns + c];
                if (feature < 0) continue;
                const k = featureSegment[feature], line = set.line[k];
                for (let j = Math.max(set.start[line], k - 1); j <= Math.min(set.start[line + 1] - 1, k + 1); j++) {
                    let seen = false;
                    for (let t = 0; t < count && !seen; t++) seen = tested[t] === j;
                    if (seen) continue;
                    tested[count++] = j;
                    segmentDistance(set, j, x, z, out);
                    if (out[0] < best) { best = out[0]; bestSegment = j; bestT = out[1]; }
                }
            }
            distance[i] = best; segment[i] = bestSegment; parameter[i] = bestT;
        }
    }
}

/**
 * Side of a polyline at the closest point: positive on the left of the travel direction (counterclockwise normal), using the
 * angle-weighted pseudo-normal (sum of adjacent unit normals) when the closest point is a vertex, so sides stay consistent at corners.
 * @param {ReturnType<typeof createPolylineSet>} set @param {number} k @param {number} t @param {number} x @param {number} z
 */
export function polylineSide(set, k, t, x, z) {
    const normal = (j, out) => {
        const dx = set.bx[j] - set.ax[j], dz = set.bz[j] - set.az[j], length = Math.hypot(dx, dz) || 1;
        out[0] += -dz / length; out[1] += dx / length;
    };
    const n = [0, 0], line = set.line[k];
    let px, pz;
    if (t <= 0) { px = set.ax[k]; pz = set.az[k]; normal(k, n); if (k - 1 >= set.start[line]) normal(k - 1, n); }
    else if (t >= 1) { px = set.bx[k]; pz = set.bz[k]; normal(k, n); if (k + 1 < set.start[line + 1]) normal(k + 1, n); }
    else { px = set.ax[k] + (set.bx[k] - set.ax[k]) * t; pz = set.az[k] + (set.bz[k] - set.az[k]) * t; normal(k, n); }
    return n[0] * (x - px) + n[1] * (z - pz);
}
