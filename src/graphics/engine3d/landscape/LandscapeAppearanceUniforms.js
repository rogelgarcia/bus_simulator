// Declares the shared landscape appearance shader interface.
// @ts-check
import * as THREE from 'three';

export const LANDSCAPE_MASK_SLOTS = 17;
export const LANDSCAPE_SOIL_SLOTS = 6;

/** @returns {any} */
export function createLandscapeAppearanceUniforms() {
    const uniforms = {
        uAppearanceReady: { value: 0 },
        uMaskPages: { value: null },
        uMaskDimensions: { value: new THREE.Vector2(257, 257) },
        uMaskBounds: { value: Array.from({ length: LANDSCAPE_MASK_SLOTS }, () => new THREE.Vector4()) },
        uMaskMeta: { value: Array.from({ length: LANDSCAPE_MASK_SLOTS }, () => new THREE.Vector4(-1, 0, 0, 0)) },
        uSoilScale: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(4, 1, 1, 0)) },
        uSoilAlbedo: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(1, 0, 0, 0)) },
        uSoilRoughness: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(0, 1, 1, 0)) },
        uSoilRange: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(0, 1, 1, 0)) },
        uMaterialBlendIndex: { value: -1 },
        uMaterialBlend: { value: 1 },
        uBlendBase: { value: null },
        uBlendSurface: { value: null }
    };
    for (let i = 0; i < LANDSCAPE_SOIL_SLOTS; i++) { uniforms[`uSoilBase${i}`] = { value: null }; uniforms[`uSoilSurface${i}`] = { value: null }; }
    return uniforms;
}
