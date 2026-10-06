// Re-light stable captured leaves in the continuously rotating card's basis.
import * as THREE from 'three';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { applyGrassDebugV2DistanceAppearance } from './GrassDebugV2DistanceAppearance.js';
import { grassViewCardsShader } from '../../shaders/materials/grass/GrassViewCardsShaderLoader.js?v=card-continuity-1';
import { grassPlateCoverageShader } from '../../shaders/materials/grass/GrassPlateShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

function sections(source) {
    const parts = source.split(/\/\/ @section (\w+)\s*\n/), result = {};
    for (let i = 1; i < parts.length; i += 2) result[parts[i]] = parts[i + 1];
    return result;
}

export function createGrassDebugV2ViewCardsMaterial(maps, source, shape, span) {
    const material = createGrassDebugV2Material({ map: maps.albedo, normalMap: maps.normal,
        // Linear leaf-only calibration across front, side and rear bus views. Keep
        // litter untouched and share the same live lighting as the source leaves.
        roughnessMap: maps.roughness, color: source.color.clone().multiply(new THREE.Color(.76, .84, .305)), roughness: 1, metalness: 0,
        side: THREE.FrontSide, alphaTest: .5, alphaToCoverage: true,
        envMap: source.envMap, envMapIntensity: source.envMapIntensity,
        defines: { GRASS_LEAF_TRANSLUCENCY: 1, GRASS_RIBBON_CARD: 1, USE_UV: 1 } });
    const vertex = sections(grassViewCardsShader.vertexSource), fragment = sections(grassViewCardsShader.fragmentSource);
    const uniforms = { grassViewCardShape: { value: shape }, grassViewCardSpan: { value: span } };
    [grassViewCardsShader, grassPlateCoverageShader].forEach(payload => attachShaderMetadata(material, payload));
    registerMaterialShaderHook(material, { id: 'grass.view_cards', priority: 10,
        variantKey: grassViewCardsShader.variantKey + grassPlateCoverageShader.variantKey, uniforms,
        apply(shader) {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + vertex.pars)
                .replace('#include <begin_vertex>', vertex.begin);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragment.pars)
                .replace('#include <map_fragment>', fragment.map)
                .replace('#include <roughnessmap_fragment>', fragment.roughness)
                .replace('#include <normal_fragment_maps>', fragment.normal)
                .replace('#include <alphatest_fragment>', grassPlateCoverageShader.fragmentSource);
        }
    });
    material.name = 'GrassLOD3ViewCards';
    applyGrassDebugV2DistanceAppearance(material);
    material.userData.grassFieldDistance.value.copy(source.userData.grassFieldDistance.value);
    return material;
}
