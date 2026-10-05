// Creates the terrain-field RGBA8 texture array: linear filtering inside each layer, no mipmaps, no color conversion, layer-wise uploads.
// @ts-check
import * as THREE from 'three';

/** @param {{pixels:Uint8Array,width:number,height:number,depth:number}} input */
export function createLandscapeTerrainFieldTexture({ pixels, width, height, depth }) {
    const texture = new THREE.DataArrayTexture(pixels, width, height, depth);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 4;
    return texture;
}
