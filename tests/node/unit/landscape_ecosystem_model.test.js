// Verifies the AI 599 D4 ecosystem runtime contract: the option parser, the residency share, the LOD bands and their fade mirror, the band visibility hysteresis, the impostor view selection against the distant billboard scoring, the dither matrix and the tile geometry helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ECOSYSTEM_DITHER_MATRIX, LANDSCAPE_ECOSYSTEM, createLandscapeEcosystemLedger, ecosystemBandVisible, ecosystemBoxDistanceRange, ecosystemDiagnosticColor, ecosystemDitherDefine, ecosystemDitherThreshold, ecosystemImpostorAngles,
    ecosystemImpostorView, ecosystemInstanceFade, ecosystemLodBands, ecosystemTileSphere, landscapeEcosystemDiagnostic, landscapeEcosystemOption } from '../../../src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemModel.js';
import { LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { validateEcosystemRecipe } from '../../../src/app/landscape/index.js';

const MiB = 1024 * 1024;
const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} vs ${expected}`);
const recipe = validateEcosystemRecipe(JSON.parse(await readFile(path.resolve('tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json'), 'utf8')));

test('Ecosystem runtime: the contract constants, the option parser and the diagnostic names validate', () => {
    assert.ok(Object.isFrozen(LANDSCAPE_ECOSYSTEM) && Object.isFrozen(LANDSCAPE_ECOSYSTEM.budgets));
    assert.equal(LANDSCAPE_ECOSYSTEM.id, 'landscape-ecosystem-runtime-v1'); assert.equal(LANDSCAPE_ECOSYSTEM.kind, 'landscape-ecosystem');
    assert.ok(LANDSCAPE_ECOSYSTEM.budgets.cpuBytes % MiB === 0 && LANDSCAPE_ECOSYSTEM.budgets.gpuBytes % MiB === 0);
    assert.deepEqual([LANDSCAPE_ECOSYSTEM.budgets.cpuBytes / MiB, LANDSCAPE_ECOSYSTEM.budgets.gpuBytes / MiB], [64, 96]);
    // AI 599 D3: auto by default (the sidecar beside the landscape); a URL names a sidecar manifest, no longer a recipe
    assert.deepEqual(LANDSCAPE_ECOSYSTEM.modes, ['auto', 'off', 'url']); assert.equal(LANDSCAPE_ECOSYSTEM.defaultMode, 'auto'); assert.equal(LANDSCAPE_ECOSYSTEM.sidecar, 'ecosystem/manifest.json');
    assert.deepEqual(LANDSCAPE_ECOSYSTEM.diagnostics, ['none', 'lod', 'layer', 'rank', 'fade']);
    assert.deepEqual(landscapeEcosystemOption(undefined), { mode: 'auto', url: null }); assert.deepEqual(landscapeEcosystemOption(''), { mode: 'auto', url: null });
    assert.deepEqual(landscapeEcosystemOption('auto'), { mode: 'auto', url: null }); assert.deepEqual(landscapeEcosystemOption('off'), { mode: 'off', url: null });
    assert.deepEqual(landscapeEcosystemOption('/assets/public/landscape/coastal-city/ecosystem/manifest.json'), { mode: 'url', url: '/assets/public/landscape/coastal-city/ecosystem/manifest.json' });
    assert.throws(() => landscapeEcosystemOption('on'), /must be auto, off or a sidecar manifest URL/); assert.throws(() => landscapeEcosystemOption('a b.json'), /ending in \.json/); assert.throws(() => landscapeEcosystemOption(3), /sidecar manifest URL/);
    assert.equal(landscapeEcosystemDiagnostic('none'), 0); assert.equal(landscapeEcosystemDiagnostic('fade'), 4); assert.throws(() => landscapeEcosystemDiagnostic('lods'), /must be one of none, lod, layer, rank, fade/);
    assert.equal(LANDSCAPE_ECOSYSTEM.developmentRecipe, undefined, 'the recipe is embedded in the sidecar; no tools path is fetched at runtime');
    assert.ok(Object.isFrozen(LANDSCAPE_ECOSYSTEM.streaming) && LANDSCAPE_ECOSYSTEM.streaming.maxInFlight === 4 && LANDSCAPE_ECOSYSTEM.streaming.keepHysteresis === 1.15 && LANDSCAPE_ECOSYSTEM.streaming.workers === 1);
    assert.ok(LANDSCAPE_ECOSYSTEM.lodHysteresis > 1 && LANDSCAPE_ECOSYSTEM.wind.strength === 0 && LANDSCAPE_ECOSYSTEM.contact.strength > 0 && LANDSCAPE_ECOSYSTEM.contact.strength < .5);
});

test('Ecosystem ledger: the share is one standing reservation of the ecosystem kind, its own entries stop at the share, and it releases whole', () => {
    const shared = new LandscapeResidencyBudget({ cpuBytes: 512 * MiB, gpuBytes: 512 * MiB }), ledger = createLandscapeEcosystemLedger(shared, { cpuBytes: 4 * MiB, gpuBytes: 8 * MiB });
    assert.equal(ledger.kind, 'landscape-ecosystem');
    assert.deepEqual(shared.snapshot().entries.map(entry => [entry.kind, entry.cpuBytes, entry.gpuBytes]), [['landscape-ecosystem', 4 * MiB, 8 * MiB]]);
    assert.deepEqual(ledger.reserve('ecosystem/assets/rocks', { cpuBytes: MiB, gpuBytes: 6 * MiB }), { admitted: true, reason: null });
    assert.deepEqual(ledger.reserve('ecosystem/tile/boulders/x5/z9', { cpuBytes: MiB, gpuBytes: 3 * MiB }), { admitted: false, reason: 'gpu-budget' });
    assert.equal(shared.snapshot().gpuBytes, 8 * MiB, 'the ecosystem entries never touch the shared budget again');
    assert.equal(ledger.shareSnapshot().denied, 1);
    assert.throws(() => ledger.dispose(), /still holds 1 reservation/);
    assert.ok(ledger.release('ecosystem/assets/rocks')); assert.equal(ledger.shareSnapshot().entries, 0);
    assert.ok(ledger.dispose()); assert.equal(shared.snapshot().entries.length, 0);
    assert.throws(() => createLandscapeEcosystemLedger(new LandscapeResidencyBudget({ cpuBytes: 8 * MiB, gpuBytes: 8 * MiB })), /cannot fit the shared ledger: cpu-budget/);
});

test('Ecosystem LOD bands: the development recipe layers cross-fade over fadeMeters at every boundary and end inside the view distance', () => {
    const bands = ecosystemLodBands(recipe.layers.boulders);
    assert.deepEqual(bands.map(band => [band.index, band.level, band.near, band.far]), [[0, 0, 0, 120], [1, 1, 120, 350], [2, 2, 350, 900]]);
    assert.deepEqual(bands[0].fadeIn, [-1, 0]); assert.deepEqual(bands[0].fadeOut, [107.5, 132.5]); assert.deepEqual(bands[1].fadeIn, [107.5, 132.5]); assert.deepEqual(bands[2].fadeOut, [875, 900]);
    // the fades of adjacent bands sum to one across a boundary, so no instance is drawn twice at full weight or not at all
    for (const distance of [0, 50, 107.5, 115, 120, 128, 132.5, 300, 340, 350, 360, 700, 880, 899]) {
        const fades = bands.map(band => ecosystemInstanceFade(distance, band));
        close(fades.reduce((sum, value) => sum + value, 0), distance < 875 ? 1 : (900 - distance) / 25, 1e-9, `fade sum at ${distance} m`);
        for (const value of fades) assert.ok(value >= 0 && value <= 1);
    }
    assert.equal(ecosystemInstanceFade(900, bands[2]), 0); assert.equal(ecosystemInstanceFade(1000, bands[2]), 0); assert.equal(ecosystemInstanceFade(0, bands[0]), 1);
    assert.equal(ecosystemInstanceFade(120, bands[0]), .5); assert.equal(ecosystemInstanceFade(120, bands[1]), .5);
    for (const layer of Object.values(recipe.layers)) {
        const layerBands = ecosystemLodBands(layer);
        assert.equal(layerBands.at(-1).fadeOut[1], layer.viewDistanceMeters);
        layerBands.forEach((band, index) => { if (index) assert.deepEqual(band.fadeIn, layerBands[index - 1].fadeOut); });
    }
    const single = ecosystemLodBands({ lods: [{ level: 0, distanceMeters: 60 }], fadeMeters: 10, viewDistanceMeters: 60 });
    assert.deepEqual(single, [{ index: 0, level: 0, near: 0, far: 60, fadeIn: [-1, 0], fadeOut: [50, 60] }]);
    assert.throws(() => ecosystemLodBands({ lods: [], fadeMeters: 1 }), /at least one LOD/); assert.throws(() => ecosystemInstanceFade(NaN, single[0]), /finite/);
});

test('Ecosystem band visibility: a draw shows when the tile range meets the band and hides only past the hysteresis', () => {
    const band = ecosystemLodBands(recipe.layers.boulders)[1];
    assert.equal(ecosystemBandVisible({ near: 0, far: 100 }, band, false), false, 'a tile entirely inside the first band never shows the second');
    assert.equal(ecosystemBandVisible({ near: 0, far: 110 }, band, false), true, 'the far corner reaches the fade-in start');
    assert.equal(ecosystemBandVisible({ near: 370, far: 500 }, band, false), false);
    assert.equal(ecosystemBandVisible({ near: 370, far: 500 }, band, true), true, 'visible stays within the hysteresis');
    assert.equal(ecosystemBandVisible({ near: 400, far: 500 }, band, true), false);
    assert.equal(ecosystemBandVisible({ near: 0, far: 100 }, band, true), true); assert.equal(ecosystemBandVisible({ near: 0, far: 97 }, band, true), false);
    const range = ecosystemBoxDistanceRange({ x: -10, y: 15, z: 128 }, { minX: 0, maxX: 256, minZ: 0, maxZ: 256 }, [10, 20], 2);
    close(range.near, 8, 1e-12); close(range.far, Math.hypot(268, 7, 130), 1e-9);
    const inside = ecosystemBoxDistanceRange({ x: 100, y: 15, z: 100 }, { minX: 0, maxX: 256, minZ: 0, maxZ: 256 }, [10, 20], 0);
    assert.equal(inside.near, 0); close(inside.far, Math.hypot(156, 5, 156), 1e-9);
    const sphere = ecosystemTileSphere({ minX: 0, maxX: 256, minZ: 0, maxZ: 256 }, [10, 20], 1, .55, 2.2);
    assert.deepEqual([sphere.x, sphere.y, sphere.z], [128, 15, 128]); close(sphere.radius, Math.hypot(128, 5, 128) + 2.2 * 1.1, 1e-9, 'twice the footprint beats the height');
});

// the distant billboard updater's selection (DistantTreeBillboard.selectDistantView) over the catalog's 16-view layout
const angularDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const catalogViews = Array.from({ length: 16 }, (_, index) => ecosystemImpostorAngles(index));
const selectDistantView = (azimuth, elevation) => catalogViews.reduce((best, view, index) => {
    const score = angularDistance(view.azimuthDegrees, azimuth) ** 2 + (view.elevationDegrees - elevation) ** 2;
    return score < best.score ? { index, score } : best;
}, { index: 0, score: Infinity }).index;

test('Ecosystem impostor: the arithmetic view selection equals the distant billboard scoring for sampled directions', () => {
    assert.deepEqual(catalogViews.slice(0, 2), [{ azimuthDegrees: -72, elevationDegrees: -8 }, { azimuthDegrees: -27, elevationDegrees: -8 }]);
    assert.deepEqual(catalogViews[15], { azimuthDegrees: 243, elevationDegrees: 15 });
    let seed = 11;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    let mismatches = 0;
    for (let sample = 0; sample < 20000; sample++) {
        const azimuth = (random() - .5) * 720, elevation = (random() - .5) * 180;
        if (ecosystemImpostorView(azimuth, elevation) !== selectDistantView(azimuth, elevation)) mismatches++;
    }
    assert.equal(mismatches, 0);
    for (let index = 0; index < 16; index++) { const { azimuthDegrees, elevationDegrees } = catalogViews[index]; assert.equal(ecosystemImpostorView(azimuthDegrees, elevationDegrees), index); assert.equal(ecosystemImpostorView(azimuthDegrees + 360, elevationDegrees), index); }
    assert.equal(ecosystemImpostorView(-72 + 22.4, -8), 0); assert.equal(ecosystemImpostorView(-72 + 22.6, -8), 1);
    assert.throws(() => ecosystemImpostorAngles(16), /0\.\.15/); assert.throws(() => ecosystemImpostorView(NaN, 0), /finite/);
});

test('Ecosystem dither: the 8x8 Bayer matrix is a permutation of 0..63 and the threshold shifts with the instance phase', () => {
    assert.equal(ECOSYSTEM_DITHER_MATRIX.length, 64);
    assert.deepEqual([...ECOSYSTEM_DITHER_MATRIX].sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i));
    assert.deepEqual(ECOSYSTEM_DITHER_MATRIX.slice(0, 8), [0, 32, 8, 40, 2, 34, 10, 42]);
    assert.equal(ecosystemDitherDefine().split(', ').length, 64); assert.match(ecosystemDitherDefine(), /^0\.0, 32\.0, /);
    const thresholds = new Set();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const value = ecosystemDitherThreshold(x, y, 0); assert.ok(value > 0 && value < 1); thresholds.add(value); }
    assert.equal(thresholds.size, 64, 'every cell has its own threshold');
    close(ecosystemDitherThreshold(0, 0, 0), .5 / 64, 1e-12); close(ecosystemDitherThreshold(0, 0, .5), .5 + .5 / 64, 1e-12); close(ecosystemDitherThreshold(8, 16, .25), ecosystemDitherThreshold(0, 0, .25), 1e-12, 'toroidal');
    close(ecosystemDitherThreshold(1, 0, .999), (32.5 / 64 + .999) % 1, 1e-12);
    // a fade of f keeps about f of the cells of a pixel block at every phase
    for (const phase of [0, .3, .77]) for (const fade of [.25, .5, .75]) {
        let kept = 0;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (fade >= ecosystemDitherThreshold(x, y, phase)) kept++;
        close(kept / 64, fade, 1 / 64 + 1e-12, `coverage at fade ${fade} phase ${phase}`);
    }
    assert.deepEqual(ecosystemDiagnosticColor('lod', 0), LANDSCAPE_ECOSYSTEM.lodColors[0]); assert.deepEqual(ecosystemDiagnosticColor('layer', 9), LANDSCAPE_ECOSYSTEM.layerColors[1]);
    assert.throws(() => ecosystemDiagnosticColor('lod', -1), /nonnegative integer/);
});
