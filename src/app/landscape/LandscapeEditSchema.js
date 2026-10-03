// Validates ordered bounded edit batches and persisted authoring records.
// @ts-check
import { landscapeRegionBounds, validateLandscapeRegion } from './LandscapeRegions.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl } from './internal/LandscapeValidation.js';

export const LANDSCAPE_EDIT_CAPABILITY = 'terrain-editing-v1';
export const LANDSCAPE_MAX_BATCH_OPERATIONS = 64;
export const LANDSCAPE_MAX_AUTHORING_RECORDS = 1024;

function validateOperation(operation, manifest) {
    requireId(operation.id, 'operation.id');
    requireCondition(['raise', 'set-height', 'assign-soil'].includes(operation.type), `unsupported operation type ${operation.type}`);
    validateLandscapeRegion(operation.region, { allowPoint: false });
    const bounds = landscapeRegionBounds(operation.region);
    requireCondition(bounds.minX >= manifest.bounds.minX && bounds.maxX <= manifest.bounds.maxX && bounds.minZ >= manifest.bounds.minZ && bounds.maxZ <= manifest.bounds.maxZ, `operation ${operation.id} extends outside landscape bounds`);
    requireCondition(operation.falloff && ['none', 'linear'].includes(operation.falloff.type), `operation ${operation.id} must declare none or linear falloff`);
    if (operation.falloff.type === 'linear') {
        requireFinite(operation.falloff.distance, 'falloff.distance');
        const maxDistance = operation.region.type === 'circle' ? operation.region.radius : Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
        requireCondition(operation.falloff.distance > 0 && operation.falloff.distance <= maxDistance, 'linear falloff distance must fit inside the region');
    }
    if (operation.type === 'raise') {
        requireFinite(operation.deltaMeters, 'deltaMeters');
        requireCondition(operation.deltaMeters !== 0 && Math.abs(operation.deltaMeters) <= 10000, 'raise deltaMeters must be nonzero and within +/-10000 meters');
    } else if (operation.type === 'set-height') {
        requireFinite(operation.heightMeters, 'heightMeters');
        requireCondition(Math.abs(operation.heightMeters) <= 100000, 'heightMeters must be within +/-100000 meters');
    } else {
        requireCondition(operation.falloff.type === 'none', 'assign-soil requires hard falloff:none');
        requireCondition(manifest.soil.catalog.some((entry) => entry.id === operation.soilId), `unknown assigned soil ${operation.soilId}`);
    }
}

/** @param {import('./LandscapeManifest.js').LandscapeManifest} manifest @param {unknown} input @returns {object} */
export function validateLandscapeEditBatch(manifest, input) {
    const batch = clonePlainData(input, 'batch');
    requireCondition(batch?.format === 'landscape-edit-batch' && batch.schemaVersion === 1, 'unsupported edit batch format/schemaVersion');
    requireId(batch.id, 'batch.id');
    requireCondition(batch.landscapeId === manifest.id, 'edit batch targets a different landscape');
    requireCondition(!(manifest.editHistory?.batchIds ?? []).includes(batch.id), `duplicate edit batch ${batch.id}`);
    requireCondition(batch.expectedRevision === manifest.revision, `stale edit batch: expected ${batch.expectedRevision}, current ${manifest.revision}`);
    requireCondition(Array.isArray(batch.operations) && batch.operations.length > 0 && batch.operations.length <= LANDSCAPE_MAX_BATCH_OPERATIONS, `edit batch requires 1..${LANDSCAPE_MAX_BATCH_OPERATIONS} operations`);
    requireCondition(manifest.operations.length + batch.operations.length <= LANDSCAPE_MAX_AUTHORING_RECORDS, 'authoring record limit reached; explicit history compaction is required');
    requireCondition((manifest.editHistory?.batchIds.length ?? 0) < LANDSCAPE_MAX_AUTHORING_RECORDS, 'batch history limit reached');
    const ids = new Set(manifest.operations.map((operation) => operation.id));
    for (const operation of batch.operations) {
        validateOperation(operation, manifest);
        requireCondition(!ids.has(operation.id), `duplicate operation ${operation.id}`);
        ids.add(operation.id);
    }
    return freezeData(batch);
}

/** @param {object} manifest @returns {void} */
export function validateLandscapeAuthoring(manifest) {
    const editing = manifest.capabilities.includes(LANDSCAPE_EDIT_CAPABILITY);
    requireCondition(Array.isArray(manifest.operations) && Array.isArray(manifest.soil.overrides), 'operations and soil.overrides must be arrays');
    if (!editing) {
        requireCondition(manifest.operations.length === 0 && manifest.soil.overrides.length === 0 && manifest.editHistory === undefined, 'nonempty authoring requires the terrain-editing-v1 capability; unsupported editing capability');
        return;
    }
    const history = manifest.editHistory;
    requireCondition(history && Array.isArray(history.batchIds) && history.batchIds.length <= LANDSCAPE_MAX_AUTHORING_RECORDS, 'editHistory.batchIds is required and bounded');
    const batches = new Set();
    for (const id of history.batchIds) {
        requireId(id, 'editHistory.batchId');
        requireCondition(!batches.has(id), `duplicate editHistory batch ${id}`);
        batches.add(id);
    }
    requireCondition(history.lastBatchId === null || batches.has(history.lastBatchId), 'editHistory.lastBatchId must be null or a recorded batch');
    if (history.previousManifestUrl !== null) requireRelativeUrl(history.previousManifestUrl, 'editHistory.previousManifestUrl');
    requireCondition((history.lastBatchId === null) === (history.previousManifestUrl === null), 'last batch and previous manifest snapshot must be present together');
    requireCondition(manifest.operations.length <= LANDSCAPE_MAX_AUTHORING_RECORDS, 'too many authoring operations');
    const operations = new Map();
    for (const [sequence, operation] of manifest.operations.entries()) {
        validateOperation(operation, manifest);
        requireCondition(operation.sequence === sequence && batches.has(operation.batchId), 'operation order/batch history is inconsistent');
        requireCondition(!operations.has(operation.id), `duplicate authored operation ${operation.id}`);
        operations.set(operation.id, operation);
    }
    let previousSequence = -1;
    const overrideIds = new Set();
    for (const override of manifest.soil.overrides) {
        const operation = operations.get(override.id);
        requireInteger(override.sequence, 0, LANDSCAPE_MAX_AUTHORING_RECORDS - 1, 'soil override sequence');
        requireCondition(operation?.type === 'assign-soil' && operation.sequence === override.sequence && operation.batchId === override.batchId && operation.soilId === override.soilId, 'soil override must reference its authored assignment');
        const region = validateLandscapeRegion(override.region, { allowPoint: false });
        const expectedBounds = landscapeRegionBounds(operation.region);
        const actualBounds = landscapeRegionBounds(region);
        requireCondition(region.type === operation.region.type && Object.keys(expectedBounds).every((key) => expectedBounds[key] === actualBounds[key]), 'soil override region differs from its authored operation');
        requireCondition(override.sequence > previousSequence && !overrideIds.has(override.id), 'soil overrides must retain unique operation order');
        overrideIds.add(override.id);
        previousSequence = override.sequence;
    }
    requireCondition(manifest.operations.filter((operation) => operation.type === 'assign-soil').length === overrideIds.size, 'every soil operation requires one semantic override');
}
