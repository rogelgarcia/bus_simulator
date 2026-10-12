// Loads the AI 597 animated ocean programs: the spectral simulation passes and the clipmap surface, as compile-time variants of the cascade count.
// @ts-check
// The cascade count is a compile-time define (sampler and uniform arrays are sized by it, GLSL ES 3.00 needs constant sampler indices), the
// lighting tier and the reflection map of the surface follow the water reference's defines, and the LEAN weight is a runtime uniform. Every pass
// shares one full-screen vertex program; the surface has its own vertex program (the clipmap rings).
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
import { landscapeLightingDefines, LANDSCAPE_LIGHTING } from '../../../engine3d/landscape/LandscapeLightingModel.js';
import { LANDSCAPE_OCEAN_MAX_CASCADES } from '../../../engine3d/landscape/ocean/LandscapeOceanModel.js';

const PASS_VERTEX = 'materials/landscape/ocean_pass.vert.glsl';
const [spectrumInit, spectrumTime, fft, fftFinal, derivatives, foam, surface] = await Promise.all([
    loadShaderSourceSet({ vertexPath: PASS_VERTEX, fragmentPath: 'materials/landscape/ocean_spectrum_init.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: PASS_VERTEX, fragmentPath: 'materials/landscape/ocean_spectrum_time.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: PASS_VERTEX, fragmentPath: 'materials/landscape/ocean_fft.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: PASS_VERTEX, fragmentPath: 'materials/landscape/ocean_fft_final.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: PASS_VERTEX, fragmentPath: 'materials/landscape/ocean_derivatives.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: PASS_VERTEX, fragmentPath: 'materials/landscape/ocean_foam.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: 'materials/landscape/ocean_surface.vert.glsl', fragmentPath: 'materials/landscape/ocean_surface.frag.glsl' })
]);
const SOURCES = Object.freeze({ 'spectrum-init': spectrumInit, 'spectrum-time': spectrumTime, fft, 'fft-final': fftFinal, derivatives, foam, surface });

/** @param {number} cascades @returns {string} the parenthesized cascade count define */
function cascadeDefine(cascades) {
    if (!Number.isInteger(cascades) || cascades < 1 || cascades > LANDSCAPE_OCEAN_MAX_CASCADES) throw new Error(`[LandscapeOcean] The cascade count must be an integer from 1 to ${LANDSCAPE_OCEAN_MAX_CASCADES}; received ${cascades}`);
    return `(${cascades})`;
}

/**
 * @param {'spectrum-init'|'spectrum-time'|'fft'|'fft-final'|'derivatives'|'foam'|'surface'} kind
 * @param {{cascades:number,lightingTier?:string,reflection?:boolean}} options the surface compiles the lighting tier and samples the prefiltered sky
 *   reflection when reflection is true (the sky harmonics otherwise); the passes (the D3 foam state among them) take only the cascade count
 * @returns {any} the shader payload (vertexSource, fragmentSource, defines, variantKey)
 */
export function createLandscapeOceanShaderPayload(kind, { cascades, lightingTier = LANDSCAPE_LIGHTING.defaultTier, reflection = false }) {
    const sourceSet = SOURCES[kind];
    if (!sourceSet) throw new Error(`[LandscapeOcean] Unknown ocean shader ${kind}`);
    if (typeof reflection !== 'boolean') throw new Error('[LandscapeOcean] The ocean reflection option must be boolean');
    const defines = { LANDSCAPE_OCEAN_CASCADES: cascadeDefine(cascades) };
    if (kind === 'surface') Object.assign(defines, landscapeLightingDefines(lightingTier), reflection ? { LANDSCAPE_WATER_REFLECTION: true } : {});
    return createShaderPayload({ shaderId: `landscape/ocean-${kind}`, sourceSet, defines });
}
