// Merge litter cutouts with world-aligned soil in one opaque, normally lit surface.
// @ts-check
import * as THREE from 'three';
import { litterSoilParsShader, litterSoilMapShader, litterSoilSurfaceShader, litterSoilNormalShader, litterSoilAoShader } from '../../shaders/materials/grass/GrassLitterSoilShaderLoader.js?v=litter-merged-1';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {{ litter: THREE.MeshStandardMaterial, soil: THREE.MeshStandardMaterial, soilUv: THREE.Matrix3 }} options */
export function createGrassDebugV2LitterSoilMaterial({ litter, soil, soilUv }) {
    if (!litter.map || litter.alphaMap || !litter.normalMap || !litter.aoMap || !soil.map || !soil.normalMap
        || !soil.roughnessMap || soil.roughnessMap.source !== soil.metalnessMap?.source || !soil.aoMap)
        throw new Error('Merged litter requires the exported RGBA litter and packed soil ORM material.');
    const material = litter.clone();
    material.name = 'Merged_' + litter.name;
    material.alphaTest = 0; material.alphaToCoverage = false; material.transparent = false; material.opacity = 1;
    material.polygonOffset = false;
    for (const texture of [soil.map, soil.normalMap, soil.roughnessMap, soil.aoMap]) texture.updateMatrix();
    const uniforms = {
        litterSoilUv: { value: soilUv },
        litterSoilMapTransform: { value: soil.map.matrix }, litterSoilNormalTransform: { value: soil.normalMap.matrix },
        litterSoilOrmTransform: { value: soil.roughnessMap.matrix }, litterSoilAoTransform: { value: soil.aoMap.matrix },
        litterSoilMap: { value: soil.map }, litterSoilNormal: { value: soil.normalMap },
        litterSoilOrm: { value: soil.roughnessMap }, litterSoilAo: { value: soil.aoMap },
        litterSoilColor: { value: soil.color }, litterSoilNormalScale: { value: soil.normalScale },
        litterSoilRoughness: { value: soil.roughness }, litterSoilMetalness: { value: soil.metalness },
        litterSoilAoIntensity: { value: soil.aoMapIntensity }
    };
    const payloads = [litterSoilParsShader, litterSoilMapShader, litterSoilSurfaceShader, litterSoilNormalShader, litterSoilAoShader];
    payloads.forEach(payload => attachShaderMetadata(material, payload));
    registerMaterialShaderHook(material, {
        id: 'grass.litter-soil', priority: 10, variantKey: payloads.map(p => p.variantKey).join('|'), uniforms,
        apply(shader) {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + litterSoilParsShader.vertexSource)
                .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + litterSoilMapShader.vertexSource);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + litterSoilParsShader.fragmentSource)
                .replace('#include <map_fragment>', litterSoilMapShader.fragmentSource)
                .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + litterSoilSurfaceShader.fragmentSource)
                .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + litterSoilNormalShader.fragmentSource)
                .replace('#include <aomap_fragment>', litterSoilAoShader.fragmentSource);
        }
    });
    return material;
}
