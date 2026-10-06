// Verifies the AI577 D6 surface cache runtime contracts that run on the CPU: the generation cost controller, the near-field band, weight, reach and
// draw ranges, monotonic page invalidation, the v2 demand (near-core pruning, motion LOD bias, prefetch views, allocation-free envelope queries)
// and the incremental indirection rebuild of moving windows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_SURFACE_CACHE_CONTROLLER, fitLandscapeSurfaceCacheCost, landscapeSurfaceCacheBatchCost, landscapeSurfaceCacheGenerationTarget,
    nextLandscapeSurfaceCacheQuota } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheController.js';
import { LANDSCAPE_SURFACE_CACHE_NEAR, landscapeSurfaceCacheNearBand, landscapeSurfaceCacheNearRanges, landscapeSurfaceCacheNearReach, landscapeSurfaceCacheNearWeight,
    selectLandscapeSurfaceCacheNearTiles } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheNearField.js';
import { indexLandscapeSurfaceCacheInputs, landscapeSurfaceCacheInputChange, landscapeSurfaceCachePageInputs, landscapeSurfaceCacheSoilTiers,
    landscapeSurfaceCacheTierRank } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheInputs.js';
import { LANDSCAPE_SURFACE_CACHE, landscapeSurfaceCacheGeometry, landscapeSurfaceCachePageKey, landscapeSurfaceCacheWindowOrigin } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_SURFACE_CACHE_DEMAND, chooseLandscapeSurfaceCacheCenter, createLandscapeSurfaceCacheTerrainEnvelope, planLandscapeSurfaceCacheDemand } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheDemand.js';
import { LandscapeSurfaceCacheIndirection, LandscapeSurfaceCacheResidency } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheResidency.js';

const coastal = landscapeSurfaceCacheGeometry({ minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 });
const LEVEL_SPACINGS = [15.625, 7.8125, 3.90625, 1.953125, .9765625, .48828125, .244140625];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], normalize = v => { const l = Math.hypot(...v); return v.map(c => c / l); };

// a symmetric perspective camera (Y up) as landscapeCameraSnapshot describes it, plus its ray through a pixel
function perspectiveCamera({ eye, target, fovDegrees = 55, aspect = 16 / 9, near = .1, far = 25000, viewportHeight = 1080 }) {
    const forward = normalize(sub(target, eye)), right = normalize(cross(forward, [0, 1, 0])), up = cross(right, forward);
    const tanY = Math.tan(fovDegrees * Math.PI / 360), tanX = tanY * aspect;
    const plane = normal => { const n = normalize(normal); return { x: n[0], y: n[1], z: n[2], w: -dot(n, eye) }; };
    const planes = [plane(forward), plane(forward.map(c => -c))];
    planes[0].w = -dot(forward, eye) - near; planes[1].w = dot(forward, eye) + far;
    planes.push(plane(right.map((c, i) => forward[i] * tanX - c)), plane(right.map((c, i) => forward[i] * tanX + c)));
    planes.push(plane(up.map((c, i) => forward[i] * tanY - c)), plane(up.map((c, i) => forward[i] * tanY + c)));
    const viewportWidth = Math.round(viewportHeight * aspect);
    const ray = (px, py) => normalize(forward.map((c, i) => c + right[i] * tanX * (2 * px / viewportWidth - 1) + up[i] * tanY * (1 - 2 * py / viewportHeight)));
    return { projection: 'perspective', position: { x: eye[0], y: eye[1], z: eye[2] }, direction: { x: forward[0], y: forward[1], z: forward[2] }, viewportHeight, zoom: 1,
        fovYRadians: fovDegrees * Math.PI / 180, orthoHeight: 1, frustumPlanes: planes, ray, viewportWidth, eye };
}

