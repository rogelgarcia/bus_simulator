// Export: Bradbury Block as a GLB for Blender inspection.
//
// Builds the catalog building through the `building_showcase` harness scenario
// exactly the way the game renders it, UNMERGED (per-part meshes keep their
// `buildingFab2Role` tags), then serializes the building group with the
// three.js GLTFExporter so the geometry can be opened in Blender for
// intersection / z-fight / gap analysis. Mesh names carry the fabrication
// role so Blender scripts can group parts (e.g. `portal_box__12`).
//
// Usage:
//   EXPORT_TAG=before node node_modules/@playwright/test/cli.js test -c tests/headless/visual/visual.config.mjs bradbury_blender_export
// Output: tests/artifacts/blender/bradbury/<tag>/bradbury_<tag>.glb (+ .json parts manifest)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAG = String(process.env.EXPORT_TAG ?? 'before').replace(/[^a-z0-9_-]+/gi, '_');
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/blender/bradbury', TAG);
const BUILDING_ID = String(process.env.BUILDING_ID ?? 'bradbury_block');

async function waitForShowcaseReady(page) {
    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        if (!textures || textures.total <= 0) return false;
        if (textures.ready < textures.total) return false;
        if (scenario.environment?.expected && !scenario.environment.present) return false;
        return true;
    }, null, { timeout: 60_000, polling: 250 });
}

