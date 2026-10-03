// Resolves semantic soil with ordered hard overrides independently of visual cover.
// @ts-check
import { landscapeRegionContains } from './LandscapeRegions.js';
import { requireCondition, requireFinite, requireInteger } from './internal/LandscapeValidation.js';

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {number} x @param {number} z @param {number} landCoverId @returns {string} */
export function resolveLandscapeSoil(manifest, x, z, landCoverId) {
    requireFinite(x, 'soil x');
    requireFinite(z, 'soil z');
    requireInteger(landCoverId, 0, 255, 'landCoverId');
    requireCondition(x >= manifest.bounds.minX && x <= manifest.bounds.maxX && z >= manifest.bounds.minZ && z <= manifest.bounds.maxZ, 'soil position outside landscape');
    const mapped = manifest.soil.landCoverMapping.find((entry) => entry.landCoverId === landCoverId)?.soilId;
    requireCondition(!!mapped, `unknown land-cover ID ${landCoverId}`);
    for (let i = manifest.soil.overrides.length - 1; i >= 0; i--) {
        const override = manifest.soil.overrides[i];
        if (landscapeRegionContains(override.region, x, z)) return override.soilId;
    }
    return mapped;
}
