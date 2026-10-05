// Mature urban vegetation imports, resource ownership, opaque leaf surfaces and structural variety.
import test, { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const SPECIES = process.env.VEGETATION_TEST_SPECIES?.split(',') ?? ['london-plane', 'silver-linden', 'northern-red-oak', 'arrowwood-viburnum', 'american-elm'];
const VARIANTS = ['mature_01', 'mature_02', 'mature_03'];
const REVISIONS = { 'london-plane': 6, 'silver-linden': 5, 'northern-red-oak': 5, 'arrowwood-viburnum': 6, 'american-elm': 1 };
// Front orthographic crown occupancy excludes bark, uses modeled leaf outlines and normalizes plant height.
// Broad floors preserve intentional gaps while rejecting the initial sparse crown distribution.
// Elm's reviewed wide crown measures 64.8%; retain that spread with a 64% regression floor.
const CROWN_OCCUPANCY_FLOORS = { 'london-plane': 0.65, 'silver-linden': 0.48, 'northern-red-oak': 0.63, 'arrowwood-viburnum': 0.62, 'american-elm': 0.64 };
const TOPIC = process.env.VEGETATION_ARTIFACT_TOPIC ?? 'ai582_solid_leaves';
if (!/^[a-z0-9_-]+$/.test(TOPIC)) throw new Error('Invalid vegetation artifact topic');

test('Urban vegetation: mature library assets load without quality tiers or legacy requests', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = [];
    const requests = [];
    const evidenceDirectory = path.resolve('tests/artifacts/screens', TOPIC, 'validation');
    await fs.mkdir(evidenceDirectory, { recursive: true });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    for (const species of SPECIES) {
        await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
        await page.waitForFunction(() => window.__testHooks?.version === 1);
        const result = await page.evaluate(async ({ species, variants }) => {
            const { loadUrbanVegetation } = await import('/src/graphics/engine3d/vegetation/UrbanVegetationLoader.js');
            const THREE = await import('three');
            const direct = await loadUrbanVegetation({ species });
            const cached = await loadUrbanVegetation({ species });
            const leafMap = direct.materials.leaf.map;
            const aoMap = direct.materials.leaf.userData.aoAlphaMap;
            const canvas = document.createElement('canvas');
            canvas.width = leafMap.image.width;
            canvas.height = leafMap.image.height;
            const context = canvas.getContext('2d');
            context.drawImage(leafMap.image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const alphaCoverage = { transparent: 0, opaque: 0, mismatches: 0, flipYMatches: aoMap.flipY === leafMap.flipY, linear: aoMap.colorSpace === '' };
            for (let index = 0; index < pixels.length; index += 4) {
                const alpha = pixels[index + 3];
                if (alpha === 0) alphaCoverage.transparent += 1;
                if (alpha === 255) alphaCoverage.opaque += 1;
                if (alpha !== aoMap.image.data[index + 1]) alphaCoverage.mismatches += 1;
            }
            let sharedMaterials = true;
            for (const template of direct.templates) template.traverse(mesh => {
                if (!mesh.isMesh) return;
                for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                    sharedMaterials &&= material === direct.materials.leaf || material === direct.materials.trunk;
                }
            });
            await window.__testHooks.loadScenario('urban_vegetation_showcase', { species });
            const showcase = window.__urbanVegetationShowcase;
            const metrics = showcase.getMetrics();
            const geometryEvidence = await showcase.getGeometryEvidence();
            const manifest = await (await fetch(`/assets/public/vegetation/${species.replaceAll('-', '_')}/index.json`)).json();
            const silhouettes = variants.map(variant => showcase.silhouette(variant, { frameHeight: 1 }));
            const crowns = variants.map(variant => {
                const mask = showcase.silhouette(variant, { frameHeight: 1, foliageOnly: true });
                return { variant, clipped: mask.clipped, convexHullCoverage: mask.convexHullCoverage };
            });
            const { InspectorRoomMeshesProvider } = await import('/src/graphics/gui/inspector_room/InspectorRoomMeshesProvider.js');
            const provider = new InspectorRoomMeshesProvider(window.__testHooks.getEngine());
            const collectionId = `mesh_collection.${species.replaceAll('-', '_')}`;
            const collection = provider.getCollectionOptions().find(entry => entry.id === collectionId);
            if (!collection) throw new Error(`Missing inspector collection ${collectionId}`);
            provider.setSelectedCollectionId(collection.id);
            provider.mount(window.__testHooks.getEngine().scene);
            const inspector = [];
            for (const variant of variants) {
                provider.setSelectedMeshId(`tree.${species}.${variant}`);
                await provider.whenSelectedMeshReady();
                const mesh = provider.getPickMesh();
                let aoTextureShared = true;
                mesh.traverse(object => {
                    if (!object.isMesh) return;
                    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                        if (material.userData.isFoliage) aoTextureShared &&= material.userData.aoAlphaMap === aoMap;
                    }
                });
                const height = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).y;
                inspector.push({ ...provider.getSelectedMeshMeta(), present: Boolean(mesh), aoTextureShared, height });
            }
            provider.dispose();
            return { metrics, geometryEvidence, manifest, cacheIdentity: direct === cached, hasQuality: 'quality' in direct, sharedMaterials, materialIds: [direct.materials.leaf.id, direct.materials.trunk.id], materialSpecies: [direct.materials.leaf.userData.treeSpecies, direct.materials.trunk.userData.treeSpecies], alphaCoverage, silhouettes, crowns, inspector };
        }, { species, variants: VARIANTS });
        await fs.writeFile(path.join(evidenceDirectory, `${species}.json`), JSON.stringify({
            ...result, silhouettes: result.silhouettes.map(({ occupied, ...summary }) => summary)
        }, null, 2));
        expect(result.cacheIdentity).toBe(true);
        expect(result.hasQuality).toBe(false);
        expect(result.sharedMaterials).toBe(true);
        expect(new Set(result.materialIds).size).toBe(2);
        expect(result.materialSpecies).toEqual([species, species]);
        expect(result.alphaCoverage).toMatchObject({ mismatches: 0, flipYMatches: true, linear: true });
        expect(result.alphaCoverage.transparent).toBe(0);
        expect(result.alphaCoverage.opaque).toBe(1024 * 1024);
        expect(result.manifest.foliageRepresentation).toBe('solid-leaves-v1');
        expect(result.manifest.leafStudy.forms).toBe(8);
        expect(result.metrics.environment).toMatchObject({ background: true, present: true, fallback: false });
        expect(result.metrics.textures.ready).toBe(result.metrics.textures.total);
        expect(result.metrics.textures.total).toBe(7);
        expect(result.metrics.plants).toHaveLength(3);
        expect(result.manifest.schema).toBe('bus-sim-original-vegetation-v3');
        expect(result.manifest.assetRevision).toBe(`${species}-v${REVISIONS[species]}`);
        for (const silhouette of result.silhouettes) {
            expect(silhouette.clipped).toBe(false);
            expect(silhouette.pixels).toBeGreaterThan(1000);
        }
        for (const crown of result.crowns) {
            expect(crown.clipped).toBe(false);
            expect.soft(crown.convexHullCoverage, `${species}/${crown.variant} crown pixel occupancy within its convex hull`).toBeGreaterThanOrEqual(CROWN_OCCUPANCY_FLOORS[species]);
        }
        for (const [index, plant] of result.metrics.plants.entries()) {
            expect(plant.metadata).toMatchObject({ treeSpecies: species, treeVariant: VARIANTS[index], treeGrowthStage: 'mature' });
            expect(plant.metadata).not.toHaveProperty('treeQuality');
            expect(plant.metadata).not.toHaveProperty('quality');
            expect(plant.finitePositions).toBe(true);
            expect(plant.finiteNormals).toBe(true);
            expect(plant.normalLengthMin).toBeGreaterThan(0.98);
            expect(plant.normalLengthMax).toBeLessThan(1.02);
            expect(Math.abs(plant.bounds.min[1])).toBeLessThan(0.05);
            expect(plant.bounds.max[1]).toBeGreaterThan(species === 'arrowwood-viburnum' ? 1.5 : 10);
            expect(plant.bounds.max[1]).toBeLessThan(species === 'arrowwood-viburnum' ? 5 : 22);
            const measured = result.geometryEvidence[index];
            const authored = result.manifest.variants[index];
            expect(plant.metadata.treeAssetRevision).toBe(result.manifest.assetRevision);
            expect(authored.woodyDetail.method.length).toBeGreaterThan(8);
            expect(authored.woodyDetail.voxelSizeMetres).toBeGreaterThan(0);
            expect(authored.woodyDetail.measuredReliefMetres).toBeGreaterThan(0);
            expect(measured.bark.triangles).toBe(authored.woodyDetail.barkTriangles);
            expect(measured.bark.triangles).toBeGreaterThan(species === 'arrowwood-viburnum' ? 2500 : 5000);
            expect(measured.bark).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0, degenerateTriangles: 0 });
            expect(measured.bark.connectedComponents).toBe(authored.woodyDetail.connectedComponents);
            expect(measured.bark.connectedComponents).toBeLessThanOrEqual(species === 'arrowwood-viburnum' ? authored.stemCount : 1);
            expect(measured.foliage.fingerprint).toEqual(authored.foliageFingerprint);
            if (species === 'american-elm') {
                expect(measured.bark.lowestWoodOutsideStem).toBeGreaterThan(6);
                expect(measured.foliage.bounds.min[1]).toBeGreaterThan(7);
                expect(measured.foliage.bounds.max[0] - measured.foliage.bounds.min[0]).toBeGreaterThan(11);
                expect(measured.foliage.bounds.max[2] - measured.foliage.bounds.min[2]).toBeGreaterThan(11);
                expect(measured.foliage.bounds.max[1] - measured.foliage.bounds.min[1]).toBeGreaterThan(7);
            }
            expect(authored.foliageDetail).toMatchObject({ representation: 'solid-leaves-v1', closedBlades: true, closedPetioles: true, alphaPlates: 0, templateBoundaryEdges: 0, templateNonManifoldEdges: 0 });
            expect(authored.foliageDetail.leafCount).toBeGreaterThan(5000);
            expect(authored.cardCount).toBe(0);
            expect(plant.materialDraws).toBe(2);
            expect(plant.foliageMaterials).toHaveLength(1);
            expect(plant.barkMaterials).toHaveLength(1);
            const side = 0;
            expect(plant.foliageMaterials[0]).toMatchObject({ alphaTest: 0, transparent: false, alphaToCoverage: false, depthWrite: true, side, shadowSide: side, map: true, normalMap: true, foliage: true, vertexColors: true, aoAlphaMap: true, preserveShadowSide: true, mapColorSpace: 'srgb', normalMapColorSpace: '', metalness: 0 });
            expect(plant.barkMaterials[0]).toMatchObject({ map: true, normalMap: true, transparent: false, foliage: false, mapColorSpace: 'srgb', normalMapColorSpace: '', metalness: 0, vertexColors: true });
            for (const material of [...plant.barkMaterials, ...plant.foliageMaterials]) {
                expect(material).toMatchObject({ roughnessMap: true, metalnessMap: true, roughnessMapColorSpace: '', metalnessMapColorSpace: '' });
            }
            expect(result.inspector[index]).toMatchObject({ id: `tree.${species}.${VARIANTS[index]}`, loading: false, error: null, present: true, aoTextureShared: true });
            expect(result.inspector[index].height).toBeCloseTo(plant.bounds.max[1] - plant.bounds.min[1], 4);
        }
        for (let first = 0; first < 3; first += 1) for (let second = first + 1; second < 3; second += 1) {
            const a = result.metrics.plants[first].barkShapeHistogram;
            const b = result.metrics.plants[second].barkShapeHistogram;
            const structureDifference = a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0);
            expect(structureDifference, `${species} ${first}/${second}: bark structure after independent XYZ normalization`).toBeGreaterThan(0.025);
            const firstMask = result.silhouettes[first];
            const secondMask = result.silhouettes[second];
            const occupied = new Set(firstMask.occupied);
            const intersection = secondMask.occupied.filter(pixel => occupied.has(pixel)).length;
            const union = firstMask.pixels + secondMask.pixels - intersection;
            expect(intersection / union, `${species} ${first}/${second}: distinct normalized-height silhouette`).toBeLessThan(0.95);
        }
    }
    const modelRequests = requests.filter(url => /\/assets\/public\/vegetation\/[^/]+\/[^/]+\.glb/.test(url));
    expect(new Set(modelRequests).size).toBe(SPECIES.length * 3);
    expect(modelRequests.every(url => /\/mature_0[123]\.glb$/.test(url))).toBe(true);
    expect(requests.filter(url => /\/assets\/trees\//.test(url))).toEqual([]);
    expect(errors).toEqual([]);
});

test('Default gameplay tree loading still uses only the existing legacy pack', async ({ page }) => {
    test.setTimeout(120_000);
    const requests = [];
    const errors = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    const count = await page.evaluate(async () => {
        const { loadTreeTemplates } = await import('/src/graphics/assets3d/generators/TreeGenerator.js');
        const assets = await loadTreeTemplates();
        return assets?.templates?.length ?? 0;
    });
    expect(count).toBe(15);
    expect(new Set(requests.filter(url => /\/assets\/trees\/.*\.fbx$/i.test(url))).size).toBe(15);
    expect(requests.filter(url => /\/assets\/public\/vegetation\//.test(url))).toEqual([]);
    expect(errors).toEqual([]);
});
