// Headless browser tests: Terrain Debugger should render terrain in Standard mode (no shader errors).
import test, { expect } from '@playwright/test';

// Terrain Debugger can take a while to warm up (shaders + multiple textures).
test.setTimeout(240_000);

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

async function waitFrames(page, count = 3) {
    await page.evaluate(async (n) => {
        const frames = Math.max(1, Number(n) || 1);
        for (let i = 0; i < frames; i++) {
            await new Promise(requestAnimationFrame);
        }
    }, count);
}

async function readPixels(page, { samplePoints = [] } = {}) {
    return page.evaluate(async (args) => {
        const canvas = document.getElementById('game-canvas');
        const w = canvas?.width ?? 0;
        const h = canvas?.height ?? 0;
        if (!canvas || w <= 0 || h <= 0) return { ok: false, error: 'Missing or invalid canvas#game-canvas' };

        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return { ok: false, error: 'Failed to get WebGL context from canvas#game-canvas' };

        await new Promise(requestAnimationFrame);

        const points = {};
        for (const sp of Array.isArray(args?.samplePoints) ? args.samplePoints : []) {
            const id = String(sp?.id ?? '');
            if (!id) continue;
            const u = Math.min(1, Math.max(0, Number(sp?.u) || 0));
            const v = Math.min(1, Math.max(0, Number(sp?.v) || 0));
            const x = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
            const yTop = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
            const y = Math.min(h - 1, Math.max(0, h - 1 - yTop));

            const px = new Uint8Array(4);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const r = px[0] / 255;
            const g = px[1] / 255;
            const b = px[2] / 255;
            const luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
            points[id] = { r, g, b, luma, rgba8: Array.from(px) };
        }

        return { ok: true, points, size: { w, h } };
    }, { samplePoints });
}

test('Terrain Debugger: standard mode renders terrain (not just road) with no shader errors', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 960, height: 540 });

    const waitStone = page.waitForResponse((res) => res.url().includes('/assets/public/pbr/rock_ground/basecolor') && res.status() === 200);
    const waitGrass = page.waitForResponse((res) => res.url().includes('/assets/public/pbr/grass_005/basecolor') && res.status() === 200);
    const waitLand = page.waitForResponse((res) => res.url().includes('/assets/public/pbr/ground_037/basecolor') && res.status() === 200);

    await page.goto('/debug_tools/terrain_debug.html');
    await page.waitForSelector('#ui-terrain-debugger');

    await Promise.all([waitStone, waitGrass, waitLand]);
    await page.waitForFunction(() => {
        const root = document.querySelector('[data-terrain-pbr-legend]');
        if (!root) return false;
        return root.children.length >= 9;
    });
    await waitFrames(page, 10);

    const pixels = await readPixels(page, {
        samplePoints: [
            // Sample away from the road centerline; should hit terrain if it renders at all.
            { id: 'left', u: 0.05, v: 0.90 },
            { id: 'right', u: 0.95, v: 0.90 }
        ]
    });
    expect(pixels.ok).toBe(true);
    const maxLuma = Math.max(pixels.points.left.luma, pixels.points.right.luma);
    expect(maxLuma).toBeGreaterThan(0.02);

    expect(await getErrors()).toEqual([]);
});
