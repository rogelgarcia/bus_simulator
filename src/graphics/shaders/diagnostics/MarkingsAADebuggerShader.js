import { createShaderPayload, loadShaderSourceSet } from '../core/ShaderLoader.js';

const BLIT_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/markings_aa_blit.vert.glsl',
    fragmentPath: 'postprocessing/markings_aa_blit.frag.glsl'
});

const MARKINGS_VIZ_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/markings_aa_markings.vert.glsl',
    fragmentPath: 'postprocessing/markings_aa_markings.frag.glsl'
});

const COMPOSITE_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/markings_aa_composite.vert.glsl',
    fragmentPath: 'postprocessing/markings_aa_composite.frag.glsl'
});

const DEPTH_VIZ_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/markings_aa_depth.vert.glsl',
    fragmentPath: 'postprocessing/markings_aa_depth.frag.glsl'
});

const OCCLUDER_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'postprocessing/markings_aa_occluder.vert.glsl',
    fragmentPath: 'postprocessing/markings_aa_occluder.frag.glsl'
});

const BLIT_SCHEMA = Object.freeze({
    tDiffuse: { type: 'raw', default: null }
});

const MARKINGS_VIZ_SCHEMA = Object.freeze({
    tMarkings: { type: 'raw', default: null },
    uBgColor: { type: 'raw', default: [0.165, 0.184, 0.211] }
});

const MARKINGS_VIZ_DEFAULTS = Object.freeze({
    tMarkings: null,
    uBgColor: MARKINGS_VIZ_SCHEMA.uBgColor.default
});

const COMPOSITE_SCHEMA = Object.freeze({
    tScene: { type: 'raw', default: null },
    tMarkings: { type: 'raw', default: null }
});

const DEPTH_VIZ_SCHEMA = Object.freeze({
    tDepth: { type: 'raw', default: null },
    cameraNear: { type: 'number', default: 0.1, min: 0.001, max: 10000 },
    cameraFar: { type: 'number', default: 500, min: 1, max: 100000 },
    uRangeMeters: { type: 'number', default: 200, min: 1, max: 10000 },
    uPower: { type: 'number', default: 1.6, min: 0.1, max: 10 }
});

const OCCLUDER_SCHEMA = Object.freeze({
    uColor: { type: 'raw' },
    uDepthTex: { type: 'raw', default: null },
    uInvSize: { type: 'raw', default: [1, 1] },
    cameraNear: { type: 'number', default: 0.1, min: 0.001, max: 10000 },
    cameraFar: { type: 'number', default: 500, min: 1, max: 100000 },
    uBiasMeters: { type: 'number', default: 0.02, min: 0, max: 10 }
});

export function createMarkingsAAblitShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/markings_aa_blit',
        sourceSet: BLIT_SHADER_SOURCES,
        uniformSchema: BLIT_SCHEMA,
        defaultUniforms: { tDiffuse: BLIT_SCHEMA.tDiffuse.default },
        uniformValues: { tDiffuse: uniforms.tDiffuse }
    });
}

export function createMarkingsAAMarkingsShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/markings_aa_markings',
        sourceSet: MARKINGS_VIZ_SHADER_SOURCES,
        uniformSchema: MARKINGS_VIZ_SCHEMA,
        defaultUniforms: { ...MARKINGS_VIZ_DEFAULTS },
        uniformValues: {
            tMarkings: uniforms.tMarkings,
            uBgColor: uniforms.uBgColor
        }
    });
}

export function createMarkingsAACompositeShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/markings_aa_composite',
        sourceSet: COMPOSITE_SHADER_SOURCES,
        uniformSchema: COMPOSITE_SCHEMA,
        defaultUniforms: { tScene: null, tMarkings: null },
        uniformValues: {
            tScene: uniforms.tScene,
            tMarkings: uniforms.tMarkings
        }
    });
}

export function createMarkingsAADepthShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/markings_aa_depth',
        sourceSet: DEPTH_VIZ_SHADER_SOURCES,
        uniformSchema: DEPTH_VIZ_SCHEMA,
        defaultUniforms: {
            tDepth: null,
            cameraNear: DEPTH_VIZ_SCHEMA.cameraNear.default,
            cameraFar: DEPTH_VIZ_SCHEMA.cameraFar.default,
            uRangeMeters: DEPTH_VIZ_SCHEMA.uRangeMeters.default,
            uPower: DEPTH_VIZ_SCHEMA.uPower.default
        },
        uniformValues: {
            tDepth: uniforms.tDepth,
            cameraNear: uniforms.cameraNear,
            cameraFar: uniforms.cameraFar,
            uRangeMeters: uniforms.uRangeMeters,
            uPower: uniforms.uPower
        }
    });
}

export function createMarkingsAAOccluderShaderPayload({ uniforms = {} } = {}) {
    return createShaderPayload({
        shaderId: 'postprocessing/markings_aa_occluder',
        sourceSet: OCCLUDER_SHADER_SOURCES,
        uniformSchema: OCCLUDER_SCHEMA,
        defaultUniforms: {
            uColor: [1, 1, 1],
            uDepthTex: null,
            uInvSize: [1, 1],
            cameraNear: OCCLUDER_SCHEMA.cameraNear.default,
            cameraFar: OCCLUDER_SCHEMA.cameraFar.default,
            uBiasMeters: OCCLUDER_SCHEMA.uBiasMeters.default
        },
        uniformValues: {
            uColor: uniforms.uColor,
            uDepthTex: uniforms.uDepthTex,
            uInvSize: uniforms.uInvSize,
            cameraNear: uniforms.cameraNear,
            cameraFar: uniforms.cameraFar,
            uBiasMeters: uniforms.uBiasMeters
        }
    });
}
