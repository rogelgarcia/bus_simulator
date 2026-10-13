// Export: Terra & Mar (recessed balconies) as a GLB for Blender (AI 614).
//
// A Terra & Mar copy of bradbury_blender_export.pwtest.js (the Bradbury spec
// stays untouched). Builds the catalog building through the `building_showcase`
// harness scenario exactly the way the game renders it, UNMERGED (per-part
// meshes keep their `buildingFab2Role` tags), then serializes the building
// group with the three.js GLTFExporter. Mesh names carry the fabrication role
// (`<role>__<n>`) and materials keep their source name (`MAT_<n>_<name>`).
//
// Beyond the Bradbury export, the JSON manifest also records:
// - `placement`: the showcase moves the config footprint onto its build site;
//   the offset (three.js x/z) lets Blender put the config origin back at 0.
// - `materials`: one row per exported material with its type, colour, glass
//   parameters and the source URL of every texture map, so Blender can name
//   material families and point textures back at the game's asset files.
// - per part: the BF2 userData tags (wall/roof/interior kinds, ids) and the
//   exported material names.
// - window shades: the game cuts each shade in its shader by per-instance
//   coverage; the parameters go in `parts[].shade` and the shader's
//   windowShadeUv rides along as the second UV set, so Blender can match it.
//
// Usage:
//   EXPORT_TAG=before VISUAL_BASE_URL=http://127.0.0.1:<port> node node_modules/@playwright/test/cli.js test -c tests/headless/visual/visual.config.mjs terramar_recessed_blender_export
// Output: tests/artifacts/blender/terramar_recessed/<tag>/terramar_recessed_<tag>.glb (+ .json manifest)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAG = String(process.env.EXPORT_TAG ?? 'before').replace(/[^a-z0-9_-]+/gi, '_');
const BUILDING_ID = 'terramar_recessed';
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/blender', BUILDING_ID, TAG);

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

