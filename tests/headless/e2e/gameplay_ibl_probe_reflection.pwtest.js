// Headless browser tests: Gameplay IBL should light the probe sphere (metal reflection proxy).
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
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exact = new RegExp(`^${escaped}$`);
    return page.locator('.options-row', {
        has: page.locator('.options-row-label', { hasText: exact })
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

function maxLuma(result) {
    const pts = result?.points ?? null;
    if (!pts || typeof pts !== 'object') return 0;
    return Math.max(...Object.values(pts).map((p) => Number(p?.luma) || 0));
}

test('Gameplay: IBL lights the probe sphere', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 960, height: 540 });

    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Enter');

    await page.waitForSelector('#ui-select:not(.hidden)');
    await page.keyboard.press('G');
    await page.waitForSelector('#hud-game:not(.hidden)');

    await page.keyboard.press('0');
    await page.waitForSelector('#ui-options');

    await setNumber(page, 'Sun intensity', 0);
    await setNumber(page, 'Hemisphere intensity', 0);
    await setNumber(page, 'IBL intensity (envMapIntensity)', 5);
    await setToggle(page, 'IBL background (setBackground)', true);

    const probePoints = [
        { id: 'p1', u: 0.50, v: 0.40 },
        { id: 'p2', u: 0.50, v: 0.42 },
        { id: 'p3', u: 0.50, v: 0.45 },
        { id: 'p4', u: 0.47, v: 0.43 },
        { id: 'p5', u: 0.53, v: 0.43 },
        { id: 'p6', u: 0.48, v: 0.45 },
        { id: 'p7', u: 0.52, v: 0.45 }
    ];

    await setToggle(page, 'IBL enabled', false);
    await waitFrames(page, 4);
    const iblOff = await readPixels(page, { samplePoints: probePoints });
    expect(iblOff.ok).toBe(true);

    await setToggle(page, 'IBL enabled', true);

    const envRow = rowByLabel(page, 'Env map').locator('div').last();
    const probeEnvRow = rowByLabel(page, 'Probe envMap').locator('div').last();
    const probeIntensityRow = rowByLabel(page, 'Probe envMapIntensity').locator('div').last();

    await expect(envRow).toHaveText(/Loaded/, { timeout: 30_000 });
    await expect(probeEnvRow).toHaveText(/Set/, { timeout: 30_000 });
    await expect(probeIntensityRow).toHaveText(/5\.00|4\.99|5\.0/, { timeout: 30_000 });

    await waitFrames(page, 8);
    const iblOn = await readPixels(page, { samplePoints: probePoints });
    expect(iblOn.ok).toBe(true);

    expect(maxLuma(iblOn)).toBeGreaterThan(maxLuma(iblOff) + 0.02);
    expect(await getErrors()).toEqual([]);
});