test('Surface cache controller: a line fit of fixed and per-page cost sizes batches the per-page ratio would keep small', () => {
    assert.equal(LANDSCAPE_SURFACE_CACHE_CONTROLLER.id, 'landscape-surface-cache-controller-v3');
    const line = pages => .35 + .021 * pages;
    const exact = fitLandscapeSurfaceCacheCost([4, 6, 8, 10, 12, 16].map(pages => [pages, line(pages)]));
    assert.equal(exact.fitted, true);
    assert.ok(Math.abs(exact.fixedMs - .35) < 1e-9 && Math.abs(exact.perPageMs - .021) < 1e-9 && exact.marginMs < 1e-9 && exact.outliers === 0);
    // batches kept small by a lack of candidates: the ratio per page (the D6 controller's predecessor) charges them the fixed cost; the line does not
    let quota = 6;
    const window = [];
    for (let batch = 0; batch < 24; batch++) {
        const pages = Math.min(Math.round(quota), 4 + (batch % 5));
        window.push([pages, line(pages)]);
        quota = nextLandscapeSurfaceCacheQuota({ quota, model: fitLandscapeSurfaceCacheCost(window), targetMs: 1, limitMs: 1.2, lastMs: line(pages), lastPages: pages, maximum: 64, growth: 1.25, cut: .7 });
    }
    assert.ok(Math.abs(quota - (1 - .35) / .021) < .5, `quota ${quota} reaches the line's ${(1 - .35) / .021}`);
    const ratio = 1 / window.map(([pages, ms]) => ms / pages).sort((a, b) => a - b)[Math.floor((window.length - 1) * .75)];
    assert.ok(ratio < 12, `a per-page ratio would stay near ${ratio.toFixed(1)} pages`);
    // without spread the prior per-page cost applies with a median intercept; growth is bounded but at least two pages
    const flat = fitLandscapeSurfaceCacheCost([[8, .5], [8, .52], [8, .48]]);
    assert.equal(flat.fitted, false);
    assert.equal(flat.perPageMs, LANDSCAPE_SURFACE_CACHE_CONTROLLER.priorPerPageMs);
    assert.ok(Math.abs(flat.fixedMs - (.5 - 8 * .021)) < 1e-9);
    assert.equal(nextLandscapeSurfaceCacheQuota({ quota: 8, model: exact, targetMs: 1, limitMs: 1.2, lastMs: .5, lastPages: 8, maximum: 64, growth: 1.25, cut: .7 }), 10);
    assert.equal(nextLandscapeSurfaceCacheQuota({ quota: 1, model: exact, targetMs: 1, limitMs: 1.2, lastMs: .37, lastPages: 1, maximum: 64, growth: 1.25, cut: .7 }), 3, 'a collapsed quota grows by two pages, not 25%');
    // a batch whose own cost exceeds the limit cuts at once, whether or not the line explains it (controller v2 held the quota on the second)
    assert.equal(nextLandscapeSurfaceCacheQuota({ quota: 64, model: exact, targetMs: 1, limitMs: 1.2, lastMs: line(60), lastPages: 60, maximum: 64, growth: 1.25, cut: .7 }), 60 * .7);
    assert.ok(Math.abs(nextLandscapeSurfaceCacheQuota({ quota: 20, model: exact, targetMs: 1, limitMs: 1.2, lastMs: 3.5, lastPages: 12, maximum: 64, growth: 1.25, cut: .7 }) - 12 * .7) < 1e-9);
    // the own cost of a batch: an unpack (normally a few hundredths of a millisecond) that took far longer ran another process's work inside its timer
    // window, so it counts at most four times the recent median (never capped below 0.25 ms) and the rest is external; such a batch does not cut
    const inflated = landscapeSurfaceCacheBatchCost({ generationMs: .5, unpackMs: 2.4, unpackMedianMs: .04 });
    assert.ok(Math.abs(inflated.ms - .75) < 1e-9 && Math.abs(inflated.externalMs - 2.15) < 1e-9, JSON.stringify(inflated));
    assert.deepEqual(landscapeSurfaceCacheBatchCost({ generationMs: .5, unpackMs: .05, unpackMedianMs: .04 }), { ms: .55, externalMs: 0 });
    const wide = landscapeSurfaceCacheBatchCost({ generationMs: .5, unpackMs: .6, unpackMedianMs: .2 });
    assert.ok(Math.abs(wide.ms - 1.1) < 1e-9 && wide.externalMs === 0, 'an unpack within four times its median is the batch\'s own');
    assert.equal(landscapeSurfaceCacheBatchCost({ generationMs: .5, unpackMs: 1, unpackMedianMs: null }).ms, .75, 'before a median the floor caps it');
    assert.equal(nextLandscapeSurfaceCacheQuota({ quota: 20, model: exact, targetMs: 1, limitMs: 1.2, lastMs: inflated.ms, lastPages: 12, maximum: 64, growth: 1.25, cut: .7 }), 25);
    // noisy batches widen the margin (90th percentile of the residuals) and lower the quota
    const noisy = fitLandscapeSurfaceCacheCost([4, 6, 8, 10, 12, 16, 5, 7, 9, 11].map((pages, i) => [pages, line(pages) + (i % 3 === 0 ? .25 : 0)]));
    assert.ok(noisy.marginMs > .1, `margin ${noisy.marginMs}`);
    const settledQuota = model => nextLandscapeSurfaceCacheQuota({ quota: 64, model, targetMs: 1, limitMs: 1.2, lastMs: .5, lastPages: 8, maximum: 64, growth: 1.25, cut: .7 });
    assert.ok(settledQuota(noisy) < settledQuota(exact), `noisy ${settledQuota(noisy)} against ${settledQuota(exact)}`);
    // rare outliers (two batches in 24) neither steepen the line nor widen the margin; frequent ones (four in 24, above one in ten) widen it
    const sizes24 = [4, 6, 8, 10, 12, 16, 5, 7, 9, 11, 13, 15, 6, 8, 10, 12, 14, 9, 7, 5, 11, 13, 8, 10];
    const spiky = sizes24.map((pages, i) => [pages, line(pages) + (i === 5 ? 3.5 : i === 17 ? 2.9 : 0)]);
    const robust = fitLandscapeSurfaceCacheCost(spiky);
    assert.ok(Math.abs(robust.perPageMs - .021) < 1e-6 && Math.abs(robust.fixedMs - .35) < 1e-6 && robust.marginMs < 1e-6, JSON.stringify(robust));
    assert.equal(robust.outliers, 2);
    const frequent = fitLandscapeSurfaceCacheCost(sizes24.map((pages, i) => [pages, line(pages) + (i % 6 === 1 ? .6 : 0)]));
    assert.ok(Math.abs(frequent.marginMs - .6) < 1e-6 && Math.abs(frequent.perPageMs - .021) < 1e-6, JSON.stringify(frequent));
    assert.ok(settledQuota(frequent) < settledQuota(robust), `frequent outliers ${settledQuota(frequent)} against rare ${settledQuota(robust)}`);
    // the tail: with three batches in 24 half a millisecond above the line, the margin (90th percentile) ignores them but the 95th percentile must fit
    // under the limit, so the batch shrinks from the target's 31 pages to 16.7; a tail beyond the limit halves the batch, never more
    const tailed = fitLandscapeSurfaceCacheCost(sizes24.map((pages, i) => [pages, line(pages) + (i % 8 === 3 ? .5 : 0)]));
    assert.ok(Math.abs(tailed.marginMs) < 1e-6 && Math.abs(tailed.tailMs - .5) < 1e-6, JSON.stringify(tailed));
    assert.ok(Math.abs(settledQuota(tailed) - (1.2 - .35 - .5) / .021) < 1e-6, `tail quota ${settledQuota(tailed)}`);
    const extreme = fitLandscapeSurfaceCacheCost(sizes24.map((pages, i) => [pages, line(pages) + (i % 8 === 3 ? 3 : 0)]));
    assert.ok(Math.abs(settledQuota(extreme) - (1 - .35) / .021 / 2) < 1e-6, `extreme tail quota ${settledQuota(extreme)}`);
    // the D6 failure: one-page batches with two spikes in the window held the quota at one page; it now recovers to the line's size within a few batches
    let recovering = 1;
    const history = Array.from({ length: 24 }, (_, i) => [1, line(1) + (i === 3 ? 3.3 : i === 11 ? 2.9 : 0)]);
    const sizes = [];
    for (let batch = 0; batch < 16; batch++) {
        const pages = Math.max(1, Math.round(recovering));
        history.push([pages, line(pages)]); history.shift();
        recovering = nextLandscapeSurfaceCacheQuota({ quota: recovering, model: fitLandscapeSurfaceCacheCost(history), targetMs: 1, limitMs: 1.2, lastMs: line(pages), lastPages: pages, maximum: 64, growth: 1.25, cut: .7 });
        sizes.push(Math.round(recovering));
    }
    assert.ok(sizes[5] >= 10 && sizes.at(-1) >= 25, `recovering quotas ${sizes.join(', ')}`);
    // the target: the budget, or the headroom below the frame period and its margin, never below the floor
    const target = frameGpuMs => landscapeSurfaceCacheGenerationTarget({ frameGpuMs, budgetMs: 1, periodMs: 1000 / 60, marginMs: 2, floorMs: .3 });
    assert.equal(target(null), 1);
    assert.equal(target(5), 1);
    assert.ok(Math.abs(target(14) - (1000 / 60 - 16)) < 1e-9);
    assert.equal(target(15.5), .3);
    // the runtime passes the whole budget as the floor while pages the current view samples are missing (AI577 D7)
    assert.equal(landscapeSurfaceCacheGenerationTarget({ frameGpuMs: 17.5, budgetMs: 1, periodMs: 1000 / 60, marginMs: 2, floorMs: 1 }), 1);
});

