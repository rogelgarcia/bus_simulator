// Exposes renderer-independent landscape manifests, channels, coordinates, and sampling.
// @ts-check
export { LANDSCAPE_LAND_COVER_CATALOG, LANDSCAPE_SOIL_CATALOG } from './LandscapeCatalog.js';
export { LANDSCAPE_SCHEMA_VERSION, LANDSCAPE_MAX_CHUNK_SAMPLES, LANDSCAPE_SUPPORTED_CAPABILITIES, createLandscapeChunkId, createLandscapeManifest, validateLandscapeManifest } from './LandscapeManifest.js';
export { LANDSCAPE_MANIFEST_BYTE_LIMIT, LANDSCAPE_CHUNK_BYTE_LIMIT, encodeLandscapeChannel, decodeLandscapeChannel, loadLandscapeManifest, loadLandscapeChunk, loadLandscapeOverview } from './LandscapePayload.js';
export { landscapeGridToWorld, landscapeWorldToGrid, landscapeCityTileToWorld, landscapeWorldToCityTile } from './LandscapeCoordinates.js';
export { sampleLandscapeChunk, createLandscapeSelectionContext } from './LandscapeSampling.js';
export { resolveLandscapeSoil } from './LandscapeSoil.js';
export { LANDSCAPE_MAX_POLYGON_VERTICES, validateLandscapeRegion, landscapeRegionBounds, landscapeRegionContains, landscapeRegionIntersectsBounds, landscapeRegionWeight, landscapeRegionsEqual, landscapeRegionSignedDistance, landscapeRegionNearestBoundaryPoint } from './LandscapeRegions.js';
export { LANDSCAPE_SURFACE_DETAIL_FORMAT, LANDSCAPE_SURFACE_DETAIL_MAX_LEVELS, LANDSCAPE_SURFACE_DETAIL_MAX_WARP_METERS, LANDSCAPE_SURFACE_DETAIL_MAX_WARP_SLOPE, validateLandscapeSurfaceDetailRecipe, createLandscapeSurfaceDetailIndex,
    landscapeSurfaceDetailSupport, landscapeSurfaceDetailInputs, landscapeSurfaceDetailKey, landscapeSurfaceDetailRecipeHash, landscapeSurfaceDetailSeed, landscapeSurfaceDetailSearchRadius } from './LandscapeSurfaceDetail.js';
export { LANDSCAPE_EDIT_CAPABILITY, LANDSCAPE_ADVANCED_EDIT_CAPABILITY, LANDSCAPE_MAX_BATCH_OPERATIONS, LANDSCAPE_MAX_NAMED_REGIONS, LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES, validateLandscapeEditBatch } from './LandscapeEditSchema.js';
export { LANDSCAPE_MAX_NATIVE_CHUNKS, LANDSCAPE_QUERY_BYTE_LIMIT, planLandscapeRegion, acquireLandscapeRegion, queryLandscapeSelection, validateAcquiredLandscapeChunk, validateLandscapeNativeSeams } from './LandscapeAcquisition.js';
export { LANDSCAPE_EDIT_WORKING_BYTE_LIMIT, applyLandscapeEditBatch } from './LandscapeEditing.js';
export { LANDSCAPE_STREAMED_EDIT_WORKING_BYTE_LIMIT, applyLandscapeEditBatchStreamed } from './LandscapeStreamedEditing.js';
export { createLandscapeViewPlanner, planLandscapeView, landscapeResourceKey } from './LandscapeStreaming.js';
export { LANDSCAPE_STREAMING_BUDGETS, LandscapeResidencyBudget } from './LandscapeResidencyBudget.js';
export { LANDSCAPE_APPEARANCE_TIERS, LANDSCAPE_APPEARANCE_MANIFEST_LIMIT, LANDSCAPE_APPEARANCE_PAGE_LIMIT, LandscapeAppearanceBindingError, landscapeAppearanceBindingKey, validateLandscapeAppearanceManifest, validateLandscapeAppearancePage } from './LandscapeAppearanceManifest.js';
export { loadLandscapeAppearanceManifest, loadLandscapeAppearancePage, loadLandscapeCoverMask, loadLandscapeCoverChannel, rasterizeLandscapeSoilMask } from './LandscapeAppearancePayload.js';
export { LANDSCAPE_APPEARANCE_MULTISCALE_FORMAT, LANDSCAPE_APPEARANCE_MULTISCALE_ALGORITHM, LANDSCAPE_APPEARANCE_MULTISCALE_TIERS, LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT, LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT,
    LANDSCAPE_APPEARANCE_MICRO_ENCODING, LandscapeAppearanceMultiscaleBindingError, validateLandscapeAppearanceMultiscale, validateLandscapeAppearanceMultiscalePage, decodeLandscapeAppearanceMicroTexel } from './LandscapeAppearanceMultiscale.js';
