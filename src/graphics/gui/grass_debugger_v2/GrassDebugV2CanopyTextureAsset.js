// Load authenticated offline canopy maps directly into GPU-compressed texture storage.
// @ts-check
import * as THREE from 'three';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
import { createGrassDebugV2CanopyMaterials } from './GrassDebugV2CanopyMaterial.js';
import { cloneMaterialShaderContract, registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

export const GRASS_CANOPY_TEXTURE_ROOT = '/assets/public/grass/lod4/maps/';
const CHANNELS = ['albedo', 'normal', 'roughness', 'visibility'];
async function fetchBytes(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Offline canopy asset unavailable: ' + url + ' (' + response.status + ')');
    return response.arrayBuffer();
}
async function sha256(bytes) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}

export async function loadGrassCanopyTextureAsset({ renderer, shadowDirection, root = GRASS_CANOPY_TEXTURE_ROOT, anisotropy = 8 }) {
    if (!Number.isInteger(anisotropy) || anisotropy < 1) throw new Error('Canopy anisotropy must be a positive integer.');
    if (!renderer.extensions.has('WEBGL_compressed_texture_s3tc')) throw new Error('This canopy experiment requires GPU S3TC/BC1/BC3 support.');
    const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes(root + 'manifest.json')));
    if (manifest.schema !== 'bus-simulator.grass-canopy-maps' || manifest.version !== 1 || manifest.maps?.length !== 8
        || manifest.definition?.tileMeters !== 2 || manifest.metadata?.bake?.shadowResolution !== 8192
        || shadowDirection.toArray().some((n, i) => Math.abs(n - manifest.metadata.bake.shadowDirection[i]) > 1e-5))
        throw new Error('Offline canopy manifest does not match the scene/shadow contract.');
    if (await sha256(await fetchBytes('/assets/public/grass/lod4/layout.json')) !== manifest.layoutSha256)
        throw new Error('Offline canopy maps are stale: source layout changed.');
    const textures = [{}, {}], owned = [], loader = new DDSLoader();
    try {
        for (const entry of manifest.maps) {
            if (![0, 1].includes(entry.variant) || !CHANNELS.includes(entry.channel) || textures[entry.variant][entry.channel]
                || !/^tile[01]_(albedo|normal|roughness|visibility)\.dds$/.test(entry.file)) throw new Error('Invalid offline canopy channel.');
            const bytes = await fetchBytes(root + entry.file);
            if (await sha256(bytes) !== entry.sha256) throw new Error('Offline canopy checksum mismatch: ' + entry.file);
            const data = loader.parse(bytes, true), expectedSize = entry.channel === 'visibility' ? 4096 : 1024;
            const expectedFormat = entry.channel === 'visibility' ? THREE.RGB_S3TC_DXT1_Format : THREE.RGBA_S3TC_DXT5_Format;
            if (data.width !== expectedSize || data.height !== expectedSize || data.format !== expectedFormat
                || data.mipmaps.length !== Math.log2(expectedSize) + 1
                || data.mipmaps.reduce((sum, mip) => sum + mip.data.byteLength, 0) !== entry.residentBytes)
                throw new Error('Offline canopy dimensions/format/mips mismatch: ' + entry.file);
            const texture = new THREE.CompressedTexture(data.mipmaps, data.width, data.height, data.format);
            texture.name = 'OfflineCanopy-' + entry.file; texture.colorSpace = THREE.NoColorSpace;
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy());
            texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
            texture.flipY = false; texture.userData = { ...entry.userData }; texture.needsUpdate = true;
            textures[entry.variant][entry.channel] = texture; owned.push(texture);
        }
        if (textures.some(tile => CHANNELS.some(channel => !tile[channel]))) throw new Error('Incomplete offline canopy maps.');
        const shadowUniforms = { grassCanopyShadowVisibility: { value: null }, grassCanopyShadowBounds: { value: new THREE.Vector4() }, grassCanopyShadowPass: { value: 0 } };
        const materials = createGrassDebugV2CanopyMaterials({ texturesByLayer: { all: textures[0] }, secondaryTexturesByLayer: { all: textures[1] },
            shadowUniforms, ...manifest.definition, sourceHeight: manifest.metadata.bake.sourceHeight });
        return Object.freeze({ materials, shadowUniforms, textures,
            getSnapshot: () => ({ definition: manifest.definition, layout: manifest.metadata.layout, bake: { ...manifest.metadata.bake,
                offline: true, formats: ['BC3', 'BC3', 'BC3', 'BC1'], estimatedTextureBytes: manifest.residentBytes,
                residentTextureBytes: manifest.residentBytes, diskBytes: manifest.diskBytes, layers: ['all'], layerVariants: 1 } }),
            dispose() { Object.values(materials).forEach(material => material.dispose()); owned.forEach(texture => texture.dispose()); } });
    } catch (error) { owned.forEach(texture => texture.dispose()); throw error; }
}

export function createGrassCompressedCanopyMaterial(source, asset) {
    const material = cloneMaterialShaderContract(source), [a, b] = asset.textures;
    material.map = a.albedo; material.normalMap = a.normal; material.roughnessMap = a.roughness;
    const uniforms = { grassCanopyTileVisibility: { value: a.visibility }, grassCanopyAlbedoB: { value: b.albedo },
        grassCanopyNormalB: { value: b.normal }, grassCanopyRoughnessB: { value: b.roughness }, grassCanopyVisibilityB: { value: b.visibility } };
    registerMaterialShaderHook(material, { id: 'grass.offline-textures', priority: 210, variantKey: 'bc3-bc1-v1', uniforms,
        apply: shader => Object.assign(shader.uniforms, uniforms) });
    return Object.freeze({ material, dispose: () => material.dispose() });
}
