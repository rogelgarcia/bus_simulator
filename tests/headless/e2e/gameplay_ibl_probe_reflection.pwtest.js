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

function clamp01(v) {
    const num = Number(v);
    if (!Number.isFinite(num)) return 0;
    return Math.min(1, Math.max(0, num));
}

function parseProbeScreenUv(text) {
    const m = String(text ?? '').trim().match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const u = Number(m[1]);
    const v = Number(m[2]);
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
    return { u, v };
}

function parseNumber(text) {
    const m = String(text ?? '').match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
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
    await setToggle(page, 'HDR background', true);

    const probeScreenRow = rowByLabel(page, 'Probe screen').locator('div').last();
    const probeVisibleRow = rowByLabel(page, 'Probe visible').locator('div').last();
    const probeRadiusRow = rowByLabel(page, 'Probe radius').locator('div').last();
    await expect(probeScreenRow).toHaveText(/,/, { timeout: 30_000 });
    await expect(probeVisibleRow).toHaveText(/Yes/, { timeout: 30_000 });

    await setToggle(page, 'IBL enabled', false);
    await waitFrames(page, 20);

    const offScreenText = await probeScreenRow.textContent();
    const offUv = parseProbeScreenUv(offScreenText);
    expect(offUv).not.toBeNull();
    const offRadiusText = await probeRadiusRow.textContent();
    const offRadius = parseNumber(offRadiusText);
    expect(offRadius).not.toBeNull();
    const rOff = Math.max(0.003, Math.min(0.05, offRadius * 0.35));
    const offU = clamp01(offUv.u);
    const offV = clamp01(offUv.v);
    const offPoints = [
        { id: 'c', u: offU, v: offV },
        { id: 'u1', u: clamp01(offU + rOff), v: offV },
        { id: 'u2', u: clamp01(offU - rOff), v: offV },
        { id: 'v1', u: offU, v: clamp01(offV + rOff) },
        { id: 'v2', u: offU, v: clamp01(offV - rOff) },
        { id: 'd1', u: clamp01(offU + rOff * 0.75), v: clamp01(offV + rOff * 0.75) },
        { id: 'd2', u: clamp01(offU - rOff * 0.75), v: clamp01(offV + rOff * 0.75) },
        { id: 'd3', u: clamp01(offU + rOff * 0.75), v: clamp01(offV - rOff * 0.75) },
        { id: 'd4', u: clamp01(offU - rOff * 0.75), v: clamp01(offV - rOff * 0.75) }
    ];
    const iblOff = await readPixels(page, { samplePoints: offPoints });
    expect(iblOff.ok).toBe(true);

    await setToggle(page, 'IBL enabled', true);

    const envRow = rowByLabel(page, 'Env map').locator('div').last();
    const envIsTextureRow = rowByLabel(page, 'Env isTexture').locator('div').last();
    const envMappingRow = rowByLabel(page, 'Env mapping').locator('div').last();
    const probeEnvRow = rowByLabel(page, 'Probe envMap').locator('div').last();
    const probeEnvIsTextureRow = rowByLabel(page, 'Probe env isTexture').locator('div').last();
    const probeEnvMappingRow = rowByLabel(page, 'Probe env mapping').locator('div').last();
    const probeIntensityRow = rowByLabel(page, 'Probe envMapIntensity').locator('div').last();

    await expect(envRow).toHaveText(/Loaded/, { timeout: 30_000 });
    await expect(envIsTextureRow).toHaveText('Yes');
    await expect(envMappingRow).toHaveText('CubeUV');
    await expect(probeEnvRow).toHaveText(/Set/, { timeout: 30_000 });
    await expect(probeEnvIsTextureRow).toHaveText('Yes');
    await expect(probeEnvMappingRow).toHaveText('CubeUV');
    await expect(probeIntensityRow).toHaveText(/5\.00|4\.99|5\.0/, { timeout: 30_000 });

    await waitFrames(page, 20);
    const onScreenText = await probeScreenRow.textContent();
    const onUv = parseProbeScreenUv(onScreenText);
    expect(onUv).not.toBeNull();
    const onRadiusText = await probeRadiusRow.textContent();
    const onRadius = parseNumber(onRadiusText);
    expect(onRadius).not.toBeNull();
    const rOn = Math.max(0.003, Math.min(0.05, onRadius * 0.35));
    const onU = clamp01(onUv.u);
    const onV = clamp01(onUv.v);
    const onPoints = [
        { id: 'c', u: onU, v: onV },
        { id: 'u1', u: clamp01(onU + rOn), v: onV },
        { id: 'u2', u: clamp01(onU - rOn), v: onV },
        { id: 'v1', u: onU, v: clamp01(onV + rOn) },
        { id: 'v2', u: onU, v: clamp01(onV - rOn) },
        { id: 'd1', u: clamp01(onU + rOn * 0.75), v: clamp01(onV + rOn * 0.75) },
        { id: 'd2', u: clamp01(onU - rOn * 0.75), v: clamp01(onV + rOn * 0.75) },
        { id: 'd3', u: clamp01(onU + rOn * 0.75), v: clamp01(onV - rOn * 0.75) },
        { id: 'd4', u: clamp01(onU - rOn * 0.75), v: clamp01(onV - rOn * 0.75) }
    ];
    const iblOn = await readPixels(page, { samplePoints: onPoints });
    expect(iblOn.ok).toBe(true);

    const offMax = maxLuma(iblOff);
    const onMax = maxLuma(iblOn);
    expect(onMax, `IBL on max luma ${onMax.toFixed(4)} should exceed IBL off ${offMax.toFixed(4)} (probeUv ${onU.toFixed(3)},${onV.toFixed(3)} r=${rOn.toFixed(4)})`).toBeGreaterThan(offMax + 0.01);
    expect(await getErrors()).toEqual([]);
});