test('Surface cache near field: the band ends at one mip-0 texel and the weight mirrors the cache footprint metric', () => {
    const band = landscapeSurfaceCacheNearBand();
    assert.equal(LANDSCAPE_SURFACE_CACHE_NEAR.id, 'landscape-surface-cache-near-v1');
    assert.deepEqual({ ...band }, { start: .75 * LANDSCAPE_SURFACE_CACHE.texel0Meters, end: LANDSCAPE_SURFACE_CACHE.texel0Meters }, 'the band ends at one mip-0 texel');
    assert.throws(() => landscapeSurfaceCacheNearBand({ startTexels: 2, endTexels: 1 }), /end above its start/);
    const weight = (dx, dy, anisotropy = 2) => landscapeSurfaceCacheNearWeight({ dx, dy, anisotropy, ...band });
    assert.equal(weight([.005, 0], [0, .005]), 1, 'below the start the near pass owns the fragment');
    assert.equal(weight([.03, 0], [0, .03]), 0, 'above the end the cache does');
    const middle = (band.start + band.end) / 2;
    assert.ok(Math.abs(weight([middle, 0], [0, middle]) - .5) < 1e-12, 'the smoothstep crosses one half at the band centre');
    // the metric is max(major / anisotropy, minor): a grazing footprint with a short minor axis is governed by its major axis over the anisotropy
    const footprint = Math.max(.03 / 2, .01), t = (footprint - band.start) / (band.end - band.start);
    assert.ok(Math.abs(weight([.03, 0], [0, .01]) - (1 - t * t * (3 - 2 * t))) < 1e-12);
    assert.equal(landscapeSurfaceCacheNearWeight({ dx: [0, 0], dy: [0, 0], anisotropy: 2, start: 0, end: 0 }), 0, 'a disabled band owns nothing');
});

