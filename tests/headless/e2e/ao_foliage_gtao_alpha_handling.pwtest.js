// Headless browser tests: GTAO alpha handling should respect cutout transparency.
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
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;
        issues.push({ kind: 'console.error', message: text });
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        issues.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        const status = res.status();
        if (status < 400) return;
        issues.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...issues, ...fromPage];
    };
}

async function waitFrames(page, count = 4) {
    await page.evaluate(async (n) => {
        const frames = Math.max(1, Number(n) || 1);
        for (let i = 0; i < frames; i += 1) {
            await new Promise(requestAnimationFrame);
        }
    }, count);
}

async function readAveragedLuma(page, points, sampleRadiusPx = 2) {
    return page.evaluate(({ points, sampleRadiusPx }) => {
        const canvas = document.getElementById('game-canvas');
        const w = canvas?.width ?? 0;
        const h = canvas?.height ?? 0;
        if (!canvas || w <= 0 || h <= 0) return { ok: false, error: 'Missing canvas' };

        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return { ok: false, error: 'Missing WebGL context' };

        const result = {};
        for (const p of Array.isArray(points) ? points : []) {
            const id = String(p?.id ?? '');
            if (!id) continue;
            const u = Math.min(1, Math.max(0, Number(p?.u) || 0));
            const v = Math.min(1, Math.max(0, Number(p?.v) || 0));
            const x = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
            const yTop = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
            const y = Math.min(h - 1, Math.max(0, h - 1 - yTop));
            const radius = Math.max(0, Math.floor(Number(sampleRadiusPx) || 0));

            let sum = 0;
            let count = 0;
            for (let oy = -radius; oy <= radius; oy += 1) {
                const sy = Math.min(h - 1, Math.max(0, y + oy));
                for (let ox = -radius; ox <= radius; ox += 1) {
                    const sx = Math.min(w - 1, Math.max(0, x + ox));
                    const px = new Uint8Array(4);
                    gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                    const r = px[0] / 255;
                    const g = px[1] / 255;
                    const b = px[2] / 255;
                    sum += (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
                    count += 1;
                }
            }

            result[id] = { luma: count > 0 ? sum / count : 0 };
        }

        return { ok: true, points: result, size: { w, h } };
    }, { points, sampleRadiusPx });
}

async function setGtaoAlphaHandling(page, handling, threshold = 0.5) {
    await page.evaluate(({ mode, threshold }) => {
        const hooks = window.__aoFoliageDebugHooks;
        if (!hooks) throw new Error('Missing __aoFoliageDebugHooks');
        const current = hooks.getAmbientOcclusion() ?? {};
        const next = {
            ...current,
            mode: 'gtao',
            alpha: {
                ...(current.alpha ?? {}),
                handling: mode,
                threshold
            },
            gtao: {
                ...(current.gtao ?? {}),
                intensity: 1.1,
                radius: 0.8,
                quality: 'high',
                denoise: true,
                debugView: false,
                updateMode: 'every_frame',
                motionThreshold: {
                    positionMeters: 0.02,
                    rotationDeg: 0.15,
                    fovDeg: 0
                }
            }
        };
        hooks.setAmbientOcclusion(next);
    }, { mode: handling, threshold });
}

async function setAoOff(page) {
    await page.evaluate(() => {
        const hooks = window.__aoFoliageDebugHooks;
        if (!hooks) throw new Error('Missing __aoFoliageDebugHooks');
        const current = hooks.getAmbientOcclusion() ?? {};
        hooks.setAmbientOcclusion({
            ...current,
            mode: 'off'
        });
    });
}

async function readAoOverrideDebug(page) {
    return page.evaluate(() => {
        const hooks = window.__aoFoliageDebugHooks;
        if (!hooks) throw new Error('Missing __aoFoliageDebugHooks');
        return hooks.getAoOverrideDebugInfo?.() ?? null;
    });
}

test('AO Foliage Debugger: GTAO alpha handling avoids foliage darkening regression', async ({ page }) => {
    const getIssues = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/debug_tools/ao_foliage_debug.html');
    await page.waitForFunction(() => window.__aoFoliageDebugHooks?.version === 1);

    const repro = await page.evaluate(() => window.__aoFoliageDebugHooks.getReproInfo());
    expect(repro?.leafTexture?.width ?? 0).toBeGreaterThan(0);
    expect(repro?.leafTexture?.height ?? 0).toBeGreaterThan(0);

    const sampleIds = ['wallOpaque', 'wallEdge', 'wallTransparent', 'wallReference'];
    const samplePoints = sampleIds.map((id) => ({
        id,
        u: repro?.samplePoints?.[id]?.u ?? -1,
        v: repro?.samplePoints?.[id]?.v ?? -1,
        onScreen: repro?.samplePoints?.[id]?.onScreen === true
    }));
    for (const p of samplePoints) expect(p.onScreen).toBe(true);

    await setAoOff(page);
    await waitFrames(page, 10);
    const aoOffPixels = await readAveragedLuma(page, samplePoints);
    expect(aoOffPixels.ok).toBe(true);

    await setGtaoAlphaHandling(page, 'alpha_test', 0.5);
    await waitFrames(page, 10);
    const alphaTestPixels = await readAveragedLuma(page, samplePoints);
    expect(alphaTestPixels.ok).toBe(true);
    const alphaDebug = await readAoOverrideDebug(page);

    await setGtaoAlphaHandling(page, 'alpha_test', 0.85);
    await waitFrames(page, 10);
    const alphaTestHighThresholdPixels = await readAveragedLuma(page, samplePoints);
    expect(alphaTestHighThresholdPixels.ok).toBe(true);
    const alphaHighDebug = await readAoOverrideDebug(page);

    await setGtaoAlphaHandling(page, 'exclude');
    await waitFrames(page, 10);
    const excludePixels = await readAveragedLuma(page, samplePoints);
    expect(excludePixels.ok).toBe(true);
    const excludeDebug = await readAoOverrideDebug(page);

    const alphaOpaque = alphaTestPixels.points.wallOpaque.luma;
    const alphaEdge = alphaTestPixels.points.wallEdge.luma;
    const alphaTransparent = alphaTestPixels.points.wallTransparent.luma;
    const alphaHighThresholdOpaque = alphaTestHighThresholdPixels.points.wallOpaque.luma;
    const alphaHighThresholdEdge = alphaTestHighThresholdPixels.points.wallEdge.luma;
    const alphaHighThresholdTransparent = alphaTestHighThresholdPixels.points.wallTransparent.luma;
    const excludeOpaque = excludePixels.points.wallOpaque.luma;
    const excludeEdge = excludePixels.points.wallEdge.luma;
    const excludeTransparent = excludePixels.points.wallTransparent.luma;
    const offOpaque = aoOffPixels.points.wallOpaque.luma;
    const offEdge = aoOffPixels.points.wallEdge.luma;
    const offTransparent = aoOffPixels.points.wallTransparent.luma;
    const offReference = aoOffPixels.points.wallReference.luma;

    const alphaSplit = Math.abs(alphaTransparent - alphaOpaque);
    const offSplit = Math.abs(offTransparent - offOpaque);
    const excludeSplit = Math.abs(excludeTransparent - excludeOpaque);

    expect(alphaOpaque).toBeGreaterThan(offOpaque - 0.22);
    expect(alphaEdge).toBeGreaterThan(offEdge - 0.22);
    expect(alphaTransparent).toBeGreaterThan(offTransparent - 0.22);
    expect(alphaHighThresholdOpaque).toBeGreaterThan(offOpaque - 0.22);
    expect(alphaHighThresholdEdge).toBeGreaterThan(offEdge - 0.22);
    expect(alphaHighThresholdTransparent).toBeGreaterThan(offTransparent - 0.22);
    expect(excludeOpaque).toBeGreaterThan(offOpaque - 0.24);
    expect(excludeEdge).toBeGreaterThan(offEdge - 0.24);
    expect(excludeTransparent).toBeGreaterThan(offTransparent - 0.24);

    expect(alphaDebug?.count ?? 0).toBeGreaterThan(0);
    expect(alphaHighDebug?.count ?? 0).toBeGreaterThan(0);
    expect(excludeDebug?.count ?? 0).toBeGreaterThan(0);
    expect((alphaDebug?.materials ?? []).some((m) => {
        const t = Number(m?.alphaTest) || 0;
        return t > 0 && t <= 1;
    })).toBe(true);
    expect((alphaHighDebug?.materials ?? []).some((m) => {
        const t = Number(m?.alphaTest) || 0;
        return t > 0 && t <= 1;
    })).toBe(true);
    expect((excludeDebug?.materials ?? []).some((m) => (m?.alphaTest ?? 0) > 1)).toBe(true);

    expect(Math.abs(alphaSplit - offSplit)).toBeLessThan(0.24);
    expect(Math.abs(excludeSplit - offSplit)).toBeLessThan(0.26);

    const alphaReference = alphaTestPixels.points.wallReference.luma;
    const excludeReference = excludePixels.points.wallReference.luma;
    expect(Math.abs(excludeReference - alphaReference)).toBeLessThan(0.16);
    expect(alphaReference).toBeGreaterThan(offReference - 0.24);
    expect(excludeReference).toBeGreaterThan(offReference - 0.24);

    expect(await getIssues()).toEqual([]);
});
