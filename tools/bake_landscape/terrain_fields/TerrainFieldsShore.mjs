// Measures the signed horizontal distance from every sample to the sea-level shoreline with dead-reckoning propagation.
// @ts-check
// The shoreline is the marching-squares polyline of (height - sea level) = 0: crossing points are interpolated linearly on every row and
// column edge whose endpoints straddle sea level (land is height >= sea level), and each grid quad joins its two crossings, or for a
// four-crossing saddle pairs them by the sign of the quad mean. Every sample first adopts the nearest segment of its four adjacent quads,
// then two raster-order dead-reckoning passes (Grevera 2004) propagate the nearest segment (not a distance) through the 8-neighborhood
// and are repeated once, so each distance is Euclidean to an actual shoreline segment. Land is positive and water negative (water at
// zero distance is -0, which the encoder keeps negative); a landscape without a crossing reports +/-Infinity, which encoders clamp.

const FORWARD = Object.freeze([[-1, -1], [-1, 0], [-1, 1], [0, -1]]);
const BACKWARD = Object.freeze([[1, 1], [1, 0], [1, -1], [0, 1]]);

/**
 * @param {{columns:number,rows:number,spacingX:number,spacingZ:number,minX:number,maxZ:number}} grid @param {Float32Array} heights @param {number} seaLevel
 * @param {import('./TerrainFieldsGrid.mjs').TerrainFieldMemory} memory
 * @returns {{distance:Float32Array,statistics:{segments:number,maximumAdjacentMeters:number}}}
 */
export function shoreDistance(grid, heights, seaLevel, memory) {
    const { columns, rows, spacingX, spacingZ } = grid, n = columns * rows;
    const nearest = memory.allocate('shore/nearest', Int32Array, n), best = memory.allocate('shore/best', Float64Array, n);
    let segment = memory.allocate('shore/segments', Float64Array, 4096 * 4), segments = 0;
    nearest.fill(-1); best.fill(Infinity);
    const xOf = column => grid.minX + column * spacingX, zOf = row => grid.maxZ - row * spacingZ, land = i => heights[i] >= seaLevel;
    const distanceTo = (cell, s) => {
        const row = (cell / columns) | 0, px = xOf(cell - row * columns), pz = zOf(row), at = s * 4;
        const ax = segment[at], az = segment[at + 1], dx = segment[at + 2] - ax, dz = segment[at + 3] - az, length = dx * dx + dz * dz;
        const t = length > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length)) : 0;
        return Math.hypot(ax + dx * t - px, az + dz * t - pz);
    };
    const offer = (cell, s) => {
        const distance = distanceTo(cell, s);
        if (distance < best[cell] || (distance === best[cell] && s < nearest[cell])) { best[cell] = distance; nearest[cell] = s; }
    };
    const crossing = (a, b, ax, az, bx, bz, out) => {
        const t = (seaLevel - heights[a]) / (heights[b] - heights[a]);
        out.push(ax + (bx - ax) * t, az + (bz - az) * t);
    };
    const add = (points, first, second, corners) => {
        if (segments * 4 === segment.length) segment = memory.grow('shore/segments', segment, segment.length * 2);
        segment.set([points[first], points[first + 1], points[second], points[second + 1]], segments * 4);
        for (const corner of corners) offer(corner, segments);
        segments++;
    };
    for (let row = 0; row + 1 < rows; row++) for (let column = 0; column + 1 < columns; column++) {
        const nw = row * columns + column, ne = nw + 1, sw = nw + columns, se = sw + 1, corners = [nw, ne, sw, se];
        const points = [];
        if (land(nw) !== land(ne)) crossing(nw, ne, xOf(column), zOf(row), xOf(column + 1), zOf(row), points);
        if (land(ne) !== land(se)) crossing(ne, se, xOf(column + 1), zOf(row), xOf(column + 1), zOf(row + 1), points);
        if (land(se) !== land(sw)) crossing(se, sw, xOf(column + 1), zOf(row + 1), xOf(column), zOf(row + 1), points);
        if (land(sw) !== land(nw)) crossing(sw, nw, xOf(column), zOf(row + 1), xOf(column), zOf(row), points);
        if (points.length === 4) add(points, 0, 2, corners);
        else if (points.length === 8) {
            // saddle: crossings are ordered top, right, bottom, left; join around the corner whose sign differs from the quad mean
            const mean = (heights[nw] + heights[ne] + heights[sw] + heights[se]) / 4 >= seaLevel;
            if (mean === land(nw)) { add(points, 0, 2, corners); add(points, 4, 6, corners); }
            else { add(points, 0, 6, corners); add(points, 2, 4, corners); }
        }
    }
    const relax = (row, column, offsets) => {
        const cell = row * columns + column;
        for (const [dr, dc] of offsets) {
            const r = row + dr, c = column + dc;
            if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
            const s = nearest[r * columns + c];
            if (s >= 0 && s !== nearest[cell]) offer(cell, s);
        }
    };
    for (let repeat = 0; repeat < 2 && segments; repeat++) {
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) relax(row, column, FORWARD);
        for (let row = rows - 1; row >= 0; row--) for (let column = columns - 1; column >= 0; column--) relax(row, column, BACKWARD);
    }
    const distance = memory.allocate('shore/distance', Float32Array, n);
    let maximumAdjacent = 0;
    for (let i = 0; i < n; i++) {
        const isLand = land(i);
        distance[i] = isLand ? best[i] : -best[i];
        const row = (i / columns) | 0, column = i - row * columns;
        const adjacent = (column + 1 < columns && land(i + 1) !== isLand) || (row + 1 < rows && land(i + columns) !== isLand)
            || (column > 0 && land(i - 1) !== isLand) || (row > 0 && land(i - columns) !== isLand);
        if (adjacent) maximumAdjacent = Math.max(maximumAdjacent, best[i]);
    }
    memory.free('shore/nearest', 'shore/best', 'shore/segments');
    return { distance, statistics: { segments, maximumAdjacentMeters: maximumAdjacent } };
}