test('Surface cache near field: no fragment beyond the reach of a tile has a near weight, on flat and steep ground', () => {
    const band = landscapeSurfaceCacheNearBand(), anisotropy = 2;
    // cameras whose views reach past the reach: toward the horizon over flat ground, and along the strike of slopes rising in +z
    for (const [eye, target, slopeDegrees] of [[[0, 1.6, 0], [2, 1.1, 60], 0], [[0, 4.5, 0], [12, 0, 120], 0], [[0, 1.6, 0], [80, 1.2, 0], 35], [[0, 3, -4], [90, 2, -4], 60], [[0, 1.2, 0], [70, .9, -3], 15]]) {
        const camera = perspectiveCamera({ eye, target }), slope = slopeDegrees * Math.PI / 180;
        // the ground plane rises along +z with the slope; its normal is (0, cos, -sin)
        const normal = [0, Math.cos(slope), -Math.sin(slope)], hit = ray => { const d = dot(ray, normal); if (d >= -1e-9) return null; const t = -dot(eye, normal) / d; return t > 0 ? eye.map((c, i) => c + ray[i] * t) : null; };
        const reach = landscapeSurfaceCacheNearReach({ camera, aspect: 16 / 9, anisotropy, end: band.end, slopeCosine: Math.cos(slope), margin: 1 });
        let checked = 0;
        for (let py = 0; py < camera.viewportHeight; py += 12) for (let px = 0; px < camera.viewportWidth; px += 16) {
            // the plane through the origin, the camera above it
            const p = hit(camera.ray(px + .5, py + .5)), px1 = hit(camera.ray(px + 1.5, py + .5)), py1 = hit(camera.ray(px + .5, py + 1.5));
            if (!p || !px1 || !py1) continue;
            const distance = Math.hypot(...sub(p, eye));
            if (distance <= reach) continue;
            // planar derivatives (x, z) of the world position per pixel, as the fragment program measures them
            const w = landscapeSurfaceCacheNearWeight({ dx: [px1[0] - p[0], px1[2] - p[2]], dy: [py1[0] - p[0], py1[2] - p[2]], anisotropy, ...band });
            assert.equal(w, 0, `slope ${slopeDegrees} pixel ${px},${py} at ${distance.toFixed(2)} m beyond the reach ${reach.toFixed(2)} m`);
            checked++;
        }
        assert.ok(checked > 100, `${checked} fragments beyond the reach`);
    }
    // steeper ground reaches farther (its planar footprint shrinks); an orthographic view reaches everywhere or nowhere
    const camera = perspectiveCamera({ eye: [0, 1.6, 0], target: [0, 0, 6] });
    assert.ok(landscapeSurfaceCacheNearReach({ camera, aspect: 16 / 9, anisotropy, end: band.end, slopeCosine: .5 }) > landscapeSurfaceCacheNearReach({ camera, aspect: 16 / 9, anisotropy, end: band.end }));
    const ortho = span => landscapeSurfaceCacheNearReach({ camera: { projection: 'orthographic', orthoHeight: span, zoom: 1, viewportHeight: 1080, fovYRadians: 1 }, aspect: 16 / 9, anisotropy, end: band.end });
    assert.equal(ortho(10), Infinity);
    assert.equal(ortho(200), 0);
    assert.equal(landscapeSurfaceCacheNearReach({ camera, aspect: 16 / 9, anisotropy, end: 0 }), 0);
});

