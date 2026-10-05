// Computes exact terrain horizon angles along grid lines with convex-hull sweeps and integrates the facet sky-view factor.
// @ts-check
// Every sample lies on exactly one line per integer direction step; lines are swept from their far end with an upper convex hull
// of the samples ahead (each sample is pushed and popped at most once), so the horizon is the maximum elevation angle to any sample
// ahead on the line, over the whole landscape, in O(samples) per direction. Rows, columns and the NW-SE diagonal follow edges of the
// triangulated surface, whose profile maxima are at vertices, so those horizons are exact. Knight-move directions sample every
// grid point on their line (step sqrt(5) samples) and only feed the sky-view integral. Beyond the landscape there is no terrain.

const TAU = Math.PI * 2;

/** Integer (column, row) steps; rows increase to the south, so azimuth = atan2(-row, column) counterclockwise from +X (east) toward +Z (north). */
export const TERRAIN_HORIZON_STORED_STEPS = Object.freeze([[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]]);
export const TERRAIN_HORIZON_KNIGHT_STEPS = Object.freeze([[2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2], [1, 2], [2, 1]]);

/** @param {number[]} step @param {{spacingX:number,spacingZ:number}} grid */
export function horizonStepAzimuth(step, grid) {
    const azimuth = Math.atan2(-step[1] * grid.spacingZ, step[0] * grid.spacingX);
    return azimuth < 0 ? azimuth + TAU : azimuth + 0;
}

/**
 * Directions used by the sky-view integral, sorted by azimuth, each with its trapezoidal azimuth weight (radians, summing to 2π).
 * @param {{spacingX:number,spacingZ:number}} grid
 */
export function skyViewDirections(grid) {
    const directions = [...TERRAIN_HORIZON_STORED_STEPS, ...TERRAIN_HORIZON_KNIGHT_STEPS].map(step => ({ step, azimuth: horizonStepAzimuth(step, grid) }))
        .sort((a, b) => a.azimuth - b.azimuth);
    return directions.map((direction, i) => {
        const previous = directions[(i + directions.length - 1) % directions.length].azimuth, next = directions[(i + 1) % directions.length].azimuth;
        const gap = (a, b) => ((b - a) % TAU + TAU) % TAU;
        return { ...direction, weight: (gap(previous, direction.azimuth) + gap(direction.azimuth, next)) / 2 };
    });
}

/**
 * Writes tan(horizon elevation) of every sample looking along `step` into `tangents` (-Infinity where no terrain lies ahead).
 * @param {{columns:number,rows:number,spacingX:number,spacingZ:number}} grid @param {Float32Array} heights @param {number[]} step
 * @param {Float32Array} tangents @param {{line:Int32Array,t:Float64Array,z:Float64Array}} scratch
 */
export function sweepHorizon(grid, heights, step, tangents, scratch) {
    const { columns, rows } = grid, [dc, dr] = step, length = Math.hypot(dc * grid.spacingX, dr * grid.spacingZ);
    const { line, t: hullT, z: hullZ } = scratch;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const pc = column - dc, pr = row - dr;
        if (pc >= 0 && pr >= 0 && pc < columns && pr < rows) continue;
        let count = 0;
        for (let c = column, r = row; c >= 0 && r >= 0 && c < columns && r < rows; c += dc, r += dr) line[count++] = r * columns + c;
        let top = -1;
        for (let k = count - 1; k >= 0; k--) {
            const index = line[k], t = k * length, z = heights[index];
            while (top >= 1 && (hullZ[top - 1] - z) / (hullT[top - 1] - t) >= (hullZ[top] - z) / (hullT[top] - t)) top--;
            tangents[index] = top >= 0 ? (hullZ[top] - z) / (hullT[top] - t) : -Infinity;
            top++; hullT[top] = t; hullZ[top] = z;
        }
    }
}

/** @param {{columns:number,rows:number}} grid */
export function horizonScratch(grid) {
    const longest = Math.max(grid.columns, grid.rows);
    return { line: new Int32Array(longest), t: new Float64Array(longest), z: new Float64Array(longest) };
}

/**
 * Cosine-weighted visible sky over one azimuth slice of a facet with unit normal (nx, ny, nz): the integral over elevation e from
 * max(0, horizon, facet tangent plane) to 90° of max(0, n·ω)·cos e. a = ny, b = horizontal normal component along the azimuth.
 * @param {number} horizonTangent tan(horizon elevation) or -Infinity @param {number} a @param {number} b
 */
export function skyViewSlice(horizonTangent, a, b) {
    let lower = horizonTangent > 0 ? Math.atan(horizonTangent) : 0;
    if (b < 0) lower = Math.max(lower, Math.atan2(-b, a));
    if (lower >= Math.PI / 2) return 0;
    const sine = Math.sin(lower);
    return Math.max(0, a * (1 - sine * sine) / 2 + b * (Math.PI / 4 - lower / 2 - Math.sin(2 * lower) / 4));
}

/** sin(horizon elevation), clamped to the horizontal: the stored horizon quantity. @param {number} tangent */
export function horizonSine(tangent) { return tangent > 0 ? tangent / Math.sqrt(1 + tangent * tangent) : 0; }
