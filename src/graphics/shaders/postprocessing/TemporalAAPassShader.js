import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/temporal_aa.vert.glsl',
    fragmentPath: 'postprocessing/temporal_aa.frag.glsl'
});

const COPY_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/temporal_aa_copy.vert.glsl',
    fragmentPath: 'postprocessing/temporal_aa_copy.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    uHistoryStrength: { type: 'number', default: 0.85, min: 0, max: 0.98 },
    uClampStrength: { type: 'number', default: 0.75, min: 0, max: 1 },
    uSharpenStrength: { type: 'number', default: 0.15, min: 0, max: 1 },
    tDiffuse: { type: 'raw', default: null },
    tHistory: { type: 'raw', default: null },
    uInvResolution: { type: 'raw', default: null }
});

export function createTemporalAAShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/temporal_aa',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: {
            tDiffuse: null,
            tHistory: null,
            uHistoryStrength: UNIFORM_SCHEMA.uHistoryStrength.default,
            uClampStrength: UNIFORM_SCHEMA.uClampStrength.default,
            uSharpenStrength: UNIFORM_SCHEMA.uSharpenStrength.default,
            uInvResolution: { x: 1, y: 1 }
        },
        uniformValues: {
            tDiffuse: uniforms.tDiffuse,
            tHistory: uniforms.tHistory,
            uHistoryStrength: uniforms.uHistoryStrength,
            uClampStrength: uniforms.uClampStrength,
            uSharpenStrength: uniforms.uSharpenStrength,
            uInvResolution: uniforms.uInvResolution
        }
    });
}

export function createTemporalAACopyShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/temporal_aa_copy',
        sourceSet: COPY_SHADER_SOURCES,
        uniformSchema: {
            tDiffuse: { type: 'raw', default: null }
        },
        defaultUniforms: {
            tDiffuse: null
        },
        uniformValues: {
            tDiffuse: uniforms.tDiffuse
        }
    });
}
