// Headless browser tests: window mesh interior atlas + parallax regression guard.
import test, { expect } from '@playwright/test';

async function attachFailFastConsole({ page }) {
    const issues = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
            const msg = e?.reason?.message ?? String(e?.reason ?? 'unhandledrejection');
            window.__e2eErrors.push({ kind: 'unhandledrejection', message: msg });
        });
    });
    page.on('pageerror', (err) => {
        issues.push({ kind: 'pageerror', message: err?.message ?? String(err) });
    });
    page.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;

        if (type === 'error') {
            issues.push({ kind: 'console.error', message: text });
            return;
        }

        if (type === 'warning') {
            const needle = [
                'Texture marked for update but no image data found',
                'GL_INVALID',
                'glTexSubImage2D'
            ];
            if (needle.some((s) => text.includes(s))) issues.push({ kind: 'console.warn', message: text });
        }
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document' && type !== 'image') return;
        issues.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document' && type !== 'image') return;
        const status = res.status();
        if (status < 400) return;
        issues.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...issues, ...fromPage];
    };
}

test('Window mesh: interior atlas loads and parallax changes pixels', async ({ page }) => {
    const getIssues = await attachFailFastConsole({ page });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    const result = await page.evaluate(async () => {
        const viewport = { width: 960, height: 540 };
        window.__testHooks.setViewport(viewport.width, viewport.height);
        window.__testHooks.setFixedDt(1 / 60);

        const canvas = document.getElementById('harness-canvas');
        if (!canvas) throw new Error('Missing #harness-canvas');

        const w = Math.max(1, canvas.width | 0);
        const h = Math.max(1, canvas.height | 0);
        const roi = {
            x: Math.max(0, Math.min(w - 1, Math.floor(w * 0.5 - w * 0.05))),
            y: Math.max(0, Math.min(h - 1, Math.floor(h * 0.5 - h * 0.12))),
            w: Math.max(1, Math.floor(w * 0.10)),
            h: Math.max(1, Math.floor(h * 0.24))
        };

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Missing offscreen 2D context');

        const grabLuma = () => {
            ctx.drawImage(canvas, 0, 0);
            const data = ctx.getImageData(roi.x, roi.y, roi.w, roi.h).data;
            const out = new Float32Array((data.length / 4) | 0);
            for (let i = 0, p = 0; i + 2 < data.length; i += 4, p += 1) {
                out[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            }
            return out;
        };

        const stats = (arr) => {
            let sum = 0;
            for (let i = 0; i < arr.length; i++) sum += arr[i];
            const mean = arr.length ? sum / arr.length : 0;
            let varSum = 0;
            for (let i = 0; i < arr.length; i++) {
                const d = arr[i] - mean;
                varSum += d * d;
            }
            const std = Math.sqrt(arr.length ? varSum / arr.length : 0);
            return { mean, std };
        };

        const fractionAbove = (arr, threshold) => {
            const t = Number(threshold) || 0;
            let count = 0;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] >= t) count += 1;
            }
            return arr.length ? count / arr.length : 0;
        };

        const meanAbsDiff = (a, b) => {
            const n = Math.min(a.length, b.length);
            if (!n) return 0;
            let sum = 0;
            for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
            return sum / n;
        };

        const waitForAtlas = async ({ timeoutMs = 8000 } = {}) => {
            const t0 = performance.now();
            while (performance.now() - t0 < timeoutMs) {
                const metrics = window.__testHooks.getMetrics();
                const atlas = metrics?.scenario?.atlas ?? null;
                if (atlas && atlas.width === 1024 && atlas.height === 1024 && atlas.tag !== 'CANVAS') return atlas;
                window.__testHooks.step(1, { render: true });
                await new Promise((r) => setTimeout(r, 50));
            }
            return null;
        };

	        const render = async ({
	            parallaxDepthMeters,
	            uvZoom = 1.0,
	            imageAspect = 1.0,
	            parallaxScaleX = 1.0,
	            parallaxScaleY = 1.0,
	            interiorZOffset = 0.0,
	            cameraAmplitudeX = 0.45,
	            cameraAmplitudeY = 0.0
	        }) => {
	            await window.__testHooks.loadScenario('window_mesh_interior_parallax', {
	                seed: 'interior-parallax',
                atlasId: 'window_interior_atlas.residential_4x4',
                parallaxDepthMeters,
	                uvZoom,
	                imageAspect,
	                parallaxScaleX,
	                parallaxScaleY,
	                interiorZOffset,
	                glassOpacity: 0.0,
	                cameraAmplitudeX,
	                cameraAmplitudeY,
	                cameraSpeed: 1.1
            });

            const atlas = await waitForAtlas();
            if (!atlas) throw new Error('Atlas did not load (expected 1024x1024 image).');

            window.__testHooks.step(45, { render: true });
            window.__testHooks.renderFrame();
	            const metrics = window.__testHooks.getMetrics();
	            const luma = grabLuma();
	            return {
	                atlas,
	                cameraX: Number(metrics?.scenario?.camera?.x) || 0,
	                interiorPlaneLocalZ: Number(metrics?.scenario?.objects?.interiorPlaneLocalZ) || 0,
	                uvBounds: metrics?.scenario?.uvBounds ?? null,
	                luma,
	                stats: stats(luma),
	                whiteFrac: fractionAbove(luma, 245)
            };
        };

        const noParallax = await render({ parallaxDepthMeters: 0.0, uvZoom: 1.0, imageAspect: 1.0 });
        const parallax = await render({ parallaxDepthMeters: 12.0, uvZoom: 1.0, imageAspect: 1.0 });
        const deepParallax = await render({ parallaxDepthMeters: 25.0, uvZoom: 1.0, imageAspect: 1.0 });
        const zoomed = await render({ parallaxDepthMeters: 0.0, uvZoom: 2.0, imageAspect: 1.0 });
        const aspectWide = await render({ parallaxDepthMeters: 0.0, uvZoom: 1.0, imageAspect: 1.6 });
	        const yParallaxSmall = await render({
	            parallaxDepthMeters: 12.0,
	            parallaxScaleX: 0.0,
	            parallaxScaleY: 0.0,
	            cameraAmplitudeX: 0.0,
	            cameraAmplitudeY: 0.45
	        });
	        const yParallaxLarge = await render({
	            parallaxDepthMeters: 12.0,
	            parallaxScaleX: 0.0,
	            parallaxScaleY: 2.0,
	            cameraAmplitudeX: 0.0,
	            cameraAmplitudeY: 0.45
	        });
	        const planeNear = await render({ parallaxDepthMeters: 12.0, interiorZOffset: 0.5 });
	        const planeFar = await render({ parallaxDepthMeters: 12.0, interiorZOffset: -0.5 });

	        return {
	            viewport,
	            roi,
            noParallax: {
                atlas: noParallax.atlas,
                cameraX: noParallax.cameraX,
                stats: noParallax.stats,
                whiteFrac: noParallax.whiteFrac,
                uvBounds: noParallax.uvBounds
            },
            parallax: {
                atlas: parallax.atlas,
                cameraX: parallax.cameraX,
                stats: parallax.stats,
                whiteFrac: parallax.whiteFrac,
                uvBounds: parallax.uvBounds
            },
            deepParallax: {
                atlas: deepParallax.atlas,
                cameraX: deepParallax.cameraX,
                stats: deepParallax.stats,
                whiteFrac: deepParallax.whiteFrac,
                uvBounds: deepParallax.uvBounds
            },
            zoomed: {
                atlas: zoomed.atlas,
                cameraX: zoomed.cameraX,
                stats: zoomed.stats,
                whiteFrac: zoomed.whiteFrac,
                uvBounds: zoomed.uvBounds
            },
            aspectWide: {
                atlas: aspectWide.atlas,
                cameraX: aspectWide.cameraX,
                stats: aspectWide.stats,
                whiteFrac: aspectWide.whiteFrac,
                uvBounds: aspectWide.uvBounds
            },
            yParallaxSmall: {
                atlas: yParallaxSmall.atlas,
                cameraX: yParallaxSmall.cameraX,
                stats: yParallaxSmall.stats,
                whiteFrac: yParallaxSmall.whiteFrac,
                uvBounds: yParallaxSmall.uvBounds
            },
	            yParallaxLarge: {
	                atlas: yParallaxLarge.atlas,
	                cameraX: yParallaxLarge.cameraX,
	                interiorPlaneLocalZ: yParallaxLarge.interiorPlaneLocalZ,
	                stats: yParallaxLarge.stats,
	                whiteFrac: yParallaxLarge.whiteFrac,
	                uvBounds: yParallaxLarge.uvBounds
	            },
	            planeNear: {
	                interiorPlaneLocalZ: planeNear.interiorPlaneLocalZ
	            },
	            planeFar: {
	                interiorPlaneLocalZ: planeFar.interiorPlaneLocalZ
	            },
	            diff: {
	                meanAbsLuma: meanAbsDiff(noParallax.luma, parallax.luma),
	                meanAbsLumaDeep: meanAbsDiff(parallax.luma, deepParallax.luma),
	                meanAbsLumaZoom: meanAbsDiff(noParallax.luma, zoomed.luma),
	                meanAbsLumaAspect: meanAbsDiff(noParallax.luma, aspectWide.luma),
	                meanAbsLumaParallaxYScale: meanAbsDiff(yParallaxSmall.luma, yParallaxLarge.luma),
	                interiorPlaneZSpan: Math.abs(planeNear.interiorPlaneLocalZ - planeFar.interiorPlaneLocalZ)
	            }
	        };
	    });

    expect(result.noParallax.atlas.width).toBe(1024);
    expect(result.noParallax.atlas.height).toBe(1024);
    expect(result.noParallax.atlas.tag).not.toBe('CANVAS');
    expect(result.parallax.atlas.width).toBe(1024);
    expect(result.parallax.atlas.height).toBe(1024);
    expect(result.parallax.atlas.tag).not.toBe('CANVAS');
    expect(result.noParallax.uvBounds).not.toBeNull();
    expect(result.noParallax.uvBounds.maxU - result.noParallax.uvBounds.minU).toBeGreaterThan(0.98);
    expect(result.noParallax.uvBounds.maxV - result.noParallax.uvBounds.minV).toBeGreaterThan(0.98);
    expect(result.noParallax.stats.std).toBeGreaterThan(4);
    expect(result.parallax.stats.std).toBeGreaterThan(4);
    expect(result.deepParallax.stats.std).toBeGreaterThan(4);
    expect(result.zoomed.stats.std).toBeGreaterThan(4);
    expect(result.aspectWide.stats.std).toBeGreaterThan(4);
    expect(result.yParallaxSmall.stats.std).toBeGreaterThan(4);
    expect(result.yParallaxLarge.stats.std).toBeGreaterThan(4);
    expect(result.noParallax.whiteFrac).toBeLessThan(0.35);
    expect(result.parallax.whiteFrac).toBeLessThan(0.35);
    expect(result.deepParallax.whiteFrac).toBeLessThan(0.35);
    expect(result.zoomed.whiteFrac).toBeLessThan(0.35);
    expect(result.aspectWide.whiteFrac).toBeLessThan(0.35);
    expect(result.yParallaxSmall.whiteFrac).toBeLessThan(0.35);
    expect(result.yParallaxLarge.whiteFrac).toBeLessThan(0.35);
    expect(result.diff.meanAbsLuma).toBeGreaterThan(2);
    expect(result.diff.meanAbsLumaDeep).toBeGreaterThan(0.5);
	    expect(result.diff.meanAbsLumaZoom).toBeGreaterThan(2);
	    expect(result.diff.meanAbsLumaAspect).toBeGreaterThan(0.5);
	    expect(result.diff.meanAbsLumaParallaxYScale).toBeGreaterThan(0.5);
	    expect(result.diff.interiorPlaneZSpan).toBeGreaterThan(0.9);
	    expect(result.diff.interiorPlaneZSpan).toBeLessThan(1.1);
	    expect(await getIssues()).toEqual([]);
	});
