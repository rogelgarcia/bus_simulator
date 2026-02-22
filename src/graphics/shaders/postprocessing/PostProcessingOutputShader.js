import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/postprocessing_output.vert.glsl',
    fragmentPath: 'postprocessing/postprocessing_output.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    tDiffuse: { type: 'raw', default: null },
    uEnableToneMapping: { type: 'number', default: 1, min: 0, max: 1 },
    uEnableOutputColorSpace: { type: 'number', default: 1, min: 0, max: 1 }
});

export function createPostProcessingOutputShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/output',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: {
            tDiffuse: null,
            uEnableToneMapping: UNIFORM_SCHEMA.uEnableToneMapping.default,
            uEnableOutputColorSpace: UNIFORM_SCHEMA.uEnableOutputColorSpace.default
        },
        uniformValues: {
            tDiffuse: uniforms.tDiffuse,
            uEnableToneMapping: uniforms.uEnableToneMapping,
            uEnableOutputColorSpace: uniforms.uEnableOutputColorSpace
        }
    });
}
