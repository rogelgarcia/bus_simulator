// Isolates moving roof patches from geometry, sun visibility and postprocess AO.
import test, { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('tools/baking/blender.local.json', 'utf8'));
const inputs = JSON.parse(await readFile('tests/fixtures/lighting/ai550_camera_poses.json', 'utf8'));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video: 'off', trace: 'off' });
const output = 'tests/artifacts/screens/bus_roof_probe_diagnosis';
test('Bus roof: isolate spatial probe artifacts at saved route positions', async ({ page }) => {
    test.setTimeout(900_000); await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1400, height: 1000 });
    const pose = structuredClone(inputs.poses[0].pose);
    pose.camera = { yawDeg: -30, pitchDeg: 60, distance: 17, fovDeg: 55, locked: true };
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ mode: 'auto', busAppearanceVersion: 2,
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { indirect: true }, bus: { enabled: true, materials: true, probes: true } })));
    await page.goto('/?coreTests=0&gameplayPose=' + encodeURIComponent(JSON.stringify(pose)));
    await page.waitForFunction(() => window.__busSim?.sm?.current?.busAnchor, null, { timeout: 90_000 });
    await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().busLighting.active), { timeout: 300_000 }).toBe(true);
    await page.evaluate(() => {
        const e = window.__busSim.engine, bus = e._bakedLighting.bus;
        const frameBegin = bus.frameBegin.bind(bus);
        window.roofProbeOn = true;
        bus.frameBegin = allow => frameBegin(allow && window.roofProbeOn);
    });
    async function capture(name) {
        await page.evaluate(() => new Promise(resolve => { let n = 0; function frame() {
            if (++n > 25) resolve(); else requestAnimationFrame(frame);
        } requestAnimationFrame(frame); }));
        await page.locator('canvas').first().screenshot({ path: `${output}/${name}.png` });
        console.log('[Roof diagnosis] ' + name);
    }
    for (let i = 0; i < inputs.poses.length; i++) {
        const value = structuredClone(inputs.poses[i].pose); value.camera = pose.camera;
        await page.evaluate(value => { const s = window.__busSim.sm.current; s._gameplayPose = value;
            s._applyGameplayPoseVehicleTransform(); s._configureGameplayPoseCamera(); window.roofProbeOn = true;
        }, value);
        await capture(`pose-${i + 1}-probes-on`);
        await page.evaluate(() => { window.roofProbeOn = false; }); await capture(`pose-${i + 1}-probes-off`);
    }
    const status = await page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo());
    await writeFile(`${output}/status.json`, JSON.stringify({ settings: status.settings, bus: status.busLighting, status: status.status, errors }, null, 2));
    expect(errors).toEqual([]);
});
