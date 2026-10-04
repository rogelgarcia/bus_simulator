// Load the field lab's authored grass, litter and canopy for the transition scene.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { primePbrAssetsAvailability } from '../../content3d/materials/PbrAssetsRuntime.js';
import { resolvePbrMaterialPipeline } from '../../content3d/materials/PbrTexturePipeline.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { createGrassDebugV2FieldLod } from './GrassDebugV2FieldLod1.js';
import { createGrassDebugV2FieldDetail } from './GrassDebugV2FieldDetail.js';
import { createGrassDebugV2LitterSoilMaterial } from './GrassDebugV2LitterSoilMaterial.js';
import { applyGrassDebugV2DistanceAppearance } from './GrassDebugV2DistanceAppearance.js';
import { cloneMaterialShaderContract } from '../../shaders/core/MaterialShaderHookRegistry.js';

const ROOT = '/tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m/';

function groundMapping(mesh) {
    const p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
    const points = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
    const inverse = new THREE.Matrix3().set(...points.flatMap(v => [v.x, v.z, 1])).invert();
    const u = new THREE.Vector3(...[0, 1, 2].map(i => uv.getX(i))).applyMatrix3(inverse);
    const v = new THREE.Vector3(...[0, 1, 2].map(i => uv.getY(i))).applyMatrix3(inverse);
    return new THREE.Matrix3().set(u.x, u.y, u.z, v.x, v.y, v.z, 0, 0, 1);
}

