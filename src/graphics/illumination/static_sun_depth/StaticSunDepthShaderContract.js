// Pinned Three r183 directional-light source contract shared by runtime patching and tests.
// @ts-check

export const STATIC_SUN_DEPTH_THREE_REVISION = '183';
export const STATIC_SUN_DEPTH_DIRECT_ANCHOR = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

const DIRECTIONAL_BEGIN = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
const DIRECTIONAL_END = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
const APPLY_CALL = 'staticSunDepthApplyDirectional( directLight, directionalLight.color, geometryNormal );';

/**
 * Patch every direct-sun branch in either the exact stock r183 chunk or the
 * r183 CSM replacement. No point/spot/rect-area loop may be touched.
 * @param {string} source
 * @param {string | number} revision
 */
export function patchStaticSunDepthDirectionalChunk(source, revision) {
    if (String(revision) !== STATIC_SUN_DEPTH_THREE_REVISION) {
        throw new Error(`[StaticSunDepthMaterialAdapter] Unsupported Three revision '${revision}'.`);
    }
    if (typeof source !== 'string') {
        throw new TypeError('[StaticSunDepthMaterialAdapter] Three directional-light chunk must be a string.');
    }
    const begin = source.indexOf(DIRECTIONAL_BEGIN);
    const end = source.indexOf(DIRECTIONAL_END, begin + DIRECTIONAL_BEGIN.length);
    if (begin < 0 || end <= begin) {
        throw new Error('[StaticSunDepthMaterialAdapter] Directional-light chunk boundaries do not match pinned Three r183.');
    }
    const prefix = source.slice(0, begin);
    const directional = source.slice(begin, end);
    const suffix = source.slice(end);
    const replacements = directional.split(STATIC_SUN_DEPTH_DIRECT_ANCHOR).length - 1;
    const csmVariant = directional.includes('USE_CSM') || directional.includes('CSM_CASCADES');
    // r183.2 CSM has five compile-time directional paths: fade, non-fade,
    // the single-shadow-light fallback, surplus non-shadow directional lights,
    // and the non-CSM fallback.
    const expectedReplacements = csmVariant ? 5 : 1;
    if (replacements !== expectedReplacements
        || prefix.includes(APPLY_CALL)
        || suffix.includes(APPLY_CALL)) {
        throw new Error(
            `[StaticSunDepthMaterialAdapter] Directional RE_Direct anchors do not match pinned `
            + `${csmVariant ? 'CSM' : 'stock'} variant (expected ${expectedReplacements}, found ${replacements}).`
        );
    }
    const patchedDirectional = directional.replaceAll(
        STATIC_SUN_DEPTH_DIRECT_ANCHOR,
        `{\n\t\t\t${APPLY_CALL}\n\t\t\t${STATIC_SUN_DEPTH_DIRECT_ANCHOR}\n\t\t}`
    );
    return Object.freeze({
        source: prefix + patchedDirectional + suffix,
        replacements,
        variant: csmVariant ? 'csm' : 'stock'
    });
}
