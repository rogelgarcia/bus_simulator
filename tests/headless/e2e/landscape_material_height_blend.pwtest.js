// Measures relative-relief dominance, clump relief parity, stochastic tiling parity and derivative stability through the unchanged production landscape shader.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { landscapeClumpedCoverage, landscapeMaterialClumpRelief, landscapeMaterialHeightDetail, sampleLandscapeMaterialBlend } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';
import { landscapeHexLattice, landscapeHexWeights, landscapeMaterialSamplingDefinition, landscapeMaterialSamplingSalt } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialSampling.js';
import { LANDSCAPE_SOIL_CATALOG } from '../../../src/app/landscape/LandscapeCatalog.js';

const artifacts = path.resolve('tests/artifacts/screens/landscape', process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'ai577/d1a', 'height-probe');
const two = [0, 0, .5, .5, 0, 0], highThird = [255, 255, 0, 255, 255, 255], clumps = { seed: 4005984422 }, samplingSeed = 1207276911;
const cases = [
    { id: 'legacy-disabled', weights: two, heights: highThird, enabled: false },
    { id: 'missing-height-metadata', weights: two, heights: highThird, flags: [0, 0, 0, 0, 0, 0] },
    { id: 'equal-height', weights: two, heights: [128, 128, 128, 128, 128, 128] },
    { id: 'sand-high', weights: two, heights: [255, 255, 255, 0, 255, 255] },
    { id: 'grass-high', weights: two, heights: highThird },
    { id: 'absent-high-material', weights: two, heights: [255, 255, 128, 128, 255, 255] },
    { id: 'three-material-junction', weights: [0, 0, 1 / 3, 1 / 3, 1 / 3, 0] },
    { id: 'six-material-junction', weights: Array(6).fill(1 / 6) },
    { id: 'six-material-height-winner', weights: Array(6).fill(1 / 6), heights: [0, 0, 0, 0, 0, 255] },
    { id: 'far-pixel-footprint', weights: two, heights: highThird, span: 102.4 },
    { id: 'coarse-height-detail', weights: two, heights: highThird, resolution: 32 },
    ...Array.from({ length: 11 }, (_, step) => ({ id: `tier-arrival-${step}`, weights: two, heights: highThird, resolution: 32,
        transition: { soil: 3, progress: step / 10, resolution: 512, height: 255 } })),
    // clump relief: resolution 16 removes texture relief detail so the rendered weights are the clumped coverage itself
    ...[[300.37, 412.81], [512.5, 610.25], [700.11, 205.73], [250.9, 777.4], [640.2, 455.6], [455.55, 333.3]].map((center, index) => ({
        id: `clumps-coverage-${index}`, weights: two, resolution: 16, clumps, center })),
    ...[[120.4, 377.7], [301.9, 160.2], [410.6, 420.3]].map((center, index) => ({ id: `clumps-junction-${index}`, weights: [0, 0, 1 / 3, 1 / 3, 1 / 3, 0], resolution: 16, clumps, center })),
    { id: 'clumps-tail', weights: [0, 0, .99, .01, 0, 0], heights: [128, 128, 0, 255, 128, 128], clumps, center: [512.5, 610.25] },
    { id: 'clumps-without-relief-metadata', weights: two, flags: [0, 0, 0, 0, 0, 0], clumps, center: [512.5, 610.25] },
    { id: 'clumps-far-footprint', weights: two, resolution: 16, clumps, center: [700.11, 205.73], span: 102.4 },
    ...[[300.37, 412.81], [455.55, 333.3]].map((center, index) => ({ id: `clumps-relief-${index}`, weights: two, heights: highThird, clumps, center }))
];

// clump relief and clumped relief scores at a world position; the sampled pixel sits half a pixel right (+x) and up (-z) of the camera center
function expectedInputs(value, x, z) {
    const heights = value.heights ?? Array(6).fill(128), flags = value.flags ?? Array(6).fill(1), metersPerPixel = (value.span ?? 4) / 512;
    const sampled = heights.map((height, soil) => !flags[soil] ? .5 : value.transition?.soil === soil
        ? (height * (1 - value.transition.progress) + value.transition.height * value.transition.progress) / 255 : height / 255);
    const details = flags.map((enabled, soil) => landscapeMaterialHeightDetail({ periodMeters: value.period ?? 4,
        resolution: value.resolution ?? 512, metersPerPixel, enabled: !!enabled,
        targetResolution: value.transition?.soil === soil ? value.transition.resolution : value.resolution ?? 512,
        transition: value.transition?.soil === soil ? value.transition.progress : 0 }));
    const clumpRelief = value.weights.map((weight, soil) => !value.clumps || !weight ? 0 : landscapeMaterialClumpRelief({ soilId: LANDSCAPE_SOIL_CATALOG[soil].id,
        seed: value.clumps.seed, x, z, metersPerPixel, height: sampled[soil], heightDetail: details[soil], enabled: !!flags[soil] }));
    const scores = landscapeClumpedCoverage(value.weights, clumpRelief).map((weight, soil) => weight * (1 + .7 * (2 * sampled[soil] - 1)));
    return { sampled, details, clumpRelief, scores, metersPerPixel };
}