test('Surface cache near field: tiles within reach are selected and draw only the native rows within the reach, plus their skirts', () => {
    const tiles = [{ id: 'a', bounds: { minX: 0, maxX: 62.5, minZ: 0, maxZ: 62.5 }, minHeight: 0, maxHeight: 5 }, { id: 'b', bounds: { minX: 62.5, maxX: 125, minZ: 0, maxZ: 62.5 }, minHeight: 0, maxHeight: 5 },
        { id: 'c', bounds: { minX: 200, maxX: 262.5, minZ: 0, maxZ: 62.5 }, minHeight: 0, maxHeight: 5 }];
    const position = { x: 60, y: 6.6, z: 30 };
    assert.deepEqual(selectLandscapeSurfaceCacheNearTiles({ position, reachOf: () => 10, tiles }).map(tile => tile.id), ['a', 'b']);
    assert.deepEqual(selectLandscapeSurfaceCacheNearTiles({ position, reachOf: () => Infinity, tiles }).map(tile => tile.id), ['a', 'b', 'c']);
    assert.deepEqual(selectLandscapeSurfaceCacheNearTiles({ position, reachOf: () => 0, tiles }), []);
    // rows: the native grid is row 0 north (maxZ), six indices per cell, the skirt after the surface (LandscapeMeshBuffers)
    const rows = 129, columns = 129, bounds = tiles[0].bounds, perRow = 6 * (columns - 1), dz = 62.5 / (rows - 1);
    const ranges = landscapeSurfaceCacheNearRanges({ bounds, rows, columns, z: 30, reach: 4 });
    assert.deepEqual(ranges.skirt, { start: (rows - 1) * perRow, count: 6 * (2 * columns + 2 * rows - 4) });
    const first = ranges.rows.start / perRow, last = first + ranges.rows.count / perRow - 1;
    assert.ok(bounds.maxZ - first * dz >= 34 && bounds.maxZ - (first + 1) * dz <= 34, 'the first row reaches z + reach');
    assert.ok(bounds.maxZ - (last + 1) * dz <= 26 && bounds.maxZ - (last - 1) * dz >= 26, 'the last row reaches z - reach, at most one row beyond');
    assert.deepEqual(landscapeSurfaceCacheNearRanges({ bounds, rows, columns, z: 30, reach: Infinity }).rows, { start: 0, count: (rows - 1) * perRow });
    assert.equal(landscapeSurfaceCacheNearRanges({ bounds, rows, columns, z: 30, reach: 0 }).rows, null);
    assert.equal(landscapeSurfaceCacheNearRanges({ bounds, rows, columns, z: 300, reach: 4 }).rows, null, 'rows beyond the tile draw nothing');
});