test('Export: Bradbury Block GLB for Blender', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });

    const glbPath = path.join(OUT_DIR, `${BUILDING_ID}_${TAG}.glb`);
    const handle = await fs.open(glbPath, 'w');
    let written = 0;
    await page.exposeFunction('__writeGlbChunk', async (base64) => {
        const buf = Buffer.from(base64, 'base64');
        await handle.write(buf);
        written += buf.length;
    });

    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(1280, 720);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            mergeBuildingGeometry: false,
            mergeBuildingWindowAssemblies: false,
            mergeDedupeMaterials: false
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BUILDING_ID });
    await waitForShowcaseReady(page);

    const manifest = await page.evaluate(async (args) => {
        const THREE = await import('three');
        const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
        const engine = window.__testHooks.getEngine();
        engine.scene.updateMatrixWorld(true);
        const root = engine.scene.getObjectByName(`showcase_${args.buildingId}`);
        if (!root) throw new Error(`building group showcase_${args.buildingId} not found`);

        const exportScene = new THREE.Scene();
        const building = new THREE.Group();
        building.name = 'BRADBURY_BLOCK';
        exportScene.add(building);

        const materialCache = new Map();
        const geometryCache = new Map();
        const roleCounts = {};
        const parts = [];
        let meshCount = 0;
        let triangles = 0;

        const toExportMaterial = (source) => {
            if (!source) return new THREE.MeshStandardMaterial({ name: 'MAT_missing' });
            if (materialCache.has(source.uuid)) return materialCache.get(source.uuid);
            let target;
            if (source.isMeshStandardMaterial) {
                target = source.clone();
            } else {
                target = new THREE.MeshStandardMaterial();
                for (const key of ['name', 'color', 'emissive', 'emissiveIntensity', 'map', 'emissiveMap', 'normalMap', 'normalScale', 'opacity', 'transparent', 'alphaTest', 'side']) {
                    if (source[key] !== undefined && source[key] !== null) {
                        target[key] = source[key]?.clone && !source[key].isTexture ? source[key].clone() : source[key];
                    }
                }
                target.roughness = 0.8;
                target.metalness = 0;
            }
            target.name = `MAT_${materialCache.size}_${source.name || source.type}`;
            target.userData = {};
            target.onBeforeCompile = () => {};
            target.customProgramCacheKey = () => '';
            target.lightMap = null;
            target.aoMap = null;
            target.envMap = null;
            materialCache.set(source.uuid, target);
            return target;
        };
        const toExportGeometry = (source) => {
            if (geometryCache.has(source.uuid)) return geometryCache.get(source.uuid);
            const g = source.clone();
            g.userData = {};
            for (const key of Object.keys(g.attributes)) {
                if (!['position', 'normal', 'uv', 'uv1', 'color'].includes(key)) g.deleteAttribute(key);
            }
            geometryCache.set(source.uuid, g);
            return g;
        };

        root.traverseVisible((object) => {
            if (!object.isMesh) return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            if (materials.every((m) => !m || !m.visible)) return;
            // Shadow-only helpers (the merged shadow caster writes no color)
            // and meshes outside the camera layers are not part of what the
            // game shows; Blender inspection wants the rendered surfaces only.
            if (materials.every((m) => !m || m.colorWrite === false || m.userData?.isShadowCasterMerge)) return;
            if (!object.layers.test(engine.camera.layers)) return;
            const role = object.userData?.buildingFab2Role
                ?? object.userData?.buildingWindowSource
                ?? (object.userData?.portalOrnamentPart ? 'portal_ornament' : null)
                ?? 'mesh';
            // Ornament parts are nested under a group carrying the role tag.
            let roleTag = role;
            for (let anc = object.parent; anc && roleTag === 'mesh'; anc = anc.parent) {
                if (anc.userData?.buildingFab2Role) roleTag = anc.userData.buildingFab2Role;
            }
            const geom = toExportGeometry(object.geometry);
            const mats = materials.map(toExportMaterial);
            const count = object.isInstancedMesh ? object.count : 1;
            for (let i = 0; i < count; i++) {
                const matrix = object.matrixWorld.clone();
                if (object.isInstancedMesh) {
                    const local = new THREE.Matrix4();
                    object.getMatrixAt(i, local);
                    matrix.multiply(local);
                }
                const mesh = new THREE.Mesh(geom, Array.isArray(object.material) ? mats : mats[0]);
                mesh.name = `${roleTag}__${meshCount}`;
                mesh.matrix.copy(matrix);
                mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
                mesh.matrixAutoUpdate = false;
                building.add(mesh);
                const tris = (geom.index ? geom.index.count : geom.attributes.position.count) / 3;
                triangles += tris;
                roleCounts[roleTag] = (roleCounts[roleTag] ?? 0) + 1;
                parts.push({
                    name: mesh.name,
                    sourceName: object.name || null,
                    role: roleTag,
                    windowDefinitionId: object.userData?.windowDefinitionId ?? null,
                    portalLevelIndex: object.userData?.portalLevelIndex ?? null,
                    portalOrderIndex: object.userData?.portalOrderIndex ?? null,
                    letteringText: object.userData?.letteringText ?? null,
                    triangles: tris,
                    position: mesh.position.toArray()
                });
                meshCount++;
            }
        });
        exportScene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(building);

        const bytes = await new GLTFExporter().parseAsync(exportScene, {
            binary: true,
            onlyVisible: true,
            trs: false,
            maxTextureSize: args.maxTextureSize
        });
        const data = new Uint8Array(bytes);
        const chunkSize = 1024 * 1024;
        for (let offset = 0; offset < data.length; offset += chunkSize) {
            const part = data.subarray(offset, offset + chunkSize);
            let binary = '';
            for (let n = 0; n < part.length; n += 8192) binary += String.fromCharCode(...part.subarray(n, n + 8192));
            await window.__writeGlbChunk(btoa(binary));
        }
        const cam = engine.camera;
        return {
            buildingId: args.buildingId,
            bytes: data.length,
            meshCount,
            triangles,
            roleCounts,
            bounds: { min: box.min.toArray(), max: box.max.toArray() },
            camera: { position: cam.position.toArray(), quaternion: cam.quaternion.toArray(), fov: cam.fov },
            warnings: window.__testHooks.getMetrics()?.scenario?.building ?? null,
            parts
        };
    }, { buildingId: BUILDING_ID, maxTextureSize: Number(process.env.EXPORT_MAX_TEXTURE ?? 1024) });

    await handle.close();
    expect(written).toBe(manifest.bytes);
    await fs.writeFile(path.join(OUT_DIR, `${BUILDING_ID}_${TAG}.json`), JSON.stringify(manifest, null, 2));
    console.log(`GLB: ${glbPath} (${(written / 1e6).toFixed(1)} MB, ${manifest.meshCount} meshes, ${manifest.triangles} tris)`);
    console.log('ROLES: ' + JSON.stringify(manifest.roleCounts));
});
