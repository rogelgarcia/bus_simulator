// Exposes renderer-independent landscape manifests, channels, coordinates, and sampling.
// @ts-check
export { LANDSCAPE_LAND_COVER_CATALOG, LANDSCAPE_SOIL_CATALOG } from './LandscapeCatalog.js';
export { LANDSCAPE_SCHEMA_VERSION, LANDSCAPE_MAX_CHUNK_SAMPLES, LANDSCAPE_SUPPORTED_CAPABILITIES, createLandscapeChunkId, createLandscapeManifest, validateLandscapeManifest } from './LandscapeManifest.js';
export { LANDSCAPE_MANIFEST_BYTE_LIMIT, LANDSCAPE_CHUNK_BYTE_LIMIT, encodeLandscapeChannel, decodeLandscapeChannel, loadLandscapeManifest, loadLandscapeChunk, loadLandscapeOverview } from './LandscapePayload.js';
export { landscapeGridToWorld, landscapeWorldToGrid, landscapeCityTileToWorld, landscapeWorldToCityTile } from './LandscapeCoordinates.js';
export { sampleLandscapeChunk, createLandscapeSelectionContext } from './LandscapeSampling.js';
export { resolveLandscapeSoil } from './LandscapeSoil.js';
export { validateLandscapeRegion, landscapeRegionBounds, landscapeRegionContains, landscapeRegionIntersectsBounds, landscapeRegionWeight } from './LandscapeRegions.js';
export { LANDSCAPE_EDIT_CAPABILITY, LANDSCAPE_MAX_BATCH_OPERATIONS, validateLandscapeEditBatch } from './LandscapeEditSchema.js';
export { LANDSCAPE_MAX_NATIVE_CHUNKS, LANDSCAPE_QUERY_BYTE_LIMIT, planLandscapeRegion, acquireLandscapeRegion, queryLandscapeSelection, validateAcquiredLandscapeChunk, validateLandscapeNativeSeams } from './LandscapeAcquisition.js';
export { LANDSCAPE_EDIT_WORKING_BYTE_LIMIT, applyLandscapeEditBatch } from './LandscapeEditing.js';
