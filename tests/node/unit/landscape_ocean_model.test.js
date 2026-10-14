// Verifies the AI 597 ocean contract: presets, cascade band partition, clipmap rings, the deterministic clock, the residency share, the spectral math and its FFT table, and the bathymetry raster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_OCEAN, LANDSCAPE_OCEAN_MAX_CASCADES, LANDSCAPE_OCEAN_QUALITIES, LANDSCAPE_OCEAN_SEA_STATES, createLandscapeOceanClock, createLandscapeOceanLedger, landscapeOceanCascades, landscapeOceanCascadeFade, landscapeOceanShoreInputs, landscapeOceanFoamSchedule, landscapeOceanQuality,
    landscapeOceanResources, landscapeOceanRingHoleCells, landscapeOceanRingIndices, landscapeOceanRingOrigin, landscapeOceanRings, landscapeOceanSeaState, landscapeOceanSurface } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';
import { landscapeOceanButterfly, landscapeOceanDispersion, landscapeOceanEvolvedTexel, landscapeOceanGaussian, landscapeOceanHash, landscapeOceanInitialTexel, landscapeOceanInverseFftRow, landscapeOceanJonswap,
    landscapeOceanLogGamma, landscapeOceanSeaStateShapes, landscapeOceanSignificantWaveHeight, landscapeOceanSpreading, landscapeOceanTma, landscapeOceanWaveSpectrum } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanSpectrum.js';
import { landscapeOceanFieldLayout, rasterizeLandscapeOceanDepth } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanField.js';
import { LANDSCAPE_LIGHTING, landscapeLightingUniformValues, landscapeOceanUniformValue, landscapeSunDirection } from '../../../src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { LANDSCAPE_CAMERA_DEPTH } from '../../../src/graphics/engine3d/landscape/LandscapeCameraDepth.js';

