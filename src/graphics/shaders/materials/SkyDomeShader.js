import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'materials/sky_dome.vert.glsl',
    fragmentPath: 'materials/sky_dome.frag.glsl'
});

const UNIFORM_SCHEMA = Object.freeze({
    uHorizon: { type: 'raw' },
    uZenith: { type: 'raw' },
    uGround: { type: 'raw' },
    uSkyCurve: { type: 'number', default: 1, min: 0.001, max: 8 },
    uSkyExposure: { type: 'number', default: 1, min: 0, max: 8 },
    uDitherStrength: { type: 'number', default: 0.85, min: 0, max: 2 },
    uHazeEnabled: { type: 'number', default: 1, min: 0, max: 1 },
    uHazeIntensity: { type: 'number', default: 0.22, min: 0, max: 4 },
    uHazeThickness: { type: 'number', default: 0.22, min: 0.02, max: 1 },
    uHazeCurve: { type: 'number', default: 1.6, min: 0.1, max: 8 },
    uHazeTint: { type: 'raw' },
    uHazeTintStrength: { type: 'number', default: 0, min: 0, max: 1 },
    uGlareEnabled: { type: 'number', default: 1, min: 0, max: 1 },
    uGlareIntensity: { type: 'number', default: 0.95, min: 0, max: 20 },
    uGlareSigma2: { type: 'number', default: 0.0305, min: 0.1 * 0.1 * Math.PI / 180, max: 3600 },
    uGlarePower: { type: 'number', default: 1, min: 0.2, max: 6 },
    uDiscEnabled: { type: 'number', default: 1, min: 0, max: 1 },
    uDiscIntensity: { type: 'number', default: 4, min: 0, max: 50 },
    uDiscSigma2: { type: 'number', default: 0.00001496, min: 0.05, max: 1000 },
    uDiscCoreIntensity: { type: 'number', default: 2.5, min: 0, max: 50 },
    uDiscCoreSigma2: { type: 'number', default: 0.00000109, min: 0.02, max: 1000 },
    uSunDir: { type: 'raw' },
    uSunIntensity: { type: 'number', default: 1, min: 0, max: 1000 },
    uDebugMode: { type: 'number', default: 0, min: 0, max: 3 },
    uShowSunRing: { type: 'number', default: 0, min: 0, max: 1 },
    uSunRingRadius: { type: 'number', default: 0.0096, min: 0.01, max: 1 },
    uSunRingThickness: { type: 'number', default: 0.00139, min: 0.0001, max: 1 }
});

const DEFAULT_UNIFORMS = {
    uHorizon: new Float32Array([234, 249, 255].map((v) => v / 255)),
    uZenith: new Float32Array([123, 207, 255].map((v) => v / 255)),
    uGround: new Float32Array([234, 249, 255].map((v) => v / 255)),
    uHazeTint: new Float32Array([1, 1, 1]),
    uSkyCurve: UNIFORM_SCHEMA.uSkyCurve.default,
    uSkyExposure: UNIFORM_SCHEMA.uSkyExposure.default,
    uDitherStrength: UNIFORM_SCHEMA.uDitherStrength.default,
    uHazeEnabled: UNIFORM_SCHEMA.uHazeEnabled.default,
    uHazeIntensity: UNIFORM_SCHEMA.uHazeIntensity.default,
    uHazeThickness: UNIFORM_SCHEMA.uHazeThickness.default,
    uHazeCurve: UNIFORM_SCHEMA.uHazeCurve.default,
    uHazeTintStrength: UNIFORM_SCHEMA.uHazeTintStrength.default,
    uGlareEnabled: UNIFORM_SCHEMA.uGlareEnabled.default,
    uGlareIntensity: UNIFORM_SCHEMA.uGlareIntensity.default,
    uGlareSigma2: UNIFORM_SCHEMA.uGlareSigma2.default,
    uGlarePower: UNIFORM_SCHEMA.uGlarePower.default,
    uDiscEnabled: UNIFORM_SCHEMA.uDiscEnabled.default,
    uDiscIntensity: UNIFORM_SCHEMA.uDiscIntensity.default,
    uDiscSigma2: UNIFORM_SCHEMA.uDiscSigma2.default,
    uDiscCoreIntensity: UNIFORM_SCHEMA.uDiscCoreIntensity.default,
    uDiscCoreSigma2: UNIFORM_SCHEMA.uDiscCoreSigma2.default,
    uSunDir: new Float32Array([0.6, 0.9, 0.25]),
    uSunIntensity: UNIFORM_SCHEMA.uSunIntensity.default,
    uDebugMode: UNIFORM_SCHEMA.uDebugMode.default,
    uShowSunRing: UNIFORM_SCHEMA.uShowSunRing.default,
    uSunRingRadius: UNIFORM_SCHEMA.uSunRingRadius.default,
    uSunRingThickness: UNIFORM_SCHEMA.uSunRingThickness.default
};

export function createSkyDomeShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'materials/sky_dome',
        sourceSet: SHADER_SOURCES,
        uniformSchema: UNIFORM_SCHEMA,
        defaultUniforms: DEFAULT_UNIFORMS,
        uniformValues: uniforms
    });
}