test('Surface cache invalidation: inputs that only coarsened keep a page, finer or changed inputs make it stale', () => {
    assert.ok(landscapeSurfaceCacheTierRank('resolved') > landscapeSurfaceCacheTierRank('2048'));
    assert.ok(landscapeSurfaceCacheTierRank('512') > landscapeSurfaceCacheTierRank('128'));
    assert.ok(landscapeSurfaceCacheTierRank('128') > landscapeSurfaceCacheTierRank('none'));
    assert.deepEqual(landscapeSurfaceCacheSoilTiers({ tileMeters: 4, resolution: 128, microTileMeters: 0, microResolution: 128 }, .015625), ['128', 'none']);
    const base = { global: 'g', masks: ['m1', 'm2', 'm3'], soils: [[2, '512', '512'], [3, 'resolved', 'none']], tiles: ['l4/c8/r7'] };
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base }), null);
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, global: 'h' }), 'global');
    assert.equal(landscapeSurfaceCacheInputChange(null, base), 'global', 'a page without recorded inputs is stale');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, tiles: ['l5/c16/r14', 'l5/c17/r14'] }), 'tiles');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, masks: ['m1', 'm3'] }), null, 'an evicted mask page leaves the finer content');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, masks: ['m1', 'm2', 'm3', 'm4'] }), 'masks', 'a finer mask page arrived');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, masks: ['m1', 'm2b', 'm3'] }), 'masks', 'an edited mask page');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, soils: [[2, '1024', '1024'], [3, 'resolved', 'none']] }), 'soils', 'a finer tier');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, soils: [[2, '256', '256'], [3, 'resolved', 'none']] }), null, 'a downgraded tier');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, soils: [[2, '512', '512'], [3, 'resolved', '512']] }), 'soils', 'a micro layer arrived');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, soils: [[2, '512', 'none'], [3, 'resolved', 'none']] }), null, 'a micro layer left with its tier');
    assert.equal(landscapeSurfaceCacheInputChange(base, { ...base, soils: [...base.soils, [4, '512', 'none']] }), 'soils', 'a soil the page did not hold');
    // end to end through the page inputs: an evicted contributing page changes the identity but not the content the page holds
    const bounds = (minX, minZ, size) => ({ minX, maxX: minX + size, minZ, maxZ: minZ + size });
    const slots = [{ id: 'root', key: 'root', level: 0, bounds: bounds(0, 0, 4000), progress: 1, soils: [3] }, { id: 'fine', key: 'fine', level: 6, bounds: bounds(1062.5, 875, 62.5), progress: 1, soils: [2] }];
    const soils = Array.from({ length: 4 }, (_, index) => ({ index, tileMeters: 4, resolution: 1024, microTileMeters: 0, microResolution: 1024, transitionResolution: null }));
    const page = list => landscapeSurfaceCachePageInputs({ geometry: coastal, global: 'g', byLevel: indexLandscapeSurfaceCacheInputs({ slots: list, levelSpacings: LEVEL_SPACINGS }), levelSpacings: LEVEL_SPACINGS,
        soils, tiles: [{ id: 'l4/c8/r7', bounds: bounds(1000, 875, 125) }], mip: 0, x: 1070, z: 900 });
    const generated = page(slots), evicted = page(slots.slice(0, 1)), edited = page([slots[0], { ...slots[1], key: 'fine-edited' }]);
    assert.notEqual(evicted.identity, generated.identity);
    assert.equal(landscapeSurfaceCacheInputChange(generated.parts, evicted.parts), null);
    assert.equal(landscapeSurfaceCacheInputChange(evicted.parts, generated.parts), 'masks', 'a page generated without it is stale once it returns');
    assert.equal(landscapeSurfaceCacheInputChange(generated.parts, edited.parts), 'masks');
});

