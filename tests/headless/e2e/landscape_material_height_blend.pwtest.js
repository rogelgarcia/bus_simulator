// Measures relative-relief dominance, clump relief parity, stochastic tiling parity, derivative stability and the AI577 D4 layers (micro detail, macro variation,
// slope projection, split multiscale uploads) through the unchanged production landscape shader.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { landscapeClumpedCoverage, landscapeMaterialClumpRelief, landscapeMaterialHeightDetail, sampleLandscapeMaterialBlend } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';
import { landscapeHexLattice, landscapeHexWeights, landscapeMaterialSamplingDefinition, landscapeMaterialSamplingSalt } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialSampling.js';
import { LANDSCAPE_SOIL_CATALOG } from '../../../src/app/landscape/LandscapeCatalog.js';
import { landscapeMacroField, landscapeMacroVariationDefinition, landscapeMacroVariationSalts } from '../../../src/graphics/engine3d/landscape/LandscapeMacroVariation.js';
import { landscapeTextureBytes as landscapeTextureBytesNode } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';

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

const routeProbe = async page => page.route('**/tests/headless/e2e/fixtures/landscape_*', async request => {
    const file = new URL(request.request().url()).pathname.split('/').at(-1);
    if (!['landscape_surface_probe.html', 'landscape_material_probe.js'].includes(file)) return request.fallback();
    return request.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html', body: await readFile(`tests/headless/e2e/fixtures/${file}`, 'utf8') });
});
const collectErrors = (page, report) => {
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {
        if (!['error', 'warning'].includes(message.type()) || !/shader|webgl|program|THREE|GL_INVALID/i.test(message.text())) return;
        (message.type() === 'error' ? report.errors : report.warnings).push(message.text());
    });
};

