// Validates the additive layers companion that gives one schema-1 appearance the substrate and cover class materials of the surface model.
// @ts-check
// AI 598 D2. The companion (landscape-appearance-layers) is prepared by the same converter and page format as the soil materials and the
// multiscale companion, keyed by surface class id instead of soil id, with every tier (32, 128, 512, 1024) per material. It binds to one
// landscape, appearance revision and binding key like the multiscale companion, and to the surface recipe's material table: the recipe is the
// authority for which material a class names, so a companion whose material ids or whose materials key disagree with the recipe is a binding
// error, never silently accepted. Classes without a published material are simply absent; `none` binds nothing.
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';
import { landscapeAppearanceBindingKey, validateLandscapeAppearanceManifest } from './LandscapeAppearanceManifest.js';
import { LANDSCAPE_APPEARANCE_MICRO_ENCODING, LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT, LANDSCAPE_APPEARANCE_MULTISCALE_TIERS, validateLandscapeAppearanceMultiscalePage } from './LandscapeAppearanceMultiscale.js';
import { LANDSCAPE_SURFACE_COVERS, LANDSCAPE_SURFACE_SUBSTRATES, canonicalLandscapeSurfaceJson, landscapeSurfaceSha256, validateLandscapeSurfaceRecipe } from './surface/SurfaceModel.js';

export const LANDSCAPE_APPEARANCE_LAYERS_FORMAT = 'landscape-appearance-layers';
export const LANDSCAPE_APPEARANCE_LAYERS_ALGORITHM = 'landscape-appearance-layers-v1';
export const LANDSCAPE_APPEARANCE_LAYERS_LIMIT = 512 * 1024;
export const LANDSCAPE_APPEARANCE_LAYERS_PAGE_LIMIT = LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT;
export const LANDSCAPE_APPEARANCE_LAYERS_TIERS = LANDSCAPE_APPEARANCE_MULTISCALE_TIERS;
/** Classes a companion may bind, in catalog order (substrates, then covers without `none`). */
export const LANDSCAPE_APPEARANCE_LAYER_CLASSES = Object.freeze([
    ...LANDSCAPE_SURFACE_SUBSTRATES.map(definition => Object.freeze({ classId: definition.id, kind: 'substrate' })),
    ...LANDSCAPE_SURFACE_COVERS.filter(definition => definition.id !== 'none').map(definition => Object.freeze({ classId: definition.id, kind: 'cover' }))
]);

const MAX_TILE_METERS = 64;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const KEYS = Object.freeze({
    sidecar: 'appearanceRevision,bindingKey,capabilities,format,landscapeId,materials,provenance,recipe,revision,schemaVersion',
    recipe: 'id,materialsKey',
    capabilities: 'encoding,gpuCompression,maxPageBytes,tiers',
    provenance: 'algorithm,recipes,sources',
    source: 'byteLength,path,sha256',
    material: 'calibration,classId,kind,materialId,roughnessInputRange,tiers,tileMeters',
    micro: 'encoding,luminanceRange,materialId,provenanceSourceIds,tiers,tileMeters',
    tier: 'channels,id,resolution'
});

