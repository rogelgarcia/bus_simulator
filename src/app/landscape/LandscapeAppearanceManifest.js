// Validates independent retained PBR page catalogs without binding material detail to geometry residency.
// @ts-check
import { clonePlainData, freezeData, requireCondition, requireId, requireInteger, requireFinite, requireRelativeUrl, requireSha256, requireBounds } from './internal/LandscapeValidation.js';

export const LANDSCAPE_APPEARANCE_TIERS = Object.freeze([32, 128, 512]);
export const LANDSCAPE_APPEARANCE_MANIFEST_LIMIT = 256 * 1024;
export const LANDSCAPE_APPEARANCE_PAGE_LIMIT = 512 * 512 * 4;

/** @param {any} value @param {string} [label] */
export function validateLandscapeAppearancePage(value, label = 'appearance page') {
    const page = clonePlainData(value, label);
    requireCondition(page.encoding === 'rgba8', `${label} encoding must be rgba8`);
    requireCondition(LANDSCAPE_APPEARANCE_TIERS.includes(page.width) && page.height === page.width, `${label} has unsupported bounded dimensions`);
    requireCondition(['srgb', 'linear'].includes(page.colorSpace), `${label} has invalid color space`);
    requireCondition(page.byteLength === page.width * page.height * 4 && page.decodedByteLength === page.byteLength, `${label} byte size mismatch`);
    requireRelativeUrl(page.url, `${label}.url`); requireSha256(page.sha256, `${label}.sha256`); requireId(page.revision, `${label}.revision`);
    return freezeData(page);
}

/** @param {any} input @param {any} [landscape] */
export function validateLandscapeAppearanceManifest(input, landscape) {
    const value = clonePlainData(input, 'appearance');
    requireCondition(value.format === 'landscape-appearance' && value.schemaVersion === 1, 'unsupported appearance schema');
    requireId(value.landscapeId, 'appearance.landscapeId'); requireId(value.revision, 'appearance.revision');
    requireId(value.preparedFromRevision, 'appearance.preparedFromRevision'); requireBounds(value.bounds);
    requireCondition(value.grid && typeof value.grid === 'object', 'appearance grid is required');
    for (const field of ['columns', 'rows', 'chunkIntervals']) requireInteger(value.grid[field], 1, Number.MAX_SAFE_INTEGER, `appearance.grid.${field}`);
    requireInteger(value.grid.maxLevel, 0, 20, 'appearance.grid.maxLevel');
    for (const field of ['spacingX', 'spacingZ']) { requireFinite(value.grid[field], `appearance.grid.${field}`); requireCondition(value.grid[field] > 0, 'appearance grid spacing must be positive'); }
    requireCondition(value.orientation?.uAxis === 'east' && value.orientation.vAxis === 'north' && value.orientation.row0 === 'south' && value.orientation.normalConvention === 'opengl', 'unsupported appearance orientation');
    requireCondition(Array.isArray(value.materials) && value.materials.length > 0 && value.materials.length <= 16, 'appearance requires 1..16 soil material bindings');
    const ids = new Set();
    for (const material of value.materials) {
        requireId(material.soilId, 'appearance.soilId'); requireId(material.materialId, 'appearance.materialId');
        requireCondition(material.materialId.startsWith('pbr.') && !ids.has(material.soilId), 'appearance soil/material IDs must be unique catalog bindings'); ids.add(material.soilId);
        requireFinite(material.tileMeters, 'appearance.tileMeters'); requireCondition(material.tileMeters > 0, 'appearance tileMeters must be positive');
        requireCondition(material.calibration?.presetId === 'aces' && material.calibration.adjustments && typeof material.calibration.adjustments === 'object', 'appearance requires retained aces calibration');
        requireSha256(material.calibration.configSha256, 'appearance calibration hash');
        const range = material.roughnessInputRange;
        requireCondition(range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min >= 0 && range.max <= 1 && range.min <= range.max, 'appearance roughness normalization range is invalid');
        requireCondition(Array.isArray(material.tiers) && material.tiers.length === LANDSCAPE_APPEARANCE_TIERS.length, 'appearance requires all independent material tiers');
        for (let i = 0; i < material.tiers.length; i++) {
            const tier = material.tiers[i], resolution = LANDSCAPE_APPEARANCE_TIERS[i];
            requireCondition(tier.id === String(resolution) && tier.resolution === resolution, 'appearance tiers must be ordered 32,128,512');
            requireCondition(tier.channels && Object.keys(tier.channels).sort().join(',') === 'baseColor,normal,orm', 'appearance requires baseColor/normal/orm channels');
            for (const [name, page] of Object.entries(tier.channels)) {
                validateLandscapeAppearancePage(page, `${material.soilId}/${tier.id}/${name}`);
                requireCondition(page.width === resolution && page.colorSpace === (name === 'baseColor' ? 'srgb' : 'linear'), 'appearance channel resolution/color-space mismatch');
            }
        }
    }
    requireCondition(value.provenance?.algorithm === 'landscape-appearance-v1' && Array.isArray(value.provenance.sources) && value.provenance.sources.length <= 512, 'appearance provenance is required');
    for (const source of value.provenance.sources) {
        requireRelativeUrl(source.path, 'appearance source path'); requireSha256(source.sha256, 'appearance source hash'); requireInteger(source.byteLength, 0, 32 * 1024 * 1024, 'appearance source bytes');
    }
    if (landscape) {
        requireCondition(value.landscapeId === landscape.id && ['minX', 'maxX', 'minZ', 'maxZ'].every(key => value.bounds[key] === landscape.bounds[key])
            && ['columns', 'rows', 'chunkIntervals', 'maxLevel', 'spacingX', 'spacingZ'].every(key => value.grid[key] === landscape.grid[key]), 'appearance spatial identity does not match landscape');
        requireCondition(value.materials.length === landscape.soil.catalog.length && value.materials.every((material, i) => material.soilId === landscape.soil.catalog[i].id && material.materialId === landscape.soil.catalog[i].materialId), 'appearance bindings do not match semantic soil catalog');
    }
    return freezeData(value);
}
