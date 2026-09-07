// Loads the material-stage, contribution-separated dynamic contact shader.
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';
const pairs = [['dynamic_ao.vert.glsl', 'dynamic_ao.frag.glsl'],
    ['dynamic_ao_vertex_apply.glsl', 'dynamic_ao_apply.glsl'], ['dynamic_ao_debug.glsl', 'dynamic_ao_debug.glsl']];
const payloads = await Promise.all(pairs.map(async ([vertex, fragment], i) => createShaderPayload({
    shaderId: `ao.dynamic.${i}`, sourceSet: await loadShaderSourceSet({ vertexPath: `materials/${vertex}`, fragmentPath: `materials/${fragment}` })
})));
export const dynamicAoShader = {
    vertex: payloads[0].vertexSource, fragment: payloads[0].fragmentSource,
    vertexApply: payloads[1].vertexSource, apply: payloads[1].fragmentSource,
    debug: payloads[2].fragmentSource, variantKey: payloads.map(p => p.variantKey).join('.')
};
