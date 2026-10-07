// Loads optional distant tree assets and supplies explicit billboard updates before color and shadow passes.
// @ts-check
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { bindVegetationLeafTransmission } from './VegetationLeafMaterial.js';
import { createDistantBillboardUpdater } from './DistantTreeBillboard.js';
import { shareDistantVegetationTextures } from './DistantVegetationTextures.js';

const base = new URL('../../../../assets/public/vegetation_distant/', import.meta.url);
const decoders = new WeakMap();
const speciesIds = new Set(['london_plane', 'silver_linden', 'northern_red_oak', 'american_elm', 'arrowwood_viburnum']);

/** @param {{species:string, variant?:string, level:number, renderer:any}} options */
export async function loadDistantVegetation({ species, variant = 'mature_01', level, renderer }) {
    if (!speciesIds.has(species) || ![3, 4, 5, 6].includes(level) || !renderer?.isWebGLRenderer
        || !(level === 6 ? /^cluster_0[123]$/ : /^mature_0[123]$/).test(variant)) throw new Error('Invalid distant vegetation selection');
    let ktx = decoders.get(renderer);
    if (!ktx) {
        ktx = new KTX2Loader().setTranscoderPath(new URL('../../../lib/basis/0.183.2/', import.meta.url).href).setWorkerLimit(1).detectSupport(renderer);
        decoders.set(renderer, ktx);
    }
    const response = await fetch(new URL(`${species}/index.json`, base));
    if (!response.ok) throw new Error(`Distant vegetation manifest failed: ${response.status}`);
    const manifest = await response.json(), record = manifest.models.find(row => row.id === variant && row.level === level);
    if (!record || record.file !== `${variant}_lod${level}.glb`) throw new Error('Missing distant vegetation model');
    const loader = new GLTFLoader().setKTX2Loader(ktx);
    const root = (await loader.loadAsync(new URL(`${species}/${record.file}`, base).href)).scene;
    const shared = shareDistantVegetationTextures(root, record, renderer);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(object => {
        if (!object.isMesh) return;
        geometries.add(object.geometry); materials.add(object.material);
        for (const value of Object.values(object.material)) if (value?.isTexture && !shared.textures.has(value)) textures.add(value);
        object.castShadow = true; object.receiveShadow = true;
        const material = object.material, cutout = !material.name.includes('geometry');
        material.transparent = false; material.depthWrite = true;
        if (cutout) { material.alphaTest = .5; material.side = THREE.DoubleSide; material.shadowSide = THREE.DoubleSide; }
        if (material.name.startsWith('Distant leaves')) bindVegetationLeafTransmission(material, .17);
    });
    root.userData.distantTree = record;
    const update = level >= 5 ? createDistantBillboardUpdater(root, record) : () => {};
    let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; shared.release(); for (const item of [...geometries, ...materials, ...textures]) item.dispose(); };
    return Object.freeze({ root, record, update, dispose });
}

/** @param {object} renderer */
export function disposeDistantVegetationDecoder(renderer) {
    decoders.get(renderer)?.dispose(); decoders.delete(renderer);
}
