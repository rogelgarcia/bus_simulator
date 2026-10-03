// Validates ordered bounded edit batches and persisted authoring records.
// @ts-check
import { landscapeRegionBounds, landscapeRegionsEqual, validateLandscapeRegion } from './LandscapeRegions.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl } from './internal/LandscapeValidation.js';

export const LANDSCAPE_EDIT_CAPABILITY = 'terrain-editing-v1';
export const LANDSCAPE_ADVANCED_EDIT_CAPABILITY = 'terrain-editing-v2';
export const LANDSCAPE_MAX_BATCH_OPERATIONS = 64;
export const LANDSCAPE_MAX_AUTHORING_RECORDS = 1024;
export const LANDSCAPE_MAX_NAMED_REGIONS = 256;
export const LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES = 8;

function withinLandscape(region, manifest, label) {
    const bounds = landscapeRegionBounds(region);
    requireCondition(bounds.minX >= manifest.bounds.minX && bounds.maxX <= manifest.bounds.maxX && bounds.minZ >= manifest.bounds.minZ && bounds.maxZ <= manifest.bounds.maxZ, `${label} extends outside landscape bounds`);
    return bounds;
}

function namedRegions(records, manifest, existing = new Map()) {
    requireCondition(Array.isArray(records) && existing.size + records.length <= LANDSCAPE_MAX_NAMED_REGIONS, `named regions are bounded to ${LANDSCAPE_MAX_NAMED_REGIONS}`);
    const result = new Map(existing);
    for (const record of records) {
        requireId(record.id, 'region.id');
        requireCondition(!result.has(record.id), `duplicate named region ${record.id}; named shapes are immutable`);
        requireCondition(typeof record.name === 'string' && record.name.trim().length > 0 && record.name.length <= 120, 'named region name is required (1..120 characters)');
        validateLandscapeRegion(record.region, { allowPoint: false });
        withinLandscape(record.region, manifest, `named region ${record.id}`);
        result.set(record.id, record);
    }
    return result;
}

function validateOperation(operation, manifest, regions) {
    requireId(operation.id, 'operation.id');
    requireCondition(['raise', 'set-height', 'assign-soil', 'smooth', 'grade'].includes(operation.type), `unsupported operation type ${operation.type}`);
    if (operation.regionId !== undefined) {
        requireId(operation.regionId, 'operation.regionId');
        const named = regions.get(operation.regionId);
        requireCondition(!!named, `unknown named region ${operation.regionId}`);
        if (operation.region !== undefined) {
            validateLandscapeRegion(operation.region, { allowPoint: false });
            requireCondition(landscapeRegionsEqual(operation.region, named.region), `operation ${operation.id} region differs from named region ${operation.regionId}`);
        } else operation.region = clonePlainData(named.region);
    }
    validateLandscapeRegion(operation.region, { allowPoint: false });
    const bounds = withinLandscape(operation.region, manifest, `operation ${operation.id}`);
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
    } else if (operation.type === 'smooth') {
        requireFinite(operation.radiusMeters, 'smooth.radiusMeters');
        requireFinite(operation.strength, 'smooth.strength');
        requireCondition(operation.strength > 0 && operation.strength <= 1, 'smooth strength must be within (0,1]');
        for (const spacing of [manifest.grid.spacingX, manifest.grid.spacingZ]) {
            const samples = Math.floor(operation.radiusMeters / spacing);
            requireCondition(samples >= 1 && samples <= LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES, `smooth radiusMeters must span 1..${LANDSCAPE_MAX_SMOOTH_RADIUS_SAMPLES} native samples on each axis`);
        }
    } else if (operation.type === 'grade') {
        for (const [name, point] of [['start', operation.start], ['end', operation.end]]) {
            requireFinite(point?.x, `grade.${name}.x`);
            requireFinite(point?.z, `grade.${name}.z`);
            requireFinite(point?.heightMeters, `grade.${name}.heightMeters`);
            requireCondition(Math.abs(point.heightMeters) <= 100000, 'grade heights must be within +/-100000 meters');
            withinLandscape({ type: 'point', x: point.x, z: point.z }, manifest, `grade ${name}`);
        }
        const length = Math.hypot(operation.end.x - operation.start.x, operation.end.z - operation.start.z);
        requireCondition(Number.isFinite(length) && length > 0, 'grade requires two distinct finite world-space endpoints');
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
    const regions = namedRegions(batch.regions ?? [], manifest, namedRegions(manifest.regions, manifest));
    for (const operation of batch.operations) {
        validateOperation(operation, manifest, regions);
        requireCondition(!ids.has(operation.id), `duplicate operation ${operation.id}`);
        ids.add(operation.id);
    }
    return freezeData(batch);
}

/** @param {object} manifest @returns {void} */
export function validateLandscapeAuthoring(manifest) {
    const editing = manifest.capabilities.includes(LANDSCAPE_EDIT_CAPABILITY);
    const advanced = manifest.capabilities.includes(LANDSCAPE_ADVANCED_EDIT_CAPABILITY);
    requireCondition(Array.isArray(manifest.operations) && Array.isArray(manifest.soil.overrides) && Array.isArray(manifest.regions), 'operations, soil.overrides and regions must be arrays');
    requireCondition(!advanced || editing, 'terrain-editing-v2 also requires terrain-editing-v1');
    if (!editing) {
        requireCondition(manifest.operations.length === 0 && manifest.soil.overrides.length === 0 && manifest.regions.length === 0 && manifest.editHistory === undefined, 'nonempty authoring requires the terrain-editing-v1 capability; unsupported editing capability');
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
    const regions = namedRegions(manifest.regions, manifest);
    requireCondition(advanced || regions.size === 0, 'named regions require terrain-editing-v2');
    const operations = new Map();
    for (const [sequence, operation] of manifest.operations.entries()) {
        requireCondition(advanced || !['smooth', 'grade'].includes(operation.type) && operation.regionId === undefined && operation.region?.type !== 'polygon', 'advanced authored operations require terrain-editing-v2');
        requireCondition(operation.region !== undefined, 'persisted operation requires resolved world-space geometry');
        validateOperation(operation, manifest, regions);
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
        requireCondition(landscapeRegionsEqual(region, operation.region), 'soil override region differs from its authored operation');
        requireCondition(override.sequence > previousSequence && !overrideIds.has(override.id), 'soil overrides must retain unique operation order');
        overrideIds.add(override.id);
        previousSequence = override.sequence;
    }
    requireCondition(manifest.operations.filter((operation) => operation.type === 'assign-soil').length === overrideIds.size, 'every soil operation requires one semantic override');
}
