// Headless browser test: gameplay AO foliage should stay stable under camera motion.
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

async function captureMotionStats(page, { aoSettings, frames = 90 }) {
    return page.evaluate(async ({ aoSettings, frames }) => {
        function avg(values) {
            const list = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
            if (!list.length) return 0;
            return list.reduce((sum, v) => sum + v, 0) / list.length;
        }

        function max(values) {
            const list = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
            if (!list.length) return 0;
            let m = -Infinity;
            for (const v of list) if (v > m) m = v;
            return Number.isFinite(m) ? m : 0;
        }

        function p95(values) {
            const list = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
            if (!list.length) return 0;
            const sorted = list.slice().sort((a, b) => a - b);
            const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
            return sorted[idx] ?? 0;
        }

        function p95AbsFrameDelta(values) {
            const list = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
            if (list.length < 2) return 0;
            const deltas = [];
            for (let i = 1; i < list.length; i += 1) deltas.push(Math.abs(list[i] - list[i - 1]));
            return p95(deltas);
        }

        function samplePointLuma(gl, canvas, point, sampleRadiusPx = 1) {
            const w = canvas.width;
            const h = canvas.height;
            const u = Math.min(1, Math.max(0, Number(point?.u) || 0));
            const v = Math.min(1, Math.max(0, Number(point?.v) || 0));
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

            return count > 0 ? (sum / count) : 0;
        }

        const canvas = document.getElementById('harness-canvas');
        if (!canvas) throw new Error('Missing #harness-canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) throw new Error('Missing WebGL context');

        window.__testHooks.setViewport(1280, 720);
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.setAntiAliasingSettings({
            mode: 'fxaa',
            fxaa: { edgeThreshold: 0.2 }
        });
        await window.__testHooks.loadScenario('ao_foliage_motion_stability', {
            seed: 'ao-326-motion',
            cameraMotionX: 0.22,
            cameraMotionZ: 0.18,
            cameraMotionHz: 0.33
        });
        window.__testHooks.setAmbientOcclusionSettings(aoSettings);
        window.__testHooks.step(20, { dt: 1 / 60, render: true });

        const sampleIds = ['foliageOpaque', 'foliageTransparent', 'foliageReference', 'contactNear', 'contactFar'];
        const series = Object.fromEntries(sampleIds.map((id) => [id, []]));
        let offscreenFrames = 0;

        for (let i = 0; i < Math.max(1, Math.floor(frames)); i += 1) {
            window.__testHooks.step(1, { dt: 1 / 60, render: true });
            const metrics = window.__testHooks.getMetrics();
            const points = metrics?.scenario?.samplePoints ?? null;
            if (!points || typeof points !== 'object') {
                offscreenFrames += 1;
                continue;
            }

            let allOnScreen = true;
            for (const id of sampleIds) {
                if (points[id]?.onScreen !== true) {
                    allOnScreen = false;
                    break;
                }
            }
            if (!allOnScreen) {
                offscreenFrames += 1;
                continue;
            }

            for (const id of sampleIds) {
                series[id].push(samplePointLuma(gl, canvas, points[id], 1));
            }
        }

        const sampleCount = series.foliageOpaque.length;
        const splitSeries = [];
        const contactSeries = [];
        for (let i = 0; i < sampleCount; i += 1) {
            splitSeries.push(Math.abs(series.foliageTransparent[i] - series.foliageOpaque[i]));
            contactSeries.push(series.contactFar[i] - series.contactNear[i]);
        }

        return {
            sampleCount,
            offscreenFrames,
            foliageOpaqueAvg: avg(series.foliageOpaque),
            foliageTransparentAvg: avg(series.foliageTransparent),
            foliageReferenceAvg: avg(series.foliageReference),
            splitAvg: avg(splitSeries),
            splitP95: p95(splitSeries),
            splitMax: max(splitSeries),
            transparentDeltaP95: p95AbsFrameDelta(series.foliageTransparent),
            opaqueDeltaP95: p95AbsFrameDelta(series.foliageOpaque),
            referenceDeltaP95: p95AbsFrameDelta(series.foliageReference),
            contactAvg: avg(contactSeries),
            contactP95: p95(contactSeries)
        };
    }, { aoSettings, frames });
}

test('Harness: AO foliage remains stable under camera motion while keeping non-foliage contacts', async ({ page }) => {
    const getIssues = await attachFailFastConsole({ page });

    const query = [
        'ibl=0',
        'bloom=0',
        'sunBloom=0',
        'grade=off',
        'aa=fxaa',
        'ao=off',
        'shadows=off'
    ].join('&');

    await page.goto(`/tests/headless/harness/index.html?${query}`);
    await page.waitForFunction(() => window.__testHooks?.version === 1);

    const aoOff = await captureMotionStats(page, {
        aoSettings: {
            mode: 'off'
        }
    });

    const gtaoOn = await captureMotionStats(page, {
        aoSettings: {
            mode: 'gtao',
            alpha: {
                handling: 'alpha_test',
                threshold: 0.5
            },
            staticAo: {
                mode: 'off'
            },
            busContactShadow: {
                enabled: false
            },
            gtao: {
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
        }
    });

    const ssaoOn = await captureMotionStats(page, {
        aoSettings: {
            mode: 'ssao',
            alpha: {
                handling: 'alpha_test',
                threshold: 0.5
            },
            staticAo: {
                mode: 'off'
            },
            busContactShadow: {
                enabled: false
            },
            ssao: {
                intensity: 1.1,
                radius: 9,
                quality: 'high'
            }
        }
    });


    expect(aoOff.sampleCount).toBeGreaterThan(65);
    expect(gtaoOn.sampleCount).toBeGreaterThan(65);
    expect(ssaoOn.sampleCount).toBeGreaterThan(65);
    expect(aoOff.offscreenFrames).toBe(0);
    expect(gtaoOn.offscreenFrames).toBe(0);
    expect(ssaoOn.offscreenFrames).toBe(0);

    expect(gtaoOn.foliageOpaqueAvg).toBeGreaterThan(aoOff.foliageOpaqueAvg - 0.04);
    expect(ssaoOn.foliageOpaqueAvg).toBeGreaterThan(aoOff.foliageOpaqueAvg - 0.04);
    expect(gtaoOn.foliageTransparentAvg).toBeGreaterThan(aoOff.foliageTransparentAvg - 0.06);
    expect(ssaoOn.foliageTransparentAvg).toBeGreaterThan(aoOff.foliageTransparentAvg - 0.06);

    expect(gtaoOn.splitP95).toBeLessThan(aoOff.splitP95 + 0.015);
    expect(gtaoOn.splitMax).toBeLessThan(aoOff.splitMax + 0.03);
    expect(gtaoOn.transparentDeltaP95).toBeLessThan(aoOff.transparentDeltaP95 + 0.012);
    expect(gtaoOn.opaqueDeltaP95).toBeLessThan(aoOff.opaqueDeltaP95 + 0.012);
    expect(gtaoOn.referenceDeltaP95).toBeLessThan(aoOff.referenceDeltaP95 + 0.012);
    expect(ssaoOn.splitP95).toBeLessThan(aoOff.splitP95 + 0.015);
    expect(ssaoOn.splitMax).toBeLessThan(aoOff.splitMax + 0.03);
    expect(ssaoOn.transparentDeltaP95).toBeLessThan(aoOff.transparentDeltaP95 + 0.012);
    expect(ssaoOn.opaqueDeltaP95).toBeLessThan(aoOff.opaqueDeltaP95 + 0.012);
    expect(ssaoOn.referenceDeltaP95).toBeLessThan(aoOff.referenceDeltaP95 + 0.012);

    expect(gtaoOn.contactAvg).toBeGreaterThan(aoOff.contactAvg + 0.012);
    expect(gtaoOn.contactP95).toBeGreaterThan(aoOff.contactP95 + 0.008);
    expect(ssaoOn.contactAvg).toBeGreaterThan(aoOff.contactAvg + 0.012);
    expect(ssaoOn.contactP95).toBeGreaterThan(aoOff.contactP95 + 0.008);

    expect(await getIssues()).toEqual([]);
});
