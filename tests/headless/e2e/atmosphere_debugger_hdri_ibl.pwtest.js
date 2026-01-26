// Headless browser tests: Atmosphere Debugger HDR background + IBL should affect output.
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

function rowByLabel(page, label) {
    return page.locator('.options-row', {
        has: page.locator('.options-row-label', { hasText: label })
    });
}

async function setToggle(page, label, desired) {
    await page.evaluate(({ label, desired }) => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((el) => el.querySelector('.options-row-label')?.textContent?.trim() === label);
        const toggle = row?.querySelector('input[type="checkbox"]') ?? null;
        if (!toggle) throw new Error(`Missing toggle: ${label}`);
        const next = !!desired;
        if (toggle.checked === next) return;
        toggle.checked = next;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }, { label, desired: !!desired });
}

async function setNumber(page, label, value) {
    const input = rowByLabel(page, label).locator('input[type="number"]');
    await expect(input).toHaveCount(1);
    await input.fill(String(value));
}

test('Atmosphere Debugger: HDR background and IBL affect render output', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 960, height: 540 });

    const waitHdr = page.waitForResponse((res) => res.url().endsWith('.hdr') && res.status() === 200);
    const waitBaseColor = page.waitForResponse((res) => res.url().includes('/assets/public/pbr/rocky_terrain_02/basecolor.jpg') && res.status() === 200);
    const waitNormal = page.waitForResponse((res) => res.url().includes('/assets/public/pbr/rocky_terrain_02/normal_gl.png') && res.status() === 200);
    const waitOrm = page.waitForResponse((res) => res.url().includes('/assets/public/pbr/rocky_terrain_02/arm.png') && res.status() === 200);

    await page.goto('/debug_tools/atmosphere_debug.html');
    await page.waitForSelector('#ui-atmosphere-debug-options');

    await Promise.all([waitHdr, waitBaseColor, waitNormal, waitOrm]);
    await waitFrames(page, 6);

    const bgOn = await readPixels(page, {
        samplePoints: [
            { id: 'sky1', u: 0.1, v: 0.1 },
            { id: 'sky2', u: 0.5, v: 0.1 },
            { id: 'sky3', u: 0.9, v: 0.1 }
        ]
    });
    expect(bgOn.ok).toBe(true);
    const maxSkyOn = Math.max(bgOn.points.sky1.luma, bgOn.points.sky2.luma, bgOn.points.sky3.luma);
    expect(maxSkyOn).toBeGreaterThan(0.02);

    await setToggle(page, 'HDR background', false);
    await waitFrames(page, 3);
    const bgOff = await readPixels(page, {
        samplePoints: [
            { id: 'sky1', u: 0.1, v: 0.1 },
            { id: 'sky2', u: 0.5, v: 0.1 },
            { id: 'sky3', u: 0.9, v: 0.1 }
        ]
    });
    expect(bgOff.ok).toBe(true);
    const maxSkyOff = Math.max(bgOff.points.sky1.luma, bgOff.points.sky2.luma, bgOff.points.sky3.luma);
    expect(maxSkyOff).toBeLessThan(0.01);

    await setNumber(page, 'Sun intensity', 0);
    await setNumber(page, 'Hemi intensity', 0);
    await setNumber(page, 'Env intensity', 1.5);
    await setToggle(page, 'HDR background', false);
    await setToggle(page, 'IBL enabled', false);
    await waitFrames(page, 3);

    const iblOff = await readPixels(page, { samplePoints: [{ id: 'floor', u: 0.2, v: 0.8 }] });
    expect(iblOff.ok).toBe(true);

    await setToggle(page, 'IBL enabled', true);
    await waitFrames(page, 4);

    const iblOn = await readPixels(page, { samplePoints: [{ id: 'floor', u: 0.2, v: 0.8 }] });
    expect(iblOn.ok).toBe(true);
    expect(iblOn.points.floor.luma).toBeGreaterThan(iblOff.points.floor.luma + 0.02);

    expect(await getErrors()).toEqual([]);
});
