// Replays supplied camera poses and verifies reversible materials and live probe lifecycle.
import test, { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const config = await readFile('tools/baking/blender.local.json', 'utf8').then(JSON.parse).catch(() => ({}));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video: 'off', trace: 'off' });
const inputs = JSON.parse(await readFile('tests/fixtures/lighting/ai550_camera_poses.json', 'utf8'));
const root = 'tests/artifacts/screens/ai550_bus_diffuse_probes/after';
const published = existsSync('assets/baked_lighting/diffuse_probes/index.json');
const warm = page => page.evaluate(() => new Promise(resolve => { let n = 0; function frame() { if (++n > 60) resolve(); else requestAnimationFrame(frame); } frame(); }));

test('AI550: original materials, enhanced materials and probes remain independently reversible', async ({ page }) => {
    test.setTimeout(900_000);
    await mkdir(root, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors = [], probeRequests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /shader|program|WebGL/i.test(m.text())) errors.push(m.text().slice(0,1200)); });
    page.on('request', r => { if (r.url().includes('/assets/baked_lighting/diffuse_probes/')) probeRequests.push(r.url()); });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        mode: 'auto', shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { indirect: true }, bus: { enabled: false }
    })));
    await page.goto('/?coreTests=0&gameplayPose=' + encodeURIComponent(JSON.stringify(inputs.poses[0].pose)));
    await page.waitForFunction(() => window.__busSim?.sm?.current?.busAnchor, null, { timeout: 90_000 });
    await page.evaluate(async () => { await window.__busSim.sm.current.busModel.userData.readyPromise; });
    await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().status.effectiveMode), { timeout: 160_000 }).toBe('baked');
    const original = await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        window.ai550Originals = [];
        sm.current.busModel.traverse(mesh => { if (mesh.isMesh) window.ai550Originals.push({ mesh, material: mesh.material, geometry: mesh.geometry }); });
        return engine.getBakedLightingDebugInfo().busLighting;
    });
    expect(original.residentGpuBytes).toBe(0); expect(original.cachedVariants).toBe(0);
    expect(probeRequests).toEqual([]);
    await writeFile(`${root}/cold-off.json`, JSON.stringify(original, null, 2));
    console.log('[AI550] Cold Off: no probe fetch, field allocation or material variants');
    const results = [];
    async function apply(bus, mode = 'auto') {
        await page.evaluate(async ({bus, mode}) => { const e = window.__busSim.engine; await e.setBakedLightingSettings({ ...e.getBakedLightingDebugInfo().settings, mode, bus }); }, { bus, mode });
        await warm(page);
        console.log(`[AI550] Lifecycle: ${mode}, enabled=${bus.enabled}, materials=${bus.materials}, probes=${bus.probes}`);
        return page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo());
    }
    results.push({ mode: 'materials', info: await apply({ enabled: true, materials: true, probes: false }) });
    expect(results[0].info.status.effectiveMode).toBe('baked');
    expect(results[0].info.busLighting.activeMaterials).toBeGreaterThan(0);
    expect(await page.evaluate(()=>{
        let paint=false;window.__busSim.sm.current.busModel.traverse(o=>{
            if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='paint')paint=m.isMeshPhysicalMaterial===true;
        });return paint;
    })).toBe(true);
    expect(probeRequests).toEqual([]);
    await page.locator('canvas').first().screenshot({ path: `${root}/pose_01-materials.png` });
    if (published) {
        results.push({ mode: 'combined', info: await apply({ enabled: true, materials: true, probes: true }) });
        await writeFile(`${root}/combined-status.json`, JSON.stringify(results.at(-1), null, 2));
        expect(results.at(-1).info.status.effectiveMode).toBe('baked');
        expect(results.at(-1).info.busLighting.active).toBe(true);
        await page.locator('canvas').first().screenshot({ path: `${root}/pose_01-combined.png` });
        const requestCount = probeRequests.length;
        const current = await apply({ enabled: true, materials: true, probes: true }, 'current');
        expect(current.busLighting.active).toBe(false);
        expect(probeRequests.length).toBe(requestCount);
        const restored = await apply({ enabled: true, materials: true, probes: true });
        expect(restored.busLighting.active).toBe(true);
    }
    for (let i = 0; i < 2; i++) {
        const off = await apply({ enabled: false, materials: true, probes: true });
        expect(off.busLighting.active).toBe(false); expect(off.status.effectiveMode).toBe('baked');
        expect(await page.evaluate(() => window.ai550Originals.every(v => v.mesh.material === v.material && v.mesh.geometry === v.geometry))).toBe(true);
        if (i === 0) await apply({ enabled: true, materials: true, probes: published });
    }
    await page.locator('canvas').first().screenshot({ path: `${root}/pose_01-restored.png` });
    await writeFile(`${root}/lifecycle.json`, JSON.stringify({ published, results, probeRequests, errors }, null, 2));
    expect(errors).toEqual([]);
});
