// Captures the authored bus appearance and selective global-HDRI controls in the real baked city.
import test, { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('tools/baking/blender.local.json', 'utf8'));
const poses = JSON.parse(await readFile('tests/fixtures/lighting/ai550_camera_poses.json', 'utf8'));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video: 'off', trace: 'off' });
const root = 'tests/artifacts/screens/bus_reflection_recalibration';
const warm = async page => page.evaluate(() => new Promise(resolve => {
    let n = 0; const frame = () => ++n > 60 ? resolve() : requestAnimationFrame(frame); requestAnimationFrame(frame);
}));

test('Bus reflections: compare independent controls and inspect the roof in the baked city', async ({ page }) => {
    test.setTimeout(1200_000); await mkdir(root, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors = [], requests = [], records = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /shader|program|WebGL/i.test(m.text())) errors.push(m.text().slice(0, 1600)); });
    page.on('request', r => { if (r.url().includes('/diffuse_probes/') && r.url().includes('/assets/')) requests.push(r.url()); });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ mode: 'auto',
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { indirect: true }, bus: { enabled: false } })));
    await page.goto('/?coreTests=0&gameplayPose=' + encodeURIComponent(JSON.stringify(poses.poses[0].pose)));
    await page.waitForFunction(() => window.__busSim?.sm?.current?.busAnchor, null, { timeout: 90_000 });
    await page.evaluate(async () => {
        const { sm } = window.__busSim; await sm.current.busModel.userData.readyPromise;
        window.reflectionOriginals = [];
        sm.current.busModel.traverse(o => { if (o.isMesh) window.reflectionOriginals.push({ mesh: o, material: o.material }); });
    });
    await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().status.effectiveMode), { timeout: 240_000 }).toBe('baked');
    async function capture(name) {
        await warm(page);
        const value = await page.evaluate(async () => {
            const { engine: e, sm } = window.__busSim, gpu = [];
            await new Promise(resolve => { let n = 0; function frame() {
                const ms = e._gpuFrameTimer?.getLastMs(); if (Number.isFinite(ms)) gpu.push(ms);
                if (++n >= 90) resolve(); else requestAnimationFrame(frame);
            } requestAnimationFrame(frame); });
            gpu.sort((a, b) => a - b);
            const d = e.getBakedLightingDebugInfo(), materials = new Map();
            sm.current.busModel.traverse(o => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.set(m.uuid,
                { name: m.name, type: m.type, color: m.color?.toArray(), metalness: m.metalness, roughness: m.roughness, specularIntensity: m.specularIntensity }); });
            return { status: d.status, bus: d.settings.bus, busLighting: d.busLighting,
                gpuMedian: gpu[Math.floor(gpu.length / 2)], render: { ...e.renderer.info.render }, materials: [...materials.values()] };
        });
        records.push({ name, ...value });
        await page.locator('canvas').first().screenshot({ path: `${root}/${name}.png` });
        await writeFile(`${root}/measurements.json`, JSON.stringify({ records, requests, errors }, null, 2));
        console.log(`[Bus reflections] ${name}: ${value.status.effectiveMode}, GPU ${value.gpuMedian?.toFixed(2)} ms`);
    }
    async function apply(bus) {
        await page.evaluate(async bus => { const e = window.__busSim.engine;
            await e.setBakedLightingSettings({ ...e.bakedLightingSettings, bus });
        }, bus);
        await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().status.effectiveMode), { timeout: 240_000 }).toBe('baked');
    }
    await capture('original');
    for (const key of ['glassReflections', 'bodyReflections', 'rimShine']) {
        await apply({ enabled: false, [key]: true }); await capture(key);
    }
    await apply({ enabled: false, glassReflections: true, bodyReflections: true, rimShine: true }); await capture('combined');
    expect(records.every(r => r.status.effectiveMode === 'baked')).toBe(true);
    expect(records.every(r => r.busLighting.residentGpuBytes === 0)).toBe(true);
    await apply({ enabled: false }); await capture('restored');
    expect(await page.evaluate(() => window.reflectionOriginals.every(o => o.mesh.material === o.material))).toBe(true);
    await page.evaluate(async () => {
        const THREE = await import('three'), { engine: e, sm } = window.__busSim;
        const b = new THREE.Box3().setFromObject(sm.current.busModel), center = b.getCenter(new THREE.Vector3());
        e.camera.position.copy(center).add(new THREE.Vector3(-6, 14, 10)); e.camera.lookAt(center); e.camera.updateMatrixWorld(true);
        sm.current._gameplayPose = structuredClone(sm.current._gameplayPose);
        sm.current._gameplayPose.camera.position = e.camera.position.toJSON ? e.camera.position.toJSON() : { x: e.camera.position.x, y: e.camera.position.y, z: e.camera.position.z };
        sm.current._gameplayPose.camera.quaternion = { x: e.camera.quaternion.x, y: e.camera.quaternion.y, z: e.camera.quaternion.z, w: e.camera.quaternion.w };
        sm.current._configureGameplayPoseCamera();
    });
    await capture('roof-original');
    await apply({ enabled: true, materials: true, probes: false }); await capture('roof-experimental');
    const roof = await page.evaluate(async () => {
        const THREE = await import('three'), { sm } = window.__busSim;
        const root = sm.current.busModel; root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root), down = new THREE.Vector3(0, -1, 0), ray = new THREE.Raycaster();
        const samples = [];
        for (let x = box.min.x; x <= box.max.x; x += .2) for (let z = box.min.z; z <= box.max.z; z += .2) {
            ray.set(new THREE.Vector3(x, box.max.y + 1, z), down);
            const hits = ray.intersectObject(root, true);
            if (hits[0]?.point.y < box.max.y - .2 || !hits.length) continue;
            const near = hits.filter(h => Math.abs(h.point.y - hits[0].point.y) < .01);
            if (near.length > 1) samples.push({ x, z, hits: near.map(h => ({ name: h.object.name, face: h.faceIndex,
                y: h.point.y, normal: h.face.normal.toArray(), material: (Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material).name })) });
        }
        return { box: { min: box.min.toArray(), max: box.max.toArray() }, samples };
    });
    await writeFile(`${root}/roof-geometry.json`, JSON.stringify(roof, null, 2));
    await page.evaluate(() => {
        const { engine: e, sm } = window.__busSim; e.stop();
        window.roofMaterials = new Map(); sm.current.busModel.traverse(o => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!window.roofMaterials.has(m)) window.roofMaterials.set(m, { wireframe: m.wireframe }); m.wireframe = true;
        } }); e.start();
    });
    await capture('roof-wireframe');
    expect(requests).toEqual([]); expect(errors).toEqual([]);
});
