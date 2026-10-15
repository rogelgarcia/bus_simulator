// Public entry of the landscape ecosystem engine's domain (AI 599): recipe, rules, inputs, overrides, the instance record contract, the lattice, generation, statistics and the sidecar.
// @ts-check
export { ECOSYSTEM_ALGORITHM, ECOSYSTEM_BUILTIN_ZONES, ECOSYSTEM_COVER_CLASSES, ECOSYSTEM_DISTANCE_CAP, ECOSYSTEM_MAX_CURVE_POINTS, ECOSYSTEM_MAX_DENSITY_TERMS, ECOSYSTEM_PLANNING_COVER_IDS, ECOSYSTEM_RULE_INPUTS, ECOSYSTEM_SOILS,
    compileEcosystemDensity, createEcosystemInputCatalog, evaluateEcosystemCurve, evaluateEcosystemDensity, isEcosystemRuleInput, traceEcosystemRule, validateEcosystemCurve } from './EcosystemRules.js';
export { ECOSYSTEM_ALIGNMENT_MODES, ECOSYSTEM_ASSET_KINDS, ECOSYSTEM_CATALOG_LEVELS, ECOSYSTEM_CATALOG_SPECIES, ECOSYSTEM_CATALOG_VARIANTS, ECOSYSTEM_GENERATION_MODES, ECOSYSTEM_RECIPE_FORMAT, ECOSYSTEM_RECIPE_IDENTITY, ECOSYSTEM_RECIPE_LIMITS,
    ECOSYSTEM_RECIPE_SCHEMA_VERSION, ECOSYSTEM_SCALE_DISTRIBUTIONS, ECOSYSTEM_YAW_MODES, canonicalEcosystemJson, ecosystemCompetitionDistance, ecosystemCompetitors, ecosystemLayerHaloMeters, ecosystemLayerPriorityOrder, ecosystemLayerSpacing,
    ecosystemRecipeIdentity, validateEcosystemRecipe } from './EcosystemRecipe.js';
export { ECOSYSTEM_RECORD, ECOSYSTEM_TILE_BYTES_PER_INSTANCE, createEcosystemTileData, decodeEcosystemTile, ecosystemCellBounds, ecosystemCellOf, ecosystemInstanceId, ecosystemRecordNormal, ecosystemTileId, encodeEcosystemTile,
    parseEcosystemInstanceId, parseEcosystemTileId, readEcosystemRecord, sortEcosystemTile, writeEcosystemRecord } from './EcosystemTiles.js';
export { ECOSYSTEM_MASK_MODES, ECOSYSTEM_OVERRIDES_FORMAT, ECOSYSTEM_OVERRIDES_LIMITS, ECOSYSTEM_OVERRIDES_SCHEMA_VERSION, ECOSYSTEM_OVERRIDE_ORDER, applyEcosystemOverrides, createEmptyEcosystemOverrides, ecosystemOverrideParameters,
    ecosystemOverridesIdentity, ecosystemOverridesIntersecting, validateEcosystemOverrides } from './EcosystemOverrides.js';
export { createEcosystemInputSampler, ecosystemExcludedBy } from './EcosystemInputs.js';
export { ECOSYSTEM_BLUE_NOISE, ECOSYSTEM_BLUE_NOISE_PARAMETERS, decodeEcosystemBlueNoiseRanks, ecosystemBlueNoiseRank, encodeEcosystemBlueNoiseRanks, generateEcosystemBlueNoiseRanks, requireEcosystemBlueNoisePermutation } from './EcosystemBlueNoise.js';
export { ECOSYSTEM_CHILD_CHANNELS, ECOSYSTEM_SITE_CHANNELS, ECOSYSTEM_TWO_PI, createEcosystemClumping, createEcosystemVariationSampler, ecosystemCellSites, ecosystemCellsIntersecting, ecosystemChildHash, ecosystemExp2Unit, ecosystemGrownBounds,
    ecosystemHashUnit, ecosystemLayerSalt, ecosystemLayerVariants, ecosystemLog2, ecosystemSiteCell, ecosystemSiteHash, ecosystemSiteOf, ecosystemSitePosition, ecosystemSiteUnit, ecosystemUnitDirection } from './EcosystemLattice.js';
export { ECOSYSTEM_COVER_DISTANCE_METERS, createEcosystemCellSources, ecosystemCellRequirements, ecosystemDistanceTransform, ecosystemNativeChunkIds } from './EcosystemCellSources.js';
export { createEcosystemCellCache, ecosystemLayerDependencyMeters, ecosystemLayerGenerationHalo, ecosystemLayerReferences, generateEcosystemCell, generateEcosystemLayerCells, traceEcosystemSite } from './EcosystemGeneration.js';
export { ECOSYSTEM_ANISOTROPY, ECOSYSTEM_CORRELATION_SPACINGS, ecosystemSpatialStatistics } from './EcosystemStatistics.js';
export { LANDSCAPE_ECOSYSTEM_DIRECTORY, LANDSCAPE_ECOSYSTEM_FORMAT, LANDSCAPE_ECOSYSTEM_LIMIT, LANDSCAPE_ECOSYSTEM_REVISION, LANDSCAPE_ECOSYSTEM_SCHEMA_VERSION, LANDSCAPE_ECOSYSTEM_TILES_FORMAT, LANDSCAPE_ECOSYSTEM_TILES_LIMIT, LANDSCAPE_ECOSYSTEM_TILE_LIMIT,
    LandscapeEcosystemBindingError, ecosystemTileContentInput, ecosystemTileContentKey, ecosystemTileNatives, ecosystemTileStale, landscapeEcosystemLayout, landscapeEcosystemRevision, landscapeEcosystemStaleness, validateLandscapeEcosystem,
    validateLandscapeEcosystemTiles } from './EcosystemSidecar.js';
export { loadLandscapeEcosystem, loadLandscapeEcosystemTile, loadLandscapeEcosystemTiles } from './EcosystemSidecarPayload.js';
