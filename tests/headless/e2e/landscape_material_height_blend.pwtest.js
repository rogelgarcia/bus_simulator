// Measures relative-relief dominance and derivative stability through the unchanged production landscape shader.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { landscapeMaterialHeightDetail, sampleLandscapeMaterialBlend } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';

const artifacts = path.resolve('tests/artifacts/screens/landscape/ai577/d1a/height-probe');
const two = [0, 0, .5, .5, 0, 0], highThird = [255, 255, 0, 255, 255, 255];
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
        transition: { soil: 3, progress: step / 10, resolution: 512, height: 255 } }))
];

function expectedWeights(value) {
    if (value.enabled === false) return value.weights;
    const heights = value.heights ?? Array(6).fill(128), flags = value.flags ?? Array(6).fill(1);
    const sampled = heights.map((height, soil) => !flags[soil] ? .5 : value.transition?.soil === soil
        ? (height * (1 - value.transition.progress) + value.transition.height * value.transition.progress) / 255 : height / 255);
    const details = flags.map((enabled, soil) => landscapeMaterialHeightDetail({ periodMeters: value.period ?? 4,
        resolution: value.resolution ?? 512, metersPerPixel: (value.span ?? 4) / 512, enabled: !!enabled,
        targetResolution: value.transition?.soil === soil ? value.transition.resolution : value.resolution ?? 512,
        transition: value.transition?.soil === soil ? value.transition.progress : 0 }));
    return sampleLandscapeMaterialBlend({ weights: value.weights, heights: sampled, details }).weights;
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
        const result = await page.evaluate(async cases => {
            const { createLandscapeMaterialProbe } = await import('/tests/headless/e2e/fixtures/landscape_material_probe.js');
            const probe = createLandscapeMaterialProbe(), measurements = [];
            try {
                for (const value of cases) {
                    probe.setCoverage(value.weights); probe.setSynthetic(value);
                    measurements.push({ id: value.id, ...probe.measureWeights({ span: value.span ?? 4 }) });
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
                return { renderer: probe.rendererName, measurements, snapshots, boundary: { changedPixels, outsideDifferenceBytes, minimumRgbSum,
                    maximumShiftDifferenceBytes, p99ShiftDifferenceBytes: shiftedDifferences[Math.floor(shiftedDifferences.length * .99)], comparedPixels: shiftedDifferences.length } };
            } finally { probe.dispose(); }
        }, cases);
        const { snapshots, ...measurements } = result; Object.assign(report, measurements);
        for (const snapshot of snapshots) await writeFile(path.join(artifacts, `${snapshot.id}.png`), Buffer.from(snapshot.dataUrl.split(',')[1], 'base64'));
        for (const value of cases) {
            const measured = report.measurements.find(sample => sample.id === value.id), expected = expectedWeights(value);
            measured.input = value; measured.expected = expected;
            measured.maximumWeightError = Math.max(...expected.map((weight, soil) => Math.abs(weight - measured.weights[soil])));
            expect(measured.denominator).toBeGreaterThan(100);
            expect(measured.maximumWeightError, `${value.id} CPU/rendered weight parity`).toBeLessThanOrEqual(.025);
            expect(Math.abs(measured.weights.reduce((sum, weight) => sum + weight, 0) - 1), `${value.id} normalized coverage`).toBeLessThanOrEqual(.035);
            value.weights.forEach((weight, soil) => { if (!weight) expect(measured.weights[soil], `${value.id} absent soil ${soil}`).toBe(0); });
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
            const { createLandscapeAppearanceUniforms } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
            const shared = new LandscapeResidencyBudget(), budget = new LandscapeAppearanceBudget(shared, 'duplicate-binding');
            const tier = { resolution: 32, channels: { baseColor: { sha256: 'a'.repeat(64) }, normal: { sha256: 'b'.repeat(64) }, orm: { sha256: 'c'.repeat(64) } } };
            const appearance = { materials: ['seabed', 'sand'].map(soilId => ({ soilId, materialId: 'pbr.aerial_beach_01', tiers: [tier] })) };
            const pool = { request: async () => ({ baseColor: new Uint8Array(32 * 32 * 4), surface: new Uint8Array(32 * 32 * 8) }) };
            const renderer = { capabilities: { getMaxAnisotropy: () => 4 }, initTexture() {} };
            const pages = new LandscapeMaterialPages({ appearance, budget, pool, renderer, uniforms: createLandscapeAppearanceUniforms(), prefix: 'duplicate-binding' });
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
