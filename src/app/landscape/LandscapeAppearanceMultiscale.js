// Validates the additive multiscale companion that extends one schema-1 appearance with finer base tiers and micro detail pages.
// @ts-check
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';
import { LANDSCAPE_APPEARANCE_TIERS, landscapeAppearanceBindingKey, validateLandscapeAppearanceManifest } from './LandscapeAppearanceManifest.js';

export const LANDSCAPE_APPEARANCE_MULTISCALE_FORMAT = 'landscape-appearance-multiscale';
export const LANDSCAPE_APPEARANCE_MULTISCALE_ALGORITHM = 'landscape-appearance-multiscale-v1';
export const LANDSCAPE_APPEARANCE_MULTISCALE_TIERS = Object.freeze([...LANDSCAPE_APPEARANCE_TIERS, 1024]);
export const LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT = 256 * 1024;
export const LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT = 1024 * 1024 * 4;
export const LANDSCAPE_APPEARANCE_MICRO_ENCODING = 'micro-normal-height-luminance-v1';

const EXTRA_TIERS = Object.freeze(LANDSCAPE_APPEARANCE_MULTISCALE_TIERS.filter(size => !LANDSCAPE_APPEARANCE_TIERS.includes(size)));
const MAX_MICRO_TILE_METERS = 64;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const KEYS = Object.freeze({
    sidecar: 'appearanceRevision,bindingKey,capabilities,format,landscapeId,materials,provenance,revision,schemaVersion',
    capabilities: 'encoding,gpuCompression,maxPageBytes,tiers',
    provenance: 'algorithm,recipes,sources',
    source: 'byteLength,path,sha256',
    material: 'materialId,soilId,tiers',
    microMaterial: 'materialId,micro,soilId,tiers',
    micro: 'encoding,luminanceRange,materialId,provenanceSourceIds,tiers,tileMeters',
    tier: 'channels,id,resolution',
    page: 'byteLength,colorSpace,decodedByteLength,encoding,height,revision,sha256,url,width'
});

