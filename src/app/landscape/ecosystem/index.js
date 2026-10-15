// Public entry of the landscape ecosystem engine's domain (AI 599): recipe, rules, inputs, overrides and the instance record contract.
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
