// Exercises the user's reflection pose with rendered and interrupted material/probe transitions.
import test, { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('tools/baking/blender.local.json', 'utf8'));
const pose = JSON.parse(await readFile('tests/fixtures/lighting/bus_reflection_toggle_pose.json', 'utf8'));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video: 'off', trace: 'off' });
const output = 'tests/artifacts/screens/bus_reflection_toggle_lifecycle';

test('Bus reflection toggles retain complete geometry, uniforms and original material references', async ({ page }) => {
    test.setTimeout(1200_000); await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1600, height: 1000 });
    const errors = [], messages = [], snapshots = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
        if (/WebGL|shader|program|INVALID_OPERATION/i.test(m.text())) {
            messages.push(m.text().slice(0, 2500));
            if (m.type() === 'error' || /INVALID_OPERATION|too many errors/i.test(m.text())) errors.push(m.text().slice(0, 2500));
        }
    });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ mode: 'auto',
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { indirect: true }, bus: { enabled: false } })));
    await page.goto('/?coreTests=0&gameplayPose=' + encodeURIComponent(JSON.stringify(pose)));
    await page.waitForFunction(() => window.__busSim?.sm?.current?.busAnchor, null, { timeout: 90_000 });
    const settled = async () => {
        await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().status.effectiveMode), { timeout: 240_000 }).toBe('baked');
        await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().busLighting.transitionState), { timeout: 240_000 }).toBe(null);
    };
    await settled();
    await page.evaluate(() => {
        window.busOriginals = [];
        window.busWorldTransitions = [];
        const sample = () => {
            const d = window.__busSim.engine.getBakedLightingDebugInfo();
            if (d.status.effectiveMode !== 'baked') window.busWorldTransitions.push(d.status);
            window.busMonitor = requestAnimationFrame(sample);
        }; window.busMonitor = requestAnimationFrame(sample);
        window.__busSim.sm.current.busModel.traverse(mesh => {
            if (mesh.isMesh) window.busOriginals.push({ mesh, material: mesh.material, geometry: mesh.geometry });
        });
    });
    async function capture(name) {
        await page.evaluate(() => new Promise(resolve => { let n = 0; function frame() {
            if (++n > 30) resolve(); else requestAnimationFrame(frame);
        } requestAnimationFrame(frame); }));
        const snapshot = await page.evaluate(() => {
            const e = window.__busSim.engine, d = e.getBakedLightingDebugInfo();
            return { bus: d.settings.bus, state: d.status, probe: d.busLighting,
                restored: window.busOriginals.every(o => o.mesh.material === o.material),
                geometry: window.busOriginals.every(o => o.mesh.geometry === o.geometry),
                materials: window.busOriginals.map(o => ({ mesh: o.mesh.name, visible: o.mesh.visible,
                    material: (Array.isArray(o.mesh.material) ? o.mesh.material : [o.mesh.material]).map(m => ({
                        name: m.name, uuid: m.uuid, type: m.type, color: m.color?.toArray(), visible: m.visible, opacity: m.opacity })) })),
                glError: e.renderer.getContext().getError() };
        });
        snapshots.push({ name, ...snapshot });
        await page.locator('canvas').first().screenshot({ path: `${output}/${name}.png` });
        await writeFile(`${output}/diagnostics.json`, JSON.stringify({ snapshots, errors, messages }, null, 2));
        console.log('[Bus toggle] ' + name + ': ' + snapshot.state.effectiveMode + ', restored=' + snapshot.restored);
    }
    async function apply(bus) {
        await page.evaluate(async bus => { const e = window.__busSim.engine;
            await e.setBakedLightingSettings({ ...e.bakedLightingSettings, bus }); }, bus);
        await settled();
    }
    await capture('original');
    const all = { enabled: true, materials: true, probes: true, glassReflections: true, bodyReflections: true, rimShine: true };
    for (let i = 0; i < 2; i++) {
        await apply(all); await capture(`cycle-${i}-all`);
        await apply({ ...all, glassReflections: false, bodyReflections: false, rimShine: false }); await capture(`cycle-${i}-legacy-only`);
        await apply({ enabled: false }); await capture(`cycle-${i}-off`);
    }
    await page.evaluate(async all => {
        const e = window.__busSim.engine, pending = [];
        for (let i = 0; i < 15; i++) {
            pending.push(e.setBakedLightingSettings({ ...e.bakedLightingSettings, bus: { ...all,
                enabled: i % 3 !== 0, glassReflections: i % 2 === 0, bodyReflections: i % 3 === 0, rimShine: i % 4 === 0 } }));
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        pending.push(e.setBakedLightingSettings({ ...e.bakedLightingSettings, bus: { enabled: false } }));
        await Promise.all(pending);
    }, all);
    await settled(); await capture('rapid-restored');
    await apply({ enabled: false, glassReflections: true, bodyReflections: true, rimShine: true }); await capture('selective-only');
    await apply({ enabled: false }); await capture('final-original');
    expect(snapshots.every(s => s.geometry)).toBe(true);
    expect(snapshots.filter(s => s.name.endsWith('off') || s.name.includes('restored') || s.name === 'final-original').every(s => s.restored)).toBe(true);
    expect(snapshots.every(s => s.glError === 0)).toBe(true);
    expect(await page.evaluate(() => { cancelAnimationFrame(window.busMonitor); return window.busWorldTransitions; })).toEqual([]);
    expect(errors).toEqual([]);
});
