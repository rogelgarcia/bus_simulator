// Attach matching transition masks without modifying the source LOD2 material.
// @ts-check
import { grassImpostorTransitionPars, grassImpostorTransitionBody } from '../../shaders/materials/grass/GrassImpostorTransitionShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {object} material @param {{cards:boolean,map?:object,count?:number}} options */
export function attachGrassImpostorTransition(material, { cards, map = null, count = 0 }) {
    if (cards) material.defines = { ...material.defines, GRASS_IMPOSTOR_TRANSITION_CARD: 1 };
    const uniforms = { grassImpostorBlendMap: { value: map }, grassImpostorCellCount: { value: count } };
    attachShaderMetadata(material, grassImpostorTransitionPars);
    attachShaderMetadata(material, grassImpostorTransitionBody);
    registerMaterialShaderHook(material, { id: 'grass.impostor-transition', priority: 30, uniforms,
        variantKey: grassImpostorTransitionPars.variantKey + '|' + grassImpostorTransitionBody.variantKey,
        apply: shader => {
            Object.assign(shader.uniforms, uniforms);
            for (const [stage, source] of [['vertexShader', grassImpostorTransitionPars.vertexSource], ['fragmentShader', grassImpostorTransitionPars.fragmentSource]])
                shader[stage] = shader[stage].replace('#include <common>', '#include <common>\n' + source);
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', grassImpostorTransitionBody.vertexSource + '\n#include <project_vertex>');
            shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + grassImpostorTransitionBody.fragmentSource);
        } });
}