export async function loadGrassDebugV2TransitionAssets({ renderer, lighting, onProgress, offline = false }) {
    const response = await fetch(ROOT + 'scene.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Grass source manifest unavailable: ' + response.status);
    const manifest = await response.json();
    // Geometry exports record capture lighting; the live lab uses the game's resolved settings.
    await primePbrAssetsAvailability();
    const ormUrl = new URL(resolvePbrMaterialPipeline('pbr.dry_litter').urls.ormUrl, location.href);
    ormUrl.searchParams.set('v', 'orm-repair-1');
    const [loaded, , orm] = await Promise.all([
        new GLTFLoader().loadAsync(ROOT + '96000_leaves.glb?v=' + manifest.sourceHashes['src/graphics/gui/grass_debugger_v2/GrassDebugV2LitterSubstrate.js'],
            event => onProgress('Loading grass source · ' + Math.round(event.loaded / (event.total || manifest.exportBytes) * 100) + '%')),
        lighting.loadEnvironment(), new THREE.TextureLoader().loadAsync(ormUrl.href)
    ]);
    const repaired = new Set(), oldMaps = new Set();
    loaded.scene.updateMatrixWorld(true);
    const field = loaded.scene.getObjectByName('Offline_96000_Leaves');
    const litter = loaded.scene.getObjectByName('GrassV2DryLitterSubstrate');
    let soil, litterMesh;
    if (!field || !litter) throw new Error('Grass or litter source is missing.');
    loaded.scene.traverse(mesh => {
        if (!mesh.isMesh) return;
        if (mesh.material.name === 'Brown Earth') soil = mesh;
        if (!mesh.material.name.startsWith('DryLitter')) return;
        if (mesh.material.name === 'DryLitterInterior') litterMesh = mesh;
        const material = mesh.material;
        if (repaired.has(material)) return;
        repaired.add(material);
        const texture = material.roughnessMap.clone();
        texture.source = orm.source; texture.flipY = orm.flipY; texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true;
        for (const key of ['roughnessMap', 'metalnessMap', 'aoMap']) { oldMaps.add(material[key]); material[key] = texture; }
    });
    oldMaps.forEach(texture => texture?.dispose()); orm.dispose();
    if (!soil || !litterMesh) throw new Error('Transition ground materials are missing.');
    const original = field.children.find(mesh => mesh.isMesh).material;
    const sourceMaterial = createGrassDebugV2Material({ vertexColors: true, color: original.color, roughness: original.roughness,
        normalMap: original.normalMap, normalScale: original.normalScale, roughnessMap: original.roughnessMap,
        defines: { GRASS_LEAF_TRANSLUCENCY: 1, USE_UV: 1 } });
    onProgress('Preparing five grass levels…');
    const generated = ['LOD0_SMART', 'LOD1', 'LOD2'].map(lod => createGrassDebugV2FieldLod({ lod,
        placements: manifest.placements, seed: manifest.seed, material: sourceMaterial }));
    const detail = createGrassDebugV2FieldDetail({ source: generated[2].mesh, width: manifest.widthMeters, depth: manifest.depthMeters });
    const canopy = offline
        ? await (await import('./GrassDebugV2CanopyTextureAsset.js')).loadGrassCanopyTextureAsset({ renderer, shadowDirection: lighting.sunRef.direction, anisotropy: 4 })
        : await (await import('./GrassDebugV2FieldCanopy.js?v=lod4-shadow-fast-1')).createGrassDebugV2FieldCanopy({ renderer, source: generated[2].mesh, lod2: generated[2].mesh,
        soil, litter, width: manifest.widthMeters, depth: manifest.depthMeters, shadowDirection: lighting.sunRef.direction,
        lighting, onProgress, anisotropy: 4 });
    // The tile already contains grass self-shadows; this lab has no external occluders.
    const externalVisibility = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
    externalVisibility.name = 'GrassTransitionExternalVisibility'; externalVisibility.generateMipmaps = false;
    externalVisibility.needsUpdate = true;
    canopy.shadowUniforms.grassCanopyShadowVisibility.value = externalVisibility;
    canopy.shadowUniforms.grassCanopyShadowBounds.value.set(0, 0, 1, 1);
    canopy.shadowUniforms.grassCanopyShadowPass.value = 2;
    // Opt in only after baking. The general material still supports external occluders in the field lab.
    for (const material of Object.values(canopy.materials)) {
        // Linear leaf-only probe, normalized by coverage; litter retains its own base color.
        material.userData.grassFloorLeafColorScale.value.set(1.04, 1.03, 1.02);
        material.defines = { ...material.defines, GRASS_CANOPY_BAKED_SHADOW_ONLY: 1, GRASS_TRANSITION_CANOPY_COVERAGE: 1 };
        material.needsUpdate = true;
    }
    const liveMaterial = cloneMaterialShaderContract(sourceMaterial);
    liveMaterial.userData = { ...sourceMaterial.userData }; applyGrassDebugV2DistanceAppearance(liveMaterial);
    applyGrassDebugV2DistanceAppearance(detail.material);
    generated.forEach(lod => { lod.mesh.material = liveMaterial; });
    const soilUv = groundMapping(soil), litterUv = groundMapping(litterMesh);
    const litterMaterial = createGrassDebugV2LitterSoilMaterial({ litter: litterMesh.material, soil: soil.material, soilUv });
    for (const material of [soil.material, litterMaterial]) for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'])
        if (material[key]) material[key].anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return Object.freeze({ manifest, sources: { LOD0: generated[0].mesh, LOD1: generated[1].mesh,
        LOD2: generated[2].mesh, LOD3: detail.group }, detail, canopy, soilMaterial: soil.material, litterMaterial, soilUv, litterUv,
        dispose() {
            canopy.dispose(); externalVisibility.dispose(); detail.dispose(); generated.forEach(lod => lod.dispose());
            liveMaterial.dispose(); sourceMaterial.dispose(); litterMaterial.dispose();
            const materials = new Set(), textures = new Set(), geometries = new Set();
            loaded.scene.traverse(mesh => { if (mesh.isMesh) { geometries.add(mesh.geometry); materials.add(mesh.material); } });
            materials.forEach(material => { Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); }); material.dispose(); });
            textures.forEach(texture => texture.dispose()); geometries.forEach(geometry => geometry.dispose());
        }
    });
}
