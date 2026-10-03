// Share gradual distant leaf shading and silhouette compression across geometric LODs.
// @ts-check
import * as THREE from 'three';
import { grassFieldDistanceShader, grassFieldDistanceParsShader, grassFieldDistanceShadowShader,
    grassFieldDistanceCanopyShader, grassFieldDistanceCanopyResponseShader } from '../../shaders/materials/grass/GrassFieldDistanceShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

export const GRASS_FIELD_DISTANCE_APPEARANCE = Object.freeze({
    start: 8, end: 30, diffuseFilter: .85, tipCompression: .3, shadowSoftness: 1
});

/** @param {THREE.MeshStandardMaterial} material */
export function applyGrassDebugV2DistanceAppearance(material) {
    const config = GRASS_FIELD_DISTANCE_APPEARANCE;
    const uniforms = {
        grassFieldDistance: { value: new THREE.Vector4(config.start, config.end, config.diffuseFilter, config.tipCompression) },
        grassFieldShadowSoftness: { value: config.shadowSoftness }
    };
    material.userData.grassFieldDistance = uniforms.grassFieldDistance;
    material.userData.grassFieldShadowSoftness = uniforms.grassFieldShadowSoftness;
    const payloads = [grassFieldDistanceShader, grassFieldDistanceParsShader, grassFieldDistanceShadowShader];
    payloads.forEach(payload => attachShaderMetadata(material, payload));
    registerMaterialShaderHook(material, { id: 'grass.field-distance', priority: 40,
        variantKey: payloads.map(payload => payload.variantKey).join('|'), uniforms,
        apply: shader => {
            const lighting = '#define RE_Direct RE_Direct_Grass', project = '#include <project_vertex>';
            if (!shader.fragmentShader.includes(lighting) || !shader.vertexShader.includes(project)) throw new Error('Grass distance shading contract changed.');
            Object.assign(shader.uniforms, uniforms);
            shader.fragmentShader = shader.fragmentShader.replace(lighting, lighting + '\n' + grassFieldDistanceShader.fragmentSource)
                .replace('#include <common>', '#include <common>\n' + grassFieldDistanceParsShader.vertexSource)
                .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + grassFieldDistanceShadowShader.fragmentSource)
                .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replaceAll('getShadow( directionalShadowMap', 'grassFieldFilteredShadow( directionalShadowMap'));
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + grassFieldDistanceParsShader.vertexSource)
                .replace(project, grassFieldDistanceShader.vertexSource + '\n' + project + '\n' + grassFieldDistanceParsShader.fragmentSource);
        }
    });
}

/** @param {THREE.MeshStandardMaterial} material */
export function applyGrassDebugV2CanopyDistanceAppearance(material) {
    const config = GRASS_FIELD_DISTANCE_APPEARANCE;
    const uniforms = { grassFieldDistance: { value: new THREE.Vector4(config.start, config.end, config.diffuseFilter, 0) } };
    material.userData.grassFieldDistance = uniforms.grassFieldDistance;
    const payload = grassFieldDistanceCanopyShader, responsePayload = grassFieldDistanceCanopyResponseShader;
    [payload, responsePayload].forEach(value => attachShaderMetadata(material, value));
    registerMaterialShaderHook(material, { id: 'grass.canopy-distance', priority: 40,
        variantKey: payload.variantKey + '|' + responsePayload.variantKey, uniforms,
        apply: shader => {
            const response = 'mix(back, front, grassFacingFrontWeight) * BRDF_Lambert(grassColor)';
            if (!shader.fragmentShader.includes(response)) throw new Error('Grass canopy lighting contract changed.');
            Object.assign(shader.uniforms, uniforms);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\n' + payload.vertexSource + '\n' + payload.fragmentSource)
                .replace(response, responsePayload.fragmentSource);
        }
    });
}
