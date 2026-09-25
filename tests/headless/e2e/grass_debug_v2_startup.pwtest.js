// Keeps partial scene cleanup from hiding the original startup failure.
import test, { expect } from '@playwright/test';

test('Grass Debug v2 cleans up partially initialized scene content', async ({ page }) => {
    await page.route('**/grass-startup-check', route => route.fulfill({
        contentType: 'text/html',
        body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>'
    }));
    await page.goto('/grass-startup-check');
    const results = await page.evaluate(async () => {
        const THREE = await import('three');
        const { GrassDebugV2View } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2View.js');
        return [undefined, {}, { road: { materials: {} } }].map(content => {
            const disposed = [];
            const scene = new THREE.Scene();
            const geometry = new THREE.PlaneGeometry();
            const material = new THREE.MeshStandardMaterial();
            const texture = new THREE.Texture();
            material.map = texture;
            scene.add(new THREE.Mesh(geometry, material));
            for (const [name, resource] of Object.entries({ geometry, material, texture })) resource.addEventListener('dispose', () => disposed.push(name));
            GrassDebugV2View.prototype.destroy.call({
                content, scene,
                renderer: { setAnimationLoop() {}, dispose() { disposed.push('renderer'); } },
                _resizeObserver: { disconnect() {} },
                lighting: { dispose() {} },
                perfBar: { setDebugPoseProvider() {} }
            });
            return { disposed: disposed.sort(), children: scene.children.length };
        });
    });
    for (const result of results) expect(result).toEqual({ disposed: ['geometry', 'material', 'renderer', 'texture'], children: 0 });
});

test('Grass Debug v2 starts with stale pre-Land scene and catalog responses available', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/GrassDebugV2Scene.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(
            'return { ground: land.ground, land, road, bus, trees };',
            'return { ground: land.ground, road, bus, trees };'
        ) });
    });
    await page.route('**/assets/public/pbr/_catalog_index.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text())
            .replace(/^import forestGround06.*\r?\n/m, '')
            .replace(/^    forestGround06,\r?\n/m, '')
            .replace(/^import brownMud .*\r?\n/m, '')
            .replace(/^    brownMud,\r?\n/m, '')
        });
    });
    await page.goto('/debug_tools/grass_debug_v2.html');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await page.getByRole('button', { name: 'Forest Soil', exact: true }).click();
    const snapshot = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(snapshot.ready).toBe(true);
    expect(snapshot.land.materialId).toBe('pbr.forest_ground_06');
    expect(snapshot.groundTextureReady).toBe(true);
    await page.getByRole('button', { name: 'Brown Earth', exact: true }).click();
    const earth = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(earth.land.materialId).toBe('pbr.brown_mud');
    expect(earth.land.tileMeters).toBe(1.3);
    expect(earth.groundTextureReady).toBe(true);
    await expect(page.getByRole('button', { name: 'Brown Earth', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
});
