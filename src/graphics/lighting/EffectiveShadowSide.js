// Shared, pure shadow-caster sidedness contract for the live renderer, bake
// export, Lab oracle fixture, and offline production renderer.
// @ts-check

export const THREE_FRONT_SIDE = 0;
export const THREE_BACK_SIDE = 1;
export const THREE_DOUBLE_SIDE = 2;

export const STATIC_SUN_DEPTH_CASTER_SIDEDNESS = Object.freeze({
    model: 'three-r183-effective-shadow-side-v1',
    twoSidedCasting: true,
    preserveMaterialFlagSemantics: 'material-userdata-preserveShadowSide-or-isFoliage-v1'
});

const POLICY_KEYS = Object.freeze([
    'model',
    'preserveMaterialFlagSemantics',
    'twoSidedCasting'
]);

function requireSide(value, label, allowNull = false) {
    if (allowNull && (value === null || value === undefined)) return null;
    if (value !== THREE_FRONT_SIDE && value !== THREE_BACK_SIDE && value !== THREE_DOUBLE_SIDE) {
        throw new RangeError(`Unsupported Three ${label} '${String(value)}'`);
    }
    return value;
}

/** Fail closed unless the policy is the exact authenticated AI531 model. */
export function requireStaticSunDepthCasterSidedness(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('static sun casterSidedness must be an object');
    }
    const keys = Object.keys(value).sort();
    if (keys.length !== POLICY_KEYS.length || keys.some((key, index) => key !== POLICY_KEYS[index])) {
        throw new TypeError('static sun casterSidedness keys do not match the authenticated policy');
    }
    for (const key of POLICY_KEYS) {
        if (value[key] !== STATIC_SUN_DEPTH_CASTER_SIDEDNESS[key]) {
            throw new TypeError(`static sun casterSidedness.${key} does not match the authenticated policy`);
        }
    }
    return STATIC_SUN_DEPTH_CASTER_SIDEDNESS;
}

/** Three r183 WebGLShadowMap authored-side fallback. */
export function resolveThreeR183ShadowSide(side, shadowSide) {
    const explicit = requireSide(shadowSide, 'shadowSide', true);
    if (explicit !== null) return explicit;
    const ordinary = requireSide(side ?? THREE_FRONT_SIDE, 'material side');
    if (ordinary === THREE_FRONT_SIDE) return THREE_BACK_SIDE;
    if (ordinary === THREE_BACK_SIDE) return THREE_FRONT_SIDE;
    return THREE_DOUBLE_SIDE;
}

/** Resolve the effective side without mutating the authored material. */
export function resolveStaticSunDepthEffectiveShadowSide({
    side,
    shadowSide,
    preserveShadowSide,
    isFoliage
}, casterSidedness = STATIC_SUN_DEPTH_CASTER_SIDEDNESS) {
    requireStaticSunDepthCasterSidedness(casterSidedness);
    if (typeof preserveShadowSide !== 'boolean' || typeof isFoliage !== 'boolean') {
        throw new TypeError('static sun preserveShadowSide and isFoliage must be booleans');
    }
    const nativeSide = resolveThreeR183ShadowSide(side, shadowSide);
    return preserveShadowSide === true || isFoliage === true
        ? nativeSide
        : THREE_DOUBLE_SIDE;
}

/** Canonical audited record stored in mappings and Lab caster receipts. */
export function describeStaticSunDepthEffectiveShadowSide(input, casterSidedness = STATIC_SUN_DEPTH_CASTER_SIDEDNESS) {
    const policy = requireStaticSunDepthCasterSidedness(casterSidedness);
    const authoredSide = requireSide(input?.side ?? THREE_FRONT_SIDE, 'material side');
    const authoredShadowSide = requireSide(input?.shadowSide, 'shadowSide', true);
    if (typeof input?.preserveShadowSide !== 'boolean' || typeof input?.isFoliage !== 'boolean') {
        throw new TypeError('static sun preserveShadowSide and isFoliage must be booleans');
    }
    const preserveShadowSide = input.preserveShadowSide;
    const isFoliage = input.isFoliage;
    return Object.freeze({
        authoredSide,
        authoredShadowSide,
        preserveShadowSide,
        isFoliage,
        preservesAuthoredShadowSide: preserveShadowSide || isFoliage,
        casterSidedness: policy,
        effectiveShadowSide: resolveStaticSunDepthEffectiveShadowSide({
            side: authoredSide,
            shadowSide: authoredShadowSide,
            preserveShadowSide,
            isFoliage
        }, policy)
    });
}
