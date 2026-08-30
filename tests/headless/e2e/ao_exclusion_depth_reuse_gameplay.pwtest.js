// Production gameplay visual A/B for AO receiver-mask retained depth.
import test, { expect } from '@playwright/test';

test('Gameplay: retained AO depth matches the legacy mask across city regions', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error?.stack || error?.message || error)));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (message.text().startsWith('Failed to load resource:')) return;
        errors.push(message.text());
    });
    page.on('response', (response) => {
        if (response.status() < 400) return;
        if (response.url().includes('brownstone/pbr.material.correction.config.js')) return;
        errors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto('/?pose=civic_center_curve_front&coreTests=0&aoExclusionDepthReuse=1');
    await page.waitForFunction(() => (
        window.__busSim?.sm?.currentName === 'game_mode'
        && window.__busSim?.sm?.current?.city?.getStaticVisibilityStatus?.()?.state === 'active'
    ), null, { timeout: 180_000 });

    const result = await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        const city = state.city;
        const pipeline = engine._post?.pipeline;
        const renderer = engine.renderer;
        const canvas = renderer.domElement;
        const gl = renderer.getContext();
        if (!pipeline || !city) throw new Error('Missing gameplay pipeline or city');

        engine.stop();
        state._updateChaseCamera = () => {};
        const currentAo = engine.ambientOcclusionSettings ?? {};
        engine.setAmbientOcclusionSettings({
            ...currentAo,
            mode: 'gtao',
            alpha: { ...(currentAo.alpha ?? {}), handling: 'exclude', threshold: 0.5 },
            gtao: { ...(currentAo.gtao ?? {}), updateMode: 'every_frame', debugView: false }
        });

        const poses = [
            { id: 'northwest_n', x: 4, y: 3, dx: 0, dz: -1 },
            { id: 'center_e', x: 12, y: 14, dx: 1, dz: 0 },
            { id: 'southwest_s', x: 7, y: 17, dx: 0, dz: 1 },
            { id: 'southeast_w', x: 21, y: 22, dx: -1, dz: 0 }
        ];
        const pitch = -9.67328903369499 * Math.PI / 180;
        const horizontal = Math.cos(pitch) * 20;
        let logicalNow = performance.now();

        const render = (depthReuse) => {
            pipeline.setAoExclusionDepthReuseEnabledForDebug(depthReuse);
            engine.renderFrame();
            engine.renderFrame();
            gl.finish();
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return {
                pixels,
                mask: engine.getAmbientOcclusionDebugInfo()?.alpha?.frameStats ?? null
            };
        };

        const rows = [];
        for (const pose of poses) {
            const center = city.map.tileToWorldCenter(pose.x, pose.y);
            engine.camera.position.set(center.x, 3.6831812721965655, center.z);
            engine.camera.lookAt(
                center.x + pose.dx * horizontal,
                3.6831812721965655 + Math.sin(pitch) * 20,
                center.z + pose.dz * horizontal
            );
            engine.camera.fov = 55;
            engine.camera.updateProjectionMatrix();
            engine.camera.updateMatrixWorld(true);
            logicalNow += 1000;
            city.updateStaticVisibility(engine.camera, logicalNow);
            logicalNow += 1000;
            city.updateStaticVisibility(engine.camera, logicalNow);

            const legacy = render(false);
            const optimized = render(true);
            let sumError = 0;
            let maxError = 0;
            let changedPixels = 0;
            for (let index = 0; index < legacy.pixels.length; index += 4) {
                let pixelMax = 0;
                for (let channel = 0; channel < 3; channel += 1) {
                    const error = Math.abs(legacy.pixels[index + channel] - optimized.pixels[index + channel]);
                    sumError += error;
                    pixelMax = Math.max(pixelMax, error);
                    maxError = Math.max(maxError, error);
                }
                if (pixelMax > 4) changedPixels += 1;
            }
            rows.push({
                id: pose.id,
                legacy: legacy.mask,
                optimized: optimized.mask,
                meanAbsoluteError: sumError / Math.max(1, canvas.width * canvas.height * 3),
                maxError,
                changedPixelRatio: changedPixels / Math.max(1, canvas.width * canvas.height)
            });
        }
        return { rows, visibility: city.getStaticVisibilityStatus() };
    });

    const screenshotPath = testInfo.outputPath('gameplay-ao-retained-depth.png');
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach('gameplay-ao-retained-depth.png', { path: screenshotPath, contentType: 'image/png' });
    await testInfo.attach('gameplay-ao-retained-depth.json', {
        body: Buffer.from(`${JSON.stringify(result, null, 2)}\n`),
        contentType: 'application/json'
    });
    console.log('[AoExclusionDepthReuse] gameplay pixel comparison', result.rows.map((row) => ({
        id: row.id,
        meanAbsoluteError: row.meanAbsoluteError,
        maxError: row.maxError,
        changedPixelRatio: row.changedPixelRatio
    })));

    expect(result.visibility?.state).toBe('active');
    for (const row of result.rows) {
        expect(row.legacy?.maskStrategy).toMatch(/legacy_full_scene|empty/);
        expect(row.optimized?.maskStrategy).toMatch(/retained_depth_receivers_only|empty/);
        expect(row.optimized?.fallbackReason).toBeNull();
        expect(row.meanAbsoluteError).toBeLessThan(0.35);
        expect(row.maxError).toBeLessThanOrEqual(64);
        expect(row.changedPixelRatio).toBeLessThan(0.002);
    }
    expect(errors).toEqual([]);
});