test('Landscape materials: AI577 D4 micro detail and macro variation follow their JavaScript mirrors, fade by footprint and leave legacy cases unchanged', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).toBe('8002');
    await mkdir(artifacts, { recursive: true });
    const report = { format: 'landscape-d4-layer-gpu-probe', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(), errors: [], warnings: [],
        conditions: { size: 512, shader: 'production terrain programs (hex-contrast compiled, stochastic tiling disabled)', framebuffer: 'linear RGB8, no tone mapping or antialiasing',
            micro: 'paired layer 2 of a three-layer surface array, 1.5 m period, resident resolution 512', macro: `landscape seed ${samplingSeed}` } };
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 }), page = await context.newPage();
    collectErrors(page, report);
    try {
        await routeProbe(page);
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async ({ seed, legacyCases }) => {
            const { createLandscapeMaterialProbe } = await import('/tests/headless/e2e/fixtures/landscape_material_probe.js');
            const probe = createLandscapeMaterialProbe(), size = probe.size, snapshots = [];
            const center = buffer => Array.from(buffer.slice(((size / 2) * size + size / 2) * 4, ((size / 2) * size + size / 2) * 4 + 3));
            const pixel = (buffer, row, column) => Array.from(buffer.slice((row * size + column) * 4, (row * size + column) * 4 + 3));
            const maxDifference = (a, b) => { let largest = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) largest = Math.max(largest, Math.abs(a[i + c] - b[i + c])); return largest; };
            const result = {};
            try {
                // micro luminance: albedo scales by 1 + (2A - 1) * luminance scale while the fade is complete
                probe.setCoverage([0, 0, 1, 0, 0, 0]); probe.setSynthetic({ resolution: 512 });
                probe.setColors(Array.from({ length: 6 }, () => [0, 0, 0])); probe.setMicro(2); const black = center(probe.draw());
                probe.setColors(Array.from({ length: 6 }, () => [80, 80, 80]));
                probe.setSynthetic({ resolution: 512 }); const plain = probe.draw().slice();
                probe.setMicro(2); const neutral = probe.draw().slice();
                result.neutralMicroDifference = maxDifference(plain, neutral);
                result.luminance = [];
                for (const alpha of [0, 64, 191, 255]) {
                    probe.setMicro(2, { data: new Uint8Array([128, 128, 128, alpha]) });
                    const value = center(probe.draw()), base = center(neutral);
                    result.luminance.push({ alpha, measured: (value[1] - black[1]) / (base[1] - black[1]), expected: (1 + (alpha / 255 * 2 - 1) * .4) / (1 + (128 / 255 * 2 - 1) * .4) });
                }
                // a footprint beyond the micro fade leaves no trace
                probe.setMicro(2, { data: new Uint8Array([128, 128, 128, 255]) }); const farMicro = probe.draw({ span: 400 }).slice();
                probe.setMicro(2); const farNeutral = probe.draw({ span: 400 }).slice();
                result.farFadeDifference = maxDifference(farMicro, farNeutral);
                // micro slopes add to base slopes: a tilted micro normal lights like the same base normal
                probe.uniforms.uSoilScale.value[2].y = 1;
                probe.setMicro(2, { normal: [204, 128, 230, 255] }); const baseTilt = center(probe.draw());
                probe.uniforms.uSoilScale.value[2].y = 1;
                probe.setMicro(2, { data: new Uint8Array([204, 128, 128, 128]) }); const microTilt = center(probe.draw());
                probe.uniforms.uSoilScale.value[2].y = 1;
                probe.setMicro(2); const untilted = center(probe.draw());
                result.normal = { baseTilt, microTilt, untilted };
                // micro relief joins the height competition of a two-material transition
                probe.setCoverage([0, 0, .5, .5, 0, 0]); probe.setSynthetic({ resolution: 512 });
                const balanced = probe.measureWeights().weights;
                probe.setMicro(2, { data: new Uint8Array([128, 128, 255, 128]) }); const raised = probe.measureWeights().weights;
                probe.setMicro(2, { data: new Uint8Array([128, 128, 0, 128]) }); const lowered = probe.measureWeights().weights;
                result.relief = { balanced, raised, lowered };
                // landscape-scale variation: a gray albedo keeps its hue and scales by 2^(value * tone)
                probe.setCoverage([0, 0, 0, 1, 0, 0]); probe.setSynthetic({ resolution: 512 });
                result.macro = [];
                for (const [x, z] of [[1024, 1024], [1311.5, 977.25], [733.75, 1488.5]]) {
                    probe.setCenter([x, z]);
                    probe.setColors(Array.from({ length: 6 }, () => [0, 0, 0])); probe.setLayers(); const dark = center(probe.draw());
                    probe.setColors(Array.from({ length: 6 }, () => [80, 80, 80])); const off = center(probe.draw());
                    probe.setLayers({ macroSeed: seed }); const on = center(probe.draw());
                    probe.setColors(Array.from({ length: 6 }, () => [0, 0, 0])); const darkOn = center(probe.draw());
                    result.macro.push({ x, z, ratio: (on[1] - darkOn[1]) / (off[1] - dark[1]), hueShift: Math.max(...on.map((value, channel) => Math.abs((value - darkOn[channel]) / (on[1] - darkOn[1]) - (off[channel] - dark[channel]) / (off[1] - dark[1])))) });
                    probe.setLayers();
                }
                probe.setCenter([1024, 1024]);
                snapshots.push({ id: '09-d4-macro-field', dataUrl: (() => { probe.setColors(Array.from({ length: 6 }, () => [80, 80, 80])); probe.setLayers({ macroSeed: seed }); probe.draw({ span: 1200 }); const url = probe.snapshot(); probe.setLayers(); return url; })() });
                // legacy boundary bytes are unchanged by enabled but neutral layers on a flat plane
                probe.setSynthetic({ enabled: false }); probe.setBoundary(); probe.setPatternedHeights(); probe.uniforms.uSurfaceBlendEnabled.value = 1;
                probe.setColors([[80, 80, 80], [80, 80, 80], [120, 28, 12], [12, 112, 30], [80, 80, 80], [80, 80, 80]]);
                const legacy = probe.draw().slice();
                probe.setLayers({ projection: true, normalFiltering: true });
                const layered = probe.draw().slice();
                result.legacyBoundaryDifference = maxDifference(legacy, layered);
                probe.setLayers();
                // legacy weight cases with neutral layers enabled
                result.legacyWeights = [];
                for (const value of legacyCases) {
                    probe.setCoverage(value.weights); probe.setSynthetic(value); probe.setLayers({ projection: true, normalFiltering: true });
                    result.legacyWeights.push({ id: value.id, ...probe.measureWeights({ span: value.span ?? 4 }) });
                    probe.setLayers();
                }
                result.snapshots = snapshots;
                result.renderer = probe.rendererName;
                return result;
            } finally { probe.dispose(); }
        }, { seed: samplingSeed, legacyCases: cases.filter(value => !value.clumps && !value.center && !value.id.startsWith('tier-arrival-')) });
        for (const snapshot of result.snapshots) await writeFile(path.join(artifacts, `${snapshot.id}.png`), Buffer.from(snapshot.dataUrl.split(',')[1], 'base64'));
        delete result.snapshots;
        Object.assign(report, result);
        expect(result.neutralMicroDifference, 'a neutral micro layer changes nothing').toBeLessThanOrEqual(1);
        for (const value of result.luminance) expect(Math.abs(value.measured - value.expected), `micro luminance alpha ${value.alpha}`).toBeLessThanOrEqual(.02);
        expect(result.farFadeDifference, 'micro detail has faded at a far footprint').toBeLessThanOrEqual(1);
        expect(Math.max(...result.normal.baseTilt.map((byte, channel) => Math.abs(byte - result.normal.microTilt[channel]))), 'micro slopes light like equal base slopes').toBeLessThanOrEqual(2);
        expect(Math.max(...result.normal.untilted.map((byte, channel) => Math.abs(byte - result.normal.microTilt[channel]))), 'the tilt is visible').toBeGreaterThan(8);
        expect(Math.abs(result.relief.balanced[2] - .5)).toBeLessThan(.02);
        const metersPerPixel = 4 / 512, details = Array(6).fill(0).map(() => landscapeMaterialHeightDetail({ periodMeters: 4, resolution: 512, metersPerPixel }));
        for (const [label, micro] of [['raised', 1], ['lowered', 0]]) {
            const heights = [.5, .5, .5 + .3 * (micro - .5), .5, .5, .5].map(value => Math.round(value * 255) / 255), expected = sampleLandscapeMaterialBlend({ weights: [0, 0, .5, .5, 0, 0], heights, details }).weights;
            report.relief[`${label}Expected`] = expected;
            expect(Math.max(...expected.map((weight, soil) => Math.abs(weight - result.relief[label][soil]))), `micro relief ${label} matches the competition mirror`).toBeLessThanOrEqual(.03);
        }
        expect(result.relief.raised[2], 'raised micro relief wins the transition').toBeGreaterThan(.6);
        expect(result.relief.lowered[2], 'lowered micro relief yields the transition').toBeLessThan(.4);
        const salts = landscapeMacroVariationSalts(samplingSeed), loam = landscapeMacroVariationDefinition('loam');
        report.macro = result.macro.map(value => {
            const field = landscapeMacroField({ x: value.x + metersPerPixel / 2, z: value.z - metersPerPixel / 2, metersPerPixel, salts });
            return { ...value, field, expected: 2 ** (loam.value * field.tone) };
        });
        for (const value of report.macro) {
            expect(Math.abs(value.ratio - value.expected), `macro value at ${value.x},${value.z}`).toBeLessThanOrEqual(.015);
            expect(value.hueShift, 'gray albedo stays gray').toBeLessThanOrEqual(.03);
        }
        expect(new Set(report.macro.map(value => value.ratio.toFixed(3))).size, 'the field varies over the landscape').toBeGreaterThan(1);
        expect(result.legacyBoundaryDifference, 'neutral layers keep the legacy boundary bytes').toBeLessThanOrEqual(1);
        for (const measured of result.legacyWeights) {
            const value = cases.find(entry => entry.id === measured.id), expected = expectedWeights(value);
            expect(Math.max(...expected.map((weight, soil) => Math.abs(weight - measured.weights[soil]))), `${value.id} with neutral layers enabled`).toBeLessThanOrEqual(.025);
        }
        expect(report.errors).toEqual([]);
        report.complete = true;
    } finally { await context.close(); await writeFile(path.join(artifacts, 'd4-layer-report.json'), JSON.stringify(report, null, 2)); }
});

