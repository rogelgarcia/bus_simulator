// Generates the deterministic 1 x 1 km base terrain of the D2/D3 synthesis fixture (sea, beach, a coastal terrace, rising land, a soft hill) as raw float32 heights and cover at any fixture spacing.
// @ts-check
// The base is analytic (no noise), so the fixture's relief comes entirely from the operators under test; the recipe imports it with
// import-heights (raw-float32) through the fixture leaf, which writes these bytes into its stage before execution. The same formulas
// evaluate the base on every fixture grid (1.953125, 0.9765625 and 0.48828125 m: 513, 1025 and 2049 samples over the same 1 km), and
// because the sample positions are dyadic fractions the vertices the grids share get bit-identical float32 values, which is what lets the
// D3 resolution study compare the spacings on one landform. The formulas extend over the 4 x 4 km city extent unchanged (sea west of
// x = 220, land rising east to about 111 m), which gives the study its city-sized streaming fixtures at the coastal city's node counts.

/** The native spacings the fixture is defined at (meters), coarsest first: 1 km over 512, 1024 and 2048 intervals of 256-interval chunks. */
export const FIXTURE_SPACINGS = Object.freeze([1.953125, 0.9765625, 0.48828125]);
export const FIXTURE_EXTENT_METERS = 1000;
/** The city extent of the coastal city (4 x 4 km): 2049² at 1.953125 m (maxLevel 3, 85 nodes) and 4097² at 0.9765625 m (maxLevel 4, 341 nodes). */
export const FIXTURE_CITY_EXTENT_METERS = 4000;
export const FIXTURE_CHUNK_INTERVALS = 256;
export const FIXTURE_SEA_LEVEL = 0;

/** Four-digit file tag of a fixture spacing (`1953`, `0977`, `0488`: the spacing in millimeters, rounded). @param {number} spacing */
export function fixtureSpacingTag(spacing) {
    if (!FIXTURE_SPACINGS.includes(spacing)) throw new Error(`[FixtureBase] ${spacing} is not a fixture spacing (${FIXTURE_SPACINGS.join(', ')})`);
    return String(Math.round(spacing * 1000)).padStart(4, '0');
}

/**
 * The square fixture grid at one of the fixture spacings: bounds 0..extent, 256-interval chunks and the dyadic maxLevel the extent needs
 * (1 km: 513/1025/2049 samples at maxLevel 1/2/3; 4 km: 2049/4097 samples at maxLevel 3/4). The extent must be a power-of-two multiple
 * of 256 intervals at the spacing, so every grid is a complete chunk hierarchy of the saved-landscape model.
 * @param {number} spacing @param {{extentMeters?:number}} [options]
 */
export function fixtureGridForSpacing(spacing, { extentMeters = FIXTURE_EXTENT_METERS } = {}) {
    fixtureSpacingTag(spacing);
    const intervals = extentMeters / spacing, maxLevel = Math.log2(intervals / FIXTURE_CHUNK_INTERVALS);
    if (!Number.isInteger(intervals) || !Number.isInteger(maxLevel) || maxLevel < 0) throw new Error(`[FixtureBase] a ${extentMeters} m extent at ${spacing} m is not 256 x 2^k intervals`);
    return Object.freeze({ columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: Object.freeze({ minX: 0, maxX: extentMeters, minZ: 0, maxZ: extentMeters }), chunkIntervals: FIXTURE_CHUNK_INTERVALS, maxLevel });
}

/** The D2 gate grid (the coarsest fixture spacing). */
export const FIXTURE_GRID = fixtureGridForSpacing(FIXTURE_SPACINGS[0]);

/** Height of the base at a world position: seabed west of the coast, a sand ramp, then land rising east with a broad hill. @param {number} x @param {number} z */
export function fixtureBaseHeight(x, z) {
    const shore = 220 + 18 * Math.sin(z / 1000 * Math.PI * 2) + 6 * Math.sin(z / 137), d = x - shore;
    if (d < 0) return Math.max(-18, d * .06);
    // a 60 m sand ramp, a 100 m coastal terrace rise (so a bluff can be cut into it), then gently rising land with a broad hill
    const beach = Math.min(d, 60) * .035, terrace = Math.max(0, Math.min(d - 60, 100)) * .08, land = Math.max(0, d - 160) * .028, hill = 14 * Math.exp(-(((x - 760) / 180) ** 2) - ((z - 560) / 220) ** 2);
    return beach + terrace + land + hill;
}

/** Land-cover class of the base: water below sea level, sand within 60 m of the coast, grass then forest soil inland. @param {number} x @param {number} z @param {number} height */
export function fixtureBaseCover(x, z, height) {
    if (height < FIXTURE_SEA_LEVEL) return 0;
    const shore = 220 + 18 * Math.sin(z / 1000 * Math.PI * 2) + 6 * Math.sin(z / 137), d = x - shore;
    return d < 60 ? 1 : d < 260 ? 2 : 3;
}

/** The base grid as little-endian float32 height bytes and uint8 cover bytes (row 0 north). @param {ReturnType<typeof fixtureGridForSpacing>} [grid] */
export function createFixtureBase(grid = FIXTURE_GRID) {
    const { columns, rows, spacingX, spacingZ, bounds } = grid, n = columns * rows;
    const heights = new Float32Array(n), cover = new Uint8Array(n);
    for (let row = 0; row < rows; row++) {
        const z = bounds.maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const x = bounds.minX + column * spacingX, height = fixtureBaseHeight(x, z), i = row * columns + column;
            heights[i] = height; cover[i] = fixtureBaseCover(x, z, height);
        }
    }
    const heightBytes = new Uint8Array(n * 4), view = new DataView(heightBytes.buffer);
    for (let i = 0; i < n; i++) view.setFloat32(i * 4, heights[i], true);
    return { grid, heights, cover, heightBytes, coverBytes: cover };
}
