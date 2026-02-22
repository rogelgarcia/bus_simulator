import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const COMPOSITE_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/sun_bloom_debugger_final_composite.vert.glsl',
    fragmentPath: 'postprocessing/sun_bloom_debugger_final_composite.frag.glsl'
});

const EMITTER_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/sun_bloom_debugger_emitter.vert.glsl',
    fragmentPath: 'postprocessing/sun_bloom_debugger_emitter.frag.glsl'
});

const RAYS_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/sun_bloom_debugger_rays.vert.glsl',
    fragmentPath: 'postprocessing/sun_bloom_debugger_rays.frag.glsl'
});

const COMPOSITE_SCHEMA = Object.freeze({
    baseTexture: { type: 'raw', default: null },
    bloomTexture: { type: 'raw', default: null },
    uBloomStrength: { type: 'number', default: 0, min: 0, max: 10 },
    uBloomBrightnessOnly: { type: 'number', default: 1, min: 0, max: 1 },
    uViewMode: { type: 'number', default: 0, min: 0, max: 2 }
});

const EMITTER_SCHEMA = Object.freeze({
    uIntensity: { type: 'number', default: 25, min: 0, max: 200 },
    uFalloff: { type: 'number', default: 2.2, min: 0.05, max: 10 }
});

const RAYS_SCHEMA = Object.freeze({
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
    uColor: { type: 'raw', default: [1.0, 0.9490196078, 0.8392156863] }
});

const COMPOSITE_DEFAULTS = Object.freeze({
    baseTexture: null,
    bloomTexture: null,
    uBloomStrength: COMPOSITE_SCHEMA.uBloomStrength.default,
    uBloomBrightnessOnly: COMPOSITE_SCHEMA.uBloomBrightnessOnly.default,
    uViewMode: COMPOSITE_SCHEMA.uViewMode.default
});

const EMITTER_DEFAULTS = Object.freeze({
    uIntensity: EMITTER_SCHEMA.uIntensity.default,
    uFalloff: EMITTER_SCHEMA.uFalloff.default
});

const RAYS_DEFAULTS = Object.freeze({
    uIntensity: 0.85,
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
    uColor: RAYS_SCHEMA.uColor.default
});

export function createSunBloomDebuggerCompositePayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/sun_bloom_debugger_final_composite',
        sourceSet: COMPOSITE_SHADER_SOURCES,
        uniformSchema: COMPOSITE_SCHEMA,
        defaultUniforms: COMPOSITE_DEFAULTS,
        uniformValues: {
            baseTexture: uniforms.baseTexture,
            bloomTexture: uniforms.bloomTexture,
            uBloomStrength: uniforms.uBloomStrength,
            uBloomBrightnessOnly: uniforms.uBloomBrightnessOnly,
            uViewMode: uniforms.uViewMode
        }
    });
}

export function createSunBloomDebuggerEmitterPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/sun_bloom_debugger_emitter',
        sourceSet: EMITTER_SHADER_SOURCES,
        uniformSchema: EMITTER_SCHEMA,
        defaultUniforms: EMITTER_DEFAULTS,
        uniformValues: {
            uIntensity: uniforms.uIntensity,
            uFalloff: uniforms.uFalloff
        }
    });
}

export function createSunBloomDebuggerRaysPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/sun_bloom_debugger_rays',
        sourceSet: RAYS_SHADER_SOURCES,
        uniformSchema: RAYS_SCHEMA,
        defaultUniforms: RAYS_DEFAULTS,
        uniformValues: {
            uIntensity: uniforms.uIntensity,
            uRayCount: uniforms.uRayCount,
            uRayLength: uniforms.uRayLength,
            uLengthJitter: uniforms.uLengthJitter,
            uBaseWidthRad: uniforms.uBaseWidthRad,
            uTipWidthRad: uniforms.uTipWidthRad,
            uSoftnessRad: uniforms.uSoftnessRad,
            uCoreGlow: uniforms.uCoreGlow,
            uOuterGlow: uniforms.uOuterGlow,
            uRotationRad: uniforms.uRotationRad,
            uSeed: uniforms.uSeed,
            uColor: uniforms.uColor
        }
    });
}
