import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/postprocessing_composite.vert.glsl',
    fragmentPath: 'postprocessing/postprocessing_composite.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    baseTexture: { type: 'raw', default: null },
    uGlobalBloomTexture: { type: 'raw', default: null },
    uSunBloomTexture: { type: 'raw', default: null },
    uSunBrightnessOnly: { type: 'number', default: 1, min: 0, max: 1 }
});

export function createPostProcessingCompositeShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/composite',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: {
            baseTexture: null,
            uGlobalBloomTexture: null,
            uSunBloomTexture: null,
            uSunBrightnessOnly: UNIFORM_SCHEMA.uSunBrightnessOnly.default
        },
        uniformValues: {
            baseTexture: uniforms.baseTexture,
            uGlobalBloomTexture: uniforms.uGlobalBloomTexture,
            uSunBloomTexture: uniforms.uSunBloomTexture,
            uSunBrightnessOnly: uniforms.uSunBrightnessOnly
        }
    });
}
