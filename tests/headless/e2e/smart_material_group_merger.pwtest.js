// Generic grouped-material consolidation: structural, dynamic, visual, and
// direct-render draw-call coverage.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREEN_DIR = path.resolve(__dirname, '../../artifacts/screens/smart_material_merger');

async function bootHarness(page) {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    await page.evaluate(async () => {
        await window.__testHooks.loadScenario('empty', { seed: 'smart-material-groups' });
        window.__testHooks.setViewport(960, 540);
    });
}

test('Smart material-group merger is generic and preserves traffic-control rendering', async ({ page }) => {
    test.setTimeout(180_000);
    const consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error?.message ?? String(error)));
    await bootHarness(page);
    await fs.mkdir(SCREEN_DIR, { recursive: true });

    const setup = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createTrafficControlProps } = await import('/src/graphics/visuals/city/TrafficControlProps.js');
        const { mergeCompatibleMaterialGroups } = await import('/src/graphics/engine3d/procedural_meshes/SmartMaterialGroupMerger.js');
        const placements = [
            { kind: 'stop_sign', position: { x: -1.3, y: 0, z: 0 }, rotationY: 0, scale: 1 },
            { kind: 'traffic_light', position: { x: 1.2, y: 0, z: 0 }, rotationY: 0, scale: 1, armLength: 2.4 }
        ];
        const source = createTrafficControlProps({ placements, mergeMaterialGroups: false });
        const merged = createTrafficControlProps({ placements, mergeMaterialGroups: true });

        const sourceMeshes = [];
        const mergedMeshes = [];
        source.group.traverse((object) => { if (object.isMesh) sourceMeshes.push(object); });
        merged.group.traverse((object) => { if (object.isMesh) mergedMeshes.push(object); });

        const triangles = (meshes) => meshes.reduce((sum, mesh) => {
            const geometry = mesh.geometry;
            return sum + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
        }, 0);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x91b6c8);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x263345, 1.8));
        const sun = new THREE.DirectionalLight(0xffffff, 3.2);
        sun.position.set(5, 9, 8);
        scene.add(sun);
        const camera = new THREE.PerspectiveCamera(34, 960 / 540, 0.1, 100);
        camera.position.set(5.2, 3.25, 9.5);
        camera.lookAt(0.35, 1.45, 0);
        camera.updateMatrixWorld(true);

        const engine = window.__testHooks.getEngine();
        const renderer = engine.renderer;
        renderer.setSize(960, 540, false);
        const target = new THREE.WebGLRenderTarget(960, 540, {
            depthBuffer: true,
            stencilBuffer: false
        });

        const renderTarget = (root) => {
            scene.add(root);
            renderer.setRenderTarget(target);
            renderer.setClearColor(0x91b6c8, 1);
            renderer.clear(true, true, true);
            renderer.render(scene, camera);
            const calls = renderer.info.render.calls;
            const trianglesDrawn = renderer.info.render.triangles;
            const pixels = new Uint8Array(960 * 540 * 4);
            renderer.readRenderTargetPixels(target, 0, 0, 960, 540, pixels);
            renderer.setRenderTarget(null);
            scene.remove(root);
            return { calls, trianglesDrawn, pixels };
        };

        const sourceRender = renderTarget(source.group);
        const mergedRender = renderTarget(merged.group);
        let objectPixels = 0;
        let changedPixels = 0;
        let absoluteDifference = 0;
        let maxChannelDifference = 0;
        for (let index = 0; index < sourceRender.pixels.length; index += 4) {
            const sourceIsBackground = sourceRender.pixels[index] === 145
                && sourceRender.pixels[index + 1] === 182
                && sourceRender.pixels[index + 2] === 200;
            const mergedIsBackground = mergedRender.pixels[index] === 145
                && mergedRender.pixels[index + 1] === 182
                && mergedRender.pixels[index + 2] === 200;
            if (sourceIsBackground && mergedIsBackground) continue;
            objectPixels += 1;
            let pixelChanged = false;
            for (let channel = 0; channel < 3; channel += 1) {
                const difference = Math.abs(sourceRender.pixels[index + channel] - mergedRender.pixels[index + channel]);
                absoluteDifference += difference;
                maxChannelDifference = Math.max(maxChannelDifference, difference);
                if (difference > 3) pixelChanged = true;
            }
            if (pixelChanged) changedPixels += 1;
        }

        const trafficLight = mergedMeshes.find((mesh) => mesh.name === 'mesh.traffic_light.v1');
        const mergeState = trafficLight?.userData?.smartMaterialGroupMerge ?? null;
        trafficLight?.userData?.rig?.setValue?.('head.signal', 'green');
        mergeState?.sync?.();
        const surface = trafficLight?.geometry?.getAttribute?.('smartMaterialSurface') ?? null;
        const lightIntensities = {};
        if (surface && mergeState) {
            for (const slot of [4, 5, 6]) {
                const vertex = mergeState.vertexMaterialSlots.findIndex((materialSlot) => materialSlot === slot);
                lightIntensities[slot] = vertex >= 0 ? surface.getZ(vertex) : null;
            }
        }

        const genericGeometry = new THREE.BoxGeometry(1, 1, 1);
        for (let groupIndex = 0; groupIndex < genericGeometry.groups.length; groupIndex += 1) {
            genericGeometry.groups[groupIndex].materialIndex = groupIndex % 2;
        }
        const genericMesh = new THREE.Mesh(genericGeometry, [
            new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 }),
            new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.8 })
        ]);
        const genericMerge = mergeCompatibleMaterialGroups(genericMesh);

        const renderCanvas = (which) => {
            const root = which === 'source' ? source.group : merged.group;
            scene.add(root);
            renderer.setRenderTarget(null);
            renderer.setClearColor(0x91b6c8, 1);
            renderer.clear(true, true, true);
            renderer.render(scene, camera);
            scene.remove(root);
        };
        window.__smartMaterialGroupVisual = { renderCanvas };

        return {
            sourceTriangles: triangles(sourceMeshes),
            mergedTriangles: triangles(mergedMeshes),
            sourceCalls: sourceRender.calls,
            mergedCalls: mergedRender.calls,
            sourceDrawnTriangles: sourceRender.trianglesDrawn,
            mergedDrawnTriangles: mergedRender.trianglesDrawn,
            sourceMaterialCounts: sourceMeshes.map((mesh) => Array.isArray(mesh.material) ? mesh.material.length : 1),
            mergedMaterialCounts: mergedMeshes.map((mesh) => Array.isArray(mesh.material) ? mesh.material.length : 1),
            mergedGroupCounts: mergedMeshes.map((mesh) => mesh.geometry.groups.length),
            mergeStats: merged.materialGroupMerge,
            genericMerge: {
                merged: genericMerge.merged,
                reason: genericMerge.reason
            },
            lightIntensities,
            visual: {
                objectPixels,
                changedPixels,
                changedPercent: objectPixels ? changedPixels / objectPixels * 100 : 100,
                meanAbsoluteDifference: objectPixels ? absoluteDifference / (objectPixels * 3) : 255,
                maxChannelDifference
            }
        };
    });

    await page.evaluate(() => window.__smartMaterialGroupVisual.renderCanvas('source'));
    await page.locator('#harness-canvas').screenshot({ path: path.join(SCREEN_DIR, 'traffic_controls_before.png') });
    await page.evaluate(() => window.__smartMaterialGroupVisual.renderCanvas('merged'));
    await page.locator('#harness-canvas').screenshot({ path: path.join(SCREEN_DIR, 'traffic_controls_after.png') });
    await fs.writeFile(
        path.join(SCREEN_DIR, 'result.json'),
        `${JSON.stringify(setup, null, 2)}\n`,
        'utf8'
    );

    expect(setup.genericMerge, JSON.stringify(setup.genericMerge)).toMatchObject({ merged: true, reason: 'merged' });
    expect(setup.sourceMaterialCounts).toEqual([4, 7]);
    expect(setup.mergedMaterialCounts).toEqual([1, 1]);
    expect(setup.mergedGroupCounts).toEqual([0, 0]);
    expect(setup.mergeStats.merged).toBe(2);
    expect(setup.sourceTriangles).toBe(setup.mergedTriangles);
    expect(setup.sourceDrawnTriangles).toBe(setup.mergedDrawnTriangles);
    expect(setup.sourceCalls).toBe(11);
    expect(setup.mergedCalls).toBe(2);
    expect(setup.lightIntensities[4]).toBe(0);
    expect(setup.lightIntensities[5]).toBe(0);
    expect(setup.lightIntensities[6]).toBeGreaterThan(1);
    expect(setup.visual.objectPixels).toBeGreaterThan(1000);
    expect(setup.visual.meanAbsoluteDifference).toBeLessThan(2.0);
    expect(setup.visual.changedPercent).toBeLessThan(8.0);
    expect(consoleErrors).toEqual([]);
});
