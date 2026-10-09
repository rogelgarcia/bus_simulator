// Generates the deterministic 1 x 1 km base terrain of the D2 synthesis fixture (sea, beach, a coastal terrace, rising land, a soft hill) as raw float32 heights and cover.
// @ts-check
// The base is analytic (no noise), so the fixture's relief comes entirely from the operators under test; the recipe imports it with
// import-heights (raw-float32) through the fixture leaf, which writes these bytes into its stage before execution.

export const FIXTURE_GRID = Object.freeze({ columns: 513, rows: 513, spacingX: 1.953125, spacingZ: 1.953125, bounds: Object.freeze({ minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 }), chunkIntervals: 256, maxLevel: 1 });
export const FIXTURE_SEA_LEVEL = 0;

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

/** The base grid as little-endian float32 height bytes and uint8 cover bytes (row 0 north). */
export function createFixtureBase() {
    const { columns, rows, spacingX, spacingZ, bounds } = FIXTURE_GRID, n = columns * rows;
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
    return { grid: FIXTURE_GRID, heights, cover, heightBytes, coverBytes: cover };
}
