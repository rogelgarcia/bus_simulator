// Headless coverage for sun-bloom filtering outcomes and helper-pass work reduction.
import test, { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const COMMON_QUERY = [
    'ibl=0',
    'bloom=0',
    'grade=off',
    'ao=off',
    'shadows=off',
    'aa=off',
    'sunBloom=1',
    'sunBloomMode=occlusion',
    'sunBloomRays=0',
    'sunBloomStrength=1.4',
    'sunBloomRadius=0.55',
    'sunBloomDiscIntensity=70'
].join('&');

async function boot(page, { filtering = true } = {}) {
    await page.goto(`/tests/headless/harness/index.html?${COMMON_QUERY}&sunBloomFilter=${filtering ? 1 : 0}`);
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    await page.evaluate(async () => {
        window.__testHooks.setViewport(1280, 720);
        window.__testHooks.setFixedDt(1 / 60);
        await window.__testHooks.loadScenario('sun_bloom_filtering_outcomes', { seed: 'sun-bloom-filter-523' });
        window.__testHooks.step(4, { render: true });
    });
}

async function setVisible(page, name, visible) {
    return page.evaluate(({ name, visible }) => window.__testHooks.setSceneObjectVisibleByName(name, visible), { name, visible });
}

async function renderAndRead(page, frames = 2) {
    return page.evaluate((frames) => {
        window.__testHooks.step(frames, { render: true });
        return window.__testHooks.getSunBloomDebugInfo();
    }, frames);
}

async function readLumaAtScenarioPoints(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('harness-canvas');
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        const points = window.__testHooks.getMetrics()?.scenario?.samplePoints ?? null;
        if (!canvas || !gl || !points) throw new Error('Missing canvas, WebGL context, or sample points');
        const out = {};
        for (const [id, point] of Object.entries(points)) {
            if (point?.onScreen !== true) throw new Error(`Sample point ${id} is offscreen`);
            const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.u * canvas.width)));
            const y = Math.max(0, Math.min(canvas.height - 1, canvas.height - 1 - Math.floor(point.v * canvas.height)));
            const pixel = new Uint8Array(4);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            out[id] = (0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]) / 255;
        }
        return out;
    });
}

async function measureCurrentScenario(page, { warmupFrames = 20, measureFrames = 80 } = {}) {
    return page.evaluate(({ warmupFrames, measureFrames }) => {
        const gl = window.__testHooks.getEngine()?.renderer?.getContext?.() ?? null;
        window.__testHooks.step(warmupFrames, { render: true });
        const samples = [];
        for (let frame = 0; frame < measureFrames; frame += 1) {
            const start = performance.now();
            window.__testHooks.step(1, { render: true });
            gl?.finish?.();
            const elapsed = performance.now() - start;
            const debug = window.__testHooks.getSunBloomDebugInfo()?.occlusionFiltering ?? null;
            const render = window.__testHooks.getMetrics()?.renderer?.render ?? null;
            samples.push({
                frameMs: elapsed,
                calls: Number(render?.calls) || 0,
                triangles: Number(render?.triangles) || 0,
                passCalls: Number(debug?.passCalls) || 0,
                passTriangles: Number(debug?.passTriangles) || 0,
                candidateTestMs: Number(debug?.candidateTestMs) || 0,
                outcome: debug?.outcome ?? null
            });
        }
        const summarize = (field) => {
            const values = samples.map((sample) => sample[field]).sort((a, b) => a - b);
            const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
            return {
                average,
                p95: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0,
                min: values[0] ?? 0,
                max: values[values.length - 1] ?? 0
            };
        };
        return {
            warmupFrames,
            measureFrames,
            frameMs: summarize('frameMs'),
            calls: summarize('calls'),
            triangles: summarize('triangles'),
            passCalls: summarize('passCalls'),
            passTriangles: summarize('passTriangles'),
            candidateTestMs: summarize('candidateTestMs'),
            outcomes: samples.reduce((counts, sample) => {
                counts[sample.outcome] = (counts[sample.outcome] || 0) + 1;
                return counts;
            }, {})
        };
    }, { warmupFrames, measureFrames });
}

