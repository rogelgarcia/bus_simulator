// Loads the AI 599 ecosystem instance programs as compile-time variants: mesh or impostor, textured catalog assets or constant-material rocks, the texture variant count, the lighting tier and the diagnostic views.
// @ts-check
// The variant count sizes the per-variant sampler ladder and the impostor tables (GLSL ES 3.00 indexes samplers by constants only), the dither
// matrix and the impostor layout are constants of LandscapeEcosystemModel.js injected as defines, and the lighting tier carries the calibrated
// atmosphere constants like every landscape program. The diagnostic views are compiled only when selected, so the default program draws the
// shaded instances alone.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
import { landscapeLightingDefines, LANDSCAPE_LIGHTING } from '../../../engine3d/landscape/LandscapeLightingModel.js';
import { LANDSCAPE_ECOSYSTEM, ecosystemDitherDefine } from '../../../engine3d/landscape/ecosystem/LandscapeEcosystemModel.js';

const SOURCES = await loadShaderSourceSet({ vertexPath: 'materials/landscape/ecosystem_instance.vert.glsl', fragmentPath: 'materials/landscape/ecosystem_instance.frag.glsl' });
export const LANDSCAPE_ECOSYSTEM_SHADER_KINDS = Object.freeze(['mesh', 'impostor']);
/** The largest texture variant count one textured program binds (three samplers each beside the shared leaf atlas). */
export const LANDSCAPE_ECOSYSTEM_MAX_TEXTURE_VARIANTS = 3;
// the constant rock material (grey stone) and the natural-ground responses (EON roughness, specular shadowing weight, opposition amplitude)
export const LANDSCAPE_ECOSYSTEM_MATERIALS = Object.freeze({ rockAlbedo: Object.freeze([.36, .35, .33]), rockRoughness: .82, rockResponse: Object.freeze([.65, .35, .15]), foliageResponse: Object.freeze([.45, .2, 0]) });

const glslFloat = value => { const text = String(value); return /[.e]/.test(text) ? text : `${text}.0`; };
const glslVec3 = values => `${values.map(glslFloat).join(', ')}`;
const impostor = LANDSCAPE_ECOSYSTEM.impostor;
const CONSTANT_DEFINES = Object.freeze({
    LANDSCAPE_ECOSYSTEM_DITHER_LIST: ecosystemDitherDefine(),
    LANDSCAPE_ECOSYSTEM_ROCK_ALBEDO: glslVec3(LANDSCAPE_ECOSYSTEM_MATERIALS.rockAlbedo),
    LANDSCAPE_ECOSYSTEM_ROCK_ROUGHNESS: glslFloat(LANDSCAPE_ECOSYSTEM_MATERIALS.rockRoughness),
    LANDSCAPE_ECOSYSTEM_ROCK_RESPONSE: glslVec3(LANDSCAPE_ECOSYSTEM_MATERIALS.rockResponse),
    LANDSCAPE_ECOSYSTEM_FOLIAGE_RESPONSE: glslVec3(LANDSCAPE_ECOSYSTEM_MATERIALS.foliageResponse),
    LANDSCAPE_ECOSYSTEM_WIND_FREQUENCY: glslFloat(2 * Math.PI * LANDSCAPE_ECOSYSTEM.wind.frequencyHertz),
    LANDSCAPE_ECOSYSTEM_IMPOSTOR_AZIMUTH_START: glslFloat(impostor.azimuthStartDegrees),
    LANDSCAPE_ECOSYSTEM_IMPOSTOR_AZIMUTH_STEP: glslFloat(impostor.azimuthStepDegrees),
    LANDSCAPE_ECOSYSTEM_IMPOSTOR_ELEVATION_0: glslFloat(impostor.elevationsDegrees[0]),
    LANDSCAPE_ECOSYSTEM_IMPOSTOR_ELEVATION_1: glslFloat(impostor.elevationsDegrees[1])
});

/**
 * @param {{kind?:'mesh'|'impostor',textured?:boolean,lightingTier?:string,diagnostics?:boolean,variants?:number}} options the impostor kind is always textured; variants is the
 *   number of texture variants a textured program binds (1..3; the rocks take no textures)
 * @returns {any} the shader payload (vertexSource, fragmentSource, defines, variantKey)
 */
export function createLandscapeEcosystemShaderPayload({ kind = 'mesh', textured = false, lightingTier = LANDSCAPE_LIGHTING.defaultTier, diagnostics = false, variants = 1 } = {}) {
    if (!LANDSCAPE_ECOSYSTEM_SHADER_KINDS.includes(kind)) throw new Error(`[LandscapeEcosystem] Unknown ecosystem shader kind ${String(kind)}`);
    if (typeof textured !== 'boolean' || typeof diagnostics !== 'boolean') throw new Error('[LandscapeEcosystem] The textured and diagnostics options must be boolean');
    if (kind === 'impostor' && !textured) throw new Error('[LandscapeEcosystem] The impostor program is always textured');
    if (!Number.isInteger(variants) || variants < 1 || variants > LANDSCAPE_ECOSYSTEM_MAX_TEXTURE_VARIANTS) throw new Error(`[LandscapeEcosystem] The texture variant count must be an integer from 1 to ${LANDSCAPE_ECOSYSTEM_MAX_TEXTURE_VARIANTS}; received ${variants}`);
    // parenthesized counts, so the shared define builder never turns the value 1 into a valueless flag
    const defines = { ...CONSTANT_DEFINES, ...landscapeLightingDefines(lightingTier), LANDSCAPE_ECOSYSTEM_VARIANTS: `(${textured ? variants : 1})`, LANDSCAPE_ECOSYSTEM_IMPOSTOR_TABLE: `(${(textured ? variants : 1) * impostor.views})` };
    if (textured) defines.LANDSCAPE_ECOSYSTEM_TEXTURED = true;
    if (kind === 'impostor') defines.LANDSCAPE_ECOSYSTEM_IMPOSTOR = true;
    if (diagnostics) defines.LANDSCAPE_ECOSYSTEM_DIAGNOSTICS = true;
    return createShaderPayload({ shaderId: `landscape/ecosystem-${kind}${textured ? '-textured' : ''}`, sourceSet: SOURCES, defines });
}
