// Compare the 4K LOD3-10 source with its top texture, including bright leaf detail.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.use({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('4K texture retains LOD3-10 silhouettes and bright leaf variation', async ({ page }) => {
    test.setTimeout(180000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/lod10_texture');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const metrics = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy;
        s.setMode('refined'); s.setSquareBounds(false);
        const canvas = document.createElement('canvas'), renderer = s.renderer;
        canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
        const context = canvas.getContext('2d', { willReadFrequently: true }), point = new THREE.Vector3();
        const poses = [], heading = Math.atan2(s.lighting.sunRef.direction.x, s.lighting.sunRef.direction.z);
        for (const elevation of [45, 85]) for (const turn of [0, 180]) {
            const angle = heading + turn * Math.PI / 180, pitch = elevation * Math.PI / 180, row = { elevation, turn };
            for (const [name, z] of [['leaves', 0], ['texture', -1.3]]) {
                const y = name === 'texture' ? s.comparison.volume.surfaceHeight : 0.04;
                s.controls.target.set(0, y, z);
                s.camera.position.set(Math.sin(angle) * 1.8 * Math.cos(pitch), y + 1.8 * Math.sin(pitch), z + Math.cos(angle) * 1.8 * Math.cos(pitch));
                s.controls.update(); s.lighting.render(0); context.drawImage(renderer.domElement, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data, values = [];
                for (let a = 0; a < 100; a++) for (let b = 0; b < 100; b++) {
                    point.set(-0.35 + 0.7 * a / 99, y, z - 0.35 + 0.7 * b / 99).project(s.camera);
                    const x = Math.floor((point.x * 0.5 + 0.5) * canvas.width), py = Math.floor((-point.y * 0.5 + 0.5) * canvas.height);
                    const i = (py * canvas.width + x) * 4, r = pixels[i], g = pixels[i + 1], blue = pixels[i + 2];
                    if (g > r * 1.25 && g > blue * 1.25) values.push(g);
                }
                values.sort((a, b) => a - b);
                row[name] = { coverage: values.length / 10000, p10: values[Math.floor(values.length * 0.1)], p50: values[Math.floor(values.length * 0.5)],
                    p90: values[Math.floor(values.length * 0.9)], mean: values.reduce((sum, value) => sum + value, 0) / values.length };
            }
            poses.push(row);
        }
        const { createGrassDebugV2FloorBake } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FloorBake.js');
        const map = new THREE.DataTexture(new Uint8Array([26,89,13,0, 26,89,13,0, 26,89,13,255, 26,89,13,255]), 4, 1);
        const normalMap = new THREE.DataTexture(new Uint8Array([218,218,128,255]), 1, 1);
        map.needsUpdate = normalMap.needsUpdate = true;
        const material = new THREE.MeshStandardMaterial({map, normalMap, normalMapType: THREE.ObjectSpaceNormalMap, roughness: 0.5,
            alphaTest: 0.15, alphaToCoverage: true, side: THREE.DoubleSide});
        const geometry = new THREE.PlaneGeometry(0.4, 0.4); geometry.rotateX(-Math.PI / 2);
        const source = new THREE.Group(), mesh = new THREE.InstancedMesh(geometry, material, 1);
        mesh.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.05, 0),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(2, 1, 1)));
        source.add(mesh);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({color: 0x806040}));
        ground.rotation.x = -Math.PI / 2; ground.updateMatrixWorld(true);
        const bake = await createGrassDebugV2FloorBake({renderer, source, ground, resolution: 256});
        const pixels = Object.fromEntries(['albedo', 'normal', 'roughness'].map(name => [name, bake.readPixels(name)]));
        const sample = z => {
            const offset = (Math.floor((0.5 - z) * 256) * 256 + 128) * 4;
            return Object.fromEntries(Object.entries(pixels).map(([name, data]) => [name, Array.from(data.slice(offset, offset + 4))]));
        };
        const fixture = { leaf: sample(-0.15), gap: sample(0.15) };
        bake.dispose(); mesh.dispose(); geometry.dispose(); material.dispose(); map.dispose(); normalMap.dispose(); ground.geometry.dispose(); ground.material.dispose();
        return { bake: s.comparison.getSnapshot().bake, side: s.comparison.volume.bake.getSnapshot(), poses, fixture };
    });
    const prefix = process.env.GRASS_LOD10_CAPTURE || 'after';
    await writeFile(path.join(folder, prefix + '.json'), JSON.stringify({ metrics, errors }, null, 2));
    await page.addStyleTag({content: '.plant-study-panel, .grass-authoring-dock, .grass-comparison-label, .grass-patch-distance {display:none!important;}'});
    for (const [name, position] of [['top', [0, 4.2, -0.64]], ['angle', [1.5, 2.6, 1.5]]]) {
        await page.evaluate(position => {
            const s = window.__plantCardsStudy;
            s.camera.position.set(...position); s.controls.target.set(0, 0.02, -0.65); s.controls.update(); s.lighting.render(0);
        }, position);
        await page.screenshot({path: path.join(folder, prefix + '-' + name + '.png')});
    }
    await page.evaluate(() => {
        const s = window.__plantCardsStudy, c = s.comparison;
        c.group.visible = false;
        const tile = c.tiles[0].clone(); tile.position.set(1.3, c.volume.surfaceHeight, 0); s.scene.add(tile);
        for (const original of c.volume.walls.slice(0, 4)) {
            const wall = original.clone(); wall.position.x += 1.3; wall.position.z += 1.3; s.scene.add(wall);
        }
        s.renderer.shadowMap.needsUpdate = true; s.lighting.sun.shadow.needsUpdate = true;
    });
    for (const [name, position] of [['4k-pair-top', [0.65, 3.4, 0.001]], ['4k-pair-angle', [0.65, 2.7, 2.2]]]) {
        await page.evaluate(position => {
            const s = window.__plantCardsStudy;
            s.camera.position.set(...position); s.controls.target.set(0.65, 0.035, 0); s.controls.update(); s.lighting.render(0);
        }, position);
        await page.screenshot({path: path.join(folder, prefix + '-' + name + '.png')});
    }
    expect(metrics.bake.periodic.originalInstances).toBe(4000);
    expect(metrics.bake).toMatchObject({ sourceLod: 'LOD3 · 10', sourceTriangles: 80000, leafHeightBaked: true });
    for (const pose of metrics.poses) {
        expect(pose.texture.coverage).toBeGreaterThan(0.45);
        expect(pose.texture.coverage).toBeLessThan(0.85);
        expect(Math.abs(pose.texture.p90 - pose.leaves.p90), 'Bright leaf detail at ' + pose.elevation + '/' + pose.turn).toBeLessThan(16);
        expect(pose.texture.p90 - pose.texture.p10).toBeGreaterThanOrEqual(Math.floor((pose.leaves.p90 - pose.leaves.p10) * 0.85));
        expect(Math.abs(pose.texture.mean / pose.leaves.mean - 1)).toBeLessThan(0.12);
    }
    expect(metrics.fixture.leaf.normal[3]).toBe(255);
    expect(metrics.fixture.gap.normal[3]).toBe(0);
    [129, 185, 242].forEach((value, i) => expect(Math.abs(metrics.fixture.leaf.normal[i] - value)).toBeLessThanOrEqual(2));
    [26, 89, 13].forEach((value, i) => expect(Math.abs(metrics.fixture.leaf.albedo[i] - value)).toBeLessThanOrEqual(1));
    expect(metrics.fixture.leaf.albedo[3]).toBe(255);
    expect(metrics.fixture.gap.albedo[3]).toBe(0);
    expect(Math.abs(metrics.fixture.leaf.roughness[1] - 128)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
});
