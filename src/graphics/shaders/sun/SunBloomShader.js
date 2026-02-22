import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/sun_bloom.vert.glsl',
    fragmentPath: 'postprocessing/sun_bloom.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    uIntensity: { type: 'number', min: 0, max: 200 },
    uFalloff: { type: 'number', min: 0.5, max: 10 }
});

const DEFAULT_UNIFORMS = {
    uIntensity: 25.0,
    uFalloff: 2.2
};

export function createSunBloomShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/sun_bloom',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: DEFAULT_UNIFORMS,
        uniformValues: uniforms
    });
}
