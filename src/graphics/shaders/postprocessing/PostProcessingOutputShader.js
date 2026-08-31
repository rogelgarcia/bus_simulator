import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/postprocessing_output.vert.glsl',
    fragmentPath: 'postprocessing/postprocessing_output.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    tDiffuse: { type: 'raw', default: null },
    tLut: { type: 'raw', default: null },
    uColorGradingIntensity: { type: 'number', default: 0, min: 0, max: 1 },
    uLutSize: { type: 'number', default: 2, min: 2 },
    uEnableColorGrading: { type: 'number', default: 0, min: 0, max: 1 },
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
            tLut: null,
            uColorGradingIntensity: UNIFORM_SCHEMA.uColorGradingIntensity.default,
            uLutSize: UNIFORM_SCHEMA.uLutSize.default,
            uEnableColorGrading: UNIFORM_SCHEMA.uEnableColorGrading.default,
            uEnableToneMapping: UNIFORM_SCHEMA.uEnableToneMapping.default,
            uEnableOutputColorSpace: UNIFORM_SCHEMA.uEnableOutputColorSpace.default
        },
        uniformValues: {
            tDiffuse: uniforms.tDiffuse,
            tLut: uniforms.tLut,
            uColorGradingIntensity: uniforms.uColorGradingIntensity,
            uLutSize: uniforms.uLutSize,
            uEnableColorGrading: uniforms.uEnableColorGrading,
            uEnableToneMapping: uniforms.uEnableToneMapping,
            uEnableOutputColorSpace: uniforms.uEnableOutputColorSpace
        }
    });
}