function expectedWeights(value) {
    if (value.enabled === false) return value.weights;
    const metersPerPixel = (value.span ?? 4) / 512, [x, z] = value.center ? [value.center[0] + metersPerPixel / 2, value.center[1] - metersPerPixel / 2] : [0, 0];
    const { sampled, details, clumpRelief, scores } = expectedInputs(value, x, z);
    if (!value.clumps) return sampleLandscapeMaterialBlend({ weights: value.weights, heights: sampled, details }).weights;
    const right = expectedInputs(value, x + metersPerPixel, z).scores, up = expectedInputs(value, x, z - metersPerPixel).scores;
    return sampleLandscapeMaterialBlend({ weights: value.weights, heights: sampled, details, clumpRelief,
        scoreDx: right.map((score, soil) => score - scores[soil]), scoreDy: up.map((score, soil) => score - scores[soil]) }).weights;
}

test.use({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1, trace: 'off', video: 'off' });

test('Landscape materials: production shader resolves height dominance, supported junctions, fallback and stable derivatives', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).toBe('8002');
    await mkdir(artifacts, { recursive: true });
    const report = { format: 'landscape-material-height-gpu-probe', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(),
        shaderSha256: createHash('sha256').update(await readFile('src/graphics/shaders/materials/landscape/terrain.frag.glsl')).digest('hex'),
        conditions: { size: 512, shader: 'unchanged production terrain vertex and fragment programs', framebuffer: 'linear RGB8, no tone mapping or antialiasing',
            weights: 'Each soil is measured by its independent white/black albedo basis with identical normal, roughness, AO and metalness; black/white endpoints cancel common specular light.',
            coverage: 'Constant dyadic hierarchy progress produces known normalized coverage away from unavailable neighbors.',
            derivativeProbe: 'Production contour field, opposed periodic relief maps, matched one-pixel camera shift.' }, errors: [], warnings: [] };
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 }), page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {
        if (!['error', 'warning'].includes(message.type()) || !/shader|webgl|program|THREE|GL_INVALID/i.test(message.text())) return;
        const target = message.type() === 'error' || /\berrors?(?:\s+X\d+|\s*:)|compil(?:ation|e).*fail|GL_INVALID|VALIDATE_STATUS\s*[:=]?\s*false/i.test(message.text()) ? report.errors : report.warnings;
        if (!target.includes(message.text())) target.push(message.text());
    });
    try {
        await page.route('**/tests/headless/e2e/fixtures/landscape_*', async request => {
            const file = new URL(request.request().url()).pathname.split('/').at(-1);
            if (!['landscape_surface_probe.html', 'landscape_material_probe.js'].includes(file)) return request.fallback();
            return request.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html', body: await readFile(`tests/headless/e2e/fixtures/${file}`, 'utf8') });
        });
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async ([cases, clumpSeed, samplingSeed]) => {
            const { createLandscapeMaterialProbe } = await import('/tests/headless/e2e/fixtures/landscape_material_probe.js');
            const probe = createLandscapeMaterialProbe(), measurements = [], stochasticMeasurements = [];
            try {
                for (const value of cases) {
                    probe.setCoverage(value.weights); probe.setSynthetic(value);
                    if (value.center) probe.setCenter(value.center);
                    measurements.push({ id: value.id, ...probe.measureWeights({ span: value.span ?? 4 }) });
                    // uniform material pages are invariant to stochastic tiling, so every legacy expectation must hold with it enabled
                    probe.setStochastic(samplingSeed);
                    stochasticMeasurements.push({ id: value.id, ...probe.measureWeights({ span: value.span ?? 4 }) });
                    probe.setStochastic(null);
                }
                probe.setSynthetic({ enabled: false }); probe.setBoundary(); probe.setPatternedHeights();
                probe.setColors([[80, 80, 80], [80, 80, 80], [120, 28, 12], [12, 112, 30], [80, 80, 80], [80, 80, 80]]);
                const legacy = probe.draw().slice(), snapshots = [{ id: '01-coverage-only', dataUrl: probe.snapshot() }];
                probe.uniforms.uSurfaceBlendEnabled.value = 1;
                const height = probe.draw().slice(); snapshots.push({ id: '02-relative-relief', dataUrl: probe.snapshot() });
                const shifted = probe.draw({ offsetX: 4 / probe.size }).slice();
                let changedPixels = 0, outsideDifferenceBytes = 0, minimumRgbSum = Infinity, maximumShiftDifferenceBytes = 0;
                const shiftedDifferences = [];
                for (let row = 0; row < probe.size; row++) for (let column = 0; column < probe.size; column++) {
                    const offset = (row * probe.size + column) * 4;
                    const difference = Math.max(...[0, 1, 2].map(channel => Math.abs(legacy[offset + channel] - height[offset + channel])));
                    if (difference > 2) changedPixels++;
                    const worldOffset = (column + .5 - probe.size / 2) * 4 / probe.size;
                    if (Math.abs(worldOffset) > .6) outsideDifferenceBytes = Math.max(outsideDifferenceBytes, difference);
                    minimumRgbSum = Math.min(minimumRgbSum, height[offset] + height[offset + 1] + height[offset + 2]);
                    if (column < probe.size - 1) {
                        const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(shifted[offset + channel] - height[offset + 4 + channel])));
                        shiftedDifferences.push(delta); maximumShiftDifferenceBytes = Math.max(maximumShiftDifferenceBytes, delta);
                    }
                }
                shiftedDifferences.sort((a, b) => a - b);
                probe.setClumps(clumpSeed);
                const clumped = probe.draw().slice(); snapshots.push({ id: '03-clump-relief', dataUrl: probe.snapshot() });
                const clumpedShifted = probe.draw({ offsetX: 4 / probe.size }).slice();
                probe.setClumps(null);
                let clumpChangedPixels = 0, clumpOutsideDifferenceBytes = 0, clumpMinimumRgbSum = Infinity, clumpMaximumShiftDifferenceBytes = 0;
                const clumpShiftDifferences = [];
                for (let row = 0; row < probe.size; row++) for (let column = 0; column < probe.size; column++) {
                    const offset = (row * probe.size + column) * 4, worldOffset = (column + .5 - probe.size / 2) * 4 / probe.size;
                    if (Math.max(...[0, 1, 2].map(channel => Math.abs(clumped[offset + channel] - height[offset + channel]))) > 2) clumpChangedPixels++;
                    if (Math.abs(worldOffset) > .6) clumpOutsideDifferenceBytes = Math.max(clumpOutsideDifferenceBytes, ...[0, 1, 2].map(channel => Math.abs(clumped[offset + channel] - legacy[offset + channel])));
                    clumpMinimumRgbSum = Math.min(clumpMinimumRgbSum, clumped[offset] + clumped[offset + 1] + clumped[offset + 2]);
                    if (column < probe.size - 1) {
                        const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(clumpedShifted[offset + channel] - clumped[offset + 4 + channel])));
                        clumpShiftDifferences.push(delta); clumpMaximumShiftDifferenceBytes = Math.max(clumpMaximumShiftDifferenceBytes, delta);
                    }
                }
                clumpShiftDifferences.sort((a, b) => a - b);
                // the same relief boundary with world-anchored stochastic tiling of the patterned relief pages
                probe.setStochastic(samplingSeed);
                const stochastic = probe.draw().slice(); snapshots.push({ id: '04-stochastic-relief', dataUrl: probe.snapshot() });
                const stochasticShifted = probe.draw({ offsetX: 4 / probe.size }).slice();
                probe.setStochastic(null);
                let stochasticChangedPixels = 0, stochasticOutsideDifferenceBytes = 0, stochasticMinimumRgbSum = Infinity, stochasticMaximumShiftDifferenceBytes = 0;
                const stochasticShiftDifferences = [];
                for (let row = 0; row < probe.size; row++) for (let column = 0; column < probe.size; column++) {
                    const offset = (row * probe.size + column) * 4, worldOffset = (column + .5 - probe.size / 2) * 4 / probe.size;
                    if (Math.max(...[0, 1, 2].map(channel => Math.abs(stochastic[offset + channel] - legacy[offset + channel]))) > 2) stochasticChangedPixels++;
                    if (Math.abs(worldOffset) > .6) stochasticOutsideDifferenceBytes = Math.max(stochasticOutsideDifferenceBytes, ...[0, 1, 2].map(channel => Math.abs(stochastic[offset + channel] - legacy[offset + channel])));
                    stochasticMinimumRgbSum = Math.min(stochasticMinimumRgbSum, stochastic[offset] + stochastic[offset + 1] + stochastic[offset + 2]);
                    if (column < probe.size - 1) {
                        const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(stochasticShifted[offset + channel] - stochastic[offset + 4 + channel])));
                        stochasticShiftDifferences.push(delta); stochasticMaximumShiftDifferenceBytes = Math.max(stochasticMaximumShiftDifferenceBytes, delta);
                    }
                }
                stochasticShiftDifferences.sort((a, b) => a - b);
                return { renderer: probe.rendererName, measurements, stochasticMeasurements, snapshots,
                    stochasticBoundary: { changedPixels: stochasticChangedPixels, outsideDifferenceBytes: stochasticOutsideDifferenceBytes, minimumRgbSum: stochasticMinimumRgbSum,
                        maximumShiftDifferenceBytes: stochasticMaximumShiftDifferenceBytes, p99ShiftDifferenceBytes: stochasticShiftDifferences[Math.floor(stochasticShiftDifferences.length * .99)], comparedPixels: stochasticShiftDifferences.length },
                    boundary: { changedPixels, outsideDifferenceBytes, minimumRgbSum,
                    maximumShiftDifferenceBytes, p99ShiftDifferenceBytes: shiftedDifferences[Math.floor(shiftedDifferences.length * .99)], comparedPixels: shiftedDifferences.length },
                    clumpBoundary: { changedPixels: clumpChangedPixels, outsideDifferenceBytes: clumpOutsideDifferenceBytes, minimumRgbSum: clumpMinimumRgbSum,
                        maximumShiftDifferenceBytes: clumpMaximumShiftDifferenceBytes, p99ShiftDifferenceBytes: clumpShiftDifferences[Math.floor(clumpShiftDifferences.length * .99)],
                        shiftPixelsOverTwelveBytes: clumpShiftDifferences.filter(delta => delta > 12).length, comparedPixels: clumpShiftDifferences.length } };
            } finally { probe.dispose(); }
        }, [cases, clumps, samplingSeed]);
        const { snapshots, ...measurements } = result; Object.assign(report, measurements);
        for (const snapshot of snapshots) await writeFile(path.join(artifacts, `${snapshot.id}.png`), Buffer.from(snapshot.dataUrl.split(',')[1], 'base64'));
        for (const value of cases) for (const [label, list] of [['legacy', report.measurements], ['stochastic', report.stochasticMeasurements]]) {
            const measured = list.find(sample => sample.id === value.id), expected = expectedWeights(value);
            measured.input = value; measured.expected = expected;
            measured.maximumWeightError = Math.max(...expected.map((weight, soil) => Math.abs(weight - measured.weights[soil])));
            expect(measured.denominator).toBeGreaterThan(100);
            expect(measured.maximumWeightError, `${value.id} CPU/rendered weight parity (${label})`).toBeLessThanOrEqual(.025);
            expect(Math.abs(measured.weights.reduce((sum, weight) => sum + weight, 0) - 1), `${value.id} normalized coverage (${label})`).toBeLessThanOrEqual(.035);
            value.weights.forEach((weight, soil) => { if (!weight) expect(measured.weights[soil], `${value.id} absent soil ${soil} (${label})`).toBe(0); });
        }
        const at = id => report.measurements.find(value => value.id === id).weights;
        expect(at('sand-high')[2]).toBeGreaterThan(.97); expect(at('grass-high')[3]).toBeGreaterThan(.97);
        expect(at('six-material-height-winner')[5]).toBeGreaterThan(.97);
        expect(Math.abs(at('far-pixel-footprint')[3] - .5)).toBeLessThan(.02);
        const arrival = report.measurements.filter(value => value.id.startsWith('tier-arrival-')).map(value => value.weights[3]);
        for (let index = 1; index < arrival.length; index++) {
            expect(arrival[index] + .005).toBeGreaterThanOrEqual(arrival[index - 1]);
            expect(arrival[index] - arrival[index - 1]).toBeLessThan(.06);
        }
        expect(report.boundary.changedPixels, 'Retained relief must visibly change the contour response').toBeGreaterThan(1000);
        expect(report.boundary.outsideDifferenceBytes, 'Height competition cannot introduce support outside the coverage band').toBe(0);
        expect(report.boundary.minimumRgbSum, 'A junction must retain finite lit material coverage').toBeGreaterThan(60);
        expect(report.boundary.p99ShiftDifferenceBytes, 'One-pixel translation should retain the same resolved boundary').toBeLessThanOrEqual(3);
        expect(report.boundary.maximumShiftDifferenceBytes).toBeLessThanOrEqual(12);
        const reweighted = report.measurements.filter(value => value.id.startsWith('clumps-coverage-')).filter(value => Math.abs(value.weights[3] - .5) > .1);
        expect(reweighted.length, 'Clump relief reweights balanced coverage at most sampled positions').toBeGreaterThanOrEqual(3);
        expect(at('clumps-tail')[3], 'A coverage tail below the confidence range cannot gain weight').toBeLessThanOrEqual(.016);
        expect(report.clumpBoundary.changedPixels, 'Clump relief must visibly interleave the contour response').toBeGreaterThan(1000);
        expect(report.clumpBoundary.outsideDifferenceBytes, 'Clump relief cannot introduce support outside the coverage band').toBe(0);
        expect(report.clumpBoundary.minimumRgbSum, 'Clumped junctions retain finite lit material coverage').toBeGreaterThan(60);
        expect(report.clumpBoundary.p99ShiftDifferenceBytes, 'World-anchored clumps keep a one-pixel translation stable').toBeLessThanOrEqual(3);
        expect(report.clumpBoundary.shiftPixelsOverTwelveBytes / report.clumpBoundary.comparedPixels, 'Only isolated clump edge pixels may change their derivative footprint with the quad alignment').toBeLessThanOrEqual(.001);
        expect(report.clumpBoundary.maximumShiftDifferenceBytes).toBeLessThanOrEqual(64);
        expect(report.stochasticBoundary.outsideDifferenceBytes, 'Stochastic relief cannot introduce support outside the coverage band').toBe(0);
        expect(report.stochasticBoundary.changedPixels, 'Stochastic relief still interleaves the contour response').toBeGreaterThan(1000);
        expect(report.stochasticBoundary.minimumRgbSum).toBeGreaterThan(60);
        expect(report.stochasticBoundary.p99ShiftDifferenceBytes, 'World-anchored stochastic tiling keeps a one-pixel translation stable').toBeLessThanOrEqual(3);
        expect(report.stochasticBoundary.maximumShiftDifferenceBytes).toBeLessThanOrEqual(64);
        expect(report.errors).toEqual([]);
        report.complete = true;
    } finally { await context.close(); await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2)); }
});

