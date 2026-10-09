// Preloads the substrates so the land selector swaps complete, ready materials.
// @ts-check
import * as THREE from 'three';
import { applyTextureColorSpace, applyResolvedPbrToStandardMaterial, resolvePbrMaterialPipeline } from '../../content3d/materials/PbrTexturePipeline.js';
import { primePbrAssetsAvailability } from '../../content3d/materials/PbrAssetsRuntime.js';

const LAND_SURFACES = Object.freeze({
    gravelly_sand: {
        label: 'Gravelly Sand', materialId: 'pbr.gravelly_sand', localOverrides: null, colorMultiplierLinear: null
    },
    forest_ground_06: {
        label: 'Forest Soil', materialId: 'pbr.forest_ground_06', localOverrides: { tileMeters: 2.5 }, colorMultiplierLinear: null
    },
    brown_mud: {
        label: 'Brown Earth', materialId: 'pbr.brown_mud', localOverrides: { roughness: 0.78 },
        // Damp earth: reduce diffuse reflectance while retaining the scanned pores and roughness variation.
        colorMultiplierLinear: Object.freeze([0.32, 0.29, 0.26])
    }
});

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{width: number, depth: number, centerX: number, centerZ: number}} terrain
 */
export async function createGrassDebugV2Land(renderer, terrain) {
    await primePbrAssetsAvailability();
    const loader = new THREE.TextureLoader();
    const surfaces = {};
    const materials = Object.fromEntries(await Promise.all(Object.entries(LAND_SURFACES).map(async ([id, surface]) => {
        const resolved = resolvePbrMaterialPipeline(surface.materialId, { localOverrides: surface.localOverrides });
        const tileMeters = resolved.overrides.effective.tileMeters;
        const textures = Object.fromEntries(await Promise.all(['baseColor', 'normal', 'orm'].map(async slot => {
            const url = resolved.urls[`${slot}Url`];
            if (!url) throw new Error(`Required land texture unavailable: ${surface.materialId} ${slot}`);
            const texture = await loader.loadAsync(url);
            applyTextureColorSpace(texture, { srgb: slot === 'baseColor' });
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(terrain.width / tileMeters, terrain.depth / tileMeters);
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            return [slot, texture];
        })));
        const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
        applyResolvedPbrToStandardMaterial(material, { ...resolved, textures });
        if (surface.colorMultiplierLinear) material.color.fromArray(surface.colorMultiplierLinear);
        material.name = surface.label;
        surfaces[id] = Object.freeze({ id, label: surface.label, materialId: surface.materialId, tileMeters });
        return [id, material];
    })));
    let selected = 'gravelly_sand';
    const geometry = new THREE.PlaneGeometry(terrain.width, terrain.depth);
    geometry.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geometry, materials[selected]);
    ground.name = 'GrassV2DirtTerrain';
    ground.position.set(terrain.centerX, 0, terrain.centerZ);
    ground.receiveShadow = true;
    let patchGeometry = null, grassVisible = false;
    return Object.freeze({
        ground, materials: Object.freeze(materials),
        setGrassPatches(patches) {
            // Preserve the terrain UVs, but avoid shading a second floor beneath the grass.
            const xs = [...new Set([-terrain.width / 2, ...patches.flatMap(p => [p.minX - terrain.centerX, p.maxX - terrain.centerX]), terrain.width / 2])].sort((a, b) => a - b);
            const zs = [...new Set([-terrain.depth / 2, ...patches.flatMap(p => [p.minZ - terrain.centerZ, p.maxZ - terrain.centerZ]), terrain.depth / 2])].sort((a, b) => a - b);
            const positions = [], uvs = [], indices = [];
            for (const z of zs) for (const x of xs) {
                positions.push(x, 0, z); uvs.push(x / terrain.width + .5, .5 - z / terrain.depth);
            }
            for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < xs.length - 1; x++) {
                const centerX = (xs[x] + xs[x + 1]) / 2 + terrain.centerX, centerZ = (zs[z] + zs[z + 1]) / 2 + terrain.centerZ;
                if (patches.some(p => centerX > p.minX && centerX < p.maxX && centerZ > p.minZ && centerZ < p.maxZ)) continue;
                const a = z * xs.length + x, b = a + xs.length;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
            patchGeometry?.dispose();
            patchGeometry = new THREE.BufferGeometry();
            patchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            patchGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            patchGeometry.setIndex(indices); patchGeometry.computeVertexNormals();
            if (grassVisible) ground.geometry = patchGeometry;
        },
        setGrassVisible(value) {
            grassVisible = value;
            ground.geometry = value && patchGeometry ? patchGeometry : geometry;
        },
        dispose() { geometry.dispose(); patchGeometry?.dispose(); },
        setSurface(id) {
            if (!Object.hasOwn(materials, id)) throw new Error(`Unknown Grass Debug land: ${id}`);
            selected = id;
            ground.material = materials[id];
        },
        getSnapshot() {
            return { ...surfaces[selected], grassPatchExcluded: grassVisible && !!patchGeometry };
        }
    });
}
