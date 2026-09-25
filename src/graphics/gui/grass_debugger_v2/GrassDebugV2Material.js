// Both grass representations share thin-leaf transmission and direct-light canopy shading.
// @ts-check
import * as THREE from 'three';
import { grassBladeLightingShader } from '../../shaders/materials/grass/GrassBladeLightingShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @typedef {{grassCanopyBounds: {value: THREE.Vector4}, grassCanopyHeight: {value: number}, grassCanopyOpticalDepth: {value: number}}} GrassDebugV2CanopyUniforms */

/** @param {THREE.MeshStandardMaterialParameters} parameters @param {GrassDebugV2CanopyUniforms|null} canopy @returns {THREE.MeshStandardMaterial} */
export function createGrassDebugV2Material(parameters, canopy = null) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0, side: THREE.DoubleSide, ...parameters });
    if (canopy) material.defines = { ...material.defines, GRASS_CANOPY: 1 };
    attachShaderMetadata(material, grassBladeLightingShader);
    registerMaterialShaderHook(material, {
        id: 'grass.blade_lighting', variantKey: grassBladeLightingShader.variantKey,
        uniforms: canopy,
        apply: shader => {
            const anchor = '#include <lights_physical_pars_fragment>';
            if (!shader.fragmentShader.includes(anchor)) throw new Error('Grass blade lighting shader contract changed');
            shader.fragmentShader = shader.fragmentShader.replace(anchor, grassBladeLightingShader.fragmentSource);
            if (canopy) Object.assign(shader.uniforms, canopy);
        }
    });
    return material;
}
