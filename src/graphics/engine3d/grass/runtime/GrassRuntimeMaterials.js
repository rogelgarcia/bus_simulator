// Apply one city coverage mask to leaf, litter, transition and distant canopy materials.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { grassRuntimeMaskShader } from '../../../shaders/materials/grass/GrassRuntimeMaskShaderLoader.js';

const parts = Object.fromEntries([...grassRuntimeMaskShader.fragmentSource.matchAll(/\/\/ @section (\w+)\s*\n([\s\S]*?)(?=\/\/ @section|$)/g)].map(match => [match[1], match[2]]));

/** @param {THREE.Material} material @param {object} coverage @param {{value:THREE.Vector4}} window @param {object} staticShadows @param {boolean} far */
export function applyGrassRuntimeMask(material, coverage, window, staticShadows, far = false) {
    const uniforms = { grassRuntimeCoverage: { value: coverage.texture },
        grassRuntimeCoverageBounds: { value: new THREE.Vector4(-coverage.size / 2, -coverage.size / 2, 1 / coverage.size, 1 / coverage.size) },
        grassRuntimeWindow: window, grassRuntimeFar: { value: far ? 1 : 0 },
        grassRuntimeStaticVisibility: { value: staticShadows.target.texture }, grassRuntimeStaticBounds: { value: staticShadows.bounds } };
    material.defines.BAKED_GRASS_STATIC_SHADOWS = 1;
    attachShaderMetadata(material, grassRuntimeMaskShader);
    registerMaterialShaderHook(material, { id: 'grass.runtime-coverage', priority: 200, variantKey: grassRuntimeMaskShader.variantKey, uniforms,
        apply(shader) {
            Object.assign(shader.uniforms, uniforms);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + parts.pars)
                .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + parts.apply);
        } });
}