test('Landscape materials: repeated material bindings retain separate allocation keys and independent release', async ({ browser }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).toBe('8002');
    const context = await browser.newContext({ baseURL }), page = await context.newPage();
    try {
        await page.route('**/tests/headless/e2e/fixtures/landscape_surface_probe.html', async request => request.fulfill({
            contentType: 'text/html', body: await readFile('tests/headless/e2e/fixtures/landscape_surface_probe.html', 'utf8') }));
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async () => {
            const { LandscapeMaterialPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaterialPages.js');
            const { LandscapeResidencyBudget } = await import('/src/app/landscape/LandscapeResidencyBudget.js');
            const { LandscapeAppearanceBudget } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js');
            const { createLandscapeAppearanceUniforms, LANDSCAPE_MASK_SLOTS } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
            const shared = new LandscapeResidencyBudget(), budget = new LandscapeAppearanceBudget(shared, 'duplicate-binding');
            const tier = { resolution: 32, channels: { baseColor: { sha256: 'a'.repeat(64) }, normal: { sha256: 'b'.repeat(64) }, orm: { sha256: 'c'.repeat(64) } } };
            const appearance = { materials: ['seabed', 'sand'].map(soilId => ({ soilId, materialId: 'pbr.aerial_beach_01', tiers: [tier] })) };
            const pool = { request: async () => ({ baseColor: new Uint8Array(32 * 32 * 4), surface: new Uint8Array(32 * 32 * 8) }) };
            const renderer = { capabilities: { getMaxAnisotropy: () => 4 }, initTexture() {} };
            const pages = new LandscapeMaterialPages({ appearance, budget, pool, renderer, uniforms: createLandscapeAppearanceUniforms(LANDSCAPE_MASK_SLOTS), prefix: 'duplicate-binding' });
            const upload = async material => {
                material.refs.add(`mask-${material.index}`);
                if (!pages.request(material, 32)) throw new Error('Fixture material reservation unexpectedly denied');
                await Promise.resolve(); await Promise.resolve();
                pages.update(0, 1024 * 1024);
            };
            let result;
            try {
                pages.initialized = true;
                await upload(pages.materials[0]); await upload(pages.materials[1]);
                const records = [...pages.records.values()], keys = records.map(record => record.key);
                result = { keys, before: budget.snapshot(), sharedBefore: shared.snapshot(), recordsBefore: records.map(({ id, key, status }) => ({ id, key, status })) };
                pages.remove(records[0]);
                result.afterFirstRelease = { budget: budget.snapshot(), shared: shared.snapshot(), firstPresent: shared.has(keys[0]), secondPresent: shared.has(keys[1]),
                    secondRecordPresent: pages.records.has(records[1].id), secondPixelsRetained: records[1].baseColor?.length };
            } finally { pages.dispose(); budget.dispose(); }
            result.disposed = shared.snapshot(); return result;
        });
        expect(new Set(result.keys).size).toBe(2);
        expect(result.recordsBefore.map(value => value.status)).toEqual(['resident', 'resident']);
        expect(result.before.cpuBytes).toBe(2 * 32 * 32 * 12); expect(result.before.gpuBytes).toBe(2 * 5460 * 3);
        expect(result.sharedBefore.leaseCount).toBe(2);
        expect(result.afterFirstRelease.firstPresent).toBe(false); expect(result.afterFirstRelease.secondPresent).toBe(true);
        expect(result.afterFirstRelease.secondRecordPresent).toBe(true); expect(result.afterFirstRelease.secondPixelsRetained).toBe(32 * 32 * 4);
        expect(result.afterFirstRelease.budget.cpuBytes).toBe(32 * 32 * 12); expect(result.afterFirstRelease.budget.gpuBytes).toBe(5460 * 3);
        expect(result.afterFirstRelease.shared.leaseCount).toBe(1);
        expect(result.disposed.cpuBytes).toBe(0); expect(result.disposed.gpuBytes).toBe(0); expect(result.disposed.leaseCount).toBe(0);
        await mkdir(artifacts, { recursive: true });
        await writeFile(path.join(artifacts, 'duplicate-binding-budget.json'), JSON.stringify(result, null, 2));
    } finally { await context.close(); }
});