test('Landscape materials: slope-adaptive projection removes stretching on steep planes, keeps gentle ground exact and shows no projection seams', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).toBe('8002');
    await mkdir(artifacts, { recursive: true });
    const report = { format: 'landscape-d4-projection-gpu-probe', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(), errors: [], warnings: [],
        conditions: { size: 512, span: '8 m per frame on planes viewed along their normal, screen up uphill', texture: 'nearest 16x16 checker per 4 m period, stochastic tiling disabled',
            density: 'checker transitions per meter along the fall line (screen column) and across it (screen row); unstretched density is 4 per meter' } };
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 }), page = await context.newPage();
    collectErrors(page, report);
    try {
        await routeProbe(page);
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async () => {
            const { createLandscapeMaterialProbe } = await import('/tests/headless/e2e/fixtures/landscape_material_probe.js');
            const probe = createLandscapeMaterialProbe(), size = probe.size, span = 8, snapshots = [];
            const transitions = (buffer, along) => {
                let count = 0;
                for (let i = 1; i < size; i++) {
                    const a = along ? ((i - 1) * size + size / 2) * 4 : (size / 2 * size + i - 1) * 4, b = along ? (i * size + size / 2) * 4 : (size / 2 * size + i) * 4;
                    if (Math.abs(buffer[a + 1] - buffer[b + 1]) > 30) count++;
                }
                return count / span;
            };
            const maxDifference = (a, b) => { let largest = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) largest = Math.max(largest, Math.abs(a[i + c] - b[i + c])); return largest; };
            const result = { planes: [] };
            try {
                probe.setCoverage([0, 0, 0, 1, 0, 0]); probe.setSynthetic({ resolution: 512 }); probe.setCenter([1024, 1024]);
                const checker = new Uint8Array(16 * 16 * 4);
                for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) checker.set((x + y) % 2 ? [90, 90, 90, 255] : [5, 5, 5, 255], (y * 16 + x) * 4);
                const flat = probe.uniforms.uSoilBase3.value;
                for (const tiltDegrees of [0, 15, 30, 45, 60, 80]) {
                    probe.setPlane({ tiltDegrees, azimuthDegrees: 0 });
                    probe.uniforms.uSoilBase3.value = probe.texture(checker, 16, 1, false, true);
                    probe.setLayers({ projection: false }); const off = probe.draw({ span }).slice();
                    probe.setLayers({ projection: true }); const on = probe.draw({ span }).slice();
                    if (tiltDegrees === 60) { snapshots.push({ id: '10-d4-projection-60-on', dataUrl: probe.snapshot() }); probe.setLayers({ projection: false }); probe.draw({ span }); snapshots.push({ id: '11-d4-projection-60-off', dataUrl: probe.snapshot() }); }
                    probe.uniforms.uSoilBase3.value = flat;
                    probe.setLayers({ projection: false }); const flatOff = probe.draw({ span }).slice();
                    probe.setLayers({ projection: true }); const flatOn = probe.draw({ span }).slice();
                    result.planes.push({ tiltDegrees, offAlong: transitions(off, true), offAcross: transitions(off, false), onAlong: transitions(on, true), onAcross: transitions(on, false),
                        gentleDifference: tiltDegrees < 24 ? maxDifference(off, on) : null, flatTextureDifference: maxDifference(flatOff, flatOn) });
                }
                // a curved surface through every slope: an 8x zoom must shrink the largest step, so projection blends have no seam
                probe.setPlane({ tiltDegrees: 0 });
                const smooth = new Uint8Array(64 * 64 * 4);
                for (let ty = 0; ty < 64; ty++) for (let tx = 0; tx < 64; tx++) smooth.set([Math.round(40 + 30 * Math.sin(2 * Math.PI * tx / 64) * Math.cos(2 * Math.PI * ty / 64)), Math.round(40 + 30 * Math.sin(2 * Math.PI * (tx + ty) / 64)), 40, 255], (ty * 64 + tx) * 4);
                probe.uniforms.uSoilBase3.value = probe.texture(smooth, 64);
                probe.setLayers({ projection: true });
                const steps = [];
                for (const tiltDegrees of [20, 22, 24, 24.6, 25, 26, 28, 32, 36, 40, 44, 45, 46, 50, 60, 70]) {
                    probe.setPlane({ tiltDegrees, azimuthDegrees: 30 }); probe.setLayers({ projection: true });
                    const value = probe.draw({ span: 2 }).slice(), center = Array.from(value.slice((size / 2 * size + size / 2) * 4, (size / 2 * size + size / 2) * 4 + 3));
                    probe.setLayers({ projection: false }); const reference = probe.draw({ span: 2 }).slice();
                    steps.push({ tiltDegrees, center, differenceFromTop: maxDifference(value, reference) });
                }
                result.sweep = steps;
                result.snapshots = snapshots;
                result.renderer = probe.rendererName;
                return result;
            } finally { probe.dispose(); }
        });
        for (const snapshot of result.snapshots) await writeFile(path.join(artifacts, `${snapshot.id}.png`), Buffer.from(snapshot.dataUrl.split(',')[1], 'base64'));
        delete result.snapshots;
        Object.assign(report, result);
        for (const plane of result.planes) {
            const radians = plane.tiltDegrees * Math.PI / 180;
            expect(Math.abs(plane.offAlong - 4 * Math.cos(radians)), `top projection density at ${plane.tiltDegrees} degrees`).toBeLessThanOrEqual(.35);
            if (plane.tiltDegrees <= 30 || plane.tiltDegrees >= 60) expect(Math.abs(plane.onAcross - 4), `across-slope density at ${plane.tiltDegrees} degrees`).toBeLessThanOrEqual(.35);
            expect(plane.flatTextureDifference, `constant maps light identically at ${plane.tiltDegrees} degrees`).toBeLessThanOrEqual(1);
            if (plane.gentleDifference !== null) expect(plane.gentleDifference, `gentle ${plane.tiltDegrees} degree ground keeps the top projection exactly`).toBe(0);
            if (plane.tiltDegrees >= 60) expect(plane.onAlong / plane.onAcross, `no stretching at ${plane.tiltDegrees} degrees`).toBeGreaterThan(.85);
            if (plane.tiltDegrees >= 60) expect(plane.offAlong / plane.offAcross, `the top projection alone stretches at ${plane.tiltDegrees} degrees`).toBeLessThan(.55);
        }
        const sweep = result.sweep, at = degrees => sweep.find(value => value.tiltDegrees === degrees).differenceFromTop;
        expect(sweep.filter(value => value.tiltDegrees < 24.6).every(value => value.differenceFromTop === 0), 'below the activation slope the projection is exactly the top projection').toBe(true);
        expect(at(25), 'side projections fade in from zero above the activation slope').toBeLessThanOrEqual(3);
        for (const [low, high] of [[25, 26], [26, 28], [28, 32], [32, 36], [36, 40]]) expect(at(high) + 2, `the side share grows continuously from ${low} to ${high} degrees`).toBeGreaterThanOrEqual(at(low));
        expect(report.errors).toEqual([]);
        report.complete = true;
    } finally { await context.close(); await writeFile(path.join(artifacts, 'd4-projection-report.json'), JSON.stringify(report, null, 2)); }
});