const MiB = 1024 * 1024;
const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} vs ${expected}`);

test('Ocean model: presets and options validate, the far plane is the camera far plane and the share is whole MiB', () => {
    assert.ok(Object.isFrozen(LANDSCAPE_OCEAN) && Object.isFrozen(LANDSCAPE_OCEAN_SEA_STATES) && Object.isFrozen(LANDSCAPE_OCEAN_QUALITIES));
    assert.equal(LANDSCAPE_OCEAN.id, 'landscape-ocean-v1'); assert.equal(LANDSCAPE_OCEAN.kind, 'landscape-ocean');
    assert.equal(LANDSCAPE_OCEAN.farMeters, LANDSCAPE_CAMERA_DEPTH.farMeters);
    assert.deepEqual(LANDSCAPE_OCEAN.surfaces, ['animated', 'flat']); assert.deepEqual(LANDSCAPE_OCEAN.seaStates, Object.keys(LANDSCAPE_OCEAN_SEA_STATES)); assert.deepEqual(LANDSCAPE_OCEAN.qualities, Object.keys(LANDSCAPE_OCEAN_QUALITIES));
    assert.equal(landscapeOceanSurface(undefined), 'animated'); assert.equal(landscapeOceanSurface('flat'), 'flat'); assert.throws(() => landscapeOceanSurface('off'), /landscapeOcean must be one of animated, flat/);
    assert.equal(landscapeOceanSeaState(''), 'moderate'); assert.equal(landscapeOceanSeaState('rough'), 'rough'); assert.throws(() => landscapeOceanSeaState('storm'), /landscapeSeaState must be one of calm, moderate, rough/);
    assert.equal(landscapeOceanQuality(null), 'medium'); assert.throws(() => landscapeOceanQuality('ultra'), /landscapeOceanQuality must be one of low, medium, high/);
    assert.ok(LANDSCAPE_OCEAN.budgets.cpuBytes % MiB === 0 && LANDSCAPE_OCEAN.budgets.gpuBytes % MiB === 0);
    for (const preset of Object.values(LANDSCAPE_OCEAN_SEA_STATES)) {
        assert.ok(preset.wind.speedMetersPerSecond > 0 && preset.wind.fetchKilometres > 0 && preset.swell.heightMeters > 0 && preset.swell.periodSeconds > 0 && preset.depthMeters > 0);
        assert.equal(preset.choppiness.length, LANDSCAPE_OCEAN_MAX_CASCADES);
    }
    for (const preset of Object.values(LANDSCAPE_OCEAN_QUALITIES)) assert.ok(preset.ringCells % 4 === 0 && preset.cascadeLengths.length <= LANDSCAPE_OCEAN_MAX_CASCADES);
});

test('Ocean cascades: adjacent bands share their bound, nothing is simulated twice, the coarsest keeps every longer wave', () => {
    for (const quality of LANDSCAPE_OCEAN.qualities) {
        const cascades = landscapeOceanCascades(quality), preset = LANDSCAPE_OCEAN_QUALITIES[quality];
        assert.equal(cascades.length, preset.cascadeLengths.length);
        assert.equal(cascades[0].kMin, 0); assert.equal(cascades[0].maxWavelengthMeters, Infinity);
        cascades.forEach((cascade, index) => {
            close(cascade.texelMeters, cascade.lengthMeters / preset.texels, 1e-12);
            close(cascade.minWavelengthMeters, LANDSCAPE_OCEAN.texelsPerWavelength * cascade.texelMeters, 1e-12);
            close(cascade.kMax, 2 * Math.PI / cascade.minWavelengthMeters, 1e-12);
            if (index > 0) { close(cascade.kMin, cascades[index - 1].kMax, 1e-12, 'bands meet'); assert.ok(cascade.lengthMeters < cascades[index - 1].lengthMeters); }
        });
    }
    const medium = landscapeOceanCascades('medium');
    assert.deepEqual(medium.map(cascade => [cascade.lengthMeters, cascade.texelMeters, cascade.minWavelengthMeters]), [[1600, 6.25, 50], [200, 0.78125, 6.25], [25, 0.09765625, 0.78125]]);
});

test('Ocean rings: the clipmap doubles until it covers the far plane and snaps to twice its cell', () => {
    const rings = landscapeOceanRings({ cells: 128, baseCellMeters: .5 });
    assert.equal(rings.length, 11);
    assert.deepEqual(rings.map(ring => ring.cellMeters), rings.map((ring, index) => .5 * 2 ** index));
    assert.ok(rings.at(-1).halfExtentMeters >= LANDSCAPE_OCEAN.farMeters && rings.at(-2).halfExtentMeters < LANDSCAPE_OCEAN.farMeters);
    assert.equal(rings[0].hole, false); assert.ok(rings.slice(1).every(ring => ring.hole));
    rings.forEach((ring, index) => { if (index) close(ring.halfExtentMeters, 2 * rings[index - 1].halfExtentMeters, 1e-9); });
    assert.deepEqual(landscapeOceanRingOrigin(rings[0], 1234.4, -17.6), { x: 1234, z: -18 });
    assert.deepEqual(landscapeOceanRingOrigin(rings[3], 1234.4, -17.6), { x: 1232, z: -16 });
    assert.throws(() => landscapeOceanRings({ cells: 30, baseCellMeters: 1 }), /multiple of four/);
    assert.throws(() => landscapeOceanRings({ cells: 64, baseCellMeters: 0 }), /positive/);
    for (const quality of LANDSCAPE_OCEAN.qualities) {
        const resources = landscapeOceanResources(quality);
        assert.ok(resources.gpuBytes > 0 && resources.gpuBytes <= LANDSCAPE_OCEAN.budgets.gpuBytes && resources.cpuBytes <= LANDSCAPE_OCEAN.budgets.cpuBytes, `${quality} fits its share`);
        assert.deepEqual(Object.keys(resources.parts), ['spectra', 'cascades', 'fields', 'geometry', 'foam', 'swash']);
    }
});

test('Ocean ring geometry: the annulus leaves out exactly the square inside every hole, and the hole never moves past it', () => {
    assert.equal(landscapeOceanRingHoleCells(8), 1);
    assert.equal(landscapeOceanRingHoleCells(128), 31);
    assert.throws(() => landscapeOceanRingHoleCells(6));
    const full = landscapeOceanRingIndices(8), annulus = landscapeOceanRingIndices(8, landscapeOceanRingHoleCells(8));
    assert.equal(full.triangles, 128); assert.equal(full.index.length, 384);
    assert.equal(annulus.triangles, 2 * (64 - 4)); assert.equal(annulus.index.length, annulus.triangles * 3);
    // the quads present are exactly those outside the inner square, and every triangle keeps a corner strictly outside it
    const side = 9, at = v => [v % side - 4, Math.floor(v / side) - 4];
    const quads = new Set();
    for (let t = 0; t < annulus.index.length; t += 3) {
        const corners = [annulus.index[t], annulus.index[t + 1], annulus.index[t + 2]].map(at);
        assert.ok(corners.some(([x, z]) => Math.abs(x) > 1 || Math.abs(z) > 1), `triangle inside the hole: ${JSON.stringify(corners)}`);
        quads.add(annulus.index[t]);
    }
    for (let x = -4; x < 4; x++) for (let z = -4; z < 4; z++) assert.equal(quads.has((z + 4) * side + x + 4), !(x >= -1 && x + 1 <= 1 && z >= -1 && z + 1 <= 1), `quad ${x},${z}`);
    // the shipped preset: the full grid of ring 0 and the annulus of the ten rings with a hole (the spec's triangle count)
    assert.equal(landscapeOceanRingIndices(128).triangles, 32768);
    assert.equal(landscapeOceanRingIndices(128, 31).triangles, 25080);
    assert.equal(32768 + 10 * 25080, 283568);
    assert.throws(() => landscapeOceanRingIndices(8, 4));
    // for any camera, the previous ring's extent sits a whole number of this ring's cells from this ring's origin, at most one, so it always
    // holds the inner square the annulus leaves out
    const rings = landscapeOceanRings({ cells: 128, baseCellMeters: .5 });
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let sample = 0; sample < 500; sample++) {
        const x = (random() - .5) * 20000, z = (random() - .5) * 20000;
        for (let r = 1; r < rings.length; r++) {
            const outer = landscapeOceanRingOrigin(rings[r], x, z), inner = landscapeOceanRingOrigin(rings[r - 1], x, z);
            const ox = (inner.x - outer.x) / rings[r].cellMeters, oz = (inner.z - outer.z) / rings[r].cellMeters;
            assert.ok(Number.isInteger(ox) && Number.isInteger(oz) && Math.abs(ox) <= 1 && Math.abs(oz) <= 1, `ring ${r} at ${x},${z}: offset ${ox},${oz}`);
            assert.ok(rings[r - 1].halfExtentMeters / rings[r].cellMeters - Math.abs(ox) >= landscapeOceanRingHoleCells(128));
        }
    }
});

test('Ocean clock: free mode clamps the frame interval, fixed mode moves only by setTime and step', () => {
    const clock = createLandscapeOceanClock();
    assert.deepEqual(clock.snapshot(), { mode: 'free', time: 0, frame: 0, maxStepSeconds: .1 });
    clock.advance(1 / 60); close(clock.time, 1 / 60, 1e-12); clock.advance(5); close(clock.time, 1 / 60 + .1, 1e-12); clock.advance(-1); close(clock.time, 1 / 60 + .1, 1e-12);
    assert.equal(clock.frame, 3);
    clock.setMode('fixed'); clock.setTime(30); clock.advance(1); assert.equal(clock.time, 30); clock.step(.5); assert.equal(clock.time, 30.5);
    assert.throws(() => clock.setMode('paused'), /clock mode must be one of free, fixed/); assert.throws(() => clock.setTime(-1), /must not be negative/); assert.throws(() => clock.advance(NaN), /finite/);
    const fixed = createLandscapeOceanClock({ mode: 'fixed', time: 12 });
    fixed.advance(.016); assert.equal(fixed.time, 12);
});

test('Ocean ledger: the share is one standing reservation of the ocean kind, its own entries stop at the share, and it releases whole', () => {
    const shared = new LandscapeResidencyBudget({ cpuBytes: 512 * MiB, gpuBytes: 512 * MiB }), ledger = createLandscapeOceanLedger(shared, { cpuBytes: 4 * MiB, gpuBytes: 8 * MiB });
    assert.equal(ledger.kind, 'landscape-ocean');
    assert.deepEqual(shared.snapshot().entries.map(entry => [entry.kind, entry.cpuBytes, entry.gpuBytes]), [['landscape-ocean', 4 * MiB, 8 * MiB]], 'the whole share is reserved at once');
    assert.deepEqual(ledger.reserve('a', { cpuBytes: MiB, gpuBytes: 6 * MiB }), { admitted: true, reason: null });
    assert.deepEqual(ledger.reserve('b', { cpuBytes: MiB, gpuBytes: 3 * MiB }), { admitted: false, reason: 'gpu-budget' });
    assert.equal(shared.snapshot().gpuBytes, 8 * MiB, 'the ocean entries never touch the shared budget again');
    assert.equal(ledger.shareSnapshot().denied, 1);
    assert.throws(() => ledger.dispose(), /still holds 1 reservation/);
    assert.ok(ledger.release('a')); assert.equal(ledger.shareSnapshot().entries, 0);
    assert.ok(ledger.dispose()); assert.equal(shared.snapshot().entries.length, 0);
    assert.throws(() => ledger.reserve('c', { cpuBytes: 1, gpuBytes: 1 }), /share is disposed/);
    assert.throws(() => createLandscapeOceanLedger(new LandscapeResidencyBudget({ cpuBytes: 8 * MiB, gpuBytes: 8 * MiB })), /cannot fit the shared ledger: cpu-budget/);
    // the shipped profiles hold the share beside what the streams had before AI 597 (640/352 and 640/544 MiB)
    assert.deepEqual([LANDSCAPE_OCEAN.budgets.cpuBytes / MiB, LANDSCAPE_OCEAN.budgets.gpuBytes / MiB], [48, 80]);
});

test('Ocean lighting uniform: the glint switch joins the lighting layout and defaults to the terrain glint', () => {
    assert.equal(LANDSCAPE_LIGHTING.uniforms.uLandscapeOcean, 1); assert.equal(LANDSCAPE_LIGHTING.uniformVectors, 13);
    assert.deepEqual(landscapeOceanUniformValue(undefined), [0, 0, 0, 0]); assert.deepEqual(landscapeOceanUniformValue({ animated: true }), [1, 0, 0, 0]);
    assert.deepEqual(landscapeOceanUniformValue({ animated: true, swash: true }), [1, 1, 0, 0]); assert.throws(() => landscapeOceanUniformValue({ animated: true, swash: 1 }), /swash flag/);
    assert.throws(() => landscapeOceanUniformValue({ animated: 'yes' }), /boolean animated flag/);
    const values = landscapeLightingUniformValues({ seaLevel: 0, waterLevel: 0, sunDirection: landscapeSunDirection(45, 55), sunIrradiance: [1, 1, 1], skyCoefficients: new Array(33).fill(0), calibration: [1, 1, 1], ocean: { animated: true } });
    assert.deepEqual(Array.from(values.uLandscapeOcean), [1, 0, 0, 0]);
});

test('Ocean spectrum: dispersion limits, JONSWAP peak, TMA bounds and a normalized spreading', () => {
    close(landscapeOceanLogGamma(5), Math.log(24), 1e-9); close(landscapeOceanLogGamma(.5), .5 * Math.log(Math.PI), 1e-9);
    close(landscapeOceanDispersion(1, 1000).omega ** 2, LANDSCAPE_OCEAN.gravity, 1e-6, 'deep water');
    close(landscapeOceanDispersion(.01, .5).omega ** 2, LANDSCAPE_OCEAN.gravity * .01 * .01 * .5, 1e-8, 'shallow water');
    close(landscapeOceanDispersion(.01, .5).groupVelocity, Math.sqrt(LANDSCAPE_OCEAN.gravity * .5), 1e-3, 'shallow group velocity');
    assert.throws(() => landscapeOceanDispersion(-1, 10), /k >= 0/);
    const shape = { alpha: .01, omegaPeak: 1.2, gamma: 3.3 };
    let best = 0, bestOmega = 0;
    for (let omega = .3; omega < 4; omega += .001) { const value = landscapeOceanJonswap(omega, shape); if (value > best) { best = value; bestOmega = omega; } }
    close(bestOmega, 1.2, .01, 'JONSWAP peaks at the peak frequency');
    assert.equal(landscapeOceanJonswap(0, shape), 0);
    assert.equal(landscapeOceanTma(10, 30), 1); close(landscapeOceanTma(1, 2), .5 * 1 * 2 / LANDSCAPE_OCEAN.gravity, 1e-12); assert.ok(landscapeOceanTma(1.3, 10) > 0 && landscapeOceanTma(1.3, 10) < 1);
    const shapes = landscapeOceanSeaStateShapes('moderate');
    for (const omega of [.5, shapes.wind.omegaPeak, 3]) {
        let sum = 0; const n = 4000;
        for (let i = 0; i < n; i++) sum += landscapeOceanSpreading(-Math.PI + (i + .5) * 2 * Math.PI / n, omega, shapes.wind) * 2 * Math.PI / n;
        close(sum, 1, 1e-2, `spreading integrates to one at ${omega}`);
    }
    assert.ok(landscapeOceanSpreading(shapes.wind.heading, shapes.wind.omegaPeak, shapes.wind) > landscapeOceanSpreading(shapes.wind.heading + 1, shapes.wind.omegaPeak, shapes.wind));
});

test('Ocean sea states: the swell is calibrated to its height, the discrete variance matches the continuous one and the states order by energy', () => {
    const heights = LANDSCAPE_OCEAN.seaStates.map(id => landscapeOceanSignificantWaveHeight(id, 'medium'));
    heights.forEach((hs, index) => close(hs.discreteMeters, hs.continuousMeters, .03 * hs.continuousMeters, `${LANDSCAPE_OCEAN.seaStates[index]} discrete vs continuous Hs`));
    assert.ok(heights[0].continuousMeters < heights[1].continuousMeters && heights[1].continuousMeters < heights[2].continuousMeters);
    for (const id of LANDSCAPE_OCEAN.seaStates) {
        const shapes = landscapeOceanSeaStateShapes(id), preset = LANDSCAPE_OCEAN_SEA_STATES[id];
        close(2 * Math.PI / shapes.swell.omegaPeak, preset.swell.periodSeconds, 1e-9);
        // the swell alone (deep water) reproduces its preset height within the numerical integration
        const deep = { ...shapes, depthMeters: 1e4 };
        let variance = 0; const dk = 2 * Math.PI / 1600;
        for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) {
            const kx = i * dk, kz = j * dk;
            if (Math.hypot(kx, kz) > 0) variance += landscapeOceanWaveSpectrum(kx, kz, { ...deep, wind: { ...deep.wind, alpha: 0 } }) * dk * dk;
        }
        close(4 * Math.sqrt(variance), preset.swell.heightMeters, .06 * preset.swell.heightMeters, `${id} swell height`);
        assert.ok(Math.abs(Math.cos(shapes.wind.heading) - Math.sin(preset.wind.headingDegrees * Math.PI / 180)) < 1e-12, 'the heading angle is atan2(z, x) of the landscape heading');
    }
});

test('Ocean hash and initial spectrum: deterministic Gaussians, Hermitian pairs and the packed time evolution', () => {
    assert.equal(landscapeOceanHash(3, 4, 5), landscapeOceanHash(3, 4, 5)); assert.notEqual(landscapeOceanHash(3, 4, 5), landscapeOceanHash(4, 3, 5)); assert.notEqual(landscapeOceanHash(3, 4, 5), landscapeOceanHash(3, 4, 6));
    let mean = 0, square = 0, count = 0;
    for (let x = 0; x < 200; x++) for (let y = 0; y < 200; y++) { const [a, b] = landscapeOceanGaussian(x, y, 9); mean += a + b; square += a * a + b * b; count += 2; }
    close(mean / count, 0, .02, 'Gaussian mean'); close(square / count, 1, .02, 'Gaussian variance');
    const shapes = landscapeOceanSeaStateShapes('moderate'), cascade = landscapeOceanCascades('medium')[1], texels = 64;
    let energy = 0;
    for (let m = 1; m < texels; m++) for (let n = 1; n < texels; n++) {
        const texel = landscapeOceanInitialTexel(m, n, cascade, texels, shapes), mirror = landscapeOceanInitialTexel(texels - m, texels - n, cascade, texels, shapes);
        // the stored conj h0(-k) equals the conjugate of the mirrored texel's h0
        close(texel[2], mirror[0], 1e-9); close(texel[3], -mirror[1], 1e-9);
        energy += texel[0] ** 2 + texel[1] ** 2;
    }
    assert.ok(energy > 0, 'the cascade holds energy');
    assert.deepEqual(landscapeOceanInitialTexel(0, 10, cascade, texels, shapes), [0, 0, 0, 0]);
    assert.deepEqual(landscapeOceanInitialTexel(32, 32, cascade, texels, shapes), [0, 0, 0, 0]);
    const initial = [.3, -.2, .1, .4], kx = .5, kz = -.25;
    const t0 = landscapeOceanEvolvedTexel(initial, kx, kz, 30, 0), hr = initial[0] + initial[2], hi = initial[1] + initial[3], ux = kx / Math.hypot(kx, kz), uz = kz / Math.hypot(kx, kz);
    close(t0[0], hr * (1 + ux), 1e-12); close(t0[1], hi * (1 + ux), 1e-12); close(t0[2], uz * hi, 1e-12); close(t0[3], -uz * hr, 1e-12);
    const later = landscapeOceanEvolvedTexel(initial, kx, kz, 30, 2.5);
    assert.ok(later.some((value, index) => Math.abs(value - t0[index]) > 1e-3), 'the spectrum evolves');
});

test('Ocean FFT table: the butterfly stages reproduce the inverse DFT', () => {
    for (const texels of [8, 16, 64]) {
        const table = landscapeOceanButterfly(texels), re = [], im = [];
        for (let i = 0; i < texels; i++) { re.push(Math.sin(i * 1.3) + .2 * i); im.push(Math.cos(i * .7)); }
        const out = landscapeOceanInverseFftRow(re, im, table, texels);
        for (let n = 0; n < texels; n++) {
            let xr = 0, xi = 0;
            for (let k = 0; k < texels; k++) { const a = 2 * Math.PI * k * n / texels; xr += re[k] * Math.cos(a) - im[k] * Math.sin(a); xi += re[k] * Math.sin(a) + im[k] * Math.cos(a); }
            close(out.re[n], xr, 1e-5 * texels, `re ${n}`); close(out.im[n], xi, 1e-5 * texels, `im ${n}`);
        }
        assert.equal(table.length, Math.log2(texels) * texels * 4);
    }
    assert.throws(() => landscapeOceanButterfly(12), /power of two/);
});

test('Ocean field: the depth raster is bilinear in the level chunks, seamless, and reports its statistics', () => {
    const manifest = { id: 'f', bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 }, grid: { spacingX: 1, spacingZ: 1 }, coordinates: { seaLevel: 0 },
        chunks: [{ id: 'l1/c0/r0', level: 1, bounds: { minX: 0, maxX: 4, minZ: 4, maxZ: 8 } }, { id: 'l1/c1/r0', level: 1, bounds: { minX: 4, maxX: 8, minZ: 4, maxZ: 8 } },
            { id: 'l1/c0/r1', level: 1, bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 } }, { id: 'l1/c1/r1', level: 1, bounds: { minX: 4, maxX: 8, minZ: 0, maxZ: 4 } }] };
    // height = x - 4 (sea west of x = 4), sampled on each chunk's 5 x 5 grid, row 0 north
    const chunk = (id, bounds) => { const heights = new Float32Array(25); for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) heights[r * 5 + c] = bounds.minX + c - 4; return { descriptor: { id, bounds, columns: 5, rows: 5, sampleStride: 1 }, heights }; };
    const chunks = new Map(manifest.chunks.map(entry => [entry.id, chunk(entry.id, entry.bounds)]));
    const layout = landscapeOceanFieldLayout(manifest, 1, 16);
    assert.deepEqual(layout.chunkIds, manifest.chunks.map(entry => entry.id)); close(layout.texelMetersX, .5, 1e-12);
    const { depth, statistics } = rasterizeLandscapeOceanDepth(layout, manifest, chunks);
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) close(depth[r * 16 + c], 4 - (c + .5) * .5, 1e-6, `texel ${c}, ${r}`);
    close(statistics.maxDepth, 3.75, 1e-6); close(statistics.minDepth, -3.75, 1e-6); close(statistics.seaFraction, .5, 1e-12);
    assert.throws(() => landscapeOceanFieldLayout(manifest, 3, 16), /no chunks at level 3/);
    chunks.delete('l1/c1/r1');
    assert.throws(() => rasterizeLandscapeOceanDepth(layout, manifest, chunks), /missing from the loaded set/);
});

test('Ocean D2 model: per-cascade depth fades, the shore-wave inputs of a sea state and the extent field bytes', () => {
    const fade = LANDSCAPE_OCEAN.cascadeFade, medium = landscapeOceanCascades('medium');
    const fades = medium.map(cascade => landscapeOceanCascadeFade(cascade));
    // the swell cascade (unbounded band) fades over the deepest band, every finer cascade at a tenth of its longest wavelength, never below the floor
    assert.deepEqual(fades[0], { zeroMeters: fade.maxFullMeters * fade.zeroShare, fullMeters: fade.maxFullMeters });
    close(fades[1].fullMeters, medium[1].maxWavelengthMeters * fade.wavelengthShare, 1e-12); close(fades[1].zeroMeters, fades[1].fullMeters * fade.zeroShare, 1e-12);
    close(fades[2].fullMeters, medium[2].maxWavelengthMeters * fade.wavelengthShare, 1e-12);
    assert.equal(landscapeOceanCascadeFade(landscapeOceanCascades('high')[3]).fullMeters, fade.minFullMeters);
    for (let i = 1; i < fades.length; i++) assert.ok(fades[i].fullMeters < fades[i - 1].zeroMeters, `cascade ${i} fades below cascade ${i - 1}`);
    assert.throws(() => landscapeOceanCascadeFade({ maxWavelengthMeters: 0 }), /positive longest wavelength/);
    // the shore wave carries the sea state's swell period and heading, McCowan's breaking index and starts at half the deep-water wavelength
    const moderate = landscapeOceanShoreInputs('moderate'), swell = LANDSCAPE_OCEAN_SEA_STATES.moderate.swell;
    assert.equal(moderate.periodSeconds, swell.periodSeconds); assert.equal(moderate.headingDegrees, swell.headingDegrees); assert.equal(moderate.gamma, LANDSCAPE_OCEAN.shore.gamma);
    close(moderate.deepWavelengthMeters, LANDSCAPE_OCEAN.gravity * swell.periodSeconds ** 2 / (2 * Math.PI), 1e-9);
    close(moderate.deepDepthMeters, LANDSCAPE_OCEAN.shore.deepDepthFactor * moderate.deepWavelengthMeters, 1e-9);
    close(moderate.omega, 2 * Math.PI / swell.periodSeconds, 1e-12); close(moderate.groupPeriodSeconds, LANDSCAPE_OCEAN.shore.groupPeriods * swell.periodSeconds, 1e-12);
    assert.ok(landscapeOceanShoreInputs('rough').deepDepthMeters > moderate.deepDepthMeters);
    assert.throws(() => landscapeOceanShoreInputs('stormy'), /must be one of calm, moderate, rough/);
    // the extent field: RGBA16F shore channels plus RG32F travel time on the GPU, with the float depth raster kept on the CPU; the surround depth only
    const { fields } = LANDSCAPE_OCEAN, estimate = landscapeOceanResources('medium');
    assert.equal(fields.extentGpuBytesPerTexel, 16); assert.equal(fields.extentCpuBytesPerTexel, 21); assert.equal(fields.surroundBytesPerTexel, 8);
    assert.equal(estimate.parts.fields.gpuBytes, fields.texels ** 2 * 16 + fields.surroundTexels ** 2 * 8);
    assert.equal(estimate.parts.fields.cpuBytes, fields.texels ** 2 * 21 + fields.surroundTexels ** 2 * 4);
    assert.ok(LANDSCAPE_OCEAN.shore.rockZones.includes('platform') && LANDSCAPE_OCEAN.shore.exposureZones.includes('surf'));
});

test('Ocean D3 foam schedule: fixed steps on the grid with a carried remainder, a restart with the pre-roll for an unreachable time', () => {
    const { stepSeconds, preRollSeconds, maxStepsPerFrame, texels, bytesPerTexel } = LANDSCAPE_OCEAN.foam;
    // no last time: the state restarts preRollSeconds before the time and steps up to it exactly
    const first = landscapeOceanFoamSchedule({ time: 30, lastTime: null });
    assert.equal(first.reset, true); assert.equal(first.steps, Math.round(preRollSeconds / stepSeconds)); close(first.startTime + first.steps * stepSeconds, 30, 1e-9); assert.equal(first.remainder, 0);
    // a frame of 1.5 steps runs one step and carries half a step; the next frame of 0.6 steps then runs one more (1.1 carried -> 1 step + 0.1)
    const second = landscapeOceanFoamSchedule({ time: 30 + 1.5 * stepSeconds, lastTime: 30 });
    assert.deepEqual([second.reset, second.steps], [false, 1]); close(second.remainder, .5 * stepSeconds, 1e-12); close(second.startTime, 30, 1e-12);
    const third = landscapeOceanFoamSchedule({ time: 30 + 2.1 * stepSeconds, lastTime: 30 + 1.5 * stepSeconds, remainder: second.remainder });
    assert.deepEqual([third.reset, third.steps], [false, 1]); close(third.remainder, .1 * stepSeconds, 1e-12); close(third.startTime, 30 + stepSeconds, 1e-12);
    // a jump beyond maxStepsPerFrame, a time before the last one, or the same time: restart / restart / no step
    assert.equal(landscapeOceanFoamSchedule({ time: 31, lastTime: 30 }).reset, true);
    assert.equal(landscapeOceanFoamSchedule({ time: 29, lastTime: 30 }).reset, true);
    assert.deepEqual([landscapeOceanFoamSchedule({ time: 30, lastTime: 30 }).reset, landscapeOceanFoamSchedule({ time: 30, lastTime: 30 }).steps], [false, 0]);
    assert.equal(landscapeOceanFoamSchedule({ time: 30 + maxStepsPerFrame * stepSeconds, lastTime: 30 }).steps, maxStepsPerFrame);
    assert.throws(() => landscapeOceanFoamSchedule({ time: NaN, lastTime: null }), /foam time/);
    // the foam state's bytes join the resources estimate (two RG16F targets over the extent raster)
    assert.equal(landscapeOceanResources('medium').parts.foam.gpuBytes, texels * texels * bytesPerTexel);
    assert.equal(bytesPerTexel, 8);
});
