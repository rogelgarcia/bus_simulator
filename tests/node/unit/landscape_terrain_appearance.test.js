// Verifies the terrain-driven natural appearance (AI577 D5, landscape-terrain-appearance-v1): the landscape-scale appearance layer (normalized-
// convolution terrain position, planning exclusion without ghost rims, reconstruction continuity), the catena, coastal wetting, rock weathering and
// exposure mirrors, the compile-time defines of the shader chunk and the planning cover bitmask.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_TERRAIN_FIELD_CHANNELS, encodeLandscapeTerrainField, landscapeTerrainFieldsLayout } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_DRESSING_INPUTS } from '../../../src/app/landscape/LandscapeDressingInputs.js';
import { LANDSCAPE_WATER_OPTICS } from '../../../src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { LANDSCAPE_TERRAIN_APPEARANCE, buildLandscapeAppearanceLayer, decodeLandscapeAppearanceLayer, landscapeAppearanceLayerUnits, landscapeAppearanceLayerWorkBytes,
    landscapeBSplineTaps, landscapeCatenaMoisture, landscapeCoastalWetSurface, landscapeCoastalWetting, landscapeDressingClass, landscapeDressingDefines, landscapeLayerReach,
    landscapeNormalizedPlaneFit, landscapePlanningCover, landscapePlanningCoverMask, landscapeRevealRock, landscapeRockExposure, landscapeRockExposureModulation, landscapeRockFactor,
    landscapeRunupHeight, landscapeSoilCatenaShare, landscapeSoilTerrainRole, landscapeSwellHeightLength, landscapeTerrainAppearanceDefines, landscapeTerrainAppearanceInputs,
    landscapeTerrainAppearanceSnapshot, landscapeTerrainFreshness, landscapeWetAlbedo, landscapeWetFilmTransmission } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainAppearance.js';

