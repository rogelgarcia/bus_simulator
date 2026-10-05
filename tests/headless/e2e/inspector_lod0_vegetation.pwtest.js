// Exercises every installed LOD0 form through the game catalog and verifies actual compressed GPU materials.
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { expect } from '@playwright/test';
import { URBAN_VEGETATION_LOD0_SPECIES } from '../../../src/graphics/content3d/catalogs/TreeMeshCatalog.js';

const output = path.resolve('tests/artifacts/screens/ai592_lod0_catalog');
const manifest = JSON.parse(await fs.readFile('assets/public/vegetation_lod0/index.json', 'utf8'));

for (const definition of URBAN_VEGETATION_LOD0_SPECIES) {
    test(`Inspector LOD0: ${definition.id}, all three mature forms`, async ({ page }) => {
        test.setTimeout(120_000);
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('request', request => requests.push(request.url()));
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.addInitScript(definition => localStorage.setItem('bus_sim.inspector_room.v1', JSON.stringify({
            mode: 'meshes', meshes: { collectionId: definition.collectionId, itemId: `tree.lod0.${definition.id}.mature_01` }
        })), definition);
        await page.goto('/index.html?screen=inspector_room&bloom=0&grade=off&ao=off&coreTests=0');
        await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'inspector_room');
        await page.waitForFunction(() => window.__busSim.engine.scene.environment?.isTexture);
        const rows = [];
        await fs.mkdir(output, { recursive: true });
        for (let index = 0; index < 3; index++) {
            const variant = `mature_0${index + 1}`;
            await page.evaluate(async ({ species, variant }) => {
                const provider = window.__busSim.sm.current.view.meshes;
                window.__busSim.sm.current.view._setItem(`tree.lod0.${species}.${variant}`);
                await provider.whenSelectedMeshReady();
            }, { species: definition.id, variant });
            await page.waitForFunction(() => {
                const view = window.__busSim.sm.current.view;
                return view.meshes.getSelectedMeshMeta()?.loading === false
                    && view.meshes.getMeasurementObject3d().userData._meshInspectorNeedsFocusRefresh === false
                    && !view.room._cameraTween;
            });
            const result = await page.evaluate(async ({ species, index }) => {
                const THREE = await import('three');
                const { loadUrbanVegetationLod0 } = await import('/src/graphics/engine3d/vegetation/UrbanVegetationLod0Loader.js');
                const { engine, sm } = window.__busSim;
                const provider = sm.current.view.meshes;
                const library = await loadUrbanVegetationLod0({ species, renderer: engine.renderer });
                provider.setColorMode('solid');
                provider.setColorMode('semantic');
                const root = provider.getMeasurementObject3d();
                const bounds = new THREE.Box3().setFromObject(root);
                const leaf = provider._asset.materials.semantic.leaf;
                const trunk = provider._asset.materials.semantic.trunk;
                let wood = 0, foliage = 0;
                root.traverse(mesh => {
                    if (!mesh.isMesh) return;
                    const count = mesh.geometry.index.count / 3;
                    if (mesh.material.userData.isFoliage) foliage += count;
                    else wood += count;
                });
                return {
                    selected: provider.getSelectedMeshMeta(), wood, foliage,
                    height: bounds.max.y - bounds.min.y,
                    authoredHeight: library.templates[index].userData.treeHeight,
                    scale: root.children[0].scale.toArray(),
                    metrics: library.templates[index].userData.treeMetrics,
                    sharedCanopy: library.materialsByVariant.every(materials => materials.leaf === library.materialsByVariant[0].leaf),
                    distinctWood: new Set(library.materialsByVariant.map(materials => materials.trunk.map.uuid)).size,
                    correctWood: trunk.map === library.materialsByVariant[index].trunk.map,
                    leaf: { side: leaf.side, shadowSide: leaf.shadowSide, alphaTest: leaf.alphaTest, transparent: leaf.transparent,
                        transmission: leaf.userData.leafDiffuseTransmission, hooked: leaf.customProgramCacheKey().includes('vegetation.leaf_transmission') },
                    maps: [leaf, trunk].flatMap(material => [material.map, material.normalMap, material.roughnessMap].map(texture => ({
                        compressed: texture.isCompressedTexture, format: texture.format, width: texture.image.width, height: texture.image.height,
                        mips: texture.mipmaps.length, colorSpace: texture.colorSpace
                    })))
                };
            }, { species: definition.id, index });
            const expected = manifest.models.find(row => row.id === `${definition.folder}/${variant}`);
            expect(result.selected).toMatchObject({ id: `tree.lod0.${definition.id}.${variant}`, loading: false, error: null });
            expect(result.wood).toBe(expected.woodTriangles);
            expect(result.foliage).toBe(expected.leafTriangles);
            expect(result.metrics.drawCalls).toBe(3);
            expect(result.scale).toEqual([1, 1, 1]);
            expect(result.height).toBeCloseTo(result.authoredHeight, 5);
            expect(result.sharedCanopy).toBe(true);
            expect(result.distinctWood).toBe(3);
            expect(result.correctWood).toBe(true);
            expect(result.leaf).toEqual({ side: 2, shadowSide: 2, alphaTest: 0.5, transparent: false, transmission: 0.17, hooked: true });
            for (const [mapIndex, map] of result.maps.entries()) {
                expect(map.compressed).toBe(true);
                expect(map.format).not.toBe(1023);
                expect([map.width, map.height]).toEqual(mapIndex < 3 ? [4096, 3072] : [2048, 2048]);
                expect(map.mips).toBeGreaterThan(1);
                expect(map.colorSpace).toBe(mapIndex % 3 === 0 ? 'srgb' : 'srgb-linear');
            }
            rows.push(result);
            await page.screenshot({ path: path.join(output, `${definition.folder}_${variant}.png`) });
        }
        expect(requests.filter(url => /\/assets\/(trees|public\/vegetation)\//.test(url))).toEqual([]);
        const canopyRequests = requests.filter(url => url.includes(`/vegetation_lod0/${definition.folder}/textures/canopy/`));
        expect(canopyRequests).toHaveLength(3);
        expect(errors).toEqual([]);
        await fs.writeFile(path.join(output, `${definition.folder}.json`), JSON.stringify(rows, null, 2));
    });
}

test('Leaf transmission renders both faces, responds to backlighting and respects a blocked light', async ({ page }) => {
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { bindVegetationLeafTransmission } = await import('/src/graphics/engine3d/vegetation/VegetationLeafMaterial.js');
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(32, 32);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.BasicShadowMap;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
        camera.position.z = 3;
        const material = new THREE.MeshStandardMaterial({ color: 0x558822, roughness: 1, side: THREE.DoubleSide });
        bindVegetationLeafTransmission(material, 0);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        plane.receiveShadow = true;
        scene.add(plane);
        const light = new THREE.DirectionalLight(0xffffff, 2);
        light.position.z = -3;
        light.castShadow = true;
        light.shadow.normalBias = 0;
        light.shadow.camera.left = light.shadow.camera.bottom = -2;
        light.shadow.camera.right = light.shadow.camera.top = 2;
        scene.add(light);
        const target = new THREE.WebGLRenderTarget(32, 32);
        const pixel = new Uint8Array(4);
        const sample = () => {
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
            return pixel[1];
        };
        const opaque = sample();
        bindVegetationLeafTransmission(material, 0.17);
        const transmitted = sample();
        plane.rotation.y = Math.PI;
        const reverseFace = sample();
        const blocker = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        blocker.position.z = -1;
        blocker.castShadow = true;
        scene.add(blocker);
        const shadowed = sample();
        target.dispose(); plane.geometry.dispose(); material.dispose(); blocker.geometry.dispose(); blocker.material.dispose(); renderer.dispose();
        return { opaque, transmitted, reverseFace, shadowed };
    });
    expect(result.transmitted).toBeGreaterThan(result.opaque + 5);
    expect(result.reverseFace).toBeCloseTo(result.transmitted, 0);
    expect(result.shadowed).toBeLessThan(result.transmitted / 2);
    expect(errors).toEqual([]);
});
