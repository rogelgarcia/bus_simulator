// Add cached city visibility to the shared grass patch appearance.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { grassRuntimeShadowShader } from '../../../shaders/materials/grass/GrassRuntimeShadowShaderLoader.js';

/** @param {THREE.Material} material @param {object} staticShadows */
export function applyGrassRuntimeShadows(material, staticShadows) {
    const uniforms = {
        grassRuntimeStaticVisibility: { value: staticShadows.target.texture }, grassRuntimeStaticBounds: { value: staticShadows.bounds } };
    material.defines.BAKED_GRASS_STATIC_SHADOWS = 1;
    attachShaderMetadata(material, grassRuntimeShadowShader);
    registerMaterialShaderHook(material, { id: 'grass.runtime-shadows', priority: 200, variantKey: grassRuntimeShadowShader.variantKey, uniforms,
        apply(shader) {
            Object.assign(shader.uniforms, uniforms);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + grassRuntimeShadowShader.fragmentSource);
        } });
}