test('Landscape materials: synthetic 1024 micro tiers upload in steps within the frame allowance, blend directly between tiers and fall back explicitly', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).toBe('8002');
    const context = await browser.newContext({ baseURL }), page = await context.newPage();
    const report = { format: 'landscape-d4-multiscale-upload-probe', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(), errors: [], warnings: [] };
    collectErrors(page, report);
    try {
        await routeProbe(page);
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async () => {
            const { createLandscapeMaterialProbe } = await import('/tests/headless/e2e/fixtures/landscape_material_probe.js');
            const { LandscapeMaterialPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaterialPages.js');
            const { LandscapeResidencyBudget } = await import('/src/app/landscape/LandscapeResidencyBudget.js');
            const { LandscapeAppearanceBudget, landscapeTextureBytes } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js');
            const { createLandscapeAppearanceUniforms, LANDSCAPE_MASK_SLOTS } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
            const probe = createLandscapeMaterialProbe(), shared = new LandscapeResidencyBudget(), budget = new LandscapeAppearanceBudget(shared, 'multiscale-probe');
            const page = (resolution, name) => ({ url: `pages/${name}-${resolution}.rgba8`, width: resolution, height: resolution, sha256: `${name}${resolution}`.padEnd(64, '0') });
            const schemaTier = resolution => ({ id: String(resolution), resolution, channels: { baseColor: page(resolution, 'base'), normal: page(resolution, 'normal'), orm: page(resolution, 'orm') } });
            const appearance = { materials: [{ soilId: 'sand', materialId: 'pbr.aerial_beach_01', tileMeters: 30, roughnessInputRange: { min: 0, max: 1 }, tiers: [32, 128, 512].map(schemaTier) }] };
            const tier = (resolution, source) => ({ id: String(resolution), resolution, pages: [...['baseColor', 'normal', 'orm'].map(role => ({ role, source, page: page(resolution, role) })), { role: 'micro', source: 'multiscale', page: page(resolution, 'micro') }] });
            const multiscale = { status: 'active', reason: null, active: true, maxResolution: 1024,
                materials: [{ soilId: 'sand', materialId: 'pbr.aerial_beach_01', maps: 4, micro: { materialId: 'pbr.micro', tileMeters: 1.5, luminanceRange: .4, encoding: 'micro-normal-height-luminance-v1' },
                    tiers: [tier(32, 'appearance'), tier(128, 'appearance'), tier(512, 'appearance'), tier(1024, 'multiscale')] }] };
            const requests = [];
            let failNext = false;
            const pool = { request: async ({ resolution, pages }) => {
                requests.push({ resolution, roles: pages.map(value => value.role), sources: pages.map(value => value.source) });
                if (failNext && pages.some(value => value.source === 'multiscale')) { failNext = false; throw new Error('synthetic multiscale page hash mismatch'); }
                return { baseColor: new Uint8Array(resolution * resolution * 4).fill(120), surface: new Uint8Array(resolution * resolution * 4 * (pages.length - 1)).fill(128) };
            } };
            const uniforms = createLandscapeAppearanceUniforms(LANDSCAPE_MASK_SLOTS);
            const pages = new LandscapeMaterialPages({ appearance, multiscale, budget, pool, renderer: probe.renderer, uniforms, prefix: 'multiscale-probe' });
            const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); };
            const allowance = 8 * 1024 * 1024, frames = [];
            const run = async (count, dt = .05) => { for (let i = 0; i < count; i++) { await settle(); const bytes = pages.update(dt, allowance); const snapshot = pages.snapshot(); frames.push({ bytes, pending: snapshot.pendingTier, transition: snapshot.transition, bound: snapshot.materials[0].resolution }); } };
            const result = { mapBytes1024: landscapeTextureBytes(1024) };
            try {
                await pages.initialize();
                const sand = pages.materials[0];
                pages.interest(new Map([[0, new Set(['mask'])]]), { sand: '32' });
                await run(3);
                result.coarse = { bound: sand.current?.resolution, maps: sand.current?.maps, micro: uniforms.uSoilTiling.value[0].y, surfaceLayers: uniforms.uSoilSurface0.value?.image.depth };
                pages.interest(new Map([[0, new Set(['mask'])]]), { sand: '1024' });
                frames.length = 0;
                await settle();
                frames.push({ bytes: pages.update(.05, allowance), pending: pages.snapshot().pendingTier, transition: null, bound: sand.current?.resolution });
                result.decodeReservation = budget.snapshot();
                await run(12);
                result.upgradeFrames = frames.map(frame => ({ ...frame }));
                result.after1024 = { bound: sand.current?.resolution, maps: sand.current?.maps, micro: [...uniforms.uSoilTiling.value[0].toArray()], heightStrength: uniforms.uSoilState.value[0].z, budget: budget.snapshot(), uploads: pages.snapshot().uploads };
                // coarsening to 512 loads 512 and blends directly from 1024
                frames.length = 0;
                pages.interest(new Map([[0, new Set(['mask'])]]), { sand: '512' });
                await run(14);
                result.downFrames = frames.map(frame => ({ ...frame }));
                result.after512 = { bound: sand.current?.resolution, records: [...pages.records.values()].map(record => record.resolution).sort((a, b) => a - b), budget: budget.snapshot() };
                // a failing companion page returns the material to its schema-1 tiers explicitly
                failNext = true;
                pages.interest(new Map([[0, new Set(['mask'])]]), { sand: '1024' });
                await run(6);
                result.failure = { failures: pages.snapshot().multiscaleFailures, tiers: sand.tiers.map(value => value.resolution), maps: sand.maps, micro: uniforms.uSoilTiling.value[0].y, bound: sand.current?.resolution };
                result.requests = requests;
            } finally { pages.dispose(); budget.dispose(); probe.dispose(); }
            result.disposed = shared.snapshot();
            return result;
        });
        Object.assign(report, result);
        expect(result.coarse).toEqual({ bound: 32, maps: 4, micro: 1.5, surfaceLayers: 3 });
        expect(result.decodeReservation.cpuBytes).toBeGreaterThanOrEqual(2 * 1024 * 1024 * 16);
        const uploads = result.upgradeFrames.map(frame => frame.bytes).filter(bytes => bytes > 0);
        expect(uploads, 'one 1024 map per frame under the 8 MiB allowance').toEqual([result.mapBytes1024, result.mapBytes1024, result.mapBytes1024, result.mapBytes1024]);
        expect(result.upgradeFrames.every(frame => frame.bytes <= 8 * 1024 * 1024)).toBe(true);
        const firstTransition = result.upgradeFrames.findIndex(frame => frame.transition);
        const lastUpload = result.upgradeFrames.findLastIndex(frame => frame.bytes > 0);
        expect(firstTransition, 'the transition starts only after the last map').toBeGreaterThanOrEqual(lastUpload);
        expect(result.upgradeFrames.filter(frame => frame.pending?.status === 'uploading').every(frame => frame.bound === 32), 'the coarse tier stays bound while maps upload').toBe(true);
        expect(result.after1024.bound).toBe(1024); expect(result.after1024.maps).toBe(4);
        expect(result.after1024.micro).toEqual([30, 1.5, 1, .4]); expect(result.after1024.heightStrength).toBeCloseTo(.3, 6);
        expect(result.after1024.uploads.splitTiers).toBeGreaterThanOrEqual(1); expect(result.after1024.uploads.maxFramesPerTier).toBe(4);
        expect(result.after1024.budget.gpuBytes).toBe(landscapeTextureBytesNode(32) * 4 + landscapeTextureBytesNode(1024) * 4);
        expect(result.downFrames.some(frame => frame.transition?.from === 1024 && frame.transition?.to === 512), 'coarsening blends 1024 directly to 512').toBe(true);
        expect(result.downFrames.some(frame => frame.bound === 32), 'coarsening never falls back to the 32 fallback').toBe(false);
        expect(result.after512.bound).toBe(512); expect(result.after512.records).toEqual([32, 512]);
        expect(result.failure.failures.length).toBe(1); expect(result.failure.failures[0].message).toMatch(/hash mismatch/);
        expect(result.failure.tiers).toEqual([32, 128, 512]); expect(result.failure.maps).toBe(3); expect(result.failure.micro).toBe(0);
        expect(result.requests.find(request => request.resolution === 1024).roles).toEqual(['baseColor', 'normal', 'orm', 'micro']);
        expect(result.disposed.cpuBytes).toBe(0); expect(result.disposed.gpuBytes).toBe(0); expect(result.disposed.leaseCount).toBe(0);
        expect(report.errors).toEqual([]);
        report.complete = true;
    } finally { await context.close(); await mkdir(artifacts, { recursive: true }); await writeFile(path.join(artifacts, 'd4-multiscale-upload-report.json'), JSON.stringify(report, null, 2)); }
});
