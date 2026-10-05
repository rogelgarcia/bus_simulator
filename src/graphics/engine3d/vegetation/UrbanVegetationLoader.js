// Loads original mature urban vegetation as shared library templates in metre units.
// @ts-check
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { URBAN_VEGETATION_SPECIES, URBAN_VEGETATION_VARIANTS } from '../../content3d/catalogs/TreeMeshCatalog.js';

const ASSET_BASE = new URL('../../../../assets/public/vegetation/', import.meta.url);
const promises = new Map();

function collectResources(roots) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    for (const root of roots) root.traverse((object) => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
            materials.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
            if (material.userData.aoAlphaMap?.isTexture) textures.add(material.userData.aoAlphaMap);
        }
    });
    return { geometries, materials, textures };
}

function disposeResources(resources) {
    for (const collection of Object.values(resources)) for (const resource of collection) resource.dispose();
}

function getRole(material, variant) {
    const name = material.name.toLowerCase();
    if (!material.isMeshStandardMaterial || (name !== 'bark' && name !== 'foliage')) {
        throw new Error(`[UrbanVegetationLoader] ${variant}: expected bark/foliage standard materials, received '${material.name}'.`);
    }
    const image = material.map?.image;
    if (!image || !(image.width > 0 && image.height > 0)) {
        throw new Error(`[UrbanVegetationLoader] ${variant}: '${material.name}' base-color texture is not ready.`);
    }
    return name === 'foliage' ? 'leaf' : 'trunk';
}

function createAoCoverageTexture(source, species) {
    const { width, height } = source.image;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('[UrbanVegetationLoader] Cannot decode leaf alpha for ambient occlusion.');
    context.drawImage(source.image, 0, 0);
    const data = context.getImageData(0, 0, width, height).data;
    const coverage = new Uint8Array(data.length);
    for (let index = 0; index < data.length; index += 4) {
        coverage[index] = data[index + 3];
        coverage[index + 1] = data[index + 3];
        coverage[index + 2] = data[index + 3];
        coverage[index + 3] = 255;
    }
    const texture = new THREE.DataTexture(coverage, width, height, THREE.RGBAFormat);
    texture.name = `${species}_foliage_ao_coverage`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.flipY = source.flipY;
    texture.wrapS = source.wrapS;
    texture.wrapT = source.wrapT;
    texture.magFilter = source.magFilter;
    texture.minFilter = source.minFilter;
    texture.generateMipmaps = source.generateMipmaps;
    texture.anisotropy = source.anisotropy;
    texture.channel = source.channel;
    texture.offset.copy(source.offset);
    texture.repeat.copy(source.repeat);
    texture.center.copy(source.center);
    texture.rotation = source.rotation;
    texture.needsUpdate = true;
    return texture;
}

function prepareTemplates(templates, species, resources) {
    const materials = { leaf: null, trunk: null };
    templates.forEach((root, index) => {
        const variant = URBAN_VEGETATION_VARIANTS[index].id;
        let triangles = 0;
        let vertices = 0;
        let drawCalls = 0;
        const roles = new Set();
        root.traverse((object) => {
            if (!object.isMesh) return;
            const list = Array.isArray(object.material) ? object.material : [object.material];
            const resolved = list.map((material) => {
                const role = getRole(material, `${species.id}/${variant}`);
                roles.add(role);
                if (!materials[role]) {
                    material.transparent = false;
                    material.depthWrite = true;
                    material.alphaToCoverage = false;
                    material.metalness = 0;
                    material.userData.treeSpecies = species.id;
                    material.userData.isFoliage = role === 'leaf';
                    if (role === 'leaf') {
                        material.alphaTest = 0;
                        material.side = THREE.FrontSide;
                        material.shadowSide = material.side;
                        material.userData.foliageSidedness = species.foliageSidedness;
                        material.userData.preserveShadowSide = true;
                        material.userData.alphaCutoutSource = 'geometry';
                        material.userData.foliageRepresentation = 'solid-leaves-v1';
                        material.userData.aoAlphaMap = createAoCoverageTexture(material.map, species.id);
                        resources.textures.add(material.userData.aoAlphaMap);
                    }
                    materials[role] = material;
                }
                return materials[role];
            });
            object.material = Array.isArray(object.material) ? resolved : resolved[0];
            object.castShadow = true;
            object.receiveShadow = true;
            object.userData.isFoliage = resolved.every((material) => material === materials.leaf);
            object.geometry.computeBoundingBox();
            object.geometry.computeBoundingSphere();
            vertices += object.geometry.attributes.position.count;
            triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
            drawCalls += Array.isArray(object.material) ? object.geometry.groups.length : 1;
        });
        if (roles.size !== 2) throw new Error(`[UrbanVegetationLoader] ${species.id}/${variant}: missing bark or foliage mesh.`);
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root);
        const height = bounds.max.y - bounds.min.y;
        if (bounds.isEmpty() || !Number.isFinite(height) || height <= 0 || Math.abs(bounds.min.y) > 0.05) {
            throw new Error(`[UrbanVegetationLoader] ${species.id}/${variant}: invalid metre-unit bounds or base above/below ground.`);
        }
        root.name = `${species.folder}_${variant}`;
        Object.assign(root.userData, {
            treeSpecies: species.id,
            treeVariant: variant,
            treeGrowthStage: 'mature',
            treeAssetRevision: species.assetRevision,
            vegetationKind: species.kind,
            treeBaseY: bounds.min.y,
            treeHeight: height,
            treeBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
            treeMetrics: { triangles, vertices, drawCalls }
        });
    });
    return Object.freeze({ templates: Object.freeze(templates), materials: Object.freeze(materials), species: species.id, assetRevision: species.assetRevision });
}

/** @param {{species?: 'london-plane'|'silver-linden'|'northern-red-oak'|'arrowwood-viburnum'|'american-elm'}} [options] */
export function loadUrbanVegetation({ species = 'london-plane' } = {}) {
    const definition = URBAN_VEGETATION_SPECIES.find(entry => entry.id === species);
    if (!definition) throw new Error(`[UrbanVegetationLoader] Unsupported species '${species}'.`);
    if (promises.has(species)) return promises.get(species);
    const loader = new GLTFLoader();
    const promise = Promise.allSettled(URBAN_VEGETATION_VARIANTS.map(async (variant) => {
        const fileName = `${definition.folder}/${variant.id}.glb`;
        try {
            return (await loader.loadAsync(new URL(fileName, ASSET_BASE).href)).scene;
        } catch (error) {
            throw new Error(`[UrbanVegetationLoader] Failed to load '${fileName}': ${error.message}`, { cause: error });
        }
    })).then((results) => {
        const roots = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
        const resources = collectResources(roots);
        try {
            const rejected = results.find((result) => result.status === 'rejected');
            if (rejected) throw rejected.reason;
            const assets = prepareTemplates(roots, definition, resources);
            const retained = collectResources(roots);
            for (const material of resources.materials) if (!retained.materials.has(material)) material.dispose();
            for (const texture of resources.textures) if (!retained.textures.has(texture)) texture.dispose();
            return assets;
        } catch (error) {
            disposeResources(resources);
            throw error;
        }
    }).catch((error) => {
        promises.delete(species);
        throw error;
    });
    promises.set(species, promise);
    return promise;
}