/** Identifies a structurally valid companion that extends a different landscape, appearance revision, binding or surface recipe material table. */
export class LandscapeAppearanceLayersBindingError extends Error {
    constructor(message) { super(`[Landscape] ${message}`); this.name = 'LandscapeAppearanceLayersBindingError'; }
}

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields (expected ${keys})`);
}

/** Class entry of the bindable catalog, or null. @param {string} classId */
export function landscapeAppearanceLayerClass(classId) {
    return LANDSCAPE_APPEARANCE_LAYER_CLASSES.find(entry => entry.classId === classId) ?? null;
}

/**
 * SHA-256 of the recipe's class -> material id table (canonical JSON, parameters excluded): the key a companion binds to, so recipe rule tuning
 * never invalidates published pages while a rebinding does.
 * @param {any} recipe @returns {Promise<string>}
 */
export async function landscapeSurfaceMaterialsKey(recipe) {
    const value = validateLandscapeSurfaceRecipe(recipe);
    return landscapeSurfaceSha256(canonicalLandscapeSurfaceJson(Object.fromEntries(Object.entries(value.materials).map(([classId, binding]) => [classId, binding.materialId]))));
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
    requireCondition(micro.tileMeters > 0 && micro.tileMeters <= MAX_TILE_METERS, `${label}.tileMeters must be in (0, ${MAX_TILE_METERS}] meters`);
    requireCondition(micro.encoding === LANDSCAPE_APPEARANCE_MICRO_ENCODING, `${label} encoding must be ${LANDSCAPE_APPEARANCE_MICRO_ENCODING}`);
    requireFinite(micro.luminanceRange, `${label}.luminanceRange`);
    requireCondition(micro.luminanceRange > 0 && micro.luminanceRange <= 1, `${label}.luminanceRange must be in (0, 1]`);
    const ids = micro.provenanceSourceIds;
    requireCondition(Array.isArray(ids) && ids.length > 0 && ids.length <= 64 && new Set(ids).size === ids.length && ids.every(id => typeof id === 'string' && sourcePaths.has(id)),
        `${label}.provenanceSourceIds must name retained provenance sources`);
    requireCondition(Array.isArray(micro.tiers) && micro.tiers.length === LANDSCAPE_APPEARANCE_LAYERS_TIERS.length, `${label} requires one micro tier per base tier`);
    micro.tiers.forEach((tier, i) => validateTier(tier, LANDSCAPE_APPEARANCE_LAYERS_TIERS[i], 'micro', `${label}/${LANDSCAPE_APPEARANCE_LAYERS_TIERS[i]}`, pages));
}

function validateMaterial(material, sourcePaths, pages, classes) {
    const label = `layers material ${material?.classId}`;
    const keys = [KEYS.material, material?.height !== undefined ? 'height' : null, material?.micro !== undefined ? 'micro' : null].filter(Boolean).join(',').split(',').sort().join(',');
    requireKeys(material, keys, label);
    const definition = landscapeAppearanceLayerClass(material.classId);
    requireCondition(!!definition, `${label} is not a bindable surface class`);
    requireCondition(material.kind === definition.kind, `${label} must be a ${definition.kind} material`);
    requireCondition(!classes.has(material.classId), `${label} is listed twice`); classes.add(material.classId);
    requireId(material.materialId, `${label}.materialId`); requireCondition(material.materialId.startsWith('pbr.'), `${label}.materialId must be a stable pbr material ID`);
    requireFinite(material.tileMeters, `${label}.tileMeters`); requireCondition(material.tileMeters > 0 && material.tileMeters <= MAX_TILE_METERS, `${label}.tileMeters must be in (0, ${MAX_TILE_METERS}] meters`);
    requireCondition(material.calibration?.presetId === 'aces' && !!material.calibration.adjustments && typeof material.calibration.adjustments === 'object' && !Array.isArray(material.calibration.adjustments),
        `${label} requires retained aces calibration`);
    requireSha256(material.calibration.configSha256, `${label} calibration hash`);
    requireCondition(Object.keys(material.calibration).sort().join(',') === 'adjustments,configSha256,presetId', `${label}.calibration has unsupported fields`);
    const range = material.roughnessInputRange;
    requireCondition(!!range && Object.keys(range).sort().join(',') === 'max,min' && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min >= 0 && range.max <= 1 && range.min <= range.max,
        `${label} roughness normalization range is invalid`);
    if (material.height !== undefined) {
        requireCondition(material.height?.encoding === 'orm-alpha-unorm8' && material.height.interpretation === 'relative-relief' && material.height.neutral === .5 && Object.keys(material.height).length === 3,
            `${label} height must explicitly declare linear ORM-alpha relative relief with neutral 0.5`);
    }
    requireCondition(Array.isArray(material.tiers) && material.tiers.length === LANDSCAPE_APPEARANCE_LAYERS_TIERS.length, `${label} requires exactly the tiers ${LANDSCAPE_APPEARANCE_LAYERS_TIERS.join(',')}`);
    material.tiers.forEach((tier, i) => validateTier(tier, LANDSCAPE_APPEARANCE_LAYERS_TIERS[i], 'baseColor,normal,orm', `${material.classId}/${LANDSCAPE_APPEARANCE_LAYERS_TIERS[i]}`, pages));
    if (material.micro !== undefined) validateMicro(material.micro, `${material.classId}/micro`, sourcePaths, pages);
}

function validateStructure(value) {
    requireKeys(value, KEYS.sidecar, 'appearance layers');
    requireCondition(value.format === LANDSCAPE_APPEARANCE_LAYERS_FORMAT && value.schemaVersion === 1, 'unsupported appearance layers schema');
    requireId(value.landscapeId, 'layers.landscapeId'); requireId(value.revision, 'layers.revision');
    requireCondition(value.revision.startsWith('layers-'), 'layers.revision must be a layers revision');
    requireId(value.appearanceRevision, 'layers.appearanceRevision'); requireSha256(value.bindingKey, 'layers.bindingKey');
    requireKeys(value.recipe, KEYS.recipe, 'layers.recipe'); requireId(value.recipe.id, 'layers.recipe.id'); requireSha256(value.recipe.materialsKey, 'layers.recipe.materialsKey');
    const capabilities = value.capabilities;
    requireKeys(capabilities, KEYS.capabilities, 'layers.capabilities');
    requireCondition(capabilities.encoding === 'rgba8' && capabilities.gpuCompression === 'none' && capabilities.maxPageBytes === LANDSCAPE_APPEARANCE_LAYERS_PAGE_LIMIT
        && Array.isArray(capabilities.tiers) && capabilities.tiers.join(',') === LANDSCAPE_APPEARANCE_LAYERS_TIERS.join(','), 'unsupported appearance layers capabilities');
    const provenance = value.provenance;
    requireKeys(provenance, KEYS.provenance, 'layers.provenance');
    requireCondition(provenance.algorithm === LANDSCAPE_APPEARANCE_LAYERS_ALGORITHM, 'unsupported appearance layers provenance algorithm');
    requireCondition(!!provenance.recipes && typeof provenance.recipes === 'object' && !Array.isArray(provenance.recipes), 'appearance layers recipes are required');
    requireCondition(Array.isArray(provenance.sources) && provenance.sources.length > 0 && provenance.sources.length <= 512, 'appearance layers requires 1..512 retained sources');
    const sourcePaths = new Set();
    for (const source of provenance.sources) {
        requireKeys(source, KEYS.source, 'layers source');
        requireRelativeUrl(source.path, 'layers source path'); requireSha256(source.sha256, 'layers source hash');
        requireInteger(source.byteLength, 0, MAX_SOURCE_BYTES, 'layers source bytes');
        requireCondition(!sourcePaths.has(source.path), `layers source ${source.path} is listed twice`); sourcePaths.add(source.path);
    }
    requireCondition(Array.isArray(value.materials) && value.materials.length > 0 && value.materials.length <= LANDSCAPE_APPEARANCE_LAYER_CLASSES.length,
        `appearance layers requires 1..${LANDSCAPE_APPEARANCE_LAYER_CLASSES.length} class material entries`);
    const pages = new Map(), classes = new Set();
    for (const material of value.materials) validateMaterial(material, sourcePaths, pages, classes);
}

/**
 * Strictly validates a layers companion against the schema-1 appearance it extends and the surface recipe whose material table it serves.
 * Structural faults throw generic errors; valid data for another landscape, appearance revision, binding or material table throws
 * LandscapeAppearanceLayersBindingError.
 * @param {any} input @param {any} appearanceInput @param {any} recipeInput @returns {Promise<any>} Frozen, key-order independent clone.
 */
export async function validateLandscapeAppearanceLayers(input, appearanceInput, recipeInput) {
    const appearance = validateLandscapeAppearanceManifest(appearanceInput), recipe = validateLandscapeSurfaceRecipe(recipeInput);
    const value = clonePlainData(input, 'appearance layers');
    validateStructure(value);
    if (value.landscapeId !== appearance.landscapeId) throw new LandscapeAppearanceLayersBindingError(`layers extend landscape ${value.landscapeId}, not ${appearance.landscapeId}`);
    if (value.appearanceRevision !== appearance.revision) throw new LandscapeAppearanceLayersBindingError(`layers extend appearance ${value.appearanceRevision}, not ${appearance.revision}`);
    if (value.bindingKey !== await landscapeAppearanceBindingKey(appearance)) throw new LandscapeAppearanceLayersBindingError('layers binding key does not match their appearance');
    if (value.recipe.materialsKey !== await landscapeSurfaceMaterialsKey(recipe)) throw new LandscapeAppearanceLayersBindingError(`layers bind the material table of recipe ${value.recipe.id}, not the current table of ${recipe.id}`);
    for (const material of value.materials) {
        const bound = recipe.materials[material.classId]?.materialId;
        if (bound !== material.materialId) throw new LandscapeAppearanceLayersBindingError(`layers bind ${material.materialId} to ${material.classId}; the recipe binds ${bound}`);
    }
    return freezeData(value);
}
