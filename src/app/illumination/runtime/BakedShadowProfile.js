// Resolves an exact city/sun package selection for optional baked shadows.
// @ts-check

const INDEX_SCHEMA = 'bus-sim-static-sun-depth-production-package-index-v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CITY_CONFIG_HASHES = Object.freeze({ bigcity2: '314e44319dd7a5b9' });

function exactInteger(value, min, max) {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function profileIdForSun(atmosphere) {
    const azimuth = exactInteger(atmosphere?.sun?.azimuthDeg, 0, 360);
    const elevation = exactInteger(atmosphere?.sun?.elevationDeg, 0, 89);
    if (azimuth === null || elevation === null) return null;
    return `ai527.sun.az${String(azimuth).padStart(3, '0')}.el${String(elevation).padStart(2, '0')}`;
}

function validIdentity(identity, cityId, profileId) {
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
    if (identity.cityId !== cityId || identity.lightingProfileId !== profileId) return false;
    if (identity.developmentCacheAllowed !== true) return false;
    return [
        identity.alphaSemanticsSha256,
        identity.casterInventorySha256,
        identity.resolvedSourceSha256,
        identity.staticSunDepthSourceSha256
    ].every((value) => typeof value === 'string' && SHA256_PATTERN.test(value));
}

/**
 * @param {unknown} index
 * @param {{cityId: string, cityConfigHash?: string, atmosphere: object}} context
 * @returns {{ok: true, profileId: string, packagePath: string, liveIdentity: object} | {ok: false, reason: string, profileId: string | null}}
 */
export function resolveExactBakedShadowProfile(index, context) {
    const cityId = typeof context?.cityId === 'string' ? context.cityId : '';
    if (!cityId) return { ok: false, reason: 'no_city', profileId: null };
    const profileId = profileIdForSun(context.atmosphere);
    if (!profileId) return { ok: false, reason: 'sun_profile_not_exact', profileId: null };
    if (context.cityConfigHash !== CITY_CONFIG_HASHES[cityId]) {
        return { ok: false, reason: 'city_map_not_current', profileId };
    }
    if (!index || typeof index !== 'object' || Array.isArray(index) || index.schema !== INDEX_SCHEMA) {
        return { ok: false, reason: 'package_index_invalid', profileId };
    }
    const profile = index.profiles?.[profileId];
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        return { ok: false, reason: 'profile_not_available', profileId };
    }
    const packagePath = typeof profile.packagePath === 'string' ? profile.packagePath.trim() : '';
    if (!packagePath || !validIdentity(profile.liveIdentity, cityId, profileId)) {
        return { ok: false, reason: 'profile_identity_invalid', profileId };
    }
    return {
        ok: true,
        profileId,
        packagePath,
        liveIdentity: Object.freeze({ ...profile.liveIdentity })
    };
}
