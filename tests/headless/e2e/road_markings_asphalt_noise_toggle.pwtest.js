// Headless browser test: asphalt noise should visibly affect road markings when enabled.
import test, { expect } from '@playwright/test';

async function attachFailFastConsole({ page }) {
    const errors = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
            const msg = e?.reason?.message ?? String(e?.reason ?? 'unhandledrejection');
            window.__e2eErrors.push({ kind: 'unhandledrejection', message: msg });
        });
    });
    page.on('pageerror', (err) => {
        errors.push({ kind: 'pageerror', message: err?.message ?? String(err) });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;
        errors.push({ kind: 'console.error', message: text });
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        errors.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        const status = res.status();
        if (status < 400) return;
        errors.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...errors, ...fromPage];
    };
}

test('Roads: markings asphalt noise toggle changes pixels', async ({ page }, testInfo) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('tests/headless/harness/index.html?ibl=0&bloom=0&sunBloom=0&grade=off&aa=off');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    const result = await page.evaluate(async () => {
        const viewport = { width: 960, height: 540 };
        window.__testHooks.setViewport(viewport.width, viewport.height);
        window.__testHooks.setFixedDt(1 / 60);

        const scenarioId = 'road_markings_asphalt_noise_toggle';
        const seed = 'markings-asphalt-noise-toggle';

        const baseAsphaltNoise = {
            coarse: { albedo: false, roughness: false },
            fine: {
                albedo: true,
                roughness: false,
                normal: true,
                scale: 12.0,
                colorStrength: 0.06,
                dirtyStrength: 0.49,
                roughnessStrength: 0.29,
                normalStrength: 0.32
            },
            markings: {
                enabled: false,
                colorStrength: 0.35,
                roughnessStrength: 0.5,
                debug: false
            },
            livedIn: {
                edgeDirt: { enabled: false, strength: 0.0, width: 0.65, scale: 0.55 },
                cracks: { enabled: false, strength: 0.0, scale: 3.2 },
                patches: { enabled: false, strength: 0.0, scale: 4.0, coverage: 0.84 },
                tireWear: { enabled: false, strength: 0.0, scale: 1.6 }
            },
            color: { value: 0.0, warmCool: 0.0, saturation: 0.0 }
        };

        const generatorConfig = { road: { visuals: { markings: { enabled: false } } } };

        const canvas = document.getElementById('harness-canvas');
        if (!canvas) throw new Error('Missing #harness-canvas');

        const w = Math.max(1, canvas.width | 0);
        const h = Math.max(1, canvas.height | 0);
        const roi = {
            x: 0,
            y: Math.max(0, Math.min(h - 1, Math.floor(h * 0.28))),
            w,
            h: Math.max(1, Math.min(h, Math.floor(h * 0.70)))
        };

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Missing offscreen 2D context');

        const grab = () => {
            ctx.drawImage(canvas, 0, 0);
            return ctx.getImageData(roi.x, roi.y, roi.w, roi.h).data;
        };

        const perPixelThreshold = 25;
        const countChangedPixels = (a, b) => {
            let changed = 0;
            const len = Math.min(a?.length ?? 0, b?.length ?? 0);
            for (let i = 0; i + 2 < len; i += 4) {
                const d = Math.abs(a[i] - b[i])
                    + Math.abs(a[i + 1] - b[i + 1])
                    + Math.abs(a[i + 2] - b[i + 2]);
                if (d >= perPixelThreshold) changed += 1;
            }
            return changed;
        };

        await window.__testHooks.loadScenario(scenarioId, {
            seed,
            asphaltNoise: { ...baseAsphaltNoise, markings: { ...baseAsphaltNoise.markings, enabled: false } },
            generatorConfig
        });
        window.__testHooks.step(40, { render: true });
        const before = grab();

        await window.__testHooks.loadScenario(scenarioId, {
            seed,
            asphaltNoise: { ...baseAsphaltNoise, markings: { ...baseAsphaltNoise.markings, enabled: true } },
            generatorConfig
        });
        window.__testHooks.step(40, { render: true });
        const after = grab();

        const changedPixels = countChangedPixels(before, after);
        return { viewport, roi, changedPixels };
    });

    const canvas = page.locator('#harness-canvas');
    await expect(canvas).toBeVisible();

    const seed = 'markings-asphalt-noise-toggle';
    const scenarioId = 'road_markings_asphalt_noise_toggle';

    await page.evaluate(({ scenarioId, seed }) => window.__testHooks.loadScenario(scenarioId, {
        seed,
        asphaltNoise: {
            coarse: { albedo: false, roughness: false },
            fine: {
                albedo: true,
                roughness: false,
                normal: true,
                scale: 12.0,
                colorStrength: 0.06,
                dirtyStrength: 0.49,
                roughnessStrength: 0.29,
                normalStrength: 0.32
            },
            markings: { enabled: false, colorStrength: 0.35, roughnessStrength: 0.5, debug: false },
            livedIn: {
                edgeDirt: { enabled: false, strength: 0.0, width: 0.65, scale: 0.55 },
                cracks: { enabled: false, strength: 0.0, scale: 3.2 },
                patches: { enabled: false, strength: 0.0, scale: 4.0, coverage: 0.84 },
                tireWear: { enabled: false, strength: 0.0, scale: 1.6 }
            },
            color: { value: 0.0, warmCool: 0.0, saturation: 0.0 }
        },
        generatorConfig: { road: { visuals: { markings: { enabled: false } } } }
    }), { scenarioId, seed });
    await page.evaluate(() => window.__testHooks.step(40, { render: true }));
    await canvas.screenshot({ path: testInfo.outputPath(`${scenarioId}__noise_off.png`) });

    await page.evaluate(({ scenarioId, seed }) => window.__testHooks.loadScenario(scenarioId, {
        seed,
        asphaltNoise: {
            coarse: { albedo: false, roughness: false },
            fine: {
                albedo: true,
                roughness: false,
                normal: true,
                scale: 12.0,
                colorStrength: 0.06,
                dirtyStrength: 0.49,
                roughnessStrength: 0.29,
                normalStrength: 0.32
            },
            markings: { enabled: true, colorStrength: 0.35, roughnessStrength: 0.5, debug: false },
            livedIn: {
                edgeDirt: { enabled: false, strength: 0.0, width: 0.65, scale: 0.55 },
                cracks: { enabled: false, strength: 0.0, scale: 3.2 },
                patches: { enabled: false, strength: 0.0, scale: 4.0, coverage: 0.84 },
                tireWear: { enabled: false, strength: 0.0, scale: 1.6 }
            },
            color: { value: 0.0, warmCool: 0.0, saturation: 0.0 }
        },
        generatorConfig: { road: { visuals: { markings: { enabled: false } } } }
    }), { scenarioId, seed });
    await page.evaluate(() => window.__testHooks.step(40, { render: true }));
    await canvas.screenshot({ path: testInfo.outputPath(`${scenarioId}__noise_on.png`) });

    expect(result.changedPixels).toBeGreaterThan(500);
    expect(await getErrors()).toEqual([]);
});