test('Surface cache demand v2: near-core pages are pruned, the motion bias coarsens the ring, prefetch views add their pages', () => {
    const ground = 6.45, flat = (minX, minZ, maxX, maxZ, out) => { if (out) { out[0] = ground; out[1] = ground; out[2] = .05; return out; } return { min: ground, max: ground, slope: .05 }; };
    const eye = [1040, ground + 1.6, 860], camera = perspectiveCamera({ eye, target: [1041, ground, 864] });
    const center = chooseLandscapeSurfaceCacheCenter({ geometry: coastal, camera, groundHeight: ground }), plan = options => planLandscapeSurfaceCacheDemand({ geometry: coastal, camera, center, heightRange: flat, capacity: 8000, ...options });
    assert.equal(LANDSCAPE_SURFACE_CACHE_DEMAND.id, 'landscape-surface-cache-demand-v2');
    const full = plan(), band = landscapeSurfaceCacheNearBand(), pruned = plan({ nearStart: band.start });
    assert.ok(pruned.pruned > 0 && pruned.desired < full.desired, `pruned ${pruned.pruned}, ${pruned.desired} of ${full.desired}`);
    // a pruned page's largest footprint lies below the band start: the frame never samples it (the near pass owns every fragment there)
    const kept = new Set(pruned.pages.map(page => page.key));
    const nearest = full.pages.filter(page => !kept.has(page.key));
    assert.ok(nearest.length > 0 && nearest.every(page => page.mip <= 1), 'only the finest pages under the camera are pruned');
    // every kept page keeps its ancestors
    for (const page of pruned.pages) if (page.mip < coastal.rootMip) assert.ok(kept.has(landscapeSurfaceCachePageKey(page.mip + 1, page.x >> 1, page.z >> 1)), `ancestor of ${page.mip}/${page.x}/${page.z}`);
    // the motion bias widens the refinement footprint: fewer pages, a coarser finest mip
    const biased = plan({ lodBias: 1 });
    assert.ok(biased.desired < full.desired);
    assert.ok(biased.byMip.findIndex(count => count > 0) >= full.byMip.findIndex(count => count > 0));
    // a prefetch view (the camera turned ahead) adds the pages it sees, ranked after the current view's
    const turned = perspectiveCamera({ eye, target: [1036, ground, 864] }), withView = plan({ views: [turned] });
    assert.ok(withView.desired > full.desired);
    assert.ok(withView.pages.some(page => page.prefetch));
    // the envelope answers into an output array without allocating, with the values of its object form
    const heights = new Float32Array(9 * 9).map((_, i) => (i % 9) * 2 + Math.floor(i / 9));
    const envelope = createLandscapeSurfaceCacheTerrainEnvelope({ descriptor: { columns: 9, rows: 9, bounds: { minX: 0, maxX: 80, minZ: 0, maxZ: 80 }, geometricError: 1 }, heights });
    const out = new Float64Array(3), object = envelope(5, 5, 35, 45);
    assert.equal(envelope(5, 5, 35, 45, out), out);
    assert.deepEqual([...out], [object.min, object.max, object.slope].map(value => Math.fround(value)));
});

