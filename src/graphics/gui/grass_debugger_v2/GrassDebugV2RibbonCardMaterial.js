// Apply source PBR maps and stable camera-facing normals to two-triangle ribbon cards.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js?v=lod3-w-1';
import { grassRibbonCardShader, grassRibbonCardMapShader, grassRibbonCardNormalShader, grassRibbonCardRoughnessShader } from '../../shaders/materials/grass/GrassRibbonCardShaderLoader.js?v=lod3-w-1';
import { grassPlantCoverageShader } from '../../shaders/materials/grass/GrassPlantCoverageShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {{albedo: THREE.Texture, dry: THREE.Texture, normal: THREE.Texture, roughness: THREE.Texture}} atlas */
export function createGrassDebugV2RibbonCardMaterial(atlas) {
    const material = createGrassDebugV2Material({ vertexColors: true, map: atlas.albedo,
        normalMap: atlas.normal, normalMapType: THREE.TangentSpaceNormalMap, roughnessMap: atlas.roughness,
        roughness: 1, alphaTest: 0.15, alphaToCoverage: true, defines: { GRASS_LEAF_TRANSLUCENCY: 1, GRASS_RIBBON_CARD: 1, USE_UV: 1 } });
    const payloads = [grassRibbonCardShader, grassRibbonCardMapShader, grassRibbonCardNormalShader, grassRibbonCardRoughnessShader, grassPlantCoverageShader];
    for (const payload of payloads) attachShaderMetadata(material, payload);
    registerMaterialShaderHook(material, { id: 'grass.ribbon.card', variantKey: payloads.map(p => p.variantKey).join('|'),
        uniforms: { grassDryMap: { value: atlas.dry } },
        apply: shader => {
            for (const anchor of ['#include <map_fragment>', '#include <normal_fragment_maps>', '#include <alphatest_fragment>', '#include <roughnessmap_fragment>'])
                if (!shader.fragmentShader.includes(anchor)) throw new Error('Ribbon card shader contract changed: ' + anchor);
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + grassRibbonCardShader.vertexSource)
                .replace('#include <uv_vertex>', grassRibbonCardMapShader.vertexSource);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + grassRibbonCardShader.fragmentSource)
                .replace('#include <map_fragment>', grassRibbonCardMapShader.fragmentSource)
                .replace('#include <normal_fragment_maps>', grassRibbonCardNormalShader.fragmentSource)
                .replace('#include <roughnessmap_fragment>', grassRibbonCardRoughnessShader.fragmentSource)
                .replace('#include <alphatest_fragment>', grassPlantCoverageShader.fragmentSource);
        }
    });
    material.name = 'GrassV2RibbonLOD3';
    return material;
}
