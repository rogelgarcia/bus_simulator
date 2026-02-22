import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/sun_rays.vert.glsl',
    fragmentPath: 'postprocessing/sun_rays.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    uIntensity: { type: 'number', min: 0, max: 6 },
    uRayCount: { type: 'number', min: 3, max: 256 },
    uRayLength: { type: 'number', min: 0, max: 1.6 },
    uLengthJitter: { type: 'number', min: 0, max: 1 },
    uBaseWidthRad: { type: 'number', min: 0, max: 12 },
    uTipWidthRad: { type: 'number', min: 0, max: 12 },
    uSoftnessRad: { type: 'number', min: 0, max: 12 },
    uCoreGlow: { type: 'number', min: 0, max: 2 },
    uOuterGlow: { type: 'number', min: 0, max: 2 },
    uRotationRad: { type: 'number', min: -360, max: 360 },
    uSeed: { type: 'number', min: -99999, max: 99999 },
    uColor: { type: 'raw' }
});

const DEFAULT_UNIFORMS = {
    uIntensity: 0.0,
    uRayCount: 48.0,
    uRayLength: 0.95,
    uLengthJitter: 0.45,
    uBaseWidthRad: (1.6 * Math.PI) / 180,
    uTipWidthRad: (0.28 * Math.PI) / 180,
    uSoftnessRad: (0.9 * Math.PI) / 180,
    uCoreGlow: 0.35,
    uOuterGlow: 0.18,
    uRotationRad: 0.0,
    uSeed: 0.0,
    uColor: 0xffffff
};

export function createSunRaysShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/sun_rays',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: DEFAULT_UNIFORMS,
        uniformValues: uniforms
    });
}
