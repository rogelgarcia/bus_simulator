// Captures the actual Inspector with a fully loaded, correctly framed mature tree.
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { expect } from '@playwright/test';
import { URBAN_VEGETATION_SPECIES } from '../../../src/graphics/content3d/catalogs/TreeMeshCatalog.js';

const species = process.env.VEGETATION_INSPECTOR_SPECIES ?? 'silver-linden';
const definition = URBAN_VEGETATION_SPECIES.find(entry => entry.id === species);
if (!definition) throw new Error('Invalid Inspector vegetation species');

const outputTopic = process.env.VEGETATION_INSPECTOR_TOPIC ?? 'ai578_tree_trunks/final';
if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(outputTopic)) throw new Error('Invalid Inspector vegetation artifact topic');

test('Inspector: original mature tree retains physical size, ready maps, and front-face materials', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];
    const legacyRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/\/assets\/trees\//.test(request.url())) legacyRequests.push(request.url()); });
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.addInitScript(({ species, collectionId }) => localStorage.setItem('bus_sim.inspector_room.v1', JSON.stringify({
        mode: 'meshes',
        meshes: { collectionId, itemId: `tree.${species}.mature_01` }
    })), { species, collectionId: definition.collectionId });
    await page.goto('/index.html?screen=inspector_room&ibl=0&bloom=0&grade=off&ao=off&coreTests=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'inspector_room');
    await page.evaluate(() => window.__busSim.sm.current.view.meshes.whenSelectedMeshReady());
    await page.waitForFunction(() => {
        const view = window.__busSim.sm.current.view;
        return view.meshes.getSelectedMeshMeta()?.loading === false
            && view.meshes.getMeasurementObject3d().userData._meshInspectorNeedsFocusRefresh === false
            && !view.room._cameraTween;
    });
    const result = await page.evaluate(async species => {
        const THREE = await import('three');
        const { loadUrbanVegetation } = await import('/src/graphics/engine3d/vegetation/UrbanVegetationLoader.js');
        const { engine, sm } = window.__busSim;
        const provider = sm.current.view.meshes;
        const cached = await loadUrbanVegetation({ species });
        provider.setColorMode('solid');
        provider.setColorMode('semantic');
        const root = provider.getMeasurementObject3d();
        const bounds = new THREE.Box3().setFromObject(root);
        const textures = new Set();
        let leaf = null;
        let trunk = null;
        root.traverse(mesh => {
            if (!mesh.isMesh) return;
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                if (material.userData.isFoliage) leaf = material;
                else trunk = material;
                for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.userData.aoAlphaMap]) if (texture) textures.add(texture);
            }
        });
        engine.camera.updateMatrixWorld(true);
        const projectedCorners = [];
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
            projectedCorners.push(new THREE.Vector3(x, y, z).project(engine.camera).toArray());
        }
        return {
            selected: provider.getSelectedMeshMeta(),
            height: bounds.max.y - bounds.min.y,
            authoredHeight: cached.templates[0].userData.treeHeight,
            assetRevision: cached.assetRevision,
            geometryMetrics: cached.templates.map(template => template.userData.treeMetrics),
            barkTextures: { base: [trunk.map.image.width, trunk.map.image.height], normal: [trunk.normalMap.image.width, trunk.normalMap.image.height], roughness: [trunk.roughnessMap.image.width, trunk.roughnessMap.image.height] },
            modelScale: root.children[0].scale.toArray(),
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
            projectedCorners,
            textures: [...textures].map(texture => ({ name: texture.name, width: texture.image?.width, height: texture.image?.height })),
            roughnessMaterials: [leaf, trunk].map(material => ({
                roughnessMap: material.roughnessMap?.isTexture === true,
                metalnessMap: material.metalnessMap?.isTexture === true,
                roughnessColorSpace: material.roughnessMap?.colorSpace,
                metalnessColorSpace: material.metalnessMap?.colorSpace
            })),
            leaf: { side: leaf.side, shadowSide: leaf.shadowSide, alphaTest: leaf.alphaTest, alphaToCoverage: leaf.alphaToCoverage, preserveShadowSide: leaf.userData.preserveShadowSide, sharedCoverage: leaf.userData.aoAlphaMap === cached.materials.leaf.userData.aoAlphaMap }
        };
    }, species);
    expect(result.selected).toMatchObject({ id: `tree.${species}.mature_01`, loading: false, error: null });
    expect(result.height).toBeGreaterThan(10);
    expect(result.height).toBeCloseTo(result.authoredHeight, 5);
    expect(result.modelScale).toEqual([1, 1, 1]);
    expect(result.assetRevision).toBe(definition.assetRevision);
    expect(result.barkTextures).toEqual({ base: [2048, 2048], normal: [2048, 2048], roughness: [2048, 2048] });
    for (const corner of result.projectedCorners) {
        expect(Math.abs(corner[0])).toBeLessThan(1);
        expect(Math.abs(corner[1])).toBeLessThan(1);
        expect(corner[2]).toBeGreaterThan(-1);
        expect(corner[2]).toBeLessThan(1);
    }
    expect(result.textures).toHaveLength(7);
    for (const texture of result.textures) {
        expect(texture.width).toBeGreaterThan(0);
        expect(texture.height).toBeGreaterThan(0);
    }
    for (const material of result.roughnessMaterials) {
        expect(material).toEqual({ roughnessMap: true, metalnessMap: true, roughnessColorSpace: '', metalnessColorSpace: '' });
    }
    expect(result.leaf).toEqual({ side: 0, shadowSide: 0, alphaTest: 0, alphaToCoverage: false, preserveShadowSide: true, sharedCoverage: true });
    expect(legacyRequests).toEqual([]);
    expect(errors).toEqual([]);
    const output = path.resolve('tests/artifacts/screens', outputTopic, 'inspector');
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `${definition.folder}_mature_01.png`) });
    await fs.writeFile(path.join(output, `${definition.folder}_mature_01.json`), JSON.stringify(result, null, 2));
});
