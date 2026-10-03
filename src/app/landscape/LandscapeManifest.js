// Validates the renderer-independent landscape manifest and spatial identities.
// @ts-check
import { LANDSCAPE_LAND_COVER_CATALOG, LANDSCAPE_SOIL_CATALOG } from './LandscapeCatalog.js';
import { LANDSCAPE_EDIT_CAPABILITY, LANDSCAPE_ADVANCED_EDIT_CAPABILITY, validateLandscapeAuthoring } from './LandscapeEditSchema.js';
import { clonePlainData, freezeData, nearlyEqual, requireBounds, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';

export const LANDSCAPE_SCHEMA_VERSION = 1;
export const LANDSCAPE_MAX_CHUNK_SAMPLES = 257 * 257;
export const LANDSCAPE_SUPPORTED_CAPABILITIES = Object.freeze(['heightfield', 'land-cover', 'coarse-preview', LANDSCAPE_EDIT_CAPABILITY, LANDSCAPE_ADVANCED_EDIT_CAPABILITY, 'chunk-hierarchy-v1']);

/** @typedef {{minX:number,maxX:number,minZ:number,maxZ:number}} LandscapeBounds */
/** @typedef {{url:string,encoding:string,byteLength:number,decodedByteLength:number,sha256:string,revision:string}} LandscapeChannel */
/** @typedef {{id:string,level:number,column:number,row:number,startColumn:number,startRow:number,sampleStride:number,columns:number,rows:number,bounds:LandscapeBounds,minHeight:number,maxHeight:number,geometricError:number,revision:string,parentId:string|null,channels:{height:LandscapeChannel,landCover:LandscapeChannel}}} LandscapeChunkDescriptor */
/** @typedef {{format:string,schemaVersion:number,id:string,name:string,revision:string,bounds:LandscapeBounds,coordinates:object,grid:object,elevation:object,soil:object,landCover:object,overviewId:string,chunks:LandscapeChunkDescriptor[],provenance:object,references:object[],regions:object[],operations:object[],attachments:object[],capabilities:string[]}} LandscapeManifest */

/** @param {number} level @param {number} column @param {number} row @returns {string} */
export function createLandscapeChunkId(level, column, row) {
    requireInteger(level, 0, 20, 'level');
    requireInteger(column, 0, 2 ** level - 1, 'column');
    requireInteger(row, 0, 2 ** level - 1, 'row');
    return `l${level}/c${column}/r${row}`;
}

function validateChannel(channel, encoding, samples, label) {
    requireCondition(!!channel, `${label} is required`);
    requireRelativeUrl(channel.url, `${label}.url`);
    requireCondition(channel.encoding === encoding, `${label}.encoding must be ${encoding}`);
    const size = samples * (encoding === 'float32-le' ? 4 : 1);
    requireCondition(channel.byteLength === size && channel.decodedByteLength === size, `${label} byte size must be ${size}`);
    requireSha256(channel.sha256, `${label}.sha256`);
    requireId(channel.revision, `${label}.revision`);
}

function validateCatalogs(manifest) {
    const soil = manifest.soil;
    const cover = manifest.landCover;
    requireCondition(soil && Array.isArray(soil.catalog) && soil.catalog.length > 0, 'soil.catalog is required');
    const soils = new Set();
    for (const entry of soil.catalog) {
        requireId(entry.id, 'soil.id');
        requireCondition(!soils.has(entry.id), `duplicate soil ${entry.id}`);
        requireCondition(typeof entry.label === 'string' && entry.label.length > 0, `soil ${entry.id} label is required`);
        requireCondition(typeof entry.materialId === 'string' && /^pbr\.[a-z0-9_]+$/.test(entry.materialId), `soil ${entry.id} materialId must reference the PBR catalog`);
        requireCondition(['stone', 'grass', 'land'].includes(entry.biome), `soil ${entry.id} biome is invalid`);
        soils.add(entry.id);
    }
    requireCondition(soils.has(soil.defaultId), 'soil.defaultId must exist in soil.catalog');
    requireCondition(Array.isArray(soil.overrides), 'soil.overrides must be an array');
    requireCondition(cover?.encoding === 'uint8' && cover.sampling === 'nearest' && Array.isArray(cover.catalog) && cover.catalog.length > 0, 'landCover requires uint8 nearest categorical data');
    const classes = new Set();
    for (const entry of cover.catalog) {
        requireInteger(entry.id, 0, 255, 'landCover.id');
        requireCondition(!classes.has(entry.id), `duplicate land-cover ID ${entry.id}`);
        requireCondition(typeof entry.label === 'string' && entry.label.length > 0, 'landCover.label is required');
        requireCondition(/^#[0-9a-fA-F]{6}$/.test(entry.color) && typeof entry.planningOnly === 'boolean', 'landCover color/planningOnly are required');
        requireCondition(soils.has(entry.soilId), `landCover soil ${entry.soilId} is unknown`);
        classes.add(entry.id);
    }
    requireCondition(Array.isArray(soil.landCoverMapping) && soil.landCoverMapping.length === classes.size, 'soil.landCoverMapping must cover every land-cover class');
    const mapped = new Set();
    for (const mapping of soil.landCoverMapping) {
        requireCondition(classes.has(mapping.landCoverId) && !mapped.has(mapping.landCoverId), 'soil.landCoverMapping has an unknown/duplicate class');
        requireCondition(soils.has(mapping.soilId), `soil mapping ${mapping.soilId} is unknown`);
        requireCondition(cover.catalog.find((entry) => entry.id === mapping.landCoverId).soilId === mapping.soilId, 'soil mapping and initial land-cover catalog disagree');
        mapped.add(mapping.landCoverId);
    }
}

function validateChunk(chunk, manifest) {
    const grid = manifest.grid;
    const label = `chunk ${chunk.id}`;
    requireInteger(chunk.level, 0, grid.maxLevel, `${label}.level`);
    requireCondition(chunk.id === createLandscapeChunkId(chunk.level, chunk.column, chunk.row), `${label} has inconsistent spatial identity`);
    const stride = 2 ** (grid.maxLevel - chunk.level);
    const intervals = grid.chunkIntervals;
    requireCondition(chunk.sampleStride === stride && chunk.columns === intervals + 1 && chunk.rows === intervals + 1, `${label} has invalid resolution`);
    requireCondition(chunk.startColumn === chunk.column * intervals * stride && chunk.startRow === chunk.row * intervals * stride, `${label} has invalid source window`);
    requireBounds(chunk.bounds, `${label}.bounds`);
    const expected = {
        minX: manifest.bounds.minX + chunk.startColumn * grid.spacingX,
        maxX: manifest.bounds.minX + (chunk.startColumn + intervals * stride) * grid.spacingX,
        maxZ: manifest.bounds.maxZ - chunk.startRow * grid.spacingZ,
        minZ: manifest.bounds.maxZ - (chunk.startRow + intervals * stride) * grid.spacingZ
    };
    for (const key of Object.keys(expected)) requireCondition(nearlyEqual(chunk.bounds[key], expected[key]), `${label}.bounds.${key} is inconsistent with the native grid`);
    requireFinite(chunk.minHeight, `${label}.minHeight`);
    requireFinite(chunk.maxHeight, `${label}.maxHeight`);
    requireFinite(chunk.geometricError, `${label}.geometricError`);
    requireCondition(chunk.maxHeight >= chunk.minHeight && chunk.geometricError >= 0, `${label} has invalid elevation/error bounds`);
    if (chunk.level === grid.maxLevel) requireCondition(chunk.geometricError === 0, `${label} native data must have zero geometric error`);
    requireId(chunk.revision, `${label}.revision`);
    requireCondition(!!chunk.channels && Object.keys(chunk.channels).length === 2, `${label} requires independent height and landCover channels`);
    validateChannel(chunk.channels.height, 'float32-le', chunk.columns * chunk.rows, `${label}.height`);
    validateChannel(chunk.channels.landCover, 'uint8', chunk.columns * chunk.rows, `${label}.landCover`);
}

/** @param {unknown} input @returns {LandscapeManifest} */
export function validateLandscapeManifest(input) {
    const manifest = clonePlainData(input);
    requireCondition(manifest.format === 'landscape' && manifest.schemaVersion === LANDSCAPE_SCHEMA_VERSION, 'unsupported manifest format/schemaVersion');
    requireId(manifest.id, 'id');
    requireId(manifest.revision, 'revision');
    requireCondition(typeof manifest.name === 'string' && manifest.name.trim().length > 0 && manifest.name.length <= 200, 'name is required (1..200 characters)');
    requireBounds(manifest.bounds);
    const coordinates = manifest.coordinates;
    requireCondition(coordinates?.units === 'meters' && coordinates.upAxis === 'Y' && coordinates.xDirection === 'east' && coordinates.zDirection === 'north' && coordinates.rasterRow0 === 'north', 'unsupported coordinate convention');
    for (const axis of ['x', 'y', 'z']) requireFinite(coordinates.origin?.[axis], `coordinates.origin.${axis}`);
    requireFinite(coordinates.seaLevel, 'coordinates.seaLevel');
    requireCondition(coordinates.origin.x === manifest.bounds.minX && coordinates.origin.z === manifest.bounds.minZ, 'coordinates.origin must identify the southwest datum');
    const grid = manifest.grid;
    requireCondition(!!grid, 'grid is required');
    requireInteger(grid.maxLevel, 0, 20, 'grid.maxLevel');
    requireInteger(grid.chunkIntervals, 1, 256, 'grid.chunkIntervals');
    requireCondition(Number.isInteger(Math.log2(grid.chunkIntervals)), 'grid.chunkIntervals must be a power of two');
    const dimension = grid.chunkIntervals * 2 ** grid.maxLevel + 1;
    requireCondition(grid.columns === dimension && grid.rows === dimension, 'grid dimensions must match the dyadic chunk hierarchy');
    requireFinite(grid.spacingX, 'grid.spacingX');
    requireFinite(grid.spacingZ, 'grid.spacingZ');
    requireCondition(grid.spacingX > 0 && grid.spacingZ > 0 && nearlyEqual(grid.spacingX * (grid.columns - 1), manifest.bounds.maxX - manifest.bounds.minX) && nearlyEqual(grid.spacingZ * (grid.rows - 1), manifest.bounds.maxZ - manifest.bounds.minZ), 'grid spacing must exactly span bounds');
    const elevation = manifest.elevation;
    requireCondition(elevation?.units === 'meters' && elevation.encoding === 'float32-le' && elevation.interpolation === 'triangulated-nw-se' && elevation.noData === 'forbidden' && elevation.outside === 'outside', 'unsupported elevation encoding/sampling/no-data contract');
    requireCondition(Array.isArray(manifest.capabilities) && manifest.capabilities.includes('heightfield') && manifest.capabilities.includes('land-cover'), 'heightfield and land-cover capabilities are required');
    requireCondition(new Set(manifest.capabilities).size === manifest.capabilities.length, 'duplicate capabilities');
    for (const capability of manifest.capabilities) requireCondition(LANDSCAPE_SUPPORTED_CAPABILITIES.includes(capability), `unsupported required capability ${capability}`);
    validateCatalogs(manifest);
    requireCondition(Array.isArray(manifest.chunks) && manifest.chunks.length > 0 && manifest.chunks.length <= 100000, 'chunks must be a bounded nonempty index');
    const chunks = new Map();
    for (const chunk of manifest.chunks) {
        validateChunk(chunk, manifest);
        requireCondition(!chunks.has(chunk.id), `duplicate chunk ${chunk.id}`);
        chunks.set(chunk.id, chunk);
    }
    requireCondition(manifest.overviewId === 'l0/c0/r0' && chunks.has(manifest.overviewId), 'one covering overview l0/c0/r0 is required');
    for (const chunk of manifest.chunks) {
        if (chunk.id === manifest.overviewId) {
            requireCondition(chunk.parentId === null, 'overview must have no parent');
            continue;
        }
        const parent = chunks.get(chunk.parentId);
        requireCondition(parent && parent.level < chunk.level, `chunk ${chunk.id} requires a coarser prepared parent`);
        const ratio = 2 ** (chunk.level - parent.level);
        requireCondition(Math.floor(chunk.column / ratio) === parent.column && Math.floor(chunk.row / ratio) === parent.row, `chunk ${chunk.id} parent does not cover it`);
        requireCondition(parent.minHeight <= chunk.minHeight && parent.maxHeight >= chunk.maxHeight, `chunk ${chunk.id} exceeds parent elevation envelope`);
    }
    const nativeCount = manifest.chunks.filter((chunk) => chunk.level === grid.maxLevel).length;
    requireCondition(nativeCount === 4 ** grid.maxLevel, 'native chunk coverage must be complete');
    if (manifest.capabilities.includes('chunk-hierarchy-v1')) {
        for (let level = 0; level <= grid.maxLevel; level++) requireCondition(manifest.chunks.filter(chunk => chunk.level === level).length === 4 ** level, `complete hierarchy is missing level ${level} coverage`);
        for (const chunk of manifest.chunks) if (chunk.level > 0) requireCondition(chunk.parentId === createLandscapeChunkId(chunk.level - 1, Math.floor(chunk.column / 2), Math.floor(chunk.row / 2)), `chunk ${chunk.id} requires its direct quadtree parent`);
        requireCondition(manifest.hierarchy?.algorithm === 'native-hierarchy-v1' && ['measured-native-vertices', 'conservative-after-edit'].includes(manifest.hierarchy.errorPolicy), 'complete hierarchy requires its supported preparation/error policy');
    }
    const provenance = manifest.provenance;
    requireCondition(provenance && ['designed-prototype', 'synthetic-fixture'].includes(provenance.kind), 'provenance.kind is required');
    requireCondition(typeof provenance.sourceName === 'string' && provenance.sourceName.length > 0, 'provenance.sourceName is required');
    requireSha256(provenance.sourceSha256, 'provenance.sourceSha256');
    requireFinite(provenance.nativeResolutionMeters, 'provenance.nativeResolutionMeters');
    requireCondition(provenance.nativeResolutionMeters > 0 && !!provenance.preparation && typeof provenance.preparation.algorithm === 'string', 'provenance native resolution and preparation algorithm are required');
    requireCondition(Array.isArray(manifest.references), 'references must be an array');
    const referenceIds = new Set();
    for (const reference of manifest.references) {
        requireId(reference.id, 'reference.id');
        requireCondition(!referenceIds.has(reference.id), `duplicate reference ${reference.id}`);
        requireRelativeUrl(reference.url, 'reference.url');
        requireSha256(reference.sha256, 'reference.sha256');
        requireInteger(reference.byteLength, 0, Number.MAX_SAFE_INTEGER, 'reference.byteLength');
        requireCondition(typeof reference.role === 'string' && reference.role.length > 0 && typeof reference.encoding === 'string' && reference.encoding.length > 0, 'reference role and encoding are required');
        referenceIds.add(reference.id);
    }
    validateLandscapeAuthoring(manifest);
    requireCondition(Array.isArray(manifest.attachments) && manifest.attachments.length === 0, 'attachments must be empty; unsupported content capability');
    requireCondition(manifest.cityBinding === undefined, 'D1 cityBinding is reserved; unsupported city-binding capability');
    return freezeData(manifest);
}

/** @param {{id:string,name:string,revision:string,bounds:LandscapeBounds,grid:object,coordinates?:object,chunks:LandscapeChunkDescriptor[],overviewId?:string,provenance:object,references?:object[]}} options @returns {LandscapeManifest} */
export function createLandscapeManifest(options) {
    return validateLandscapeManifest({
        format: 'landscape', schemaVersion: LANDSCAPE_SCHEMA_VERSION,
        id: options.id, name: options.name, revision: options.revision,
        bounds: options.bounds,
        coordinates: options.coordinates ?? {
            units: 'meters', upAxis: 'Y', xDirection: 'east', zDirection: 'north', rasterRow0: 'north',
            origin: { x: options.bounds.minX, y: 0, z: options.bounds.minZ }, seaLevel: 0
        },
        grid: options.grid,
        elevation: { units: 'meters', encoding: 'float32-le', interpolation: 'triangulated-nw-se', noData: 'forbidden', outside: 'outside' },
        soil: { defaultId: 'unknown', catalog: LANDSCAPE_SOIL_CATALOG, landCoverMapping: LANDSCAPE_LAND_COVER_CATALOG.map(({ id, soilId }) => ({ landCoverId: id, soilId })), overrides: [] },
        landCover: { encoding: 'uint8', sampling: 'nearest', catalog: LANDSCAPE_LAND_COVER_CATALOG },
        overviewId: options.overviewId ?? 'l0/c0/r0', chunks: options.chunks,
        provenance: options.provenance, references: options.references ?? [],
        regions: [], operations: [], attachments: [], capabilities: ['heightfield', 'land-cover', 'coarse-preview']
    });
}
