// Same-pose evidence of the production filter with authenticated, settled baked resources.
import test, { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readGameEvidence, settleGameFrames, setGamePose } from '../../../tools/bake_lighting/experiments/lighting_configurations/capture_baselines/GameEvidence.mjs';
import { resolvePoses } from '../../../tools/bake_lighting/experiments/lighting_configurations/Inputs.mjs';

test.use({ video: 'off', trace: 'off' });
test('small caster at the reported building penumbra', async ({ page }) => {
    test.setTimeout(360000);
    const folder = `tests/artifacts/screens/ai573_stop_sign_shadow/${process.env.AI573_STAGE ?? 'current'}`;
    await mkdir(folder, { recursive: true });
    const pose = JSON.parse(await readFile('tests/headless/e2e/fixtures/ai573_pose.json', 'utf8'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const shaderWarnings = [];
    page.on('console', message => {
        if (/X3595|X4000|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(message.text())) shaderWarnings.push(message.text());
    });
    if (process.env.AI573_BASELINE === '1') for (const name of ['static_sun_depth', 'streamed_sun_depth']) {
        const source = await readFile(`tests/artifacts/screens/ai573_stop_sign_shadow/source/${name}.frag.glsl`, 'utf8');
        await page.route(`**/shaders/materials/${name}.frag.glsl`, route => route.fulfill({ body: source, contentType: 'text/plain' }));
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(pose))}`);
    try { await page.waitForFunction(() => {
        const e = window.__busSim?.engine, d = e?.getBakedLightingDebugInfo();
        const s = e?._bakedLighting.shadows._pipeline?._active?.binding?.streamedDetail;
        return d?.status.effectiveMode === 'baked' && d.receiverLightmaps.activationBlend === 1
            && d.view?.ready !== false && !d.busLighting.transitionState
            && s?.metrics.state === 'ready' && s.pending.size === 0 && s.ready.length === 0;
    }, null, { timeout: 240000 }); } catch (error) {
        await writeFile(`${folder}/failure.json`, JSON.stringify({ errors, shaderWarnings,
            baked: await page.evaluate(() => window.__busSim?.engine?.getBakedLightingDebugInfo()),
            shadows: await page.evaluate(() => window.__busSim?.engine?._bakedLighting?.shadows?._pipeline?.getDiagnostics()) }, null, 2));
        throw error;
    }
    await page.evaluate(settleGameFrames, 30);
    await page.evaluate(async () => {
        const { ensureGlobalPerfBar } = await import('/src/graphics/gui/perf_bar/PerfBar.js'); ensureGlobalPerfBar().setHidden(true);
        const canvas = window.__busSim.engine.canvas;
        for (const el of document.body.querySelectorAll('*')) if (el !== canvas && !el.contains(canvas) && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) el.style.visibility = 'hidden';
        canvas.style.visibility = 'visible';
    });
    const evidence = await page.evaluate(readGameEvidence);
    evidence.detail = await page.evaluate(() => window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.streamedDetail.diagnostics());
    evidence.smallCasters = await page.evaluate(() => window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.smallCasters.metrics);
    evidence.casters = await page.evaluate(async () => {
        const T = await import('three'), e = window.__busSim.engine, meshes = [];
        e.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
        const names = object => { const result = []; for (; object; object = object.parent) if (object.name) result.push(object.name); return result; };
        const ray = new T.Raycaster(), rows = [];
        for (const [x, y] of [[739, 640], [900, 850], [850, 810]]) {
            ray.setFromCamera(new T.Vector2(x / 960 - 1, 1 - y / 540), e.camera);
            const surface = ray.intersectObjects(meshes, false)[0];
            if (!surface) continue;
            const sun = e._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthPointDirectionWorld.value;
            ray.set(surface.point.clone().addScaledVector(sun, .05), sun);
            const blocker = ray.intersectObjects(meshes, false)[0];
            rows.push({ screen: [x, y], receiver: names(surface.object), point: surface.point.toArray(),
                blocker: blocker ? { names: names(blocker.object), point: blocker.point.toArray(), distance: blocker.distance } : null });
        }
        return rows;
    });
    await writeFile(`${folder}/evidence.json`, JSON.stringify(evidence, null, 2));
    await page.locator('canvas').first().screenshot({ path: `${folder}/game.png` });
    await page.evaluate(() => { window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunStreamEnabled.value = 0; });
    await page.evaluate(settleGameFrames, 2);
    await page.locator('canvas').first().screenshot({ path: `${folder}/parent-only.png` });
    await page.evaluate(() => {
        const u = window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms;
        window.__ai573Filter = u.staticSunDepthFilterPolicy.value.toArray();
        u.staticSunDepthFilterPolicy.value.set(0, 0, 0, 0);
    });
    await page.evaluate(settleGameFrames, 2);
    await page.locator('canvas').first().screenshot({ path: `${folder}/point-diagnostic.png` });
    if (process.env.AI573_ALL_POSES === '1') {
        await page.evaluate(() => {
            const u = window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms;
            u.staticSunDepthFilterPolicy.value.fromArray(window.__ai573Filter);
            u.staticSunStreamEnabled.value = 1;
        });
        const catalog = JSON.parse(await readFile('tools/bake_lighting/experiments/lighting_configurations/config/poses.json', 'utf8'));
        const nearby = [-.2, .2].map((offset, i) => ({ id: `nearby_${i}`, pose: { ...pose, camera: { ...pose.camera, position: { ...pose.camera.position, x: pose.camera.position.x + offset } } } }));
        for (const item of [...nearby, ...resolvePoses(catalog)]) {
            await page.evaluate(setGamePose, item.pose);
            await page.evaluate(settleGameFrames, 60);
            await page.waitForFunction(() => {
                const s = window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.streamedDetail;
                return s.pending.size === 0 && s.ready.length === 0 && s.metrics.selectionFallbacks === 0;
            });
            await page.evaluate(settleGameFrames, 30);
            await page.locator('canvas').first().screenshot({ path: `${folder}/${item.id}.png` });
            await writeFile(`${folder}/${item.id}.json`, JSON.stringify(await page.evaluate(readGameEvidence), null, 2));
        }
    }
    expect(evidence.baked.receiverLightmaps.effective.indirect).toBe(true);
    expect(errors).toEqual([]);
    expect(shaderWarnings).toEqual([]);
});
