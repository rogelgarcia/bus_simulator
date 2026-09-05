// Loads the gated AI 548 shader variant without embedding shader programs in JavaScript.
// @ts-check
import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';
const paths = [
    ['receiver_enhanced.vert.glsl', 'receiver_enhanced.frag.glsl'],
    ['receiver_enhanced_indirect.glsl', 'receiver_enhanced_direct.glsl'],
    ['receiver_lightmap_apply.vert.glsl', 'receiver_lightmap_apply.frag.glsl'],
    ['receiver_enhanced_prepare.glsl', 'receiver_enhanced_ambient.glsl']
];
const payloads = await Promise.all(paths.map(async ([vertex, fragment], i) => createShaderPayload({
    shaderId: 'illumination.receiver.enhanced.' + i,
    sourceSet: await loadShaderSourceSet({ vertexPath: 'materials/' + vertex, fragmentPath: 'materials/' + fragment })
})));
export const enhancedReceiverShaders = Object.freeze({
    vertex: payloads[0].vertexSource, fragment: payloads[0].fragmentSource,
    indirect: payloads[1].vertexSource, direct: payloads[1].fragmentSource,
    vertexApply: payloads[2].vertexSource, fragmentApply: payloads[2].fragmentSource,
    prepare: payloads[3].vertexSource, ambient: payloads[3].fragmentSource,
    variantKey: payloads.map((v) => v.variantKey).join('.')
});
