import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/postprocessing_gtao_blend.vert.glsl',
    fragmentPath: 'postprocessing/postprocessing_gtao_blend.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    tDiffuse: { type: 'raw', default: null },
    uGtaoMap: { type: 'raw', default: null },
    uIntensity: { type: 'number', default: 0.35, min: 0, max: 2 }
});

export function createPostProcessingGtaoBlendShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/gtao_blend',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: {
            tDiffuse: null,
            uGtaoMap: null,
            uIntensity: UNIFORM_SCHEMA.uIntensity.default
        },
        uniformValues: {
            tDiffuse: uniforms.tDiffuse,
            uGtaoMap: uniforms.uGtaoMap,
            uIntensity: uniforms.uIntensity
        }
    });
}