test('Sun Bloom filtering: distinguishes irrelevant, clear, and candidate-occlusion frames', async ({ page }) => {
    await boot(page);

    const clear = await renderAndRead(page);
    expect(clear?.occlusionFiltering?.outcome).toBe('clear');
    expect(clear?.occlusionFiltering?.rendered).toBe(true);
    expect(clear?.occlusionFiltering?.retainedOccluderCount).toBe(0);
    expect(clear?.occlusionFiltering?.scannedOccluderCount).toBeGreaterThanOrEqual(16);

    expect(await setVisible(page, 'sun_filter_center_occluder', true)).toBe(1);
    const occluded = await renderAndRead(page);
    expect(occluded?.occlusionFiltering?.outcome).toBe('candidate_occlusion');
    expect(occluded?.occlusionFiltering?.retainedOccluderCount).toBeGreaterThanOrEqual(1);
    expect(occluded?.occlusionFiltering?.retainedOccluderCount).toBeLessThan(occluded?.occlusionFiltering?.scannedOccluderCount);

    expect(await setVisible(page, 'sun_filter_center_occluder', false)).toBe(1);
    expect(await setVisible(page, 'sun_filter_large_occluder', true)).toBe(1);
    const large = await renderAndRead(page);
    expect(large?.occlusionFiltering?.outcome).toBe('candidate_occlusion');
    expect(large?.occlusionFiltering?.retainedOccluderCount).toBeGreaterThanOrEqual(1);

    const taa = await page.evaluate(() => {
        const engine = window.__testHooks.getEngine();
        const current = engine.antiAliasingSettings ?? {};
        engine.setAntiAliasingSettings({
            ...current,
            mode: 'taa',
            taa: { ...(current.taa ?? {}), jitter: 1 }
        });
        window.__testHooks.step(8, { render: true });
        return window.__testHooks.getSunBloomDebugInfo();
    });
    expect(taa?.occlusionFiltering?.outcome).toBe('candidate_occlusion');

    const irrelevant = await page.evaluate(() => {
        const engine = window.__testHooks.getEngine();
        engine.camera.lookAt(0, 0, 20);
        window.__testHooks.step(3, { render: true });
        return window.__testHooks.getSunBloomDebugInfo();
    });
    expect(irrelevant?.occlusionFiltering?.outcome).toBe('irrelevant');
    expect(irrelevant?.occlusionFiltering?.rendered).toBe(false);
    expect(irrelevant?.occlusionFiltering?.passCalls).toBe(0);
    expect(irrelevant?.occlusionFiltering?.passTriangles).toBe(0);
});

test('Sun Bloom filtering: reduces helper-pass work against the legacy full-scene path', async ({ page }) => {
    await boot(page, { filtering: true });
    expect(await setVisible(page, 'sun_filter_center_occluder', true)).toBe(1);
    const optimized = await renderAndRead(page, 4);

    await boot(page, { filtering: false });
    expect(await setVisible(page, 'sun_filter_center_occluder', true)).toBe(1);
    const legacy = await renderAndRead(page, 4);

    expect(optimized?.occlusionFiltering?.outcome).toBe('candidate_occlusion');
    expect(legacy?.occlusionFiltering?.outcome).toBe('legacy_full_scene');
    expect(optimized?.occlusionFiltering?.passCalls).toBeLessThan(legacy?.occlusionFiltering?.passCalls);
    expect(optimized?.occlusionFiltering?.passTriangles).toBeLessThan(legacy?.occlusionFiltering?.passTriangles);
});

