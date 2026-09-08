// Verifies selective HDRI response without changing authored diffuse light or material ownership.
import test, { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const config = await readFile('tools/baking/blender.local.json', 'utf8').then(JSON.parse).catch(() => ({}));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video: 'off', trace: 'off' });

test('Bus reflections: Phong and PBR preserve diffuse/direct light, isolate categories and restore shared originals', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /shader|program|WebGL/i.test(m.text())) errors.push(m.text()); });
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { BusMaterialVariants } = await import('/src/graphics/illumination/diffuse_probes/BusMaterialVariants.js');
        const renderer = new THREE.WebGLRenderer(); renderer.setSize(64, 64);
        const pmrem = new THREE.PMREMGenerator(renderer), environment = new THREE.Scene();
        environment.background = new THREE.Color(1, 1, 1);
        const env = pmrem.fromScene(environment);
        const scene = new THREE.Scene(), root = new THREE.Group(), camera = new THREE.PerspectiveCamera(50, 1, .1, 100);
        camera.position.z = 5; scene.add(root);
        const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.z = 5; scene.add(sun, new THREE.HemisphereLight(0xffffff, 0xffffff, 1));
        const geometry = new THREE.PlaneGeometry(4, 4), all = [];
        for (const name of ['paint', 'glass', 'rimmetal', 'glossy', 'plastic', 'frontlights', 'tire', 'mirror', 'bus_body']) {
            const Material = name === 'bus_body' ? THREE.MeshStandardMaterial : THREE.MeshPhongMaterial;
            const material = new Material({ color: 0x666666 }); material.name = name;
            material.envMap = env.texture; material.envMapIntensity = .28;
            const mesh = new THREE.Mesh(geometry, material); mesh.visible = false; root.add(mesh); all.push({ mesh, material });
        }
        const outside = new THREE.Mesh(geometry, all[0].material); outside.visible = false; scene.add(outside);
        const engine = { scene, context: {}, lightingSettings: { ibl: { enabled: true, envMapIntensity: .28 } },
            getDynamicIlluminationObjects: () => [{ id: 'vehicle.fixture', root }] };
        const variants = new BusMaterialVariants(engine), base = { enabled: false, materials: true, probes: true,
            glassReflections: false, bodyReflections: false, rimShine: false };
        const target = new THREE.WebGLRenderTarget(64, 64, { type: THREE.FloatType });
        const pixel = mesh => {
            mesh.visible = true; renderer.setRenderTarget(target); renderer.render(scene, camera);
            const p = new Float32Array(4); renderer.readRenderTargetPixels(target, 32, 32, 1, 1, p); mesh.visible = false; return p[0];
        };
        const original = all.map(o => pixel(o.mesh));
        variants.configure({ ...base, glassReflections: true });
        const glassOnly = all.map(o => o.mesh.material !== o.material);
        const glassPixel = pixel(all[1].mesh);
        variants.configure({ ...base, bodyReflections: true });
        const bodyOnly = all.map(o => o.mesh.material !== o.material);
        const rows = [];
        variants.configure({ ...base, glassReflections: true, bodyReflections: true, rimShine: true });
        for (const i of [0, 1, 2, 8]) {
            const { mesh, material } = all[i], variant = mesh.material;
            const reflected = pixel(mesh);
            variant.envMap = null; variant.needsUpdate = true;
            const directAfter = pixel(mesh);
            mesh.material = material; material.envMap = null; material.needsUpdate = true;
            const directBefore = pixel(mesh);
            material.envMap = env.texture; material.needsUpdate = true;
            variant.envMap = env.texture; variant.needsUpdate = true; mesh.material = variant;
            rows.push({ name: material.name, original: original[i], reflected, directBefore, directAfter,
                preserved: variant.color.equals(material.color) && variant.type === material.type && variant.opacity === material.opacity });
        }
        const untouched = all.slice(3, 8).every(o => o.mesh.material === o.material) && outside.material === all[0].material;
        const count = variants.getDiagnostics().cachedVariants;
        for (let i = 0; i < 3; i++) {
            variants.configure(base); variants.configure({ ...base, glassReflections: true, bodyReflections: true, rimShine: true });
        }
        const bounded = count === variants.getDiagnostics().cachedVariants;
        variants.configure(base);
        const restored = all.every(o => o.mesh.material === o.material);
        variants.dispose(); all.forEach(o => o.material.dispose()); geometry.dispose(); target.dispose(); env.dispose(); pmrem.dispose(); renderer.dispose();
        return { glassOnly, bodyOnly, glassPixel, rows, untouched, restored, bounded };
    });
    expect(result.glassOnly).toEqual([false, true, false, false, false, false, false, false, false]);
    expect(result.bodyOnly).toEqual([true, false, false, false, false, false, false, false, true]);
    for (const row of result.rows) {
        expect(row.preserved, row.name).toBe(true);
        expect(row.reflected, row.name).toBeGreaterThan(row.original);
        expect(Math.abs(row.directBefore - row.directAfter), row.name).toBeLessThan(.0001);
    }
    expect(result.untouched).toBe(true); expect(result.restored).toBe(true); expect(result.bounded).toBe(true); expect(errors).toEqual([]);
});

test('Bus reflection controls save independent intent without enabling the diffuse experiment', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const { OptionsUI } = await import('/src/graphics/gui/options/OptionsUI.js');
        const settings = await import('/src/app/illumination/runtime/index.js');
        let saved;
        const ui = new OptionsUI({ initialTab: 'baked_lighting', onSave: draft => {
            settings.saveBakedLightingSettings(draft.bakedLighting); saved = settings.getResolvedBakedLightingSettings();
        } }); ui.mount();
        const click = label => ui.root.querySelector(`[aria-label="${label}"]`).click();
        click('Glass reflections'); const glass = ui.getDraft().bakedLighting.bus;
        click('Body reflections'); click('Glass reflections'); click('Rim shine');
        ui.saveBtn.click(); const draft = ui.getDraft().bakedLighting.bus;
        ui.resetBtn.click(); const reset = ui.getDraft().bakedLighting.bus;
        ui.unmount(); return { glass, draft, saved: saved.bus, reset };
    });
    expect(result.glass).toMatchObject({ enabled: false, glassReflections: true, bodyReflections: false });
    expect(result.draft).toMatchObject({ enabled: false, glassReflections: false, bodyReflections: true, rimShine: true });
    expect(result.saved).toEqual(result.draft);
    expect(result.reset).toMatchObject({ enabled: false, glassReflections: false, bodyReflections: false, rimShine: false });
});
