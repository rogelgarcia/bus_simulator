// CPU mirror of Three r183 WebGLShadowMap's shadow-side resolution.
// @ts-check

export {
    THREE_FRONT_SIDE,
    THREE_BACK_SIDE,
    THREE_DOUBLE_SIDE,
    STATIC_SUN_DEPTH_CASTER_SIDEDNESS,
    requireStaticSunDepthCasterSidedness,
    resolveThreeR183ShadowSide,
    resolveStaticSunDepthEffectiveShadowSide,
    describeStaticSunDepthEffectiveShadowSide
} from '../../../src/graphics/lighting/EffectiveShadowSide.js';

/**
 * Resolves the alpha cutoff used by Three r183's shadow depth pass. Materials
 * using alpha-to-coverage receive the engine's unconditional 0.5 cutoff.
 * @param {number|null|undefined} alphaTest
 * @param {boolean|null|undefined} alphaToCoverage
 * @returns {number}
 */
export function resolveThreeR183ShadowAlphaTest(alphaTest, alphaToCoverage) {
    if (alphaToCoverage === true) return 0.5;
    const explicit = Number(alphaTest);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return 0;
}
