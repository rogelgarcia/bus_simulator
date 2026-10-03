// Reuse live grass shading while rotating only the card geometry.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PlateMaterial } from './GrassDebugV2PlateMaterial.js?v=lod3-plates-2';
import { grassBillboardParsShader, grassBillboardPositionShader, grassBillboardUvShader, grassBillboardNormalShader } from '../../shaders/materials/grass/GrassBillboardShaderLoader.js?v=lod3-triads-1';
import { grassRibbonCardNormalShader } from '../../shaders/materials/grass/GrassRibbonCardShaderLoader.js?v=lod3-w-1';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {THREE.Material} material @param {object} uniforms @param {boolean} lighting */
export function attachGrassBillboardPlacement(material, uniforms, lighting = false) {
    const payloads = [grassBillboardParsShader, grassBillboardPositionShader, grassBillboardUvShader, grassBillboardNormalShader];
    payloads.forEach(payload => attachShaderMetadata(material, payload));
    registerMaterialShaderHook(material, { id: 'grass.billboard.placement', priority: 10, variantKey: payloads.map(p => p.variantKey).join('|'), uniforms,
        apply: shader => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + grassBillboardParsShader.vertexSource)
                .replace('#include <begin_vertex>', grassBillboardPositionShader.vertexSource)
                .replace('#include <uv_vertex>', grassBillboardUvShader.vertexSource)
                .replace('#include <beginnormal_vertex>', grassBillboardNormalShader.vertexSource);
            if (lighting) {
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + grassBillboardParsShader.fragmentSource);
                if (!shader.fragmentShader.includes(grassRibbonCardNormalShader.fragmentSource)) throw new Error('Billboard source normal hook is missing.');
                shader.fragmentShader = shader.fragmentShader.replace(grassRibbonCardNormalShader.fragmentSource, grassBillboardNormalShader.fragmentSource);
            }
        }
    });
}

/** @param {object} maps @param {object} uniforms */
export function createGrassDebugV2BillboardMaterial(maps, uniforms) {
    const material = createGrassDebugV2PlateMaterial(maps);
    material.side = THREE.DoubleSide; material.shadowSide = THREE.DoubleSide; material.name = 'GrassV2TriadPlates';
    attachGrassBillboardPlacement(material, uniforms, true);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: maps.albedo, alphaTest: .5, side: THREE.DoubleSide });
    const shadowUniforms = { ...uniforms, grassTriadTurns: { value: new THREE.Vector3() } };
    attachGrassBillboardPlacement(depth, shadowUniforms);
    return Object.freeze({ material, depth });
}
