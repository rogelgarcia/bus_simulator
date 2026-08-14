import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/postprocessing_gtao_blend.vert.glsl',
    fragmentPath: 'postprocessing/postprocessing_gtao_blend.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    tDiffuse: { type: 'raw', default: null },
    uGtaoMap: { type: 'raw', default: null },
    uAoExclusionMask: { type: 'raw', default: null },
    uUseAoExclusionMask: { type: 'number', default: 0, min: 0, max: 1 },
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
            uAoExclusionMask: null,
            uUseAoExclusionMask: UNIFORM_SCHEMA.uUseAoExclusionMask.default,
            uIntensity: UNIFORM_SCHEMA.uIntensity.default
        },
        uniformValues: {
            tDiffuse: uniforms.tDiffuse,
            uGtaoMap: uniforms.uGtaoMap,
            uAoExclusionMask: uniforms.uAoExclusionMask,
            uUseAoExclusionMask: uniforms.uUseAoExclusionMask,
            uIntensity: uniforms.uIntensity
        }
    });
}