test('Sun Bloom filtering: preserves alpha-cutout pixels against the legacy path', async ({ page }) => {
    await boot(page, { filtering: true });
    expect(await setVisible(page, 'sun_filter_cutout_occluder', true)).toBe(1);
    await page.waitForTimeout(75);
    const optimizedDebug = await renderAndRead(page, 8);
    const optimizedLuma = await readLumaAtScenarioPoints(page);
    const optimizedImage = await page.locator('#harness-canvas').screenshot();

    await boot(page, { filtering: false });
    expect(await setVisible(page, 'sun_filter_cutout_occluder', true)).toBe(1);
    await page.waitForTimeout(75);
    const legacyDebug = await renderAndRead(page, 8);
    const legacyLuma = await readLumaAtScenarioPoints(page);
    const legacyImage = await page.locator('#harness-canvas').screenshot();

    expect(optimizedDebug?.occlusionFiltering?.outcome).toBe('candidate_occlusion');
    expect(legacyDebug?.occlusionFiltering?.outcome).toBe('legacy_full_scene');
    expect(Math.abs(optimizedLuma.opaque - legacyLuma.opaque)).toBeLessThan(0.01);
    expect(Math.abs(optimizedLuma.transparent - legacyLuma.transparent)).toBeLessThan(0.01);
    expect(optimizedImage.equals(legacyImage)).toBe(true);
});

test('Sun Bloom filtering: clear and offscreen frames remain pixel-identical to legacy', async ({ page }) => {
    await boot(page, { filtering: true });
    await page.waitForTimeout(75);
    const optimizedClearDebug = await renderAndRead(page, 8);
    const optimizedClearImage = await page.locator('#harness-canvas').screenshot();

    await boot(page, { filtering: false });
    await page.waitForTimeout(75);
    const legacyClearDebug = await renderAndRead(page, 8);
    const legacyClearImage = await page.locator('#harness-canvas').screenshot();

    expect(optimizedClearDebug?.occlusionFiltering?.outcome).toBe('clear');
    expect(legacyClearDebug?.occlusionFiltering?.outcome).toBe('legacy_full_scene');
    expect(optimizedClearImage.equals(legacyClearImage)).toBe(true);

    await boot(page, { filtering: true });
    const optimizedOffscreenDebug = await page.evaluate(() => {
        const engine = window.__testHooks.getEngine();
        engine.camera.lookAt(0, 0, 20);
        window.__testHooks.step(8, { render: true });
        return window.__testHooks.getSunBloomDebugInfo();
    });
    const optimizedOffscreenImage = await page.locator('#harness-canvas').screenshot();

    await boot(page, { filtering: false });
    const legacyOffscreenDebug = await page.evaluate(() => {
        const engine = window.__testHooks.getEngine();
        engine.camera.lookAt(0, 0, 20);
        window.__testHooks.step(8, { render: true });
        return window.__testHooks.getSunBloomDebugInfo();
    });
    const legacyOffscreenImage = await page.locator('#harness-canvas').screenshot();

    expect(optimizedOffscreenDebug?.occlusionFiltering?.outcome).toBe('irrelevant');
    expect(optimizedOffscreenDebug?.occlusionFiltering?.rendered).toBe(false);
    expect(legacyOffscreenDebug?.occlusionFiltering?.outcome).toBe('legacy_full_scene');
    expect(optimizedOffscreenImage.equals(legacyOffscreenImage)).toBe(true);
});

test('Sun Bloom filtering: candidate path benchmark bounds worst-case overhead', async ({ page }, testInfo) => {
    await boot(page, { filtering: true });
    expect(await setVisible(page, 'sun_filter_center_occluder', true)).toBe(1);
    const optimized = await measureCurrentScenario(page);

    await boot(page, { filtering: false });
    expect(await setVisible(page, 'sun_filter_center_occluder', true)).toBe(1);
    const legacy = await measureCurrentScenario(page);

    const report = { legacy, optimized };
    const reportPath = testInfo.outputPath('sun-bloom-filtering-candidate-benchmark.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await testInfo.attach('sun-bloom-filtering-candidate-benchmark', {
        path: reportPath,
        contentType: 'application/json'
    });

    expect(optimized.outcomes.candidate_occlusion).toBe(optimized.measureFrames);
    expect(legacy.outcomes.legacy_full_scene).toBe(legacy.measureFrames);
    expect(optimized.passCalls.average).toBeLessThan(legacy.passCalls.average);
    expect(optimized.passTriangles.average).toBeLessThan(legacy.passTriangles.average);
    expect(optimized.candidateTestMs.average).toBeLessThan(0.2);
    expect(optimized.frameMs.average).toBeLessThanOrEqual(legacy.frameMs.average + 0.2);
});