/** Identifies a structurally valid companion that extends a different landscape, appearance revision or binding. */
export class LandscapeAppearanceMultiscaleBindingError extends Error {
    constructor(message) { super(`[Landscape] ${message}`); this.name = 'LandscapeAppearanceMultiscaleBindingError'; }
}

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields`);
}

/** @param {any} value @param {string} [label] @param {number} [maxPageBytes] */
export function validateLandscapeAppearanceMultiscalePage(value, label = 'multiscale page', maxPageBytes = LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT) {
    const page = clonePlainData(value, label);
    requireKeys(page, KEYS.page, label);
    requireCondition(page.encoding === 'rgba8', `${label} encoding must be rgba8`);
    requireCondition(LANDSCAPE_APPEARANCE_MULTISCALE_TIERS.includes(page.width) && page.height === page.width, `${label} has unsupported bounded dimensions`);
    requireCondition(['srgb', 'linear'].includes(page.colorSpace), `${label} has invalid color space`);
    requireCondition(page.byteLength === page.width * page.height * 4 && page.decodedByteLength === page.byteLength, `${label} byte size mismatch`);
    requireCondition(page.byteLength <= maxPageBytes && page.byteLength <= LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT, `${label} exceeds the ${maxPageBytes}-byte page limit`);
    requireRelativeUrl(page.url, `${label}.url`); requireSha256(page.sha256, `${label}.sha256`); requireId(page.revision, `${label}.revision`);
    return freezeData(page);
}

function validateTier(tier, resolution, names, label, pages) {
    requireKeys(tier, KEYS.tier, label);
    requireCondition(tier.id === String(resolution) && tier.resolution === resolution, `${label} must be the ${resolution}-pixel tier`);
    requireKeys(tier.channels, names, `${label}.channels`);
    for (const [name, page] of Object.entries(tier.channels)) {
        const channel = `${label}/${name}`;
        validateLandscapeAppearanceMultiscalePage(page, channel);
        requireCondition(page.width === resolution && page.colorSpace === (name === 'baseColor' ? 'srgb' : 'linear'), `${channel} resolution/color-space mismatch`);
        const previous = pages.get(page.url);
        requireCondition(!previous || (previous.sha256 === page.sha256 && previous.byteLength === page.byteLength), `${channel} reuses ${page.url} with different content`);
        pages.set(page.url, page);
    }
}

function validateMicro(micro, label, sourcePaths, pages) {
    requireKeys(micro, KEYS.micro, label);
    requireId(micro.materialId, `${label}.materialId`);
    requireCondition(micro.materialId.startsWith('pbr.'), `${label}.materialId must be a stable pbr material ID`);
    requireFinite(micro.tileMeters, `${label}.tileMeters`);
    requireCondition(micro.tileMeters > 0 && micro.tileMeters <= MAX_MICRO_TILE_METERS, `${label}.tileMeters must be in (0, ${MAX_MICRO_TILE_METERS}] meters`);
    requireCondition(micro.encoding === LANDSCAPE_APPEARANCE_MICRO_ENCODING, `${label} encoding must be ${LANDSCAPE_APPEARANCE_MICRO_ENCODING}`);
    requireFinite(micro.luminanceRange, `${label}.luminanceRange`);
    requireCondition(micro.luminanceRange > 0 && micro.luminanceRange <= 1, `${label}.luminanceRange must be in (0, 1]`);
    const ids = micro.provenanceSourceIds;
    requireCondition(Array.isArray(ids) && ids.length > 0 && ids.length <= 64 && new Set(ids).size === ids.length
        && ids.every(id => typeof id === 'string' && sourcePaths.has(id)), `${label}.provenanceSourceIds must name retained provenance sources`);
    requireCondition(Array.isArray(micro.tiers) && micro.tiers.length === LANDSCAPE_APPEARANCE_MULTISCALE_TIERS.length, `${label} requires one micro tier per base tier`);
    micro.tiers.forEach((tier, i) => validateTier(tier, LANDSCAPE_APPEARANCE_MULTISCALE_TIERS[i], 'micro', `${label}/${LANDSCAPE_APPEARANCE_MULTISCALE_TIERS[i]}`, pages));
}

function validateStructure(value) {
    requireKeys(value, KEYS.sidecar, 'appearance multiscale');
    requireCondition(value.format === LANDSCAPE_APPEARANCE_MULTISCALE_FORMAT && value.schemaVersion === 1, 'unsupported appearance multiscale schema');
    requireId(value.landscapeId, 'multiscale.landscapeId'); requireId(value.revision, 'multiscale.revision');
    requireId(value.appearanceRevision, 'multiscale.appearanceRevision'); requireSha256(value.bindingKey, 'multiscale.bindingKey');
    const capabilities = value.capabilities;
    requireKeys(capabilities, KEYS.capabilities, 'multiscale.capabilities');
    requireCondition(capabilities.encoding === 'rgba8' && capabilities.gpuCompression === 'none' && capabilities.maxPageBytes === LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT
        && Array.isArray(capabilities.tiers) && capabilities.tiers.join(',') === LANDSCAPE_APPEARANCE_MULTISCALE_TIERS.join(','), 'unsupported appearance multiscale capabilities');
    const provenance = value.provenance;
    requireKeys(provenance, KEYS.provenance, 'multiscale.provenance');
    requireCondition(provenance.algorithm === LANDSCAPE_APPEARANCE_MULTISCALE_ALGORITHM, 'unsupported appearance multiscale provenance algorithm');
    requireCondition(!!provenance.recipes && typeof provenance.recipes === 'object' && !Array.isArray(provenance.recipes), 'appearance multiscale recipes are required');
    requireCondition(Array.isArray(provenance.sources) && provenance.sources.length > 0 && provenance.sources.length <= 512, 'appearance multiscale requires 1..512 retained sources');
    const sourcePaths = new Set();
    for (const source of provenance.sources) {
        requireKeys(source, KEYS.source, 'multiscale source');
        requireRelativeUrl(source.path, 'multiscale source path'); requireSha256(source.sha256, 'multiscale source hash');
        requireInteger(source.byteLength, 0, MAX_SOURCE_BYTES, 'multiscale source bytes');
        requireCondition(!sourcePaths.has(source.path), `multiscale source ${source.path} is listed twice`); sourcePaths.add(source.path);
    }
    requireCondition(Array.isArray(value.materials) && value.materials.length > 0 && value.materials.length <= 16, 'appearance multiscale requires 1..16 soil material entries');
    const pages = new Map(), soils = new Set();
    for (const material of value.materials) {
        requireKeys(material, material?.micro === undefined ? KEYS.material : KEYS.microMaterial, 'multiscale material');
        requireId(material.soilId, 'multiscale.soilId'); requireId(material.materialId, 'multiscale.materialId');
        requireCondition(!soils.has(material.soilId), `multiscale soil ${material.soilId} is listed twice`); soils.add(material.soilId);
        requireCondition(Array.isArray(material.tiers) && material.tiers.length === EXTRA_TIERS.length, `${material.soilId} requires exactly the extra tiers ${EXTRA_TIERS.join(',')}`);
        material.tiers.forEach((tier, i) => validateTier(tier, EXTRA_TIERS[i], 'baseColor,normal,orm', `${material.soilId}/${EXTRA_TIERS[i]}`, pages));
        if (material.micro !== undefined) validateMicro(material.micro, `${material.soilId}/micro`, sourcePaths, pages);
    }
}

/**
 * Strictly validates a companion against the schema-1 appearance it extends. Structural faults throw generic errors;
 * valid data for another landscape, appearance revision or binding throws LandscapeAppearanceMultiscaleBindingError.
 * @param {any} input @param {any} appearanceInput @returns {Promise<any>} Frozen, key-order independent clone.
 */
export async function validateLandscapeAppearanceMultiscale(input, appearanceInput) {
    const appearance = validateLandscapeAppearanceManifest(appearanceInput);
    const value = clonePlainData(input, 'appearance multiscale');
    validateStructure(value);
    if (value.landscapeId !== appearance.landscapeId) throw new LandscapeAppearanceMultiscaleBindingError(`multiscale extends landscape ${value.landscapeId}, not ${appearance.landscapeId}`);
    if (value.appearanceRevision !== appearance.revision) throw new LandscapeAppearanceMultiscaleBindingError(`multiscale extends appearance ${value.appearanceRevision}, not ${appearance.revision}`);
    if (value.bindingKey !== await landscapeAppearanceBindingKey(appearance)) throw new LandscapeAppearanceMultiscaleBindingError('multiscale binding key does not match its appearance');
    requireCondition(value.materials.length === appearance.materials.length, 'appearance multiscale must describe every appearance soil binding');
    value.materials.forEach((material, i) => {
        requireCondition(appearance.materials.some(entry => entry.soilId === material.soilId), `appearance multiscale names unknown soil ${material.soilId}`);
        requireCondition(appearance.materials[i].soilId === material.soilId && appearance.materials[i].materialId === material.materialId, `appearance multiscale binding ${material.soilId} does not match its appearance order/material`);
    });
    return freezeData(value);
}

/**
 * Decodes one linear micro texel: RG tangent detail normal XY, B relative height, A luminance modulation.
 * @param {number} r @param {number} g @param {number} b @param {number} a @param {number} luminanceRange
 * @returns {{normal:readonly number[],height:number,luminanceRatio:number}}
 */
export function decodeLandscapeAppearanceMicroTexel(r, g, b, a, luminanceRange) {
    for (const byte of [r, g, b, a]) requireInteger(byte, 0, 255, 'micro texel byte');
    requireFinite(luminanceRange, 'micro luminanceRange');
    requireCondition(luminanceRange > 0 && luminanceRange <= 1, 'micro luminanceRange must be in (0, 1]');
    const x = r / 127.5 - 1, y = g / 127.5 - 1, length = Math.hypot(x, y), scale = length > 1 ? 1 / length : 1;
    const nx = x * scale, ny = y * scale;
    return Object.freeze({ normal: Object.freeze([nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]), height: b / 255, luminanceRatio: 1 + (a / 127.5 - 1) * luminanceRange });
}
