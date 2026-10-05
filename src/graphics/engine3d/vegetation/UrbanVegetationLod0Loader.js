// Loads opt-in LOD0 vegetation with shared compressed canopy maps and per-variant baked wood.
// Renderer-scoped caching avoids duplicate KTX2 transcoding while keeping texture ownership explicit.
// @ts-check
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { URBAN_VEGETATION_LOD0_SPECIES, URBAN_VEGETATION_VARIANTS } from '../../content3d/catalogs/TreeMeshCatalog.js';
import { bindVegetationLeafTransmission } from './VegetationLeafMaterial.js';

const ASSET_BASE = new URL('../../../../assets/public/vegetation_lod0/', import.meta.url);
const TRANSCODER_BASE = new URL('../../../lib/basis/0.183.2/', import.meta.url);
const rendererLibraries = new WeakMap();

class SharedKtx2Loader extends KTX2Loader {
    constructor(renderer) {
        super();
        this.textures = new Map();
        this.setTranscoderPath(TRANSCODER_BASE.href).setWorkerLimit(2).detectSupport(renderer);
    }

    load(url, onLoad, onProgress, onError) {
        let pending = this.textures.get(url);
        if (!pending) {
            pending = new Promise((resolve, reject) => super.load(url, resolve, onProgress, reject));
            this.textures.set(url, pending);
            pending.catch(() => this.textures.delete(url));
        }
        pending.then(onLoad, onError);
    }
}

function prepareTemplates(templates, species) {
    let sharedLeaf = null;
    const materialsByVariant = [];
    for (const [index, root] of templates.entries()) {
        const variant = URBAN_VEGETATION_VARIANTS[index].id;
        const materials = { leaf: null, trunk: null };
        const metrics = { triangles: 0, vertices: 0, drawCalls: 0, woodTriangles: 0, leafTriangles: 0 };
        root.traverse(object => {
            if (!object.isMesh) return;
            const material = object.material;
            if (!material.isMeshStandardMaterial || !['bark', 'foliage'].includes(material.name)
                || ![material.map, material.normalMap, material.roughnessMap].every(texture => texture?.image?.width > 0)) {
                throw new Error(`[UrbanVegetationLod0Loader] ${species.id}/${variant}: incomplete baked material.`);
            }
            const leaf = material.name === 'foliage';
            material.transparent = false;
            material.depthWrite = true;
            material.alphaToCoverage = false;
            material.userData.treeSpecies = species.id;
            material.userData.isFoliage = leaf;
            if (leaf) {
                material.alphaTest = 0.5;
                material.side = THREE.DoubleSide;
                material.shadowSide = THREE.DoubleSide;
                Object.assign(material.userData, {
                    foliageSidedness: 'double-sided',
                    preserveShadowSide: true,
                    alphaCutoutSource: 'map',
                    foliageRepresentation: species.assetRevision
                });
                if (!sharedLeaf) {
                    const extension = material.userData.gltfExtensions?.KHR_materials_diffuse_transmission;
                    bindVegetationLeafTransmission(material, extension?.diffuseTransmissionFactor ?? 0.17);
                    sharedLeaf = material;
                } else if (sharedLeaf !== material) material.dispose();
                object.material = sharedLeaf;
            }
            materials[leaf ? 'leaf' : 'trunk'] = object.material;
            object.userData.isFoliage = leaf;
            object.castShadow = true;
            object.receiveShadow = true;
            object.geometry.computeBoundingBox();
            object.geometry.computeBoundingSphere();
            const triangles = (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
            metrics.triangles += triangles;
            metrics[leaf ? 'leafTriangles' : 'woodTriangles'] += triangles;
            metrics.vertices += object.geometry.attributes.position.count;
            metrics.drawCalls += 1;
        });
        if (!materials.leaf || !materials.trunk) throw new Error(`[UrbanVegetationLod0Loader] ${species.id}/${variant}: missing bark or foliage.`);
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root);
        const height = bounds.max.y - bounds.min.y;
        if (bounds.isEmpty() || !Number.isFinite(height) || height <= 0 || Math.abs(bounds.min.y) > 0.05) {
            throw new Error(`[UrbanVegetationLod0Loader] ${species.id}/${variant}: invalid metre-unit bounds.`);
        }
        root.name = `${species.folder}_${variant}_lod0`;
        Object.assign(root.userData, {
            treeSpecies: species.id,
            treeVariant: variant,
            treeGrowthStage: 'mature',
            treeAssetRevision: species.assetRevision,
            vegetationKind: species.kind,
            treeBaseY: bounds.min.y,
            treeHeight: height,
            treeBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
            treeMetrics: metrics
        });
        materialsByVariant.push(Object.freeze(materials));
    }
    return Object.freeze({ templates: Object.freeze(templates), materialsByVariant: Object.freeze(materialsByVariant), species: species.id, assetRevision: species.assetRevision });
}

/** @param {{species?:string, renderer:object}} options */
export function loadUrbanVegetationLod0({ species = 'london-plane', renderer }) {
    const definition = URBAN_VEGETATION_LOD0_SPECIES.find(entry => entry.id === species);
    if (!definition || !renderer?.isWebGLRenderer) throw new Error('[UrbanVegetationLod0Loader] Expected a catalog species and WebGL renderer.');
    let library = rendererLibraries.get(renderer);
    if (!library) {
        library = { ktx2: new SharedKtx2Loader(renderer), promises: new Map() };
        rendererLibraries.set(renderer, library);
    }
    if (library.promises.has(species)) return library.promises.get(species);
    const loader = new GLTFLoader().setKTX2Loader(library.ktx2);
    const pending = Promise.allSettled(URBAN_VEGETATION_VARIANTS.map(async variant => {
        const file = new URL(`${definition.folder}/${variant.id}.glb`, ASSET_BASE);
        return (await loader.loadAsync(file.href)).scene;
    })).then(results => {
        const roots = results.filter(result => result.status === 'fulfilled').map(result => result.value);
        try {
            const rejected = results.find(result => result.status === 'rejected');
            if (rejected) throw rejected.reason;
            return prepareTemplates(roots, definition);
        } catch (error) {
            disposeRoots(roots);
            throw error;
        }
    }).catch(error => {
        library.promises.delete(species);
        throw error;
    });
    library.promises.set(species, pending);
    return pending;
}

function disposeRoots(roots) {
    const resources = new Set();
    for (const root of roots) root.traverse(object => {
        if (!object.isMesh) return;
        resources.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    });
    for (const resource of resources) resource.dispose();
}

/** Release a renderer's library only after all instances using its templates have been removed. @param {object} renderer */
export async function disposeUrbanVegetationLod0(renderer) {
    const library = rendererLibraries.get(renderer);
    if (!library) return;
    rendererLibraries.delete(renderer);
    const results = await Promise.allSettled(library.promises.values());
    for (const result of results) if (result.status === 'fulfilled') disposeRoots(result.value.templates);
    const textures = await Promise.allSettled(library.ktx2.textures.values());
    for (const result of textures) if (result.status === 'fulfilled') result.value.dispose();
    library.ktx2.dispose();
}
