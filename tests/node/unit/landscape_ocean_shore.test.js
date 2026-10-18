// Verifies the AI 597 D2 shore model: the exact signed shore distance, the phase-speed inversion, the fast-marching travel time against a plane wave, refraction and depth-limited breaking on a planar beach, reef shadowing, rock platforms, the sentinel fill and the yielding driver.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_OCEAN_SHORE, landscapeOceanSeaMask, computeLandscapeOceanShore, landscapeOceanPhaseSpeed, landscapeOceanShoreDistance, landscapeOceanShoreFill, landscapeOceanShoreSmoothLand,
    landscapeOceanShoreWaves } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanShore.js';
import { LANDSCAPE_OCEAN } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';

const G = LANDSCAPE_OCEAN.gravity;
const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} vs ${expected}`);
const lcg = seed => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

/** A planar beach: depth falls at the slope from the west edge to the shoreline at shoreX and the land rises beyond it (row 0 at z = 0). */
const beach = (texels, texelMeters, shoreX, slope) => {
    const depth = new Float32Array(texels * texels);
    for (let r = 0; r < texels; r++) for (let c = 0; c < texels; c++) depth[r * texels + c] = (shoreX - (c + .5) * texelMeters) * slope;
    return depth;
};
/** A uniform plane with a deeper strip along the west edge (and the south edge when asked) that the march starts from. */
const plane = (texels, interior, strip, stripTexels, { south = false } = {}) => {
    const depth = new Float32Array(texels * texels).fill(interior);
    for (let r = 0; r < texels; r++) for (let c = 0; c < texels; c++) if (c < stripTexels || (south && r < stripTexels)) depth[r * texels + c] = strip;
    return depth;
};

test('Shore distance: exact against the brute force on both sides of a random coast, and the capped degenerate rasters', () => {
    const texels = 24, texelMeters = .75, random = lcg(7), depth = new Float32Array(texels * texels);
    for (let i = 0; i < depth.length; i++) depth[i] = random() < .45 ? -random() * 3 : random() * 10;
    depth[5] = 0;
    const distance = landscapeOceanShoreDistance(depth, texels, texelMeters);
    assert.ok(distance instanceof Float32Array && distance.length === texels * texels);
    for (let r = 0; r < texels; r++) for (let c = 0; c < texels; c++) {
        const i = r * texels + c, water = depth[i] > 0;
        let nearest = Infinity;
        for (let rr = 0; rr < texels; rr++) for (let cc = 0; cc < texels; cc++) {
            if ((depth[rr * texels + cc] > 0) === water) continue;
            const squared = (rr - r) ** 2 + (cc - c) ** 2;
            if (squared < nearest) nearest = squared;
        }
        const expected = (water ? 1 : -1) * Math.sqrt(nearest) * texelMeters;
        close(distance[i], Math.fround(expected), 1e-6, `texel ${c}, ${r}`);
    }
    assert.ok(distance[5] < 0, 'depth 0 is land');
    const sea = landscapeOceanShoreDistance(new Float32Array(16).fill(3), 4, 2), land = landscapeOceanShoreDistance(new Float32Array(16).fill(-1), 4, 2);
    assert.ok(sea.every(value => value === 8) && land.every(value => value === -8));
    assert.throws(() => landscapeOceanShoreDistance(new Float32Array(15), 4, 2), /texels x texels/);
    assert.throws(() => landscapeOceanShoreDistance(new Float32Array(16), 4, 0), /texel size must be positive/);
});

test('Sea mask: a pocket of water enclosed by land is no shoreline; the sea is the water connected to the boundary', () => {
    // an 8 x 8 raster: the sea on the west (columns 0-2), land east of it, a one-texel pocket at (5, 4) and a two-texel pocket at (5, 1)-(6, 1)
    // (a pocket touching the raster's boundary would be sea: the sea is whatever water reaches the boundary)
    const texels = 8, depth = new Float32Array(texels * texels).fill(-1);
    for (let r = 0; r < texels; r++) for (let c = 0; c < 3; c++) depth[r * texels + c] = 2;
    depth[4 * texels + 5] = .3; depth[1 * texels + 5] = .2; depth[1 * texels + 6] = .2;
    const mask = landscapeOceanSeaMask(depth, texels);
    assert.equal(mask.seaTexels, 24); assert.equal(mask.pockets, 2); assert.equal(mask.pocketTexels, 3);
    assert.equal(mask.sea[4 * texels + 5], 0); assert.equal(mask.sea[1 * texels + 6], 0); assert.equal(mask.sea[3 * texels + 2], 1);
    // the distance ignores the pockets: at (5, 4) the land is 3 texels from the sea's edge (column 2), and the texel beside the pocket too
    const plain = landscapeOceanShoreDistance(depth, texels, 1), masked = landscapeOceanShoreDistance(depth, texels, 1, mask.sea);
    assert.equal(masked[4 * texels + 5], -3); assert.equal(masked[4 * texels + 4], -2); assert.equal(masked[4 * texels + 6], -4);
    assert.equal(masked[1 * texels + 5], -3); assert.equal(masked[1 * texels + 6], -4);
    assert.ok(plain[4 * texels + 5] > 0 && plain[4 * texels + 4] === -1, 'without the mask the pocket is water with its own shoreline');
    assert.throws(() => landscapeOceanShoreDistance(depth, texels, 1, new Uint8Array(3)), /sea mask/);
});

test('Shore fill: the island and the lake take the shoreline values breadth first and no sentinel remains', () => {
    const texels = 16, sentinel = LANDSCAPE_OCEAN_SHORE.travelTimeSentinel, values = new Float32Array(texels * texels).fill(sentinel);
    const finite = [];
    for (let r = 0; r < texels; r++) for (let c = 0; c < texels; c++) {
        // the sea: everything but an island (columns 4-7, rows 4-7) and a lake inside land (columns 10-14, rows 9-14 land; the lake 12-13, 11-12 is water again)
        const island = c >= 4 && c <= 7 && r >= 4 && r <= 7, land = c >= 10 && c <= 14 && r >= 9 && r <= 14, lake = c >= 12 && c <= 13 && r >= 11 && r <= 12;
        if (island || (land && !lake)) continue;
        values[r * texels + c] = 100 + r * texels + c;
        finite.push(values[r * texels + c]);
    }
    const copy = Float32Array.from(values), filled = landscapeOceanShoreFill(values, texels);
    assert.equal(filled, 16 + 30 - 4, 'the island and the land around the lake');
    assert.ok(values.every(value => value < sentinel), 'no sentinel remains');
    const known = new Set(finite);
    for (let i = 0; i < values.length; i++) {
        if (copy[i] < sentinel) assert.equal(values[i], copy[i], 'finite texels keep their value');
        else assert.ok(known.has(values[i]), `filled texel ${i} holds a shoreline value`);
    }
    // the island texel (5, 4) touches exactly one finite texel, (5, 3); the corner (4, 4) touches (4, 3) and (3, 4) and takes the first seeded, (4, 3)
    assert.equal(values[4 * texels + 5], copy[3 * texels + 5]);
    assert.equal(values[4 * texels + 4], copy[3 * texels + 4]);
    // the lake's west shore (11, 11) touches exactly one finite texel, the lake texel (12, 11)
    assert.equal(values[11 * texels + 11], copy[11 * texels + 12]);
    assert.equal(landscapeOceanShoreFill(new Float32Array(4).fill(sentinel), 2), 0, 'no finite texel leaves the raster unchanged');
    assert.throws(() => landscapeOceanShoreFill(new Float64Array(4), 2), /Float32Array/);
});

test('Phase speed: the deep and shallow limits, monotone over depth and the exceptions', () => {
    const period = 8, omega = 2 * Math.PI / period;
    const deep = landscapeOceanPhaseSpeed(period, 1000);
    close(deep.c, G / omega, .01 * G / omega, 'deep c = g / w'); close(deep.cg, .5 * deep.c, .01 * deep.c, 'deep cg = c / 2'); close(deep.k, omega * omega / G, 1e-6, 'deep k');
    const shallow = landscapeOceanPhaseSpeed(period, .05);
    close(shallow.c, Math.sqrt(G * .05), .01 * Math.sqrt(G * .05), 'shallow c = sqrt(g h)'); close(shallow.cg, shallow.c, .01 * shallow.c, 'shallow cg = c');
    let previous = Infinity;
    for (const depth of [500, 100, 30, 10, 3, 1, .3, .1]) {
        const wave = landscapeOceanPhaseSpeed(period, depth);
        close(wave.k * Math.tanh(wave.k * depth) * G, omega * omega, 1e-9, `dispersion holds at ${depth} m`);
        assert.ok(wave.c < previous && wave.cg <= wave.c + 1e-12, `slower over ${depth} m`);
        previous = wave.c;
    }
    assert.throws(() => landscapeOceanPhaseSpeed(0, 10), /period must be positive/);
    assert.throws(() => landscapeOceanPhaseSpeed(8, -1), /depth must be positive/);
});

test('Shore waves: the march over a uniform plane reproduces the plane-wave travel time and keeps the deep height', () => {
    const texels = 128, texelMeters = 4, period = 8, heading = 60, depth = plane(texels, 20, 20.5, 3, { south: true });
    const { travelTime, waveHeight, breaking, statistics } = landscapeOceanShoreWaves({ depth, texels, texelMeters, periodSeconds: period, heightMeters: 1, headingDegrees: heading, deepDepthMeters: 20.25 });
    const dx = Math.sin(heading * Math.PI / 180), dz = Math.cos(heading * Math.PI / 180), c = landscapeOceanPhaseSpeed(period, 20).c, cDeep = landscapeOceanPhaseSpeed(period, 20.25).c;
    assert.equal(statistics.sources, 3 * texels + 3 * (texels - 3)); assert.equal(statistics.visited, texels * texels - statistics.sources); assert.equal(statistics.water, texels * texels);
    assert.equal(statistics.breakingTexels, 0); assert.ok(breaking.every(value => value === 0)); assert.equal(statistics.deepDepthMeters, 20.25);
    const origin = (.5 * dx + .5 * dz) * texelMeters / cDeep, maxTime = ((texels - .5) * dx + (texels - .5) * dz) * texelMeters / c;
    let worst = 0;
    for (let r = 0; r < texels; r++) for (let c2 = 0; c2 < texels; c2++) {
        const expected = ((c2 + .5) * dx + (r + .5) * dz) * texelMeters / c - origin, actual = travelTime[r * texels + c2];
        if (depth[r * texels + c2] > 20) continue;
        close(actual, expected, .02 * maxTime, `texel ${c2}, ${r}`);
        if (expected >= 5) worst = Math.max(worst, Math.abs(actual - expected) / expected);
        close(waveHeight[r * texels + c2], 1, .02, 'the height stays the deep height on a flat floor');
    }
    assert.ok(worst <= .02, `relative error ${worst}`);
    assert.equal(travelTime[0], 0, 'the earliest source is at 0');
});

test('Shore waves: a planar beach refracts the swell toward the shore normal and lands hold the sentinel', () => {
    const texels = 256, texelMeters = 4, depth = beach(texels, texelMeters, 800, 1 / 20);
    const { travelTime, waveHeight, breaking, statistics } = landscapeOceanShoreWaves({ depth, texels, texelMeters, periodSeconds: 10, heightMeters: 1, headingDegrees: 60, deepDepthMeters: 30 });
    assert.ok(statistics.sources > 0 && statistics.breakingTexels > 0 && statistics.visited > 0);
    assert.equal(statistics.crestAngle.texels, statistics.breakingTexels);
    assert.ok(statistics.crestAngle.meanDegrees < 12, `crests turn parallel to the beach: ${statistics.crestAngle.meanDegrees}`);
    // the propagation direction over deep water keeps the 30 degree incidence (central differences of T at x = 300 m, z = 600 m)
    const i = 150 * texels + 75, gx = (travelTime[i + 1] - travelTime[i - 1]) / (2 * texelMeters), gz = (travelTime[i + texels] - travelTime[i - texels]) / (2 * texelMeters);
    const deepAngle = Math.atan2(gz, gx) * 180 / Math.PI;
    assert.ok(deepAngle > 25 && deepAngle < 32, `deep-water angle ${deepAngle}`);
    for (let r = 0; r < texels; r += 17) for (let c = 200; c < texels; c++) {
        const j = r * texels + c;
        assert.equal(travelTime[j], 1e9); assert.equal(waveHeight[j], 0); assert.equal(breaking[j], 0);
    }
    assert.ok(statistics.breakingDepth.p90 < 3 && statistics.breakingDepth.p10 > 0, 'the surf zone is the shallow water');
    // the crest-angle statistic restricted to a mask (the beach zones of a coast): only the masked breaking texels count
    const crestMask = new Uint8Array(texels * texels);
    let masked = 0;
    for (let r = 0; r < texels; r++) for (let c = 0; c < 197; c++) { crestMask[r * texels + c] = 1; if (breaking[r * texels + c]) masked++; }
    const restricted = landscapeOceanShoreWaves({ depth, texels, texelMeters, periodSeconds: 10, heightMeters: 1, headingDegrees: 60, deepDepthMeters: 30, crestMask });
    assert.ok(masked > 0 && masked < statistics.breakingTexels);
    assert.equal(restricted.statistics.crestAngle.texels, masked);
    assert.equal(restricted.statistics.breakingTexels, statistics.breakingTexels);
    assert.ok(Number.isFinite(restricted.statistics.crestAngle.meanDegrees));
    assert.throws(() => landscapeOceanShoreWaves({ depth, texels, texelMeters, periodSeconds: 10, heightMeters: 1, headingDegrees: 60, crestMask: new Uint8Array(3) }), /crestMask/);
});

test('Shore waves: depth-limited breaking starts near H / gamma on the beach, deeper for bigger waves', () => {
    const texels = 256, texelMeters = 2, depth = beach(texels, texelMeters, 400, 1 / 20), gamma = LANDSCAPE_OCEAN_SHORE.defaultGamma;
    let previous = 0;
    for (const heightMeters of [.5, 1, 2]) {
        const { breaking, waveHeight, statistics } = landscapeOceanShoreWaves({ depth, texels, texelMeters, periodSeconds: 4, heightMeters, headingDegrees: 90 });
        let deepest = 0;
        for (let i = 0; i < breaking.length; i++) if (breaking[i] && depth[i] > deepest) deepest = depth[i];
        close(deepest, heightMeters / gamma, .2 * heightMeters / gamma, `breaking depth of ${heightMeters} m`);
        assert.ok(deepest > previous, 'bigger waves break deeper');
        previous = deepest;
        for (let i = 0; i < breaking.length; i++) if (breaking[i]) close(waveHeight[i], gamma * depth[i], 1e-3, 'a breaking texel holds the depth-limited height');
        assert.ok(statistics.breakingDepth.median < deepest && statistics.breakingDepth.p90 <= deepest);
    }
});

test('Shore waves: a reef caps the swell behind it, a rock platform lets it surge through', () => {
    const texels = 160, texelMeters = 4, depth = plane(texels, 10, 12, 4), rock = new Uint8Array(texels * texels);
    for (let r = 0; r < texels; r++) for (let c = 60; c < 64; c++) { depth[r * texels + c] = 2; rock[r * texels + c] = 1; }
    const input = { depth, texels, texelMeters, periodSeconds: 8, heightMeters: 2, headingDegrees: 90, deepDepthMeters: 11 };
    const reef = landscapeOceanShoreWaves(input), upstream = 80 * texels + 30, onReef = 80 * texels + 61, downstream = 80 * texels + 120;
    assert.ok(reef.waveHeight[downstream] < .9 * reef.waveHeight[upstream], `shadow ${reef.waveHeight[downstream]} vs ${reef.waveHeight[upstream]}`);
    assert.equal(reef.breaking[onReef], 1); assert.equal(reef.breaking[downstream], 0); assert.equal(reef.breaking[upstream], 0);
    close(reef.waveHeight[onReef], LANDSCAPE_OCEAN_SHORE.defaultGamma * 2, 1e-3, 'the reef holds the depth-limited height');
    assert.equal(reef.statistics.breakingTexels, 4 * texels);
    const surge = landscapeOceanShoreWaves({ ...input, rock });
    assert.equal(surge.statistics.breakingTexels, 0); assert.equal(surge.breaking[onReef], 0);
    assert.ok(surge.waveHeight[onReef] > LANDSCAPE_OCEAN_SHORE.defaultGamma * 2, 'rock keeps the uncapped height');
    close(surge.waveHeight[downstream], surge.waveHeight[upstream], 1e-6, 'the flux passes the rock untouched');
    assert.ok(surge.waveHeight[downstream] > reef.waveHeight[downstream]);
    assert.throws(() => landscapeOceanShoreWaves({ ...input, rock: new Uint8Array(3) }), /rock must be a Uint8Array/);
    assert.throws(() => landscapeOceanShoreWaves({ ...input, heightMeters: -1 }), /must not be negative/);
    assert.throws(() => landscapeOceanShoreWaves({ ...input, periodSeconds: 0 }), /period must be positive/);
});

test('Shore waves: without a texel at the source depth the deepest percent of the water starts the march', () => {
    const texels = 64, texelMeters = 4, depth = beach(texels, texelMeters, 200, 1 / 20);
    const { statistics, travelTime } = landscapeOceanShoreWaves({ depth, texels, texelMeters, periodSeconds: 8, heightMeters: .5, headingDegrees: 90 });
    assert.ok(statistics.deepDepthMeters < 50 && statistics.deepDepthMeters > 9, `fallback threshold ${statistics.deepDepthMeters}`);
    assert.equal(statistics.sources, texels, 'the deepest column');
    assert.ok(travelTime[32 * texels + 10] > 0 && travelTime[32 * texels + 10] < 1e9);
});

test('Shore waves: the yielding driver repeats the synchronous result bit for bit and yields on a 256 raster', async () => {
    const texels = 256, texelMeters = 4, depth = beach(texels, texelMeters, 800, 1 / 20);
    const input = { depth, texels, texelMeters, periodSeconds: 10, heightMeters: 1, headingDegrees: 60, deepDepthMeters: 30 };
    const sync = landscapeOceanShoreWaves(input), shoreDistance = landscapeOceanShoreDistance(depth, texels, texelMeters);
    const yields = [];
    const result = await computeLandscapeOceanShore(input, { yieldEvery: 8192, onYield: progress => yields.push(progress) });
    assert.ok(yields.length >= 1, 'yielded at least once'); assert.ok(yields.every(progress => progress.accepted > 0 && progress.accepted <= progress.total));
    assert.equal(result.statistics.visited, sync.statistics.visited);
    assert.ok(Buffer.from(result.travelTime.buffer).equals(Buffer.from(sync.travelTime.buffer)), 'travel time');
    assert.ok(Buffer.from(result.waveHeight.buffer).equals(Buffer.from(sync.waveHeight.buffer)), 'wave height');
    assert.ok(Buffer.from(result.breaking.buffer).equals(Buffer.from(sync.breaking.buffer)), 'breaking');
    assert.ok(Buffer.from(result.shoreDistance.buffer).equals(Buffer.from(shoreDistance.buffer)), 'shore distance');
    assert.deepEqual(result.statistics, sync.statistics);
    assert.ok(result.milliseconds >= 0);
    await assert.rejects(() => computeLandscapeOceanShore(input, { yieldEvery: 0 }), /yieldEvery must be a positive integer/);
});

test('Shore smoothing: the land side of a filled raster blends into a continuous field while the water keeps its values', () => {
    const texels = 8, depth = new Float32Array(64), values = new Float32Array(64);
    for (let r = 0; r < texels; r++) for (let c = 0; c < texels; c++) { depth[r * texels + c] = c < 4 ? 1 : -1; values[r * texels + c] = c < 4 ? 10 + r : (r < 4 ? 10 : 17); }
    const water = Float32Array.from(values);
    const smoothed = landscapeOceanShoreSmoothLand(values, depth, texels, 2);
    assert.equal(smoothed, 32);
    for (let i = 0; i < 64; i++) if (depth[i] > 0) assert.equal(values[i], water[i]);
    // the step between the two land blocks (10 and 17) is now a ramp
    const column = c => Array.from({ length: texels }, (_, r) => values[r * texels + c]);
    const ramp = column(6);
    for (let r = 1; r < texels; r++) assert.ok(ramp[r] >= ramp[r - 1] - 1e-6, 'monotone ramp');
    assert.ok(ramp[3] > 10 && ramp[4] < 17);
    assert.throws(() => landscapeOceanShoreSmoothLand(values, depth, texels, 0), /passes/);
    assert.throws(() => landscapeOceanShoreSmoothLand(new Float32Array(3), depth, texels), /raster/);
});
