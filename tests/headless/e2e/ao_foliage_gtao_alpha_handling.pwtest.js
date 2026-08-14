// Headless browser tests: GTAO alpha handling should respect cutout transparency.
import test, { expect } from '@playwright/test';
import fs from 'node:fs/promises';

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

async function readGreenLeafPixelSnapshot(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('game-canvas');
        const width = canvas?.width ?? 0;
        const height = canvas?.height ?? 0;
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        if (!gl || width <= 0 || height <= 0) return { ok: false, width, height, pixels: [] };

        const rgba = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        const pixels = [];
        for (let offset = 0; offset < rgba.length; offset += 4) {
            const r = rgba[offset];
            const g = rgba[offset + 1];
            const b = rgba[offset + 2];
            if (g <= 45 || g <= r * 1.04 || g <= b * 1.08) continue;
            pixels.push(offset, r, g, b);
        }
        return { ok: true, width, height, pixels };
    });
}

async function readSkyPixelSnapshot(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('game-canvas');
        const width = canvas?.width ?? 0;
        const height = canvas?.height ?? 0;
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        if (!gl || width <= 0 || height <= 0) return { ok: false, width, height, pixels: [] };

        const rgba = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        const pixels = [];
        for (let offset = 0; offset < rgba.length; offset += 16) {
            const r = rgba[offset];
            const g = rgba[offset + 1];
            const b = rgba[offset + 2];
            if (r < 80 || g <= r + 8 || b <= r + 12 || b < g) continue;
            pixels.push(offset, r, g, b);
        }
        return { ok: true, width, height, pixels };
    });
}