const model = LANDSCAPE_TERRAIN_APPEARANCE;
const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} vs ${expected} (±${tolerance})`);
const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const channel = name => LANDSCAPE_TERRAIN_FIELD_CHANNELS.find(definition => definition.name === name);
const PLANNING = 5, FOREST = 3;
const catalog = [{ id: 0, planningOnly: false }, { id: 1, planningOnly: false }, { id: 2, planningOnly: false }, { id: FOREST, planningOnly: false }, { id: 4, planningOnly: false },
    { id: PLANNING, planningOnly: true }, { id: 6, planningOnly: true }, { id: 7, planningOnly: true }];

// a synthetic root: n x n samples over [0, size] meters (row 0 north), field page with the given per-sample fields and edge-clamped halo
function synthetic({ n = 129, size = 2000, height, cover = () => FOREST, fields = () => ({}) }) {
    const layout = landscapeTerrainFieldsLayout(n), bounds = { minX: 0, maxX: size, minZ: 0, maxZ: size }, spacing = size / (n - 1);
    const heights = new Float32Array(n * n), covers = new Uint8Array(n * n), page = new Uint8Array(layout.pageBytes);
    const encode = (name, value) => encodeLandscapeTerrainField(channel(name), value);
    for (let row = 0; row < n; row++) for (let column = 0; column < n; column++) {
        const x = column * spacing, z = size - row * spacing, i = row * n + column;
        heights[i] = height(x, z); covers[i] = cover(x, z);
    }
    for (let row = 0; row < layout.width; row++) for (let column = 0; column < layout.width; column++) {
        const r = Math.min(n - 1, Math.max(0, row - layout.halo)), c = Math.min(n - 1, Math.max(0, column - layout.halo)), x = c * spacing, z = size - r * spacing;
        const f = { wetness: .35, flow: 0, deposition: 0, rockExposure: 0, skyView: 1, shoreDistance: 200, convexity: 0, slope: 2, ...fields(x, z) }, at = (row * layout.width + column) * 4;
        page.set([encode('wetness', f.wetness), encode('flow', f.flow), encode('deposition', f.deposition), encode('rockExposure', f.rockExposure)], at);
        page.set([encode('skyView', f.skyView), encode('shoreDistance', f.shoreDistance), encode('convexity', f.convexity), encode('slope', f.slope)], layout.layerBytes + at);
    }
    return { layout, bounds, heights, cover: covers, fieldPage: page, spacing, n, size };
}

const derive = (scene, staleCells = [0, 0]) => buildLandscapeAppearanceLayer({ fieldPage: scene.fieldPage, layout: scene.layout, heights: scene.heights, cover: scene.cover,
    planningMask: landscapePlanningCoverMask(catalog), staleCells, bounds: scene.bounds });
const layerAt = (scene, bytes, x, z) => decodeLandscapeAppearanceLayer(landscapeAppearanceLayerUnits(bytes, 0, scene.layout, scene.bounds, x, z));

test('Terrain appearance: the planning cover bitmask marks planning-only IDs below 128 and rejects others', () => {
    const mask = landscapePlanningCoverMask(catalog);
    assert.deepEqual([...mask], [(1 << 5) | (1 << 6) | (1 << 7), 0, 0, 0]);
    for (let id = 0; id < 128; id++) assert.equal(landscapePlanningCover(mask, id), id >= 5 && id <= 7, `cover ${id}`);
    assert.equal(landscapePlanningCover(mask, 200), false);
    const high = landscapePlanningCoverMask([{ id: 100, planningOnly: true }]);
    assert.equal(landscapePlanningCover(high, 100), true);
    assert.throws(() => landscapePlanningCoverMask([{ id: 128, planningOnly: true }]), /0-127/);
    assert.throws(() => landscapePlanningCoverMask(null), /catalog/);
});

test('Terrain appearance: soil roles carry development, the catena share and the exposed-rock substrate', () => {
    assert.deepEqual(['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock', 'lava'].map(landscapeSoilTerrainRole), [1, 0, .5, 1, 1, -1, 0]);
    assert.deepEqual(['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock', 'lava'].map(landscapeSoilCatenaShare), [1, 0, .5, 1, 1, 0, 0]);
    assert.deepEqual(['sand', 'loam', 'forest', 'rock', 'seabed'].map(landscapeDressingClass), [1, 2, 3, 4, 0]);
});

test('Terrain appearance: two bilinear taps per axis reproduce the cubic B-spline and the reconstruction is C2 across texels', () => {
    for (const f of [0, .1, .37, .5, .81, .999]) {
        const { weights, offsets, cubic } = landscapeBSplineTaps(f);
        close(weights[0] + weights[1], 1, 1e-12, 'partition of unity');
        close(cubic.reduce((a, b) => a + b, 0), 1, 1e-12);
        // a bilinear tap at offset o between samples -1/0 and 1/2 equals the cubic weights of its two samples
        const values = [3, -1, 4, 1.5], direct = cubic.reduce((sum, w, k) => sum + w * values[k], 0);
        const tap = (offset, base) => { const i = Math.floor(offset), t = offset - i; return values[i + 1 - base] * (1 - t) + values[i + 2 - base] * t; };
        close(weights[0] * tap(offsets[0], 0) + weights[1] * tap(offsets[1], 0), direct, 1e-12, `f ${f}`);
    }
    // a random layer: value, first and second derivative are continuous across sample boundaries
    const layout = landscapeTerrainFieldsLayout(9), bounds = { minX: 0, maxX: 8, minZ: 0, maxZ: 8 }, pixels = new Uint8Array(layout.layerBytes);
    let seed = 7;
    for (let i = 0; i < pixels.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; pixels[i] = seed >>> 24; }
    const value = x => landscapeAppearanceLayerUnits(pixels, 0, layout, bounds, x, 4.3)[0], h = 1e-4;
    for (const boundary of [2, 3, 4, 5]) {
        const left = boundary - 1e-7, right = boundary + 1e-7;
        close(value(left), value(right), 1e-5, 'C0');
        const d1 = x => (value(x + h) - value(x - h)) / (2 * h), d2 = x => (value(x + h) - 2 * value(x) + value(x - h)) / (h * h);
        close(d1(boundary - 3 * h), d1(boundary + 3 * h), 2e-3, 'C1');
        close(d2(boundary - 3 * h), d2(boundary + 3 * h), 2e-2, 'C2');
    }
});

test('Terrain appearance: freshness is 1 without stale cells, 0 inside one and rises continuously over the fade distance', () => {
    const bounds = { minX: 0, maxX: 800, minZ: 0, maxZ: 800 }, cell = 100, stale = [1 << (2 * 8 + 3), 0];
    assert.equal(landscapeTerrainFreshness([0, 0], bounds, 350, 750), 1);
    // bit row 2 column 3: x 300-400, z (from the north) 200-300 -> world z 500-600
    assert.equal(landscapeTerrainFreshness(stale, bounds, 350, 550), 0);
    close(landscapeTerrainFreshness(stale, bounds, 400 + model.freshness.fadeMeters / 2, 550), .5, 1e-12);
    assert.equal(landscapeTerrainFreshness(stale, bounds, 400 + model.freshness.fadeMeters, 550), 1);
    let previous = 0;
    for (let x = 400; x <= 440; x += .5) { const f = landscapeTerrainFreshness(stale, bounds, x, 550); assert.ok(f >= previous && f - previous < .05); previous = f; }
    assert.equal(cell, 800 / model.freshness.grid);
});

test('Terrain appearance: the catena index is monotonic in each term and soft-clipped smoothly to [-1, 1]', () => {
    const base = { tpi: 0, wetness: model.catena.wetnessCenter, flow: 0, slopeDegrees: 0 };
    assert.equal(landscapeCatenaMoisture(base), 0);
    assert.ok(landscapeCatenaMoisture({ ...base, tpi: -1 }) > 0 && landscapeCatenaMoisture({ ...base, tpi: 1 }) < 0, 'hollows moist, ridges dry');
    assert.ok(landscapeCatenaMoisture({ ...base, wetness: .9 }) > 0 && landscapeCatenaMoisture({ ...base, flow: 1 }) > 0);
    assert.ok(landscapeCatenaMoisture({ ...base, slopeDegrees: 35 }) < 0, 'steep slopes drain');
    let previous = Infinity;
    for (let tpi = -20; tpi <= 20; tpi += .05) {
        const m = landscapeCatenaMoisture({ ...base, tpi });
        assert.ok(m <= 1 + 1e-12 && m >= -1 - 1e-12 && m <= previous + 1e-12);
        previous = m;
    }
    close(landscapeCatenaMoisture({ ...base, tpi: -model.catena.clip * model.catena.tpiScaleMeters }), 1, 1e-12, 'the clip meets 1 with zero slope');
    close(landscapeCatenaMoisture({ ...base, tpi: -(model.catena.clip - 1e-3) * model.catena.tpiScaleMeters }), 1, 1e-6);
});

test('Terrain appearance: normalized convolution fits planes exactly around holes and one-sided edges and measures curvature', () => {
    const n = 41, values = new Float64Array(n * n), confidence = new Float64Array(n * n).fill(1);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        values[y * n + x] = 3 + .4 * x - .25 * y;
        if (Math.hypot(x - 20, y - 20) < 7 || x < 3) { confidence[y * n + x] = 0; values[y * n + x] = 999; }
    }
    const fit = landscapeNormalizedPlaneFit(values, confidence, n, 4);
    for (const [x, y] of [[20, 20], [14, 20], [3, 5], [0, 0], [40, 40], [27, 13]]) {
        const i = y * n + x;
        assert.equal(fit.valid[i], 1, `${x},${y}`);
        close(fit.value[i], 3 + .4 * x - .25 * y, 1e-9, `plane at ${x},${y}`);
        close(fit.gradientX[i], .4, 1e-9); close(fit.gradientRow[i], -.25, 1e-9);
    }
    // a paraboloid: the residual of the plane through a full or a holed neighborhood is the same curvature term
    const bowl = Float64Array.from({ length: n * n }, (_, i) => .05 * ((i % n - 20) ** 2 + (Math.floor(i / n) - 20) ** 2));
    const full = landscapeNormalizedPlaneFit(bowl, new Float64Array(n * n).fill(1), n, 3), holed = landscapeNormalizedPlaneFit(bowl, confidence, n, 3);
    const center = 20 * n + 30;
    close(bowl[center] - full.value[center], -.05 * 2 * 9, .05, 'full neighborhood: h - fit = -k sigma^2 (2D)');
    close(bowl[center] - holed.value[center], bowl[center] - full.value[center], .25, 'a hole in the neighborhood barely moves the residual');
    const empty = landscapeNormalizedPlaneFit(values, new Float64Array(n * n), n, 4);
    assert.ok(empty.valid.every(v => v === 0), 'no support, no fit');
});

test('Terrain appearance: graded planning pads and road corridors leave no rim, crater or ghost line in the catena', () => {
    // natural undulating terrain, graded like the coastal prototype: features blend toward their target over a smoothstep feather beyond their edge
    const natural = (x, z) => 20 + .02 * x + 2 * Math.sin(2 * Math.PI * x / 600) * Math.cos(2 * Math.PI * z / 800);
    const road = (x, z) => Math.abs(x - 1000 - .3 * (z - 1000)) / Math.hypot(1, .3) - 4;
    const features = {
        'cut pad': { edge: (x, z) => Math.hypot(x - 1000, z - 1000) - 200, target: () => 34, feather: 100 },
        'raised pad': { edge: (x, z) => Math.hypot(x - 1000, z - 1000) - 200, target: () => 50, feather: 150 },
        'road embankment': { edge: road, target: (x, z) => natural(x, z) + 3, feather: 72 },
        'road cutting': { edge: road, target: (x, z) => natural(x, z) - 3, feather: 72 }
    };
    const reference = synthetic({ height: natural }), referenceLayer = derive(reference);
    for (const [name, f] of Object.entries(features)) {
        const graded = (x, z) => { const w = 1 - smoothstep(0, 1, Math.max(0, f.edge(x, z)) / f.feather); return natural(x, z) * (1 - w) + f.target(x, z) * w; };
        const planned = synthetic({ height: graded, cover: (x, z) => f.edge(x, z) <= 0 ? PLANNING : FOREST }), control = synthetic({ height: graded });
        const excluded = derive(planned), unexcluded = derive(control);
        // mean catena deviation from the natural reference per 20 m band of distance from the feature edge (inside negative)
        const bands = new Map();
        for (let x = 300; x <= 1700; x += 9) for (let z = 300; z <= 1700; z += 9) {
            const band = Math.floor(f.edge(x, z) / 20) * 20;
            if (band < -180 || band > 400) continue;
            const ref = layerAt(reference, referenceLayer.bytes, x, z).moisture, entry = bands.get(band) ?? { excluded: 0, control: 0, count: 0 };
            entry.excluded += layerAt(planned, excluded.bytes, x, z).moisture - ref; entry.control += layerAt(control, unexcluded.bytes, x, z).moisture - ref; entry.count++;
            bands.set(band, entry);
        }
        const worst = key => Math.max(...[...bands.values()].map(entry => Math.abs(entry[key] / entry.count)));
        assert.ok(worst('control') > .5, `${name}: graded terrain itself draws the feature (${worst('control')})`);
        assert.ok(worst('excluded') < .15 * worst('control'), `${name}: the exclusion removes at least 85% of the graded ghost (${worst('excluded')} of ${worst('control')})`);
        for (const [x, z] of [[200, 200], [1800, 300], [300, 1800]]) {
            if (f.edge(x, z) < 600) continue;
            close(layerAt(planned, excluded.bytes, x, z).moisture, layerAt(reference, referenceLayer.bytes, x, z).moisture, 2 / 255, `${name}: unchanged far away`);
        }
    }
});

test('Terrain appearance: the layer is deterministic, inpaints stale and submerged samples and encodes reach and modulation', () => {
    const scene = synthetic({ height: (x, z) => 10 + .01 * x + Math.sin(z / 150), fields: (x, z) => ({ shoreDistance: x - 300, flow: x > 1500 ? .8 : 0, deposition: z < 400 ? .6 : 0,
        convexity: .4, slope: 5 }) });
    const first = derive(scene), second = derive(scene);
    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(first.bytes.length, scene.layout.layerBytes);
    assert.ok(first.statistics.sea > 0, 'shore distance below zero marks the sea');
    // the coastal reach: runup at the field slope + tide + capillary + seepage, faded inland, in centimeters
    const coastal = layerAt(scene, first.bytes, 350, 1000), expected = landscapeLayerReach({ slopeDegrees: 5, flow: 0, shoreDistance: 50 });
    close(coastal.reach, expected, .02, 'reach near the shore');
    assert.equal(layerAt(scene, first.bytes, 1000, 1000).reach, 0, 'no reach inland');
    close(layerAt(scene, first.bytes, 1000, 1000).exposureModulation, landscapeRockExposureModulation({ convexity: .4, flow: 0, deposition: 0 }), 1 / 255 + .01);
    // stale cells carry no field weight: a stale derivation differs only near the stale cell
    const stale = derive(scene, [1 << (3 * 8 + 3), 0]);
    assert.ok(stale.statistics.stale > 0);
    close(layerAt(scene, stale.bytes, 1800, 1800).moisture, layerAt(scene, first.bytes, 1800, 1800).moisture, 1 / 255 + 1e-9);
    assert.ok(landscapeAppearanceLayerWorkBytes(257) >= 257 * 257 * 178, 'the reservation covers the measured allocations');
});

test('Terrain appearance: fragment inputs fade with availability, land, footprint and the switch, and fall back to the local runup', () => {
    const layer = { moisture: .5, deposition: .2, reach: 1.4, exposureModulation: .8 }, r = model.response;
    const full = landscapeTerrainAppearanceInputs({ layer, availability: 1, height: 5, geometricSlopeDegrees: 25, footprintSpacings: 0 });
    close(full.tone, r.toneMoisture * .5 + r.toneDeposition * .2, 1e-12);
    close(full.chroma, r.chromaMoisture * .5 + r.chromaDeposition * .2, 1e-12);
    close(full.exposure, model.rockExposure.gain * landscapeRockExposure(25, .8), 1e-12);
    assert.equal(full.reach, 1.4);
    const pending = landscapeTerrainAppearanceInputs({ layer, availability: 0, height: 5, geometricSlopeDegrees: 4, footprintSpacings: 0 });
    assert.ok([pending.tone, pending.chroma, pending.exposure].every(value => value === 0));
    close(pending.reach, landscapeRunupHeight(4) + model.coastal.tidalMeters + model.coastal.capillaryMeters, 1e-12, 'fallback reach');
    const submerged = landscapeTerrainAppearanceInputs({ layer, availability: 1, height: -1, geometricSlopeDegrees: 4, footprintSpacings: 0 });
    assert.ok(submerged.tone === 0 && submerged.exposure === 0);
    const far = landscapeTerrainAppearanceInputs({ layer, availability: 1, height: 5, geometricSlopeDegrees: 25, footprintSpacings: 4 });
    assert.ok(far.tone === 0); assert.ok(far.exposure > 0, 'exposure follows the fragment slope at every footprint');
    const off = landscapeTerrainAppearanceInputs({ layer, availability: 1, height: 5, geometricSlopeDegrees: 25, footprintSpacings: 0, enabled: false });
    assert.deepEqual(off, { tone: 0, chroma: 0, exposure: 0, reach: 0, moisture: 0, weight: 0 });
    assert.throws(() => landscapeTerrainAppearanceInputs({ layer, availability: NaN, height: 5, geometricSlopeDegrees: 25, footprintSpacings: 0 }), /availability/);
});

test('Terrain appearance: Stockdon runup, the falling-tide reach and wetting stay physical and continuous', () => {
    const hl = landscapeSwellHeightLength();
    close(hl, .5 * 9.80665 * 36 / (2 * Math.PI), 1e-9, 'H0 L0');
    const beta = Math.tan(3 * Math.PI / 180);
    close(landscapeRunupHeight(3), 1.1 * (.35 * beta * Math.sqrt(hl) + .5 * Math.sqrt(hl * (.563 * beta * beta + .004))), 1e-12);
    assert.ok(landscapeRunupHeight(1) < landscapeRunupHeight(5) && landscapeRunupHeight(14) === landscapeRunupHeight(40), 'monotonic, capped at the beach slope limit');
    assert.ok(landscapeRunupHeight(1.5) > .2 && landscapeRunupHeight(1.5) < .35, 'dissipative beach, light swell: about a quarter meter');
    close(landscapeLayerReach({ slopeDegrees: 3, flow: .5, shoreDistance: 0 }), landscapeRunupHeight(3) + model.coastal.tidalMeters + model.coastal.capillaryMeters + .5 * model.coastal.seepageFlowMeters, 1e-12);
    assert.equal(landscapeLayerReach({ slopeDegrees: 3, flow: .5, shoreDistance: model.coastal.shoreFadeMeters[1] }), 0);
    assert.ok(landscapeLayerReach({ slopeDegrees: 14, flow: 1, shoreDistance: 0 }) <= model.coastal.maximumReachMeters);
    const reach = 1.2;
    assert.deepEqual(landscapeCoastalWetting(reach, reach), { moisture: 0, film: 0 });
    assert.deepEqual(landscapeCoastalWetting(.1, 0), { moisture: 0, film: 0 });
    assert.deepEqual(landscapeCoastalWetting(0, reach), { moisture: 1, film: 1 });
    let previous = { moisture: 1, film: 1 };
    for (let h = 0; h <= reach; h += .005) {
        const wet = landscapeCoastalWetting(h, reach);
        assert.ok(wet.moisture <= previous.moisture + 1e-12 && wet.film <= previous.film + 1e-12 && previous.moisture - wet.moisture < .03 && previous.film - wet.film < .06);
        assert.ok(wet.film <= wet.moisture + 1e-12, 'the glossy film lies inside the saturated zone');
        previous = wet;
    }
});

test('Terrain appearance: Lekner-Dorf wet sand darkens to the measured wet/dry ratios with the water optics constants', () => {
    close(landscapeWetFilmTransmission(), LANDSCAPE_WATER_OPTICS.diffuseTransmission * (1 - LANDSCAPE_WATER_OPTICS.internalReflectance), 1e-15);
    for (const albedo of [.2, .25, .3, .4]) {
        const ratio = landscapeWetAlbedo(albedo) / albedo;
        assert.ok(ratio > .5 && ratio < .7, `wet/dry ${albedo}: ${ratio} (beach sand measurements 0.5-0.65)`);
    }
    assert.ok(landscapeWetAlbedo(.4) / .4 > landscapeWetAlbedo(.2) / .2, 'brighter sand keeps more of its albedo (internal re-reflection)');
    const surface = { albedo: [.3, .25, .2], normal: [.6, .8, 0], geometricNormal: [0, 1, 0], roughness: .8, response: [.25, 1, .25] };
    const dry = landscapeCoastalWetSurface({ ...surface, height: 2, reach: 1.2 });
    assert.deepEqual([dry.albedo, dry.normal, dry.roughness, dry.response], [surface.albedo, surface.normal, surface.roughness, surface.response]);
    const film = landscapeCoastalWetSurface({ ...surface, height: 0, reach: 1.2 }), c = model.coastal;
    film.albedo.forEach((value, i) => close(value, landscapeWetAlbedo(surface.albedo[i]), 1e-12));
    close(film.roughness, c.wetRoughness, 1e-12);
    assert.deepEqual(film.response, [c.wetDiffuseRoughness, 0, 0]);
    close(Math.hypot(...film.normal), 1, 1e-12);
    assert.ok(film.normal[1] > .8 + .1, 'the film flattens the relief normal toward the geometric normal');
});

test('Terrain appearance: rock weathering darkens gentle outcrops (more where moist), steep faces stay fresh, biofilm marks the splash zone', () => {
    const r = model.rock, fresh = landscapeRockFactor({ slopeDegrees: 60, height: 20, reach: 0 });
    fresh.forEach(value => close(value, 1, 1e-12));
    const gentle = landscapeRockFactor({ slopeDegrees: 5, height: 20, reach: 0 });
    gentle.forEach((value, i) => close(value, 2 ** r.weatheredLog2 * r.weatheredTint[i], 1e-12));
    const luminance = rgb => .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    assert.ok(luminance(landscapeRockFactor({ slopeDegrees: 5, height: 20, reach: 0, moisture: .8 })) < luminance(gentle), 'moist outcrops weather darker');
    assert.deepEqual(landscapeRockFactor({ slopeDegrees: 5, height: 20, reach: 0, moisture: -.8 }), gentle, 'dry outcrops keep the base weathering');
    const zone = landscapeRockFactor({ slopeDegrees: 60, height: .5, reach: 1 }), above = landscapeRockFactor({ slopeDegrees: 60, height: 3, reach: 1 });
    assert.ok(luminance(zone) < .6 && luminance(above) === 1, 'black zone in the splash reach only');
    assert.ok(luminance(landscapeRockFactor({ slopeDegrees: 60, height: .5, reach: 0 })) === 1, 'no splash without a coastal reach');
});

test('Terrain appearance: rock exposure moves susceptible coverage to the substrate and keeps coverage normalized', () => {
    const roles = [1, 0, .5, 1, 1, -1], weights = [.1, .2, .3, .2, .2, 0];
    const revealed = landscapeRevealRock(weights, roles, .5);
    close(revealed.reduce((a, b) => a + b, 0), 1, 1e-12);
    close(revealed[1], .2, 1e-12, 'seabed never reveals rock');
    close(revealed[5], .5 * (.1 + .3 * .5 + .2 + .2), 1e-12);
    assert.deepEqual(landscapeRevealRock(weights, roles, 0), weights);
    assert.deepEqual(landscapeRevealRock(weights, [1, 1, 1, 1, 1, 1], .5), weights, 'no substrate, no reveal');
    close(landscapeRockExposure(25, 1), smoothstep(18, 32, 25), 1e-12);
    assert.ok(landscapeRockExposureModulation({ convexity: 1, flow: 0, deposition: 0 }) > landscapeRockExposureModulation({ convexity: 0, flow: .5, deposition: .5 }));
});

test('Terrain appearance: compile-time defines mirror the model and are all consumed by the shader chunks', async () => {
    const defines = landscapeTerrainAppearanceDefines(), dressing = landscapeDressingDefines(), m = model, c = m.coastal, hl = landscapeSwellHeightLength();
    const vector = text => text.match(/^vec\d\((.*)\)$/)[1].split(', ').map(Number);
    assert.deepEqual(vector(defines.LANDSCAPE_TERRAIN_RESPONSE), [m.response.toneMoisture, m.response.toneDeposition, m.response.chromaMoisture, m.response.chromaDeposition]);
    assert.deepEqual(vector(defines.LANDSCAPE_TERRAIN_SWELL), [hl, Math.sqrt(hl), c.maximumBeachSlopeDegrees]);
    assert.deepEqual(vector(defines.LANDSCAPE_TERRAIN_COASTAL), [c.tidalMeters + c.capillaryMeters, c.maximumReachMeters]);
    assert.deepEqual(vector(defines.LANDSCAPE_TERRAIN_WET_SURFACE), [c.wetRoughness, c.filmNormalFlattening, c.wetDiffuseRoughness, landscapeWetFilmTransmission()]);
    assert.deepEqual(vector(defines.LANDSCAPE_TERRAIN_WEATHERING), [...m.rock.weatheredSlopeDegrees, m.rock.weatheredLog2, m.rock.moistureGain]);
    assert.deepEqual(vector(defines.LANDSCAPE_TERRAIN_WETTING), [c.coreFraction, ...c.filmFraction, c.darkeningExponent]);
    const p = LANDSCAPE_DRESSING_INPUTS.parameters;
    assert.deepEqual(vector(dressing.LANDSCAPE_DRESSING_GRASS), [p.grass.loam, p.grass.forestUnderstory, ...p.grass.slopeDegrees]);
    assert.deepEqual(vector(dressing.LANDSCAPE_DRESSING_DEBRIS_TERMS), [...p.debris.reachMeters, ...p.debris.slopeDegrees]);
    for (const value of [...Object.values(defines), ...Object.values(dressing)]) assert.match(value, /^(vec\d\(.*\)|-?[0-9.e+-]+)$/, 'values, never valueless flags');
    const chunk = await readFile(path.resolve('src/graphics/shaders/chunks/landscape/terrain_appearance.glsl'), 'utf8');
    const dressingChunk = await readFile(path.resolve('src/graphics/shaders/chunks/landscape/dressing_inputs.glsl'), 'utf8');
    for (const name of Object.keys(defines)) assert.ok(chunk.includes(name), `${name} is consumed`);
    for (const name of Object.keys(dressing)) assert.ok(dressingChunk.includes(name), `${name} is consumed`);
    for (const name of new Set(chunk.match(/LANDSCAPE_TERRAIN_[A-Z_]+/g))) assert.ok(name in defines || /^LANDSCAPE_TERRAIN_FIELD/.test(name) || name === 'LANDSCAPE_TERRAIN_APPEARANCE', `${name} is defined`);
    // AI577 D6: the switch is the loader's compile-time program variant; the body runs unconditionally while it is defined
    assert.match(chunk, /LandscapeTerrainAppearance result = LandscapeTerrainAppearance\(vec2\(0\.0\), 0\.0, 0\.0, 0\.0, 0\.0\);\s+#ifdef LANDSCAPE_TERRAIN_APPEARANCE\s+\{/);
    assert.doesNotMatch(chunk, /for \(int enabled = 0; enabled < int\(uLandscapeResponse\.w/, 'no loop of uniform trip count remains');
    assert.match(chunk, /vec3 factor = vec3\(1\.0\);\s+if \(uLandscapeResponse\.w > 0\.5\) \{/, 'the rock factor keeps its uniform gate');
    // the layer is read only while the fields and the layer are both resident; one uniform (the planning bitmask), no sampler
    assert.match(chunk, /\(uTerrainFieldsState\.z & 3u\) == 3u/);
    assert.deepEqual([...chunk.replace(/\/\/[^\n]*/g, '').matchAll(/\buniform\s+(\w+)\s+(\w+)\s*;/g)].map(match => `${match[1]} ${match[2]}`), ['uvec4 uPlanningCover']);
    const terrain = await readFile(path.resolve('src/graphics/shaders/materials/landscape/terrain.frag.glsl'), 'utf8');
    for (let soil = 0; soil < 6; soil++) {
        assert.ok(terrain.includes(`soilSurface(${soil}, position, positionDx, positionDy, normal, projection, soilMacroField(${soil}, macroField, catena)`), `soil ${soil} takes its catena share`);
        assert.ok(terrain.includes(`soilGroundAlbedo(${soil}, soilMacroField(${soil}, macroField, catena))`));
    }
    assert.match(terrain, /landscapeRockFactor\(normal, position\.y - uLandscapeSun\.w, reach, terrain\.moisture \* terrain\.weight\)/);
    const snapshot = landscapeTerrainAppearanceSnapshot();
    assert.ok(snapshot.wetToDryAlbedo[.25] > .5 && snapshot.runupMeters[14] > snapshot.runupMeters[1]);
});