test('Export: Terra & Mar (recessed) GLB for Blender', async ({ page }) => {
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
        const { getBuildingConfigById } = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
        const engine = window.__testHooks.getEngine();
        engine.scene.updateMatrixWorld(true);
        const entryId = `showcase_${args.buildingId}`;
        const root = engine.scene.getObjectByName(entryId);
        if (!root) throw new Error(`building group ${entryId} not found`);

        // Build-site offset: the placed footprint's first point minus the
        // config's own first point (both three.js x/z).
        const config = getBuildingConfigById(args.buildingId);
        const city = engine.context.city;
        const placedEntry = (city?.map?.buildings ?? []).find((b) => b?.id === entryId) ?? null;
        const configPoint = config?.footprintLoops?.[0]?.[0] ?? null;
        const placedPoint = placedEntry?.footprintLoops?.[0]?.[0] ?? null;
        const placement = (configPoint && placedPoint) ? {
            offset: { x: placedPoint.x - configPoint.x, z: placedPoint.z - configPoint.z },
            configFirstPoint: { x: configPoint.x, z: configPoint.z },
            placedFirstPoint: { x: placedPoint.x, z: placedPoint.z },
            placedLoopCount: placedEntry.footprintLoops.length
        } : null;

        const exportScene = new THREE.Scene();
        const building = new THREE.Group();
        building.name = 'TERRAMAR';
        exportScene.add(building);

        const materialCache = new Map();
        const materialRows = [];
        const geometryCache = new Map();
        const roleCounts = {};
        const parts = [];
        let meshCount = 0;
        let triangles = 0;

        const textureInfo = (tex) => {
            if (!tex || !tex.isTexture) return null;
            const img = tex.image ?? tex.source?.data ?? null;
            return {
                name: tex.name || null,
                url: img?.currentSrc || img?.src || tex.userData?.url || tex.userData?.sourceUrl || null,
                width: img?.width ?? null,
                height: img?.height ?? null,
                repeat: tex.repeat?.toArray?.() ?? null,
                offset: tex.offset?.toArray?.() ?? null,
                rotation: tex.rotation ?? 0,
                flipY: tex.flipY,
                colorSpace: tex.colorSpace ?? null,
                runtime: !(img?.currentSrc || img?.src)
            };
        };
        const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'transmissionMap', 'bumpMap'];

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
            const maps = {};
            for (const key of MAP_KEYS) {
                const info = textureInfo(source[key]);
                if (info) maps[key] = info;
            }
            materialRows.push({
                exportName: target.name,
                sourceName: source.name || null,
                sourceType: source.type,
                color: source.color?.getHexString?.() ?? null,
                emissive: source.emissive?.getHexString?.() ?? null,
                roughness: source.roughness ?? null,
                metalness: source.metalness ?? null,
                opacity: source.opacity,
                transparent: !!source.transparent,
                transmission: source.transmission ?? null,
                ior: source.ior ?? null,
                thickness: source.thickness ?? null,
                side: source.side,
                userData: Object.fromEntries(Object.entries(source.userData ?? {})
                    .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))),
                maps
            });
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
            // Window shades: the game draws a shade only over its coverage, measured along windowShadeUv in the
            // shader. Keep that UV as the second UV set (TEXCOORD_1) so Blender can cut the shade the same way.
            if (g.attributes.windowShadeUv && !g.attributes.uv1) g.setAttribute('uv1', g.attributes.windowShadeUv.clone());
            for (const key of Object.keys(g.attributes)) {
                if (!['position', 'normal', 'uv', 'uv1', 'color'].includes(key)) g.deleteAttribute(key);
            }
            geometryCache.set(source.uuid, g);
            return g;
        };
        // Per-instance shade parameters (WindowMeshGenerator / WindowMeshMaterials patchShadeShader): coverage 0
        // = no shade drawn; otherwise drawn where coord <= coverage, coord = axis ? u : v, flipped when flipX.
        const shadeParams = (object, i) => {
            const attr = (name) => object.geometry?.attributes?.[name] ?? null;
            const cov = attr('instanceShadeCoverage');
            if (!object.isInstancedMesh || !cov) return null;
            const scale = attr('instanceShadeFabricScale');
            return {
                coverage: cov.getX(i),
                flipX: attr('instanceShadeFlipX')?.getX(i) ?? 0,
                axis: attr('instanceShadeAxis')?.getX(i) ?? 0,
                fabricScale: scale ? [scale.getX(i), scale.getY(i)] : [1, 1],
                fabricIntensity: attr('instanceShadeFabricIntensity')?.getX(i) ?? 0
            };
        };
        const plainTags = (userData) => {
            const out = {};
            for (const [key, value] of Object.entries(userData ?? {})) {
                if (!/^(buildingFab2|building|window|portal|lettering|balcony|layer|face|bay|floor|run)/i.test(key)) continue;
                if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
            }
            return out;
        };

        root.traverseVisible((object) => {
            if (!object.isMesh) return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            if (materials.every((m) => !m || !m.visible)) return;
            // Shadow-only helpers (the merged shadow caster writes no color)
            // and meshes outside the camera layers are not part of what the
            // game shows; Blender wants the rendered surfaces only.
            if (materials.every((m) => !m || m.colorWrite === false || m.userData?.isShadowCasterMerge)) return;
            if (!object.layers.test(engine.camera.layers)) return;
            const role = object.userData?.buildingFab2Role
                ?? object.userData?.buildingWindowSource
                ?? (object.userData?.portalOrnamentPart ? 'portal_ornament' : null)
                ?? 'mesh';
            // Nested parts inherit the nearest ancestor's role tag.
            let roleTag = role;
            const tags = plainTags(object.userData);
            for (let anc = object.parent; anc && anc !== root.parent; anc = anc.parent) {
                if (roleTag === 'mesh' && anc.userData?.buildingFab2Role) roleTag = anc.userData.buildingFab2Role;
                for (const [k, v] of Object.entries(plainTags(anc.userData))) if (!(k in tags)) tags[k] = v;
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
                const partBox = new THREE.Box3().setFromBufferAttribute(geom.attributes.position).applyMatrix4(matrix);
                parts.push({
                    name: mesh.name,
                    sourceName: object.name || null,
                    parentName: object.parent?.name || null,
                    role: roleTag,
                    instanced: !!object.isInstancedMesh,
                    materials: mats.map((m) => m.name),
                    tags,
                    shade: shadeParams(object, i),
                    letteringText: object.userData?.letteringText ?? null,
                    triangles: tris,
                    position: mesh.position.toArray(),
                    bounds: { min: partBox.min.toArray(), max: partBox.max.toArray() }
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
            buildingName: config?.name ?? null,
            exportedAt: new Date().toISOString(),
            bytes: data.length,
            meshCount,
            triangles,
            roleCounts,
            bounds: { min: box.min.toArray(), max: box.max.toArray() },
            placement,
            camera: { position: cam.position.toArray(), quaternion: cam.quaternion.toArray(), fov: cam.fov },
            scenario: window.__testHooks.getMetrics()?.scenario?.building ?? null,
            materials: materialRows,
            parts
        };
    }, { buildingId: BUILDING_ID, maxTextureSize: Number(process.env.EXPORT_MAX_TEXTURE ?? 1024) });

    await handle.close();
    expect(written).toBe(manifest.bytes);
    expect(manifest.placement).not.toBeNull();
    await fs.writeFile(path.join(OUT_DIR, `${BUILDING_ID}_${TAG}.json`), JSON.stringify(manifest, null, 2));
    console.log(`GLB: ${glbPath} (${(written / 1e6).toFixed(1)} MB, ${manifest.meshCount} meshes, ${manifest.triangles} tris)`);
    console.log('ROLES: ' + JSON.stringify(manifest.roleCounts));
    console.log('PLACEMENT: ' + JSON.stringify(manifest.placement));
    console.log('BOUNDS: ' + JSON.stringify(manifest.bounds));
});
