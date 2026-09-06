// Binds enhanced receivers to an actually available shadow profile for their baked sun.
// @ts-check
import { selectProductionStaticSunProfiles } from '../../static_sun_depth/src/ProductionOrchestrator.mjs';

/** @param {any[]} sourceProfiles @param {{profiles: Record<string, any>}} index
 * @returns {string} Matching certified shadow profile identity. */
export function resolveSharedSunProfile(sourceProfiles, index) {
    // This is the same source light consumed by receiver_lightmaps/blender/bake.py.
    const sun = sourceProfiles.find(profile => profile.id === 'sun.default');
    const profile = selectProductionStaticSunProfiles().find(candidate =>
        candidate.directionThree.every((value, axis) => Math.abs(value - sun?.directionThree?.[axis]) < 1e-6));
    if (!profile || !index.profiles?.[profile.id]) {
        throw new Error(`Enhanced receivers require shared shadows for their source sun (${profile?.id ?? 'unsupported direction'}). Select that shadow profile or --profile all.`);
    }
    return profile.id;
}