async function compareGreenLeafPixelSnapshot(page, snapshot) {
    return page.evaluate((reference) => {
        const canvas = document.getElementById('game-canvas');
        const width = canvas?.width ?? 0;
        const height = canvas?.height ?? 0;
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        if (!gl || width !== reference?.width || height !== reference?.height) {
            return { ok: false, count: 0, meanAbsoluteError: Infinity, maxError: 255 };
        }

        const rgba = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        const pixels = Array.isArray(reference?.pixels) ? reference.pixels : [];
        let errorSum = 0;
        let maxError = 0;
        let count = 0;
        for (let i = 0; i + 3 < pixels.length; i += 4) {
            const offset = pixels[i];
            for (let channel = 0; channel < 3; channel += 1) {
                const error = Math.abs(rgba[offset + channel] - pixels[i + channel + 1]);
                errorSum += error;
                maxError = Math.max(maxError, error);
                count += 1;
            }
        }
        return {
            ok: true,
            count: count / 3,
            meanAbsoluteError: count > 0 ? errorSum / count : 0,
            maxError
        };
    }, snapshot);
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

test('AO Foliage Debugger: GTAO alpha handling avoids foliage darkening regression', async ({ page }, testInfo) => {
    const getIssues = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/debug_tools/ao_foliage_debug.html?shadows=off');
    await page.waitForFunction(() => (
        window.__aoFoliageDebugHooks?.version === 1
        && window.__aoFoliageDebugHooks?.isReady?.() === true
    ));

    const repro = await page.evaluate(() => window.__aoFoliageDebugHooks.getReproInfo());
    expect(repro?.leafTexture?.width ?? 0).toBeGreaterThan(0);
    expect(repro?.leafTexture?.height ?? 0).toBeGreaterThan(0);
    expect(repro?.leafMaterials?.length ?? 0).toBeGreaterThan(0);
    for (const material of repro.leafMaterials) {
        expect(material?.side).toBe('double');
        expect(material?.shadowSide).toBe('double');
    }

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
    const aoOffPath = testInfo.outputPath('01-ao-off.png');
    await page.screenshot({ path: aoOffPath });
    await testInfo.attach('01-ao-off.png', { path: aoOffPath, contentType: 'image/png' });
    const aoOffLeafPixels = await readGreenLeafPixelSnapshot(page);
    expect(aoOffLeafPixels.ok).toBe(true);
    expect(aoOffLeafPixels.pixels.length / 4).toBeGreaterThan(5000);

    await setGtaoAlphaHandling(page, 'alpha_test', 0.5);
    await waitFrames(page, 10);
    const alphaTestPixels = await readAveragedLuma(page, samplePoints);
    expect(alphaTestPixels.ok).toBe(true);
    const alphaDebug = await readAoOverrideDebug(page);
    const alphaTestPath = testInfo.outputPath('02-gtao-alpha-test.png');
    await page.screenshot({ path: alphaTestPath });
    await testInfo.attach('02-gtao-alpha-test.png', { path: alphaTestPath, contentType: 'image/png' });
    const alphaTestLeafComparison = await compareGreenLeafPixelSnapshot(page, aoOffLeafPixels);

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
    const excludePath = testInfo.outputPath('03-gtao-exclude.png');
    await page.screenshot({ path: excludePath });
    await testInfo.attach('03-gtao-exclude.png', { path: excludePath, contentType: 'image/png' });
    const excludeLeafComparison = await compareGreenLeafPixelSnapshot(page, aoOffLeafPixels);
    const exclusionMaskDataUrl = await page.evaluate(() => window.__aoFoliageDebugHooks?.getAoExclusionMaskDataUrl?.() ?? null);
    expect(exclusionMaskDataUrl?.startsWith('data:image/png;base64,')).toBe(true);
    const exclusionMaskPath = testInfo.outputPath('ao-exclusion-mask.png');
    await fs.writeFile(exclusionMaskPath, Buffer.from(exclusionMaskDataUrl.split(',')[1], 'base64'));
    await testInfo.attach('ao-exclusion-mask.png', {
        path: exclusionMaskPath,
        contentType: 'image/png'
    });

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

    expect(alphaOpaque).toBeGreaterThan(offOpaque - 0.24);
    expect(alphaEdge).toBeGreaterThan(offEdge - 0.24);
    expect(alphaTransparent).toBeGreaterThan(offTransparent - 0.24);
    expect(alphaHighThresholdOpaque).toBeGreaterThan(offOpaque - 0.24);
    expect(alphaHighThresholdEdge).toBeGreaterThan(offEdge - 0.24);
    expect(alphaHighThresholdTransparent).toBeGreaterThan(offTransparent - 0.24);
    expect(excludeOpaque).toBeGreaterThan(offOpaque - 0.24);
    expect(excludeEdge).toBeGreaterThan(offEdge - 0.24);
    expect(excludeTransparent).toBeGreaterThan(offTransparent - 0.24);

    expect(alphaDebug?.count ?? 0).toBeGreaterThan(0);
    expect(alphaHighDebug?.count ?? 0).toBeGreaterThan(0);
    expect(excludeDebug?.count ?? 0).toBeGreaterThan(0);
    expect(alphaDebug?.frameStats?.alphaTestDraws ?? 0).toBeGreaterThan(0);
    expect(alphaDebug?.frameStats?.excludedDraws ?? 0).toBe(0);
    expect(excludeDebug?.frameStats?.excludedFoliageObjects ?? 0).toBeGreaterThan(0);
    expect(excludeDebug?.frameStats?.alphaTestDraws ?? 0).toBe(0);
    expect((alphaDebug?.materials ?? []).some((m) => {
        const t = Number(m?.alphaTest) || 0;
        return t > 0 && t <= 1;
    })).toBe(true);
    expect((alphaHighDebug?.materials ?? []).some((m) => {
        const t = Number(m?.alphaTest) || 0;
        return t > 0 && t <= 1;
    })).toBe(true);
    expect((excludeDebug?.materials ?? []).some((m) => (m?.alphaTest ?? 0) > 1)).toBe(true);

    // Alpha-tested foliage contributes to GTAO, while Exclude must preserve the
    // exact AO-off leaf render. This catches the gameplay symptom directly.
    expect(alphaTestLeafComparison.ok).toBe(true);
    expect(alphaTestLeafComparison.meanAbsoluteError).toBeGreaterThan(2);
    expect(excludeLeafComparison.ok).toBe(true);
    expect(excludeLeafComparison.meanAbsoluteError).toBeLessThan(0.25);
    expect(excludeLeafComparison.maxError).toBeLessThan(4);

    expect(Math.abs(alphaSplit - offSplit)).toBeLessThan(0.24);
    expect(Math.abs(excludeSplit - offSplit)).toBeLessThan(0.26);

    const alphaReference = alphaTestPixels.points.wallReference.luma;
    const excludeReference = excludePixels.points.wallReference.luma;
    expect(Math.abs(excludeReference - alphaReference)).toBeLessThan(0.16);
    expect(alphaReference).toBeGreaterThan(offReference - 0.24);
    expect(excludeReference).toBeGreaterThan(offReference - 0.24);

    expect(await getIssues()).toEqual([]);
});

test('AO Foliage Debugger: gameplay pipeline keeps GTAO Exclude equal to AO off around the sun', async ({ page }, testInfo) => {
    const getIssues = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/debug_tools/ao_foliage_debug.html?sunAligned=1&sunBloom=1&shadows=on');
    await page.waitForFunction(() => (
        window.__aoFoliageDebugHooks?.version === 1
        && window.__aoFoliageDebugHooks?.isReady?.() === true
    ));

    const repro = await page.evaluate(() => window.__aoFoliageDebugHooks.getReproInfo());
    expect(repro?.pipeline?.sunBloomEnabled).toBe(true);
    expect(repro?.sunVisuals?.bloom).toBe(true);
    expect(repro?.sunVisuals?.rays).toBe(true);
    expect(repro?.visualOnlyAoExclusions).toEqual({
        sky: true,
        flare: true,
        bloom: true,
        rays: true
    });

    await setAoOff(page);
    await waitFrames(page, 40);
    const offLeafPixels = await readGreenLeafPixelSnapshot(page);
    const offSkyPixels = await readSkyPixelSnapshot(page);
    expect(offLeafPixels.pixels.length / 4).toBeGreaterThan(1000);
    expect(offSkyPixels.pixels.length / 4).toBeGreaterThan(5000);
    const offPath = testInfo.outputPath('sun-aligned-ao-off.png');
    await page.screenshot({ path: offPath });
    await testInfo.attach('sun-aligned-ao-off.png', { path: offPath, contentType: 'image/png' });

    await setGtaoAlphaHandling(page, 'exclude');
    await waitFrames(page, 20);
    const excludeLeafComparison = await compareGreenLeafPixelSnapshot(page, offLeafPixels);
    const excludeSkyComparison = await compareGreenLeafPixelSnapshot(page, offSkyPixels);
    const excludePath = testInfo.outputPath('sun-aligned-gtao-exclude.png');
    await page.screenshot({ path: excludePath });
    await testInfo.attach('sun-aligned-gtao-exclude.png', { path: excludePath, contentType: 'image/png' });

    expect(excludeLeafComparison.meanAbsoluteError).toBeLessThan(1);
    expect(excludeLeafComparison.maxError).toBeLessThan(24);
    expect(excludeSkyComparison.meanAbsoluteError).toBeLessThan(0.75);
    expect(excludeSkyComparison.maxError).toBeLessThan(24);
    expect(await getIssues()).toEqual([]);
});
