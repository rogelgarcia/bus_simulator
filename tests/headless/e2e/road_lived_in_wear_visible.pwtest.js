// Headless browser test: lived-in road wear features should be visible and tunable.
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

test('Roads: lived-in wear features toggle visible (pixel diff)', async ({ page }, testInfo) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('tests/headless/harness/index.html?ibl=0&bloom=0&sunBloom=0&grade=off&aa=off');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    const canvas = page.locator('#harness-canvas');
    await expect(canvas).toBeVisible();

    const scenarioId = 'road_lived_in_wear_toggle';
    const seed = 'lived-in-wear-visible';

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
            normalStrength: 0.35
        },
        markings: { enabled: false, colorStrength: 0.0, roughnessStrength: 0.0, debug: false },
        livedIn: {
            edgeDirt: { enabled: false, strength: 0.0, width: 0.65, scale: 0.55 },
            cracks: { enabled: false, strength: 0.0, scale: 3.2 },
            patches: { enabled: false, strength: 0.0, scale: 4.0, coverage: 0.84 },
            tireWear: { enabled: false, strength: 0.0, scale: 1.6 }
        },
        color: { value: 0.0, warmCool: 0.0, saturation: 0.0 }
    };

    const generatorConfig = { road: { visuals: { asphalt: { enabled: true } } } };

    const loadAndCapture = async (name, { asphaltNoise, camera }) => {
        await page.evaluate(({ scenarioId, seed, asphaltNoise, generatorConfig, camera }) => window.__testHooks.loadScenario(scenarioId, {
            seed,
            asphaltNoise,
            generatorConfig,
            camera
        }), { scenarioId, seed, asphaltNoise, generatorConfig, camera });
        await page.evaluate(() => window.__testHooks.step(40, { render: true }));
        await canvas.screenshot({ path: testInfo.outputPath(name) });
    };

    await loadAndCapture('baseline_macro.png', { asphaltNoise: baseAsphaltNoise, camera: 'macro' });
    await loadAndCapture('baseline_edge.png', { asphaltNoise: baseAsphaltNoise, camera: 'edge' });

    await loadAndCapture('cracks_on.png', {
        asphaltNoise: {
            ...baseAsphaltNoise,
            livedIn: {
                ...baseAsphaltNoise.livedIn,
                cracks: { enabled: true, strength: 2.0, scale: 3.2 }
            }
        },
        camera: 'macro'
    });
    await loadAndCapture('patches_on.png', {
        asphaltNoise: {
            ...baseAsphaltNoise,
            livedIn: {
                ...baseAsphaltNoise.livedIn,
                patches: { enabled: true, strength: 2.0, scale: 4.0, coverage: 0.84 }
            }
        },
        camera: 'macro'
    });
    await loadAndCapture('tire_wear_on.png', {
        asphaltNoise: {
            ...baseAsphaltNoise,
            livedIn: {
                ...baseAsphaltNoise.livedIn,
                tireWear: { enabled: true, strength: 2.0, scale: 1.6 }
            }
        },
        camera: 'macro'
    });
    await loadAndCapture('edge_dirt_on.png', {
        asphaltNoise: {
            ...baseAsphaltNoise,
            livedIn: {
                ...baseAsphaltNoise.livedIn,
                edgeDirt: { enabled: true, strength: 2.0, width: 1.0, scale: 0.55 }
            }
        },
        camera: 'edge'
    });

    const result = await page.evaluate(async () => {
        const scenarioId = 'road_lived_in_wear_toggle';
        const seed = 'lived-in-wear-visible';

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
                normalStrength: 0.35
            },
            markings: { enabled: false, colorStrength: 0.0, roughnessStrength: 0.0, debug: false },
            livedIn: {
                edgeDirt: { enabled: false, strength: 0.0, width: 0.65, scale: 0.55 },
                cracks: { enabled: false, strength: 0.0, scale: 3.2 },
                patches: { enabled: false, strength: 0.0, scale: 4.0, coverage: 0.84 },
                tireWear: { enabled: false, strength: 0.0, scale: 1.6 }
            },
            color: { value: 0.0, warmCool: 0.0, saturation: 0.0 }
        };
        const generatorConfig = { road: { visuals: { asphalt: { enabled: true } } } };

        const render = async ({ asphaltNoise, camera }) => {
            await window.__testHooks.loadScenario(scenarioId, { seed, asphaltNoise, generatorConfig, camera });
            window.__testHooks.step(40, { render: true });
            return grab();
        };

        const baselineMacro = await render({ asphaltNoise: baseAsphaltNoise, camera: 'macro' });
        const baselineEdge = await render({ asphaltNoise: baseAsphaltNoise, camera: 'edge' });

        const cracks = await render({
            asphaltNoise: { ...baseAsphaltNoise, livedIn: { ...baseAsphaltNoise.livedIn, cracks: { enabled: true, strength: 2.0, scale: 3.2 } } },
            camera: 'macro'
        });
        const patches = await render({
            asphaltNoise: { ...baseAsphaltNoise, livedIn: { ...baseAsphaltNoise.livedIn, patches: { enabled: true, strength: 2.0, scale: 4.0, coverage: 0.84 } } },
            camera: 'macro'
        });
        const tireWear = await render({
            asphaltNoise: { ...baseAsphaltNoise, livedIn: { ...baseAsphaltNoise.livedIn, tireWear: { enabled: true, strength: 2.0, scale: 1.6 } } },
            camera: 'macro'
        });
        const edgeDirt = await render({
            asphaltNoise: { ...baseAsphaltNoise, livedIn: { ...baseAsphaltNoise.livedIn, edgeDirt: { enabled: true, strength: 2.0, width: 1.0, scale: 0.55 } } },
            camera: 'edge'
        });

        const stats = {
            asphalt: window.__testHooks.getSceneObjectStatsByName('Asphalt'),
            edgeWear: window.__testHooks.getSceneObjectStatsByName('AsphaltEdgeWear')
        };

        return {
            roi,
            stats,
            changed: {
                cracks: countChangedPixels(baselineMacro, cracks),
                patches: countChangedPixels(baselineMacro, patches),
                tireWear: countChangedPixels(baselineMacro, tireWear),
                edgeDirt: countChangedPixels(baselineEdge, edgeDirt)
            }
        };
    });

    expect(result.stats?.asphalt?.count ?? 0).toBeGreaterThan(0);
    expect(result.stats?.edgeWear?.count ?? 0).toBeGreaterThan(0);

    expect(result.changed.cracks).toBeGreaterThan(500);
    expect(result.changed.patches).toBeGreaterThan(500);
    expect(result.changed.tireWear).toBeGreaterThan(500);
    expect(result.changed.edgeDirt).toBeGreaterThan(250);

    expect(await getErrors()).toEqual([]);
});

