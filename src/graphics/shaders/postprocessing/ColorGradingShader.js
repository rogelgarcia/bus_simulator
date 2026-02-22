import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/color_grading.vert.glsl',
    fragmentPath: 'postprocessing/color_grading.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    tDiffuse: { type: 'raw', default: null },
    tLut: { type: 'raw', default: null },
    intensity: { type: 'number', default: 0, min: 0, max: 1 }
});

export function createColorGradingShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/color_grading',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: {
            tDiffuse: null,
            tLut: null,
            intensity: UNIFORM_SCHEMA.intensity.default
        },
        uniformValues: {
            tDiffuse: uniforms.tDiffuse,
            tLut: uniforms.tLut,
            intensity: uniforms.intensity
        }
    });
}
