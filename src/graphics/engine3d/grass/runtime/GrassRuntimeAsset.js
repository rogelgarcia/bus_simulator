// Load the authenticated compact grass package without importing authoring or lab scenes.
// @ts-check
import * as THREE from 'three';
import { createBakedGrassMaterial } from './GrassDebugV2BakedAppearance.js';

const TYPES = Object.freeze({ Float32Array, Uint32Array, Uint16Array, Int16Array, Uint8Array });
export const GRASS_RUNTIME_ROOT = '/assets/public/grass/gameplay/';

/** @param {{renderer:THREE.WebGLRenderer,root?:string}} options */
export async function loadGrassRuntimeAsset({ renderer, root = GRASS_RUNTIME_ROOT }) {
    const responses = await Promise.all(['manifest.json', 'grass.bin'].map(name => fetch(root + name)));
    if (responses.some(response => !response.ok)) throw new Error('[Grass] Runtime assets unavailable. Run the materials/grass/gameplay-runtime bake with --publish.');
    const manifest = await responses[0].json(), bytes = await responses[1].arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    if (manifest.schema !== 'bus-simulator.gameplay-grass' || manifest.version !== 1 || bytes.byteLength !== manifest.bytes || hash !== manifest.sha256
        || manifest.appearance?.paletteRevision !== 'canopy-palette-17') throw new Error('[Grass] Invalid or stale runtime package.');
    const geometries = [], textures = [], materials = [];
    const array = record => {
        const Type = TYPES[record.type];
        if (!Type || !Number.isInteger(record.offset) || !Number.isInteger(record.length) || record.offset < 0 || record.length < 1
            || record.offset % Type.BYTES_PER_ELEMENT || record.offset + record.length * Type.BYTES_PER_ELEMENT > bytes.byteLength)
            throw new Error('[Grass] Invalid runtime buffer range.');
        return new Type(bytes, record.offset, record.length);
    };
    const geometry = record => {
        const result = new THREE.BufferGeometry(); geometries.push(result);
        for (const [name, attribute] of Object.entries(record.attributes)) result.setAttribute(name, new THREE.BufferAttribute(array(attribute), attribute.itemSize, attribute.normalized));
        result.setIndex(new THREE.BufferAttribute(array(record.index), 1));
        result.userData.grassLeafCount = record.leafCount;
        result.computeBoundingBox(); result.computeBoundingSphere(); return result;
    };
    const texture = record => {
        const mipmaps = record.mipmaps.map(mip => ({ width: mip.width, height: mip.height, data: array(mip) }));
        const result = new THREE.DataTexture(mipmaps[0].data, record.width, record.height, THREE.RGBAFormat); textures.push(result);
        result.mipmaps = mipmaps.length > 1 ? mipmaps : []; result.generateMipmaps = mipmaps.length === 1; result.colorSpace = THREE.NoColorSpace;
        result.minFilter = THREE.LinearMipmapLinearFilter; result.magFilter = THREE.LinearFilter;
        result.wrapS = result.wrapT = THREE.RepeatWrapping;
        result.anisotropy = Math.min(record.anisotropy, renderer.capabilities.getMaxAnisotropy()); result.needsUpdate = true;
        return result;
    };
    const dispose = () => { geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); };
    try {
        const white = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat); textures.push(white); white.needsUpdate = true;
        const shadowUniforms = { grassCanopyShadowVisibility: { value: white }, grassCanopyShadowBounds: { value: new THREE.Vector4(0, 0, 1, 1) }, grassCanopyShadowPass: { value: 2 } };
        const settings = { brightness: { value: 1 }, shadows: { value: 1 } };
        const canopyMaps = manifest.canopy.map(texture), litterMaps = manifest.litter.map(texture);
        const material = (color, maps = [], vertexColors = false) => {
            const value = createBakedGrassMaterial({ maps, vertexColors, shadowUniforms, settings: { ...settings, radiance: new THREE.Color().fromArray(color) } });
            materials.push(value); return value;
        };
        const leaf = material(manifest.leafColor, [], true), canopyMaterial = material(manifest.canopyColor, canopyMaps), litterMaterial = material(manifest.litterColor, litterMaps);
        for (const value of [canopyMaterial, litterMaterial]) value.defines.BAKED_GRASS_TILE_VARIATION = 1;
        Object.assign(canopyMaterial.defines, { BAKED_GRASS_CANOPY_VIEW: 1, BAKED_GRASS_CANOPY_UV_SCALE: manifest.canopyUvScale.toFixed(3) });
        for (const value of [leaf, canopyMaterial]) value.userData.grassProjectedCanopyBlend = true;
        leaf.userData.grassCanopyHandoff = { maps: canopyMaps, color: canopyMaterial.color, uvScale: manifest.canopyUvScale, height: manifest.definition.height };
        const sources = Object.fromEntries(Object.entries(manifest.sources).map(([level, record]) => {
            const mesh = new THREE.Mesh(geometry(record), leaf); mesh.userData.grassLeafRanges = record.ranges; return [level, mesh];
        }));
        const [lod3, bridge] = manifest.blades.map(group => ({ templates: group.map(geometry), material: leaf, textureBytes: 0 }));
        return Object.freeze({ sources, lod3, bridge, settings, shadowUniforms, materials, manifest, maps: { canopy: canopyMaps, litter: litterMaps },
            canopy: { materials: { all: canopyMaterial }, rootShade: .32, getSnapshot: () => ({ definition: manifest.definition }) },
            soilMaterial: litterMaterial, litterMaterial, soilUv: new THREE.Matrix3(), litterUv: new THREE.Matrix3(), tileVariation: true,
            dispose });
    } catch (error) { dispose(); throw error; }
}