test('Surface cache indirection: a moving window rebuilds only the strips of pages entering it, resolving like a full rebuild', () => {
    const geometry = landscapeSurfaceCacheGeometry({ minX: 0, maxX: 2048, minZ: 0, maxZ: 2048 });
    const residency = new LandscapeSurfaceCacheResidency({ slots: 512 });
    let seed = 11;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    residency.publish({ key: landscapeSurfaceCachePageKey(geometry.rootMip, 0, 0), slot: residency.allocate(0).slot, identity: 'r', frame: 0, pinned: true });
    for (let i = 0; i < 400; i++) {
        const mip = Math.floor(rand() * 4), size = 2 ** (geometry.rootMip - mip), key = landscapeSurfaceCachePageKey(mip, Math.floor(rand() * Math.min(size, 160)), Math.floor(rand() * Math.min(size, 160)));
        if (!residency.get(key)) residency.publish({ key, slot: residency.allocate(0).slot, identity: 'i', frame: 0 });
    }
    const slotOf = (mip, x, z) => residency.slotOf(mip, x, z);
    const moving = new LandscapeSurfaceCacheIndirection({ geometry });
    moving.setCenter({ x: 64, z: 64 });
    moving.rebuild(slotOf);
    const full = moving.rebuiltEntries;
    // a one-page step at mip 0 shifts only the finest windows: one column of 64 entries per shifted window
    const step = { x: 65, z: 64 }, shifted = Array.from({ length: geometry.mips }, (_, mip) => landscapeSurfaceCacheWindowOrigin(geometry, mip, step).x !== landscapeSurfaceCacheWindowOrigin(geometry, mip, { x: 64, z: 64 }).x).filter(Boolean).length;
    moving.setCenter(step);
    moving.rebuild(slotOf);
    assert.ok(shifted >= 1);
    assert.equal(moving.rebuiltEntries - full, shifted * 64, `${shifted} windows shifted by one page`);
    // after several moves the entries inside every window equal a fresh full rebuild at the final center
    for (const center of [{ x: 300, z: 90 }, { x: 310, z: 120 }, { x: 290, z: 121 }]) { moving.setCenter(center); moving.rebuild(slotOf); }
    const fresh = new LandscapeSurfaceCacheIndirection({ geometry });
    fresh.setCenter({ x: 290, z: 121 });
    fresh.rebuild(slotOf);
    for (let mip = 0; mip < geometry.mips; mip++) {
        const origin = fresh.origins[mip], pages = 2 ** (geometry.rootMip - mip);
        for (let z = origin.z; z < Math.min(origin.z + 64, pages); z++) for (let x = origin.x; x < Math.min(origin.x + 64, pages); x++) {
            assert.deepEqual(moving.entry(mip, x, z), fresh.entry(mip, x, z), `mip ${mip} page ${x},${z}`);
        }
    }
    // reset forgets every window and entry
    moving.reset();
    assert.equal(moving.center, null);
    assert.ok(moving.origins.every(origin => origin === null));
    assert.ok(moving.data.every(byte => byte === 0));
});