export { loadLandscapeAppearanceMultiscale, loadLandscapeAppearanceMultiscalePage } from './LandscapeAppearanceMultiscalePayload.js';
export { createLandscapeAppearancePlanner } from './LandscapeAppearancePlanner.js';
export { LANDSCAPE_CITY_BINDING_CAPABILITY, validateLandscapeCityBinding, landscapePointToCity, cityPointToLandscape, cityRegionToLandscape, cityReservationsToLandscapeConstraints, loadCityLandscape, resolveCityLandscape, assertFlatCityCapability } from './LandscapeCityBinding.js';
export { LANDSCAPE_CACHE_ROOT, LANDSCAPE_DEFAULT_DIRECTORY, LANDSCAPE_CACHE_GUIDE, LANDSCAPE_CACHE_STATUS, landscapeCacheDirectory, probeLandscapeCache, describeLandscapeCacheAvailability } from './LandscapeCache.js';
export { cityTileLandscapeCoverage } from './LandscapeCityCoverage.js';
export { LANDSCAPE_REPORT_LIMITS, reportLandscapeTerrain, readLandscapeTerrainReport } from './LandscapeTerrainReports.js';
export { createLandscapeDependency, checkLandscapeDependency, landscapeChangeInvalidates } from './LandscapeDependencies.js';
export { LANDSCAPE_PLANNING_LIMITS, LANDSCAPE_PLANNING_ROLES, normalizeLandscapePlanningReference, loadLandscapePlanningReferences } from './LandscapePlanningReferences.js';
export { LANDSCAPE_TERRAIN_FIELDS_FORMAT, LANDSCAPE_TERRAIN_FIELDS_ALGORITHM, LANDSCAPE_TERRAIN_FIELDS_LIMIT, LANDSCAPE_TERRAIN_FIELDS_PAGE_LIMIT, LANDSCAPE_TERRAIN_FIELDS_LAYOUT,
    LANDSCAPE_TERRAIN_FIELDS_HORIZON, LANDSCAPE_TERRAIN_FIELDS_FILTER, LANDSCAPE_TERRAIN_FIELDS_STALE_GRID, LANDSCAPE_TERRAIN_FIELD_CHANNELS, LANDSCAPE_TERRAIN_FIELD_CURVES,
    LandscapeTerrainFieldsBindingError, encodeLandscapeTerrainField, decodeLandscapeTerrainField, decodeLandscapeTerrainFields, landscapeTerrainFieldsLayout, landscapeTerrainFieldNativeIds,
    landscapeTerrainFieldContentKey, validateLandscapeTerrainFields, landscapeTerrainFieldsStaleness, landscapeTerrainFieldStaleAt, sampleLandscapeTerrainFieldPage,
    sampleLandscapeTerrainFieldSlots, landscapeTerrainHorizonSine, landscapeSolarDiscVisibility, landscapeTerrainSunVisibility, landscapeTerrainSkyVisibility, sampleLandscapeTerrainNaturalSoil } from './LandscapeTerrainFields.js';
export { loadLandscapeTerrainFields, loadLandscapeTerrainFieldPage } from './LandscapeTerrainFieldsPayload.js';
export { LANDSCAPE_DRESSING_INPUTS, sampleLandscapeDressingInputs } from './LandscapeDressingInputs.js';
export { LANDSCAPE_NATURAL_SOIL, landscapeNaturalSoilIndices, landscapeNaturalSoilPageBytes, landscapeNaturalSoilTransientBytes, validateLandscapeNaturalSoilPage,
    createLandscapeNaturalSoilResolver, landscapeNaturalSoilIdentity } from './LandscapeNaturalSoil.js';
export { landscapeSurfaceDetailUsesNaturalSoil } from './LandscapeSurfaceDetail.js';