// world X/Z of a framebuffer pixel (rows counted from the bottom) for the probe's top-down orthographic camera
const pixelWorld = (center, span, size, row, column) => [center[0] + (column + .5 - size / 2) * span / size, center[1] + (size / 2 - .5 - row) * span / size];

// the near-lattice sample that carries the whole hex-contrast weight at a world position (equal relief everywhere), or null in a blend zone
function dominantSample(soilId, x, z, period) {
    const definition = landscapeMaterialSamplingDefinition(soilId);
    const lattice = landscapeHexLattice({ u: x / period, v: z / period, cellsPerPeriod: definition.cellsPerPeriod, salt: landscapeMaterialSamplingSalt(samplingSeed, soilId),
        rotationRangeRadians: definition.rotationRangeDegrees * Math.PI / 180, offsetSpreadV: definition.offsetSpreadV, exponent: definition.contrastExponent });
    const index = landscapeHexWeights({ weights: lattice.weights, signals: [.5, .5, .5], mode: 'hex-contrast' }).weights.findIndex(weight => weight > .999);
    return index < 0 ? null : lattice.samples[index];
}

test('Landscape materials: production stochastic tiling follows the JS lattice, rotates normals like catalog rotation and stays seamless', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).toBe('8002');
    await mkdir(artifacts, { recursive: true });
    const size = 512, period = 4, soil = 3, soilId = LANDSCAPE_SOIL_CATALOG[soil].id, center = [1033.7, 1021.3], span = 8, texels = 16;
    const frac = value => value - Math.floor(value);
    const parityPixels = [], normalPixels = [], vertices = new Set();
    for (let row = 2; row < size; row += 6) for (let column = 3; column < size; column += 6) {
        const sample = dominantSample(soilId, ...pixelWorld(center, span, size, row, column), period);
        if (!sample) continue;
        const fu = frac(sample.uv[0]) * texels, fv = frac(sample.uv[1]) * texels;
        if (Math.min(frac(fu), 1 - frac(fu), frac(fv), 1 - frac(fv)) < .06) continue;
        parityPixels.push({ row, column, expected: [Math.floor(fu), Math.floor(fv)] });
        const key = sample.vertex.join(',');
        if (!vertices.has(key) && Math.abs(sample.angle) > .2 && normalPixels.length < 8) { vertices.add(key); normalPixels.push({ row, column, angle: sample.angle, vertex: key }); }
    }
    const report = { format: 'landscape-material-sampling-gpu-probe', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(), seed: samplingSeed, soilId, period, span, center,
        conditions: { size, shader: 'production terrain programs compiled per material sampling mode', framebuffer: 'linear RGB8, no tone mapping or antialiasing',
            parity: 'Nearest-filtered 16x16 coordinate page; decoded texel indices at pixels where one hex sample carries the weight, against the JavaScript lattice mirror',
            normals: 'Constant tilted normal page: a dominant hex sample of angle a must light exactly like the single-sample path with catalog UV rotation a',
            seams: 'Smooth periodic page: the largest adjacent-pixel step must shrink when zooming 8x into it (continuous blend), and a one-pixel camera shift must reproduce the image' },
        errors: [], warnings: [] };
    expect(parityPixels.length, 'enough single-sample pixels to test').toBeGreaterThan(500);
    expect(normalPixels.length).toBe(8);
    const context = await browser.newContext({ baseURL, viewport: { width: size, height: size }, deviceScaleFactor: 1 }), page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {
        if (!['error', 'warning'].includes(message.type()) || !/shader|webgl|program|THREE|GL_INVALID/i.test(message.text())) return;
        (message.type() === 'error' ? report.errors : report.warnings).push(message.text());
    });
    try {
        await page.route('**/tests/headless/e2e/fixtures/landscape_*', async request => {
            const file = new URL(request.request().url()).pathname.split('/').at(-1);
            if (!['landscape_surface_probe.html', 'landscape_material_probe.js'].includes(file)) return request.fallback();
            return request.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html', body: await readFile(`tests/headless/e2e/fixtures/${file}`, 'utf8') });
        });
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async ({ seed, soil, period, center, span, texels, parityPixels, normalPixels }) => {
            const { createLandscapeMaterialProbe } = await import('/tests/headless/e2e/fixtures/landscape_material_probe.js');
            const probe = createLandscapeMaterialProbe({ materialSampling: 'hex-contrast' }), size = probe.size, snapshots = [];
            const pixel = (buffer, row, column) => Array.from(buffer.slice((row * size + column) * 4, (row * size + column) * 4 + 3));
            const stepStatistics = (buffer, inside = () => true) => {
                let largest = 0, at = [0, 0];
                for (let row = 0; row < size - 1; row++) for (let column = 0; column < size - 1; column++) {
                    if (!inside(row, column)) continue;
                    const offset = (row * size + column) * 4;
                    for (const next of [offset + 4, offset + size * 4]) {
                        const step = Math.max(...[0, 1, 2].map(channel => Math.abs(buffer[offset + channel] - buffer[next + channel])));
                        if (step > largest) { largest = step; at = [row, column]; }
                    }
                }
                return { largest, at };
            };
            try {
                probe.setCoverage([0, 0, 0, 1, 0, 0]); probe.setSynthetic({ period }); probe.setCenter(center); probe.setStochastic(seed);
                const result = {};
                // texel parity against the JavaScript lattice
                probe.setColors(Array.from({ length: 6 }, () => [0, 0, 0])); const black = probe.draw({ span }).slice();
                probe.setColors(Array.from({ length: 6 }, () => [80, 80, 80])); const white = probe.draw({ span }).slice();
                const coordinates = new Uint8Array(texels * texels * 4);
                for (let ty = 0; ty < texels; ty++) for (let tx = 0; tx < texels; tx++) coordinates.set([tx * 5, ty * 5, 0, 255], (ty * texels + tx) * 4);
                const base = probe.uniforms[`uSoilBase${soil}`].value;
                probe.uniforms[`uSoilBase${soil}`].value = probe.texture(coordinates, texels, 1, false, true);
                const decoded = probe.draw({ span }).slice(); snapshots.push({ id: '05-stochastic-coordinates', dataUrl: probe.snapshot() });
                result.parity = parityPixels.map(({ row, column, expected }) => {
                    const value = pixel(decoded, row, column), low = pixel(black, row, column), high = pixel(white, row, column);
                    const bytes = [0, 1].map(channel => (value[channel] - low[channel]) / (high[channel] - low[channel]) * 80);
                    return { row, column, expected, decoded: bytes.map(byte => Math.round(byte / 5)), bytes };
                });
                probe.uniforms[`uSoilBase${soil}`].value = base;
                // inverse-rotated slopes light like the established catalog rotation path
                probe.setColors(Array.from({ length: 6 }, () => [80, 80, 80]));
                const tilted = new Uint8Array(8); tilted.set([204, 128, 230, 255, 255, 255, 0, 128]);
                const surface = probe.uniforms[`uSoilSurface${soil}`].value;
                probe.uniforms[`uSoilSurface${soil}`].value = probe.texture(tilted, 1, 2);
                probe.uniforms.uSoilScale.value[soil].set(period, 1, 1, 0);
                const stochasticLit = probe.draw({ span }).slice();
                probe.setMaterialSampling('single'); probe.setStochastic(null);
                result.normals = normalPixels.map(({ row, column, angle }) => {
                    probe.uniforms.uSoilRange.value[soil].w = angle;
                    const reference = probe.draw({ span }).slice();
                    return { row, column, angle, stochastic: pixel(stochasticLit, row, column), single: pixel(reference, row, column) };
                });
                probe.uniforms.uSoilRange.value[soil].w = 0;
                probe.uniforms[`uSoilSurface${soil}`].value = surface;
                probe.uniforms.uSoilScale.value[soil].set(period, 0, 1, 0);
                // continuity: a smooth page has no seam, so its largest step shrinks with an 8x zoom; a camera shift reproduces the image
                const smooth = new Uint8Array(64 * 64 * 4);
                for (let ty = 0; ty < 64; ty++) for (let tx = 0; tx < 64; tx++) {
                    smooth.set([Math.round(40 + 30 * Math.sin(2 * Math.PI * tx / 64) * Math.cos(2 * Math.PI * ty / 64)), Math.round(40 + 30 * Math.sin(2 * Math.PI * (tx + ty) / 64)), 40, 255], (ty * 64 + tx) * 4);
                }
                probe.uniforms[`uSoilBase${soil}`].value = probe.texture(smooth, 64);
                const singleSmooth = probe.draw({ span: 16 }).slice(); snapshots.push({ id: '06-single-smooth', dataUrl: probe.snapshot() });
                result.singleStep = stepStatistics(singleSmooth);
                probe.setMaterialSampling('hex-contrast'); probe.setStochastic(seed);
                const wide = probe.draw({ span: 16 }).slice(); snapshots.push({ id: '07-stochastic-smooth', dataUrl: probe.snapshot() });
                result.wideStep = stepStatistics(wide);
                let changed = 0;
                for (let i = 0; i < size * size; i++) if (Math.max(...[0, 1, 2].map(channel => Math.abs(wide[i * 4 + channel] - singleSmooth[i * 4 + channel]))) > 2) changed++;
                result.changedFraction = changed / (size * size);
                const [row, column] = result.wideStep.at, focus = [center[0] + (column + .5 - size / 2) * 16 / size, center[1] + (size / 2 - .5 - row) * 16 / size];
                probe.setCenter(focus);
                const zoomed = probe.draw({ span: 2 }).slice(); snapshots.push({ id: '08-stochastic-smooth-zoom', dataUrl: probe.snapshot() });
                result.zoomStep = stepStatistics(zoomed, (r, c) => Math.abs(r - size / 2) < 96 && Math.abs(c - size / 2) < 96);
                probe.setCenter(center);
                const unshifted = probe.draw({ span: 8 }).slice(), shifted = probe.draw({ span: 8, offsetX: 8 / size }).slice(), shifts = [];
                for (let r = 0; r < size; r++) for (let c = 0; c < size - 1; c++) {
                    const offset = (r * size + c) * 4;
                    shifts.push(Math.max(...[0, 1, 2].map(channel => Math.abs(shifted[offset + channel] - unshifted[offset + 4 + channel]))));
                }
                shifts.sort((a, b) => a - b);
                result.shift = { p99: shifts[Math.floor(shifts.length * .99)], maximum: shifts.at(-1) };
                // every compiled mode keeps a uniform page exactly
                probe.uniforms[`uSoilBase${soil}`].value = base;
                probe.setColors(Array.from({ length: 6 }, () => [60, 50, 40]));
                result.modes = {};
                for (const mode of ['single', 'hex-linear', 'hex-contrast', 'hex-variance']) {
                    probe.setMaterialSampling(mode); probe.setStochastic(mode === 'single' ? null : seed);
                    result.modes[mode] = pixel(probe.draw({ span }), size / 2, size / 2);
                }
                result.snapshots = snapshots;
                result.renderer = probe.rendererName;
                return result;
            } finally { probe.dispose(); }
        }, { seed: samplingSeed, soil, period, center, span, texels, parityPixels, normalPixels });
        for (const snapshot of result.snapshots) await writeFile(path.join(artifacts, `${snapshot.id}.png`), Buffer.from(snapshot.dataUrl.split(',')[1], 'base64'));
        delete result.snapshots;
        Object.assign(report, result);
        const mismatches = result.parity.filter(value => value.decoded[0] !== value.expected[0] || value.decoded[1] !== value.expected[1]);
        report.parityMatched = result.parity.length - mismatches.length; report.parityMismatches = mismatches.slice(0, 20);
        expect(mismatches.length, 'every dominant hex sample reads the texel the JavaScript lattice predicts').toBe(0);
        report.normalDifferenceBytes = Math.max(...result.normals.map(value => Math.max(...value.stochastic.map((byte, channel) => Math.abs(byte - value.single[channel])))));
        expect(report.normalDifferenceBytes, 'rotated samples light exactly like the catalog-rotation path').toBeLessThanOrEqual(2);
        expect(new Set(result.normals.map(value => value.stochastic.join(','))).size, 'different patch rotations light differently').toBeGreaterThan(4);
        expect(result.changedFraction, 'stochastic tiling is active').toBeGreaterThan(.5);
        expect(result.zoomStep.largest, 'an 8x zoom shrinks the largest step, so the blend has no seam').toBeLessThanOrEqual(Math.max(3, result.wideStep.largest * .35));
        expect(result.shift.p99, 'world-anchored tiling keeps a one-pixel camera shift stable').toBeLessThanOrEqual(2);
        expect(result.shift.maximum).toBeLessThanOrEqual(16);
        for (const [mode, value] of Object.entries(result.modes)) value.forEach((byte, channel) => expect(Math.abs(byte - result.modes.single[channel]), `${mode} keeps a uniform page`).toBeLessThanOrEqual(1));
        expect(report.errors).toEqual([]);
        report.complete = true;
    } finally { await context.close(); await writeFile(path.join(artifacts, 'stochastic-report.json'), JSON.stringify(report, null, 2)); }
});
