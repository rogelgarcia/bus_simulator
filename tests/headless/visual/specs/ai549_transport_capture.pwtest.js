// Separates physical glazing, baked transmitted sun, combined output and stale fallback.
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';
import { loadBakeConfiguration } from '../../../../tools/baking/Configuration.mjs';

const config = await loadBakeConfiguration(undefined, { requiredPaths: ['browserExecutable'], checkedPaths: ['browserExecutable'] });
test.use({ launchOptions: { executablePath: config.browserExecutable, args: ['--force-color-profile=srgb'] } });
test('AI549: bounded glass transport loads, composes and invalidates', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') console.log(m.text()); });
    await bootHarness(page, { query: '' });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(async () => {
        const h = window.__testHooks, e = h.getEngine();
        await e.waitForLightingReady();
        h.setViewport(1920, 1080);
        await h.loadScenario('building_showcase', { seed: 'ai549-transport', buildingId: 'burban', sun: { azimuthDeg: 90, elevationDeg: 45 },
            hdri: { iblId: 'ibl.calibrated.clear_afternoon_55' },
            glassTransportUrl: '/tests/artifacts/screens/buildings/burban/ai549/transport/transport.json' });
        e.camera.position.set(10, 8, 42); e.camera.lookAt(0, 1, 30); e.camera.updateProjectionMatrix();
        document.getElementById('harness-ui').style.display = 'none';
    });
    await page.waitForFunction(() => {
        const h = window.__testHooks;
        h.stepAdvanced(1, { renderEachTick: true });
        return !h.getEngine()._bakedLighting.shouldHoldView();
    }, null, { timeout: 90000 });
    const initial = await page.evaluate(() => {
        const f = window.__testHooks.getEngine().context.glassTransportFixture;
        f.update();
        return { status: f.binding.getStatus(), sun: window.__testHooks.getEngine().context.city.sun.position.toArray(), profile: f.profile };
    });
    expect(initial.status, JSON.stringify(initial)).toBe('active');
    const out = path.resolve('tests/artifacts/screens/buildings/burban/ai549/transport');
    const reports = [];
    for (const mode of ['glass-only', 'transport-only', 'combined', 'stale']) {
        const state = await page.evaluate(mode => {
            const h = window.__testHooks, e = h.getEngine(), f = e.context.glassTransportFixture;
            f.setEnabled(mode !== 'glass-only');
            f.panes.forEach(p => { p.visible = mode !== 'transport-only'; });
            if (mode === 'stale') f.panes[0].position.z += .1;
            h.stepAdvanced(3, { renderEachTick: true });
            return { mode, status: f.binding.getStatus(), casterStates: f.panes.map(p => p.castShadow),
                render: { ...e.renderer.info.render }, textureBytes: f.binding.textureBytes };
        }, mode);
        expect(state.status).toBe(mode === 'stale' ? 'stale-profile-opaque-shadow-fallback' : mode === 'glass-only' ? 'disabled' : 'active');
        expect(state.casterStates.every(v => v === (mode === 'stale' || mode === 'glass-only'))).toBe(true);
        await page.locator('#harness-canvas').screenshot({ path: path.join(out, `${mode}.png`) });
        if (mode === 'glass-only' || mode === 'combined') state.performance = await page.evaluate(async () => {
            const h = window.__testHooks, e = h.getEngine(), frames = [];
            h.setViewport(1280, 720);
            for (let i = 0; i < 120; i++) {
                const start = performance.now(); h.stepAdvanced(1, { renderEachTick: true }); e.renderer.getContext().finish();
                if (i >= 30) frames.push(performance.now() - start);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            const result = { samples: 90, warmup: 30, viewport: [1280, 720], frames,
                meanMs: frames.reduce((a, b) => a + b, 0) / frames.length, calls: e.renderer.info.render.calls,
                triangles: e.renderer.info.render.triangles, memory: { ...e.renderer.info.memory } };
            h.setViewport(1920, 1080); h.stepAdvanced(3, { renderEachTick: true });
            return result;
        });
        reports.push(state);
    }
    const receiverInvalidation = await page.evaluate(() => {
        const f = window.__testHooks.getEngine().context.glassTransportFixture;
        f.panes[0].position.z -= .1;
        f.update();
        const restored = f.binding.getStatus();
        f.receiver.position.x += .1;
        f.update();
        const moved = f.binding.getStatus();
        f.receiver.position.x -= .1;
        f.receiver.geometry.parameters.width += .1;
        f.update();
        return { restored, moved, resized: f.binding.getStatus() };
    });
    expect(receiverInvalidation).toEqual({ restored: 'active', moved: 'stale-profile-opaque-shadow-fallback', resized: 'stale-profile-opaque-shadow-fallback' });
    await fs.writeFile(path.join(out, 'runtime-report.json'), JSON.stringify({ initial, reports, receiverInvalidation, errors }, null, 2));
    expect(errors).toEqual([]);
});
