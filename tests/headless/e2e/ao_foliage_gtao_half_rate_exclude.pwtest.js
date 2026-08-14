// Headless browser regression: excluded foliage must use the same GTAO
// composition path on update and cached frames, including over opaque trunks.
import test, { expect } from '@playwright/test';

async function captureSeries(page, { mode = 'gtao', updateMode = 'every_frame', frames = 60 } = {}) {
    return page.evaluate(async ({ mode, updateMode, frames }) => {
        const hooks = window.__testHooks;
        if (!hooks) throw new Error('Missing window.__testHooks');

        const canvas = document.getElementById('harness-canvas');
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        if (!canvas || !gl) throw new Error('Missing harness WebGL canvas');

        const sampleLuma = (point, radius = 1) => {
            const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.u * canvas.width)));
            const yTop = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.v * canvas.height)));
            const y = canvas.height - 1 - yTop;
            let sum = 0;
            let count = 0;
            for (let oy = -radius; oy <= radius; oy += 1) {
                for (let ox = -radius; ox <= radius; ox += 1) {
                    const px = new Uint8Array(4);
                    gl.readPixels(
                        Math.max(0, Math.min(canvas.width - 1, x + ox)),
                        Math.max(0, Math.min(canvas.height - 1, y + oy)),
                        1,
                        1,
                        gl.RGBA,
                        gl.UNSIGNED_BYTE,
                        px
                    );
                    sum += ((0.2126 * px[0]) + (0.7152 * px[1]) + (0.0722 * px[2])) / 255;
                    count += 1;
                }
            }
            return count > 0 ? sum / count : 0;
        };

        const summarize = (values) => {
            const finite = values.filter(Number.isFinite);
            const average = finite.reduce((sum, value) => sum + value, 0) / Math.max(1, finite.length);
            const deltas = [];
            for (let i = 1; i < finite.length; i += 1) deltas.push(Math.abs(finite[i] - finite[i - 1]));
            deltas.sort((a, b) => a - b);
            const p95Index = Math.max(0, Math.min(deltas.length - 1, Math.ceil(deltas.length * 0.95) - 1));
            const even = finite.filter((_, index) => (index % 2) === 0);
            const odd = finite.filter((_, index) => (index % 2) === 1);
            const evenAverage = even.reduce((sum, value) => sum + value, 0) / Math.max(1, even.length);
            const oddAverage = odd.reduce((sum, value) => sum + value, 0) / Math.max(1, odd.length);
            return {
                average,
                frameDeltaP95: deltas[p95Index] ?? 0,
                alternatingBias: Math.abs(evenAverage - oddAverage)
            };
        };

        hooks.setViewport(1280, 720);
        hooks.setFixedDt(1 / 60);
        hooks.setAntiAliasingSettings({ mode: 'fxaa', fxaa: { edgeThreshold: 0.2 } });
        await hooks.loadScenario('ao_foliage_motion_stability', {
            seed: 'ao-half-rate-exclude',
            cameraMotionX: 0.12,
            cameraMotionZ: 0.08,
            cameraMotionHz: 0.25
        });
        hooks.setAmbientOcclusionSettings(mode === 'off'
            ? { mode: 'off' }
            : {
                mode: 'gtao',
                alpha: { handling: 'exclude', threshold: 0.5 },
                staticAo: { mode: 'off' },
                busContactShadow: { enabled: false },
                gtao: {
                    intensity: 1.1,
                    radius: 0.8,
                    quality: 'high',
                    denoise: true,
                    debugView: false,
                    updateMode,
                    motionThreshold: { positionMeters: 0.02, rotationDeg: 0.15, fovDeg: 0 }
                }
            });
        hooks.step(16, { dt: 1 / 60, render: true });

        const series = {
            foliageOverTrunk: [],
            foliageTransparent: [],
            trunkVisible: [],
            contact: []
        };
        const reasons = {};
        let updatedFrames = 0;

        for (let i = 0; i < frames; i += 1) {
            hooks.step(1, { dt: 1 / 60, render: true });
            const points = hooks.getMetrics()?.scenario?.samplePoints ?? {};
            const debug = hooks.getAmbientOcclusionDebugInfo?.() ?? null;
            if (points.foliageOverTrunk?.onScreen !== true || points.trunkVisible?.onScreen !== true) {
                throw new Error('AO sample point moved off screen');
            }

            series.foliageOverTrunk.push(sampleLuma(points.foliageOverTrunk));
            series.foliageTransparent.push(sampleLuma(points.foliageTransparent));
            series.trunkVisible.push(sampleLuma(points.trunkVisible));
            series.contact.push(sampleLuma(points.contactFar) - sampleLuma(points.contactNear));

            const gtao = debug?.gtao ?? null;
            if (gtao?.updatedThisFrame === true) updatedFrames += 1;
            const reason = String(gtao?.updateReason ?? 'none');
            reasons[reason] = (reasons[reason] ?? 0) + 1;
        }

        return {
            foliageOverTrunk: summarize(series.foliageOverTrunk),
            foliageTransparent: summarize(series.foliageTransparent),
            trunkVisible: summarize(series.trunkVisible),
            contact: summarize(series.contact),
            updatedFrames,
            reasons
        };
    }, { mode, updateMode, frames });
}

test('Harness: excluded foliage does not alternate on half-rate GTAO frames', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0&sunBloom=0&grade=off&aa=fxaa&ao=off&shadows=off');
    await page.waitForFunction(() => window.__testHooks?.version === 1);

    const aoOff = await captureSeries(page, { mode: 'off' });
    const everyFrame = await captureSeries(page, { updateMode: 'every_frame' });
    const halfRate = await captureSeries(page, { updateMode: 'half_rate' });

    expect(halfRate.updatedFrames).toBeGreaterThanOrEqual(25);
    expect(halfRate.updatedFrames).toBeLessThanOrEqual(35);
    expect(halfRate.reasons.cadence ?? 0).toBeGreaterThan(20);
    expect(halfRate.reasons.cached ?? 0).toBeGreaterThan(20);

    expect(Math.abs(everyFrame.foliageOverTrunk.average - aoOff.foliageOverTrunk.average)).toBeLessThan(0.035);
    expect(Math.abs(halfRate.foliageOverTrunk.average - aoOff.foliageOverTrunk.average)).toBeLessThan(0.035);
    expect(halfRate.foliageOverTrunk.frameDeltaP95).toBeLessThan(everyFrame.foliageOverTrunk.frameDeltaP95 + 0.012);
    expect(halfRate.foliageOverTrunk.alternatingBias).toBeLessThan(everyFrame.foliageOverTrunk.alternatingBias + 0.006);

    expect(halfRate.foliageTransparent.frameDeltaP95).toBeLessThan(everyFrame.foliageTransparent.frameDeltaP95 + 0.012);
    expect(halfRate.contact.average).toBeGreaterThan(aoOff.contact.average + 0.008);
    expect(Math.abs(halfRate.contact.average - everyFrame.contact.average)).toBeLessThan(0.025);
});
