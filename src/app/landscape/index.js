// Exposes renderer-independent landscape manifests, channels, coordinates, and sampling.
// @ts-check
export { LANDSCAPE_LAND_COVER_CATALOG, LANDSCAPE_SOIL_CATALOG } from './LandscapeCatalog.js';
export { LANDSCAPE_SCHEMA_VERSION, LANDSCAPE_MAX_CHUNK_SAMPLES, LANDSCAPE_SUPPORTED_CAPABILITIES, createLandscapeChunkId, createLandscapeManifest, validateLandscapeManifest } from './LandscapeManifest.js';
export { LANDSCAPE_MANIFEST_BYTE_LIMIT, LANDSCAPE_CHUNK_BYTE_LIMIT, encodeLandscapeChannel, decodeLandscapeChannel, loadLandscapeManifest, loadLandscapeChunk, loadLandscapeOverview } from './LandscapePayload.js';
export { landscapeGridToWorld, landscapeWorldToGrid, landscapeCityTileToWorld, landscapeWorldToCityTile } from './LandscapeCoordinates.js';
export { sampleLandscapeChunk, createLandscapeSelectionContext } from './LandscapeSampling.js';
export { resolveLandscapeSoil } from './LandscapeSoil.js';
export { LANDSCAPE_MAX_POLYGON_VERTICES, validateLandscapeRegion, landscapeRegionBounds, landscapeRegionContains, landscapeRegionIntersectsBounds, landscapeRegionWeight, landscapeRegionsEqual } from './LandscapeRegions.js';
export { LANDSCAPE_EDIT_CAPABILITY, LANDSCAPE_ADVANCED_EDIT_CAPABILITY, LANDSCAPE_MAX_BATCH_OPERATIONS, LANDSCAPE_MAX_NAMED_REGIONS, LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES, validateLandscapeEditBatch } from './LandscapeEditSchema.js';
export { LANDSCAPE_MAX_NATIVE_CHUNKS, LANDSCAPE_QUERY_BYTE_LIMIT, planLandscapeRegion, acquireLandscapeRegion, queryLandscapeSelection, validateAcquiredLandscapeChunk, validateLandscapeNativeSeams } from './LandscapeAcquisition.js';
export { LANDSCAPE_EDIT_WORKING_BYTE_LIMIT, applyLandscapeEditBatch } from './LandscapeEditing.js';
export { LANDSCAPE_STREAMED_EDIT_WORKING_BYTE_LIMIT, applyLandscapeEditBatchStreamed } from './LandscapeStreamedEditing.js';
export { createLandscapeViewPlanner, planLandscapeView, landscapeResourceKey } from './LandscapeStreaming.js';
export { LANDSCAPE_STREAMING_BUDGETS, LandscapeResidencyBudget } from './LandscapeResidencyBudget.js';
export { LANDSCAPE_APPEARANCE_TIERS, LANDSCAPE_APPEARANCE_MANIFEST_LIMIT, LANDSCAPE_APPEARANCE_PAGE_LIMIT, validateLandscapeAppearanceManifest, validateLandscapeAppearancePage } from './LandscapeAppearanceManifest.js';
export { loadLandscapeAppearanceManifest, loadLandscapeAppearancePage, loadLandscapeCoverMask, rasterizeLandscapeSoilMask } from './LandscapeAppearancePayload.js';
export { createLandscapeAppearancePlanner } from './LandscapeAppearancePlanner.js';
export { LANDSCAPE_CITY_BINDING_CAPABILITY, validateLandscapeCityBinding, landscapePointToCity, cityPointToLandscape, cityRegionToLandscape, cityReservationsToLandscapeConstraints, loadCityLandscape, assertFlatCityCapability } from './LandscapeCityBinding.js';
export { cityTileLandscapeCoverage } from './LandscapeCityCoverage.js';
export { LANDSCAPE_REPORT_LIMITS, reportLandscapeTerrain, readLandscapeTerrainReport } from './LandscapeTerrainReports.js';
export { createLandscapeDependency, checkLandscapeDependency, landscapeChangeInvalidates } from './LandscapeDependencies.js';
export { LANDSCAPE_PLANNING_LIMITS, LANDSCAPE_PLANNING_ROLES, normalizeLandscapePlanningReference, loadLandscapePlanningReferences } from './LandscapePlanningReferences.js';
