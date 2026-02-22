import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/bus_contact_shadow.vert.glsl',
    fragmentPath: 'postprocessing/bus_contact_shadow.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    uIntensity: { type: 'number', min: 0, max: 2 },
    uSoftness: { type: 'number', min: 0.02, max: 1 }
});

const DEFAULT_UNIFORMS = {
    uIntensity: 0.4,
    uSoftness: 0.75
};

export function createBusContactShadowShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/bus_contact_shadow',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: DEFAULT_UNIFORMS,
        uniformValues: uniforms
    });
}
