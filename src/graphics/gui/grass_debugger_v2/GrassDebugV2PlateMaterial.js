// Apply live grass lighting to bespoke source-color plates.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js?v=lod3-w-1';
import { grassPlateRoughnessShader, grassPlateParsShader, grassPlateCoverageShader } from '../../shaders/materials/grass/GrassPlateShaderLoader.js?v=lod3-plates-2';
import { grassRibbonCardNormalShader } from '../../shaders/materials/grass/GrassRibbonCardShaderLoader.js?v=lod3-w-1';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {{albedo:THREE.Texture, normal:THREE.Texture, roughness:THREE.Texture}} maps */
export function createGrassDebugV2PlateMaterial(maps) {
    const material = createGrassDebugV2Material({ vertexColors: true, map: maps.albedo, normalMap: maps.normal,
        normalMapType: THREE.TangentSpaceNormalMap, roughnessMap: maps.roughness, roughness: 1,
        alphaTest: .5, alphaToCoverage: true, defines: { GRASS_LEAF_TRANSLUCENCY: 1, GRASS_RIBBON_CARD: 1, USE_UV: 1 } });
    const payloads = [grassPlateRoughnessShader, grassPlateParsShader, grassRibbonCardNormalShader, grassPlateCoverageShader];
    payloads.forEach(payload => attachShaderMetadata(material, payload));
    registerMaterialShaderHook(material, { id: 'grass.dynamic.plates', variantKey: payloads.map(p => p.variantKey).join('|'),
        apply: shader => {
            for (const [anchor, source] of [
                ['#include <normal_fragment_maps>', grassRibbonCardNormalShader.fragmentSource],
                ['#include <roughnessmap_fragment>', grassPlateRoughnessShader.fragmentSource],
                ['#include <alphatest_fragment>', grassPlateCoverageShader.fragmentSource]
            ]) {
                if (!shader.fragmentShader.includes(anchor)) throw new Error('Plate shader contract changed: ' + anchor);
                shader.fragmentShader = shader.fragmentShader.replace(anchor, source);
            }
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + grassPlateParsShader.fragmentSource);
        }
    });
    material.name = 'GrassV2DynamicPlates'; return material;
}
