// Extracts deterministic, content-addressed geometry and mesh instances from resolved city roots.
// @ts-check

import { canonicalJsonBytes, compareCanonicalStrings } from '../../../app/illumination/bake_source/CanonicalJson.js';
import { failBakeSource } from './BakeSourceErrors.js';
import { activeMaterialSlotEntries, isBakeVisibleWithinRoot } from './BakeSourceScene.js';

const AFFINE_EPSILON = 1e-12;
const DETERMINANT_EPSILON = 1e-12;
const BOUNDS_EPSILON = 1e-6;
const DEFAULT_SPATIAL_CHUNK_SIZE_METERS = 128;

const ARRAY_TYPES = Object.freeze({
    Int8Array: Object.freeze({ componentType: 'i8', byteSize: 1, setter: 'setInt8', signed: true }),
    Uint8Array: Object.freeze({ componentType: 'u8', byteSize: 1, setter: 'setUint8', signed: false }),
    Uint8ClampedArray: Object.freeze({ componentType: 'u8', byteSize: 1, setter: 'setUint8', signed: false }),
    Int16Array: Object.freeze({ componentType: 'i16', byteSize: 2, setter: 'setInt16', signed: true }),
    Uint16Array: Object.freeze({ componentType: 'u16', byteSize: 2, setter: 'setUint16', signed: false }),
    Int32Array: Object.freeze({ componentType: 'i32', byteSize: 4, setter: 'setInt32', signed: true }),
    Uint32Array: Object.freeze({ componentType: 'u32', byteSize: 4, setter: 'setUint32', signed: false }),
    Float32Array: Object.freeze({ componentType: 'f32', byteSize: 4, setter: 'setFloat32', signed: null }),
    Float64Array: Object.freeze({ componentType: 'f64', byteSize: 8, setter: 'setFloat64', signed: null })
});

const MATERIAL_REFERENCES = new WeakMap();
const OBJECT_REFERENCES = new WeakMap();

/**
 * @typedef {{
 *   id: string,
 *   category: string,
 *   root: Record<string, any>,
 *   provenance?: Record<string, unknown>
 * }} BakeRootEntry
 *
 * @typedef {{
 *   validateAffineTransform?: (matrix: readonly number[], label: string) => unknown,
 *   multiplyMatrices?: (left: readonly number[], right: readonly number[]) => ArrayLike<number> | {elements: ArrayLike<number>},
 *   multiply4x4?: (left: readonly number[], right: readonly number[]) => ArrayLike<number> | {elements: ArrayLike<number>},
 *   convertThreeMatrixToBlender?: (matrix: readonly number[]) => ArrayLike<number>,
 *   transformPoint?: (matrix: readonly number[], point: readonly number[]) => ArrayLike<number> | {x: number, y: number, z: number},
 *   chunkIdForBounds?: (context: Record<string, unknown>) => string,
 *   createChunkId?: (context: Record<string, unknown>) => string,
 *   spatialChunkSizeMeters?: number
 * }} BakeMatrixHelpers
 *
 * @typedef {{
 *   hashBytes: (bytes: Uint8Array) => string | ArrayBuffer | ArrayBufferView | Promise<string | ArrayBuffer | ArrayBufferView>,
 *   matrixHelpers?: BakeMatrixHelpers
 * }} BakeGeometryExtractionOptions
 *
 * @typedef {{
 *   objects: Record<string, any>[],
 *   geometries: Record<string, any>[],
 *   buffers: {id: string, hash: string, sha256: string, byteLength: number, roles: string[], data: Uint8Array}[],
 *   inventory: Record<string, any>
 * }} BakeGeometryExtraction
 */

/**
 * @param {readonly BakeRootEntry[]} rootEntries
 * @param {BakeGeometryExtractionOptions | BakeGeometryExtractionOptions['hashBytes']} optionsOrHashBytes
 * @param {BakeMatrixHelpers} [positionalMatrixHelpers]
 * @returns {Promise<BakeGeometryExtraction>}
 */
export async function extractBakeSourceGeometry(
    rootEntries,
    optionsOrHashBytes,
    positionalMatrixHelpers = {}
) {
    const options = sanitizeExtractionOptions(optionsOrHashBytes, positionalMatrixHelpers);
    const roots = sanitizeRootEntries(rootEntries);
    const bufferRegistry = createBufferRegistry(options.hashBytes);
    const geometryRegistry = createGeometryRegistry(options.hashBytes);
    const sourceGeometryCache = new WeakMap();
    const sourceOwners = new WeakMap();
    const objectIdentityBytes = new Map();
    const materialReferences = new Map();
    const objectReferences = new Map();
    const objects = [];
    let excludedShadowMergeProxyCount = 0;

    for (const rootEntry of roots) {
        const collected = collectWhitelistedMeshes(rootEntry, sourceOwners);
        excludedShadowMergeProxyCount += collected.excludedShadowMergeProxyCount;
        for (const candidate of collected.candidates) {
            const object = candidate.object;
            assertSupportedMesh(object, rootEntry.id, candidate.semanticPath);
            const materialSlots = materialSlotsForObject(object, rootEntry.id, candidate.semanticPath);
            let geometry = sourceGeometryCache.get(object.geometry);
            if (!geometry) {
                geometry = await extractGeometryRecord(object.geometry, bufferRegistry, geometryRegistry, {
                    rootId: rootEntry.id,
                    semanticPath: candidate.semanticPath,
                    meshName: object.name || object.type || null,
                    objectUserDataKeys: Object.keys(object.userData ?? {}).sort(compareCanonicalStrings),
                    buildingFab2Role: object.userData?.buildingFab2Role ?? null,
                    buildingFab2RoofKind: object.userData?.buildingFab2RoofKind ?? null,
                    buildingFab2WallKind: object.userData?.buildingFab2WallKind ?? null,
                    buildingMergedGeometryRanges: Array.isArray(object.userData?.buildingMergedGeometryRanges)
                        ? object.userData.buildingMergedGeometryRanges.map((range) => ({ ...range }))
                        : [],
                    buildingWindowRanges: Array.isArray(object.userData?.buildingWindowRanges)
                        ? object.userData.buildingWindowRanges.map((range) => ({
                            vertexStart: range.vertexStart,
                            vertexCount: range.vertexCount,
                            instanceCount: range.instanceCount,
                            definitionId: range.definitionId,
                            assetType: range.assetType,
                            part: range.part
                        }))
                        : []
                });
                sourceGeometryCache.set(object.geometry, geometry);
            }
            validateMaterialGroups(geometry, materialSlots.length, rootEntry.id, candidate.semanticPath);
            const extractedObject = await extractObjectRecord({
                rootEntry,
                semanticPath: candidate.semanticPath,
                object,
                geometry,
                bufferRegistry,
                hashBytes: options.hashBytes,
                matrixHelpers: options.matrixHelpers,
                objectIdentityBytes
            });
            objects.push(extractedObject);
            materialReferences.set(extractedObject.id, Object.freeze(materialSlots.slice()));
            objectReferences.set(extractedObject.id, object);
            geometry.objectIds.push(extractedObject.id);
        }
    }

    objects.sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const geometries = geometryRegistry.values();
    for (const geometry of geometries) geometry.objectIds.sort(compareCanonicalStrings);
    const buffers = bufferRegistry.values();
    const inventory = createInventory(roots, objects, geometries, buffers, excludedShadowMergeProxyCount);
    const result = { objects, geometries, buffers, inventory };
    MATERIAL_REFERENCES.set(result, materialReferences);
    OBJECT_REFERENCES.set(result, objectReferences);
    return result;
}

/**
 * Returns temporary live Three.js material references for the later semantic material adapter.
 *
 * @param {BakeGeometryExtraction} extraction
 * @returns {Map<string, readonly unknown[]>}
 */
export function getBakeSourceMaterialReferences(extraction) {
    const references = MATERIAL_REFERENCES.get(extraction);
    if (!references) {
        failBakeSource('unknown_geometry_extraction', 'Material references require the live geometry extraction result.');
    }
    return new Map(Array.from(references, ([id, slots]) => [id, slots.slice()]));
}

/**
 * Returns temporary live Three.js object references for caster policy and material-semantic adapters.
 *
 * @param {BakeGeometryExtraction} extraction
 * @returns {Map<string, unknown>}
 */
export function getBakeSourceObjectReferences(extraction) {
    const references = OBJECT_REFERENCES.get(extraction);
    if (!references) {
        failBakeSource('unknown_geometry_extraction', 'Object references require the live geometry extraction result.');
    }
    return new Map(references);
}

function sanitizeExtractionOptions(optionsOrHashBytes, positionalMatrixHelpers) {
    const options = typeof optionsOrHashBytes === 'function'
        ? { hashBytes: optionsOrHashBytes, matrixHelpers: positionalMatrixHelpers }
        : optionsOrHashBytes;
    if (!options || typeof options !== 'object' || typeof options.hashBytes !== 'function') {
        failBakeSource('invalid_geometry_extraction_options', 'Geometry extraction requires a hashBytes(Uint8Array) callback.');
    }
    const matrixHelpers = options.matrixHelpers ?? {};
    if (!matrixHelpers || typeof matrixHelpers !== 'object' || Array.isArray(matrixHelpers)) {
        failBakeSource('invalid_matrix_helpers', 'Geometry extraction matrix helpers must be an object.');
    }
    const chunkSize = matrixHelpers.spatialChunkSizeMeters ?? DEFAULT_SPATIAL_CHUNK_SIZE_METERS;
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
        failBakeSource('invalid_spatial_chunk_size', 'Spatial chunk size must be a positive finite number.', {
            actual: chunkSize
        });
    }
    return {
        hashBytes: options.hashBytes,
        matrixHelpers: { ...matrixHelpers, spatialChunkSizeMeters: chunkSize }
    };
}

function sanitizeRootEntries(rootEntries) {
    if (!Array.isArray(rootEntries)) {
        failBakeSource('invalid_bake_roots', 'Resolved bake roots must be an array.');
    }
    const ids = new Set();
    const entries = rootEntries.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || !entry.root) {
            failBakeSource('invalid_bake_root', `Resolved bake root[${index}] is missing its root object.`, { index });
        }
        const id = stableSourceString(entry.id, `Resolved bake root[${index}].id`);
        const category = stableSourceString(entry.category, `Resolved bake root '${id}' category`);
        if (ids.has(id)) failBakeSource('duplicate_root_id', `Duplicate bake root ID '${id}'.`, { id });
        if (typeof entry.root.traverse !== 'function') {
            failBakeSource('invalid_bake_root', `Resolved bake root '${id}' cannot be traversed.`, { id });
        }
        ids.add(id);
        return { ...entry, id, category };
    });
    entries.sort((left, right) => compareCanonicalStrings(left.id, right.id));
    return entries;
}

function collectWhitelistedMeshes(rootEntry, sourceOwners) {
    const candidates = [];
    let excludedShadowMergeProxyCount = 0;
    rootEntry.root.traverse((object) => {
        if (!object?.isMesh) return;
        if (!isBakeVisibleWithinRoot(rootEntry.root, object, {
            ignoreRootVisibility: rootEntry.ignoreRootVisibility === true
        })) return;
        if (activeMaterialSlotEntries(object).length === 0) return;
        if (isShadowMergeProxy(object)) {
            excludedShadowMergeProxyCount += 1;
            return;
        }
        const priorRootId = sourceOwners.get(object);
        if (priorRootId && priorRootId !== rootEntry.id) {
            failBakeSource('mesh_multiple_roots', 'A source mesh is owned by more than one resolved bake root.', {
                firstRootId: priorRootId,
                secondRootId: rootEntry.id,
                meshName: object.name || object.type || null
            });
        }
        sourceOwners.set(object, rootEntry.id);
        candidates.push({ object, semanticPath: semanticPathWithinRoot(rootEntry.root, object, rootEntry.id) });
    });
    return { candidates, excludedShadowMergeProxyCount };
}

function isShadowMergeProxy(object) {
    if (object?.userData?.isShadowCasterMerge === true) return true;
    if (object?.geometry?.userData?.isShadowCasterMerge === true) return true;
    const materials = Array.isArray(object?.material) ? object.material : [object?.material];
    return materials.some((material) => material?.userData?.isShadowCasterMerge === true);
}

function semanticPathWithinRoot(root, object, rootId) {
    if (object === root) return 'root';
    const segments = [];
    let cursor = object;
    while (cursor && cursor !== root) {
        const siblings = cursor.parent?.children;
        const siblingIndex = Array.isArray(siblings) ? siblings.indexOf(cursor) : -1;
        if (siblingIndex < 0 || siblings.indexOf(cursor, siblingIndex + 1) >= 0) {
            failBakeSource('ambiguous_sibling_order', 'A mesh path requires a unique producer-owned parent.children position.', {
                rootId,
                meshName: cursor.name || cursor.type || null
            });
        }
        const semanticSegment = encodeIdSegment(semanticName(cursor.name || cursor.type || 'unnamed'));
        segments.push(`${String(siblingIndex).padStart(8, '0')}-${semanticSegment}`);
        cursor = cursor.parent;
    }
    if (cursor !== root) {
        failBakeSource('mesh_outside_root', 'A collected mesh is outside its declared resolved root.', {
            rootId,
            meshName: object.name || object.type || null
        });
    }
    return segments.reverse().join('/');
}

function assertSupportedMesh(object, rootId, semanticPath) {
    const context = { rootId, semanticPath, meshType: object?.type ?? null };
    if (object?.isSkinnedMesh || object?.isBatchedMesh || (!object?.isMesh && !object?.isInstancedMesh)) {
        failBakeSource('unsupported_mesh_type', 'Only Mesh and InstancedMesh source geometry is supported.', context);
    }
    if (object?.isInstancedMesh !== true && object?.isMesh !== true) {
        failBakeSource('unsupported_mesh_type', 'Only Mesh and InstancedMesh source geometry is supported.', context);
    }
    const geometry = object.geometry;
    if (!geometry || !geometry.attributes?.position) {
        failBakeSource('missing_position_attribute', 'A bake-source mesh requires a position BufferAttribute.', context);
    }
    const morphAttributes = geometry.morphAttributes && typeof geometry.morphAttributes === 'object'
        ? Object.values(geometry.morphAttributes)
        : [];
    const hasMorphTargets = morphAttributes.some((attributes) => Array.isArray(attributes) && attributes.length > 0);
    const hasMorphInfluences = Array.isArray(object.morphTargetInfluences) && object.morphTargetInfluences.length > 0;
    if (hasMorphTargets || hasMorphInfluences || object.skeleton || object.bindMatrix) {
        failBakeSource('unsupported_deformation', 'Skinned, morphed, or otherwise deformed geometry is unsupported.', context);
    }
    if (geometry.isInstancedBufferGeometry) {
        failBakeSource('unsupported_deformation', 'InstancedBufferGeometry attributes require an explicit bake adapter.', context);
    }
    if (object.drawMode !== undefined && object.drawMode !== 0) {
        failBakeSource('unsupported_topology', 'Only counter-clockwise triangle-list Mesh topology is supported.', {
            ...context,
            drawMode: object.drawMode
        });
    }
}

function materialSlotsForObject(object, rootId, semanticPath) {
    const slots = Array.isArray(object.material) ? object.material.slice() : [object.material];
    if (slots.length === 0 || slots.some((slot) => !slot || typeof slot !== 'object')) {
        failBakeSource('missing_material_slot', 'Every bake-source mesh material slot must reference a material object.', {
            rootId,
            semanticPath,
            slotCount: slots.length
        });
    }
    return slots;
}

async function extractGeometryRecord(geometry, bufferRegistry, geometryRegistry, context) {
    const attributeNames = Object.keys(geometry.attributes ?? {}).sort(compareCanonicalStrings);
    if (!attributeNames.includes('position')) {
        failBakeSource('missing_position_attribute', 'A bake-source geometry requires a position attribute.', context);
    }
    const attributes = {};
    const sourceAttributes = {};
    let positionCount = null;
    for (const semanticAttributeName of attributeNames) {
        const attribute = geometry.attributes[semanticAttributeName];
        const accessor = await extractAccessor(
            attribute,
            semanticAttributeName,
            `geometry_attribute:${semanticAttributeName}`,
            bufferRegistry,
            context
        );
        validateKnownAttributeShape(semanticAttributeName, accessor, context);
        if (semanticAttributeName === 'position') positionCount = accessor.count;
        attributes[semanticAttributeName] = accessor;
        sourceAttributes[semanticAttributeName] = attribute;
    }
    if (!Number.isSafeInteger(positionCount) || positionCount <= 0) {
        failBakeSource('invalid_position_count', 'The position attribute must contain at least one vertex.', {
            ...context,
            positionCount
        });
    }
    for (const [name, accessor] of Object.entries(attributes)) {
        if (accessor.count !== positionCount) {
            failBakeSource('attribute_count_mismatch', `Geometry attribute '${name}' does not match the position count.`, {
                ...context,
                attribute: name,
                expected: positionCount,
                actual: accessor.count
            });
        }
    }

    const index = geometry.index
        ? await extractAccessor(geometry.index, 'index', 'geometry_index', bufferRegistry, context)
        : null;
    if (index) validateIndexAccessor(index, geometry.index, positionCount, context);
    const referenceCount = index?.count ?? positionCount;
    const groups = sanitizeGroups(geometry.groups, referenceCount, context);
    const drawRange = sanitizeDrawRange(geometry.drawRange, referenceCount, context);
    const localBounds = computeLocalBounds(sourceAttributes.position, context);
    validateCachedBounds(geometry, sourceAttributes.position, localBounds, context);
    const triangleCount = validateTriangleTopology({
        position: sourceAttributes.position,
        index: geometry.index ?? null,
        groups,
        drawRange,
        context
    });
    const descriptor = {
        topology: 'triangles',
        winding: 'counter_clockwise',
        attributes,
        index,
        groups,
        drawRange,
        bounds: localBounds,
        vertexCount: positionCount,
        referenceCount,
        triangleCount
    };
    return geometryRegistry.add(descriptor);
}

async function extractAccessor(attribute, semanticNameValue, role, bufferRegistry, context, activeCount = null) {
    const semanticNameString = stableSourceString(semanticNameValue, 'Geometry attribute semantic name');
    if (!attribute || typeof attribute !== 'object' || attribute.isGLBufferAttribute) {
        failBakeSource('unsupported_attribute', `Geometry attribute '${semanticNameString}' is not a readable buffer attribute.`, {
            ...context,
            attribute: semanticNameString
        });
    }
    if (attribute.isFloat16BufferAttribute) {
        failBakeSource('unsupported_attribute_component', 'Float16BufferAttribute is not supported by bake-input V2.', {
            ...context,
            attribute: semanticNameString
        });
    }
    const interleaved = attribute.isInterleavedBufferAttribute === true || Boolean(attribute.data?.array);
    const backingArray = interleaved ? attribute.data?.array : attribute.array;
    const arrayInfo = typedArrayInfo(backingArray, semanticNameString, context);
    const itemSize = attribute.itemSize;
    const sourceCount = attribute.count;
    const count = activeCount ?? sourceCount;
    if (!Number.isSafeInteger(itemSize) || itemSize <= 0 || !Number.isSafeInteger(sourceCount) || sourceCount < 0
        || !Number.isSafeInteger(count) || count < 0 || count > sourceCount) {
        failBakeSource('invalid_attribute_shape', `Geometry attribute '${semanticNameString}' has invalid itemSize or count.`, {
            ...context,
            attribute: semanticNameString,
            itemSize,
            count,
            sourceCount
        });
    }
    const stride = interleaved ? attribute.data?.stride : itemSize;
    const offset = interleaved ? attribute.offset : 0;
    if (!Number.isSafeInteger(stride) || stride < itemSize || !Number.isSafeInteger(offset) || offset < 0
        || offset + itemSize > stride) {
        failBakeSource('invalid_attribute_stride', `Geometry attribute '${semanticNameString}' has an invalid interleaved layout.`, {
            ...context,
            attribute: semanticNameString,
            itemSize,
            stride,
            offset
        });
    }
    const sourceElementCount = interleaved ? sourceCount * stride : sourceCount * itemSize;
    if (!Number.isSafeInteger(sourceElementCount) || backingArray.length !== sourceElementCount) {
        failBakeSource('attribute_count_mismatch', `Geometry attribute '${semanticNameString}' backing array length is incompatible.`, {
            ...context,
            attribute: semanticNameString,
            expectedElements: sourceElementCount,
            actualElements: backingArray.length
        });
    }
    const activeElementCount = interleaved ? count * stride : count * itemSize;
    const exportedArray = count === sourceCount ? backingArray : backingArray.subarray(0, activeElementCount);
    const buffer = await bufferRegistry.add(exportedArray, role);
    return {
        semanticName: semanticNameString,
        name: typeof attribute.name === 'string' ? attribute.name.normalize('NFC') : '',
        bufferId: buffer.id,
        byteOffset: offset * arrayInfo.byteSize,
        byteStride: stride * arrayInfo.byteSize,
        componentType: arrayInfo.componentType,
        arrayType: arrayInfo.arrayType,
        itemSize,
        count,
        normalized: attribute.normalized === true,
        interleaved
    };
}

function typedArrayInfo(array, attribute, context) {
    if (!ArrayBuffer.isView(array) || array instanceof DataView) {
        failBakeSource('unsupported_attribute_array', `Attribute '${attribute}' must use a supported typed array.`, {
            ...context,
            attribute
        });
    }
    const arrayType = array.constructor?.name;
    const info = ARRAY_TYPES[arrayType];
    if (!info) {
        failBakeSource('unsupported_attribute_array', `Attribute '${attribute}' uses unsupported array type '${arrayType || 'unknown'}'.`, {
            ...context,
            attribute,
            arrayType: arrayType || null
        });
    }
    return { ...info, arrayType };
}

function validateKnownAttributeShape(name, accessor, context) {
    const requiredItemSizes = { position: 3, normal: 3, tangent: 4, uv: 2, uv1: 2, uv2: 2, uv3: 2 };
    const required = requiredItemSizes[name];
    if (required && accessor.itemSize !== required) {
        failBakeSource('incompatible_attribute', `Geometry attribute '${name}' must have itemSize ${required}.`, {
            ...context,
            attribute: name,
            expected: required,
            actual: accessor.itemSize
        });
    }
}

function validateIndexAccessor(accessor, sourceIndex, positionCount, context) {
    if (accessor.itemSize !== 1 || accessor.normalized || !['u8', 'u16', 'u32'].includes(accessor.componentType)) {
        failBakeSource('incompatible_index_attribute', 'Geometry indices must be scalar, non-normalized unsigned integers.', {
            ...context,
            itemSize: accessor.itemSize,
            componentType: accessor.componentType,
            normalized: accessor.normalized
        });
    }
    for (let index = 0; index < accessor.count; index += 1) {
        const vertexIndex = readRawAttributeComponent(sourceIndex, index, 0);
        if (!Number.isSafeInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= positionCount) {
            failBakeSource('index_out_of_bounds', 'A geometry index references a vertex outside the position attribute.', {
                ...context,
                index,
                vertexIndex,
                positionCount
            });
        }
    }
}

function sanitizeGroups(sourceGroups, referenceCount, context) {
    const groups = sourceGroups === undefined ? [] : sourceGroups;
    if (!Array.isArray(groups)) failBakeSource('invalid_groups', 'Geometry groups must be an array.', context);
    return groups.map((group, groupIndex) => {
        const start = group?.start;
        const count = group?.count;
        const materialIndex = group?.materialIndex ?? 0;
        if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 0
            || !Number.isSafeInteger(materialIndex) || materialIndex < 0 || start + count > referenceCount
            || start % 3 !== 0 || count % 3 !== 0) {
            failBakeSource('invalid_group_range', 'Geometry material groups must be bounded triangle-list ranges.', {
                ...context,
                groupIndex,
                start,
                count,
                materialIndex,
                referenceCount
            });
        }
        return { start, count, materialIndex };
    });
}

function sanitizeDrawRange(sourceDrawRange, referenceCount, context) {
    const start = sourceDrawRange?.start ?? 0;
    const declaredCount = sourceDrawRange?.count ?? Number.POSITIVE_INFINITY;
    if (!Number.isSafeInteger(start) || start < 0 || start > referenceCount) {
        failBakeSource('invalid_draw_range', 'Geometry drawRange.start must be a bounded integer.', {
            ...context,
            start,
            referenceCount
        });
    }
    const infinite = declaredCount === Number.POSITIVE_INFINITY;
    if (!infinite && (!Number.isSafeInteger(declaredCount) || declaredCount < 0 || start + declaredCount > referenceCount)) {
        failBakeSource('invalid_draw_range', 'Geometry drawRange.count must be finite and bounded or positive infinity.', {
            ...context,
            start,
            count: declaredCount,
            referenceCount
        });
    }
    const count = infinite ? referenceCount - start : declaredCount;
    if (start % 3 !== 0 || count % 3 !== 0) {
        failBakeSource('invalid_draw_range', 'Geometry drawRange must select complete triangle-list primitives.', {
            ...context,
            start,
            count
        });
    }
    return { start, count, countWasInfinite: infinite };
}

function computeLocalBounds(position, context) {
    const count = position.count;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < count; index += 1) {
        const x = readAttributeComponent(position, index, 0);
        const y = readAttributeComponent(position, index, 1);
        const z = readAttributeComponent(position, index, 2);
        if (![x, y, z].every(Number.isFinite)) {
            failBakeSource('non_finite_attribute', 'Position attributes must contain only finite values.', {
                ...context,
                vertexIndex: index
            });
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
    }
    const center = [
        normalizeNegativeZero((minX + maxX) * 0.5),
        normalizeNegativeZero((minY + maxY) * 0.5),
        normalizeNegativeZero((minZ + maxZ) * 0.5)
    ];
    let radiusSquared = 0;
    for (let index = 0; index < count; index += 1) {
        const dx = readAttributeComponent(position, index, 0) - center[0];
        const dy = readAttributeComponent(position, index, 1) - center[1];
        const dz = readAttributeComponent(position, index, 2) - center[2];
        radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
    }
    return {
        box: {
            min: [normalizeNegativeZero(minX), normalizeNegativeZero(minY), normalizeNegativeZero(minZ)],
            max: [normalizeNegativeZero(maxX), normalizeNegativeZero(maxY), normalizeNegativeZero(maxZ)]
        },
        sphere: { center, radius: normalizeNegativeZero(Math.sqrt(radiusSquared)) }
    };
}

function validateCachedBounds(geometry, position, computed, context) {
    if (geometry.boundingBox) {
        const actual = [
            geometry.boundingBox.min?.x,
            geometry.boundingBox.min?.y,
            geometry.boundingBox.min?.z,
            geometry.boundingBox.max?.x,
            geometry.boundingBox.max?.y,
            geometry.boundingBox.max?.z
        ];
        const expected = [...computed.box.min, ...computed.box.max];
        if (!actual.every(Number.isFinite) || actual.some((value, index) => !boundsEqual(value, expected[index]))) {
            failBakeSource('bounds_mismatch', 'Cached geometry boundingBox does not match evaluated position bytes.', {
                ...context,
                expected,
                actual
            });
        }
    }
    if (geometry.boundingSphere) {
        const actual = [
            geometry.boundingSphere.center?.x,
            geometry.boundingSphere.center?.y,
            geometry.boundingSphere.center?.z,
            geometry.boundingSphere.radius
        ];
        let requiredRadiusSquared = 0;
        if (actual.every(Number.isFinite) && actual[3] >= 0) {
            for (let index = 0; index < position.count; index += 1) {
                const dx = readAttributeComponent(position, index, 0) - actual[0];
                const dy = readAttributeComponent(position, index, 1) - actual[1];
                const dz = readAttributeComponent(position, index, 2) - actual[2];
                requiredRadiusSquared = Math.max(requiredRadiusSquared, dx * dx + dy * dy + dz * dz);
            }
        }
        const requiredRadius = Math.sqrt(requiredRadiusSquared);
        if (!actual.every(Number.isFinite) || actual[3] < 0 || actual[3] + BOUNDS_EPSILON < requiredRadius) {
            failBakeSource('bounds_mismatch', 'Cached geometry boundingSphere does not enclose the evaluated position bytes.', {
                ...context,
                minimumRequiredRadius: requiredRadius,
                actual
            });
        }
    }
}

function validateTriangleTopology({ position, index, groups, drawRange, context }) {
    const ranges = groups.length > 0
        ? groups.map((group) => intersectRanges(group.start, group.count, drawRange.start, drawRange.count))
        : [{ start: drawRange.start, count: drawRange.count }];
    let triangleCount = 0;
    for (const range of ranges) {
        if (range.count === 0) continue;
        if (range.start % 3 !== 0 || range.count % 3 !== 0) {
            failBakeSource('invalid_group_range', 'A material-group and draw-range intersection splits a triangle.', {
                ...context,
                range
            });
        }
        for (let offset = range.start; offset < range.start + range.count; offset += 3) {
            const vertexIndices = [0, 1, 2].map((component) => index
                ? readRawAttributeComponent(index, offset + component, 0)
                : offset + component);
            if (new Set(vertexIndices).size !== 3 || isDegenerateTriangle(position, vertexIndices)) {
                const positions = vertexIndices.map((vertexIndex) => [0, 1, 2]
                    .map((component) => readAttributeComponent(position, vertexIndex, component)));
                const mergedSourceRange = context.buildingMergedGeometryRanges.find((candidate) => (
                    offset >= candidate.referenceStart
                    && offset < candidate.referenceStart + candidate.referenceCount
                )) ?? null;
                const { buildingMergedGeometryRanges: _ranges, ...diagnosticContext } = context;
                failBakeSource('degenerate_topology', 'Bake-source geometry contains a degenerate active triangle.', {
                    ...diagnosticContext,
                    mergedSourceRange,
                    referenceOffset: offset,
                    vertexIndices,
                    positions
                });
            }
            triangleCount += 1;
        }
    }
    return triangleCount;
}

function intersectRanges(leftStart, leftCount, rightStart, rightCount) {
    const start = Math.max(leftStart, rightStart);
    const end = Math.min(leftStart + leftCount, rightStart + rightCount);
    return { start, count: Math.max(0, end - start) };
}

function isDegenerateTriangle(position, indices) {
    const a = [0, 1, 2].map((component) => readAttributeComponent(position, indices[0], component));
    const b = [0, 1, 2].map((component) => readAttributeComponent(position, indices[1], component));
    const c = [0, 1, 2].map((component) => readAttributeComponent(position, indices[2], component));
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0]
    ];
    return cross[0] === 0 && cross[1] === 0 && cross[2] === 0;
}

function validateMaterialGroups(geometry, materialSlotCount, rootId, semanticPath) {
    if (geometry.groups.length === 0 && materialSlotCount < 1) {
        failBakeSource('missing_material_slot', 'Ungrouped geometry requires material slot zero.', {
            rootId,
            semanticPath
        });
    }
    // Three.js only consults BufferGeometry groups when `material` is an array.
    // With one material, otherwise-stale group indices are dormant and the
    // evaluated draw uses the geometry drawRange with that one material.
    if (materialSlotCount === 1) return;
    geometry.groups.forEach((group, groupIndex) => {
        if (group.materialIndex >= materialSlotCount) {
            failBakeSource('material_group_out_of_bounds', 'A geometry group references a missing material slot.', {
                rootId,
                semanticPath,
                groupIndex,
                materialIndex: group.materialIndex,
                materialSlotCount
            });
        }
    });

    const drawStart = geometry.drawRange.start;
    const drawEnd = drawStart + geometry.drawRange.count;
    const activeRanges = geometry.groups
        .map((group, groupIndex) => ({
            groupIndex,
            start: Math.max(drawStart, group.start),
            end: Math.min(drawEnd, group.start + group.count)
        }))
        .filter((range) => range.end > range.start)
        .sort((left, right) => left.start - right.start
            || left.end - right.end
            || left.groupIndex - right.groupIndex);
    for (let index = 1; index < activeRanges.length; index += 1) {
        const previous = activeRanges[index - 1];
        const current = activeRanges[index];
        if (current.start >= previous.end) continue;
        failBakeSource('overlapping_material_groups', 'Active geometry material groups must not overlap.', {
            rootId,
            semanticPath,
            drawRange: geometry.drawRange,
            firstGroupIndex: previous.groupIndex,
            firstRange: { start: previous.start, count: previous.end - previous.start },
            secondGroupIndex: current.groupIndex,
            secondRange: { start: current.start, count: current.end - current.start }
        });
    }
}

async function extractObjectRecord(input) {
    const {
        rootEntry,
        semanticPath,
        object,
        geometry,
        bufferRegistry,
        hashBytes,
        matrixHelpers,
        objectIdentityBytes
    } = input;
    const transformContext = { rootId: rootEntry.id, semanticPath };
    const objectMatrix = validateAffineMatrix(matrixElements(object.matrixWorld), 'Mesh.matrixWorld', matrixHelpers, transformContext);
    const isInstanced = object.isInstancedMesh === true;
    let instanceMatrix = null;
    let instanceColor = null;
    let instanceCount = 1;
    if (isInstanced) {
        instanceCount = object.count;
        const matrixCapacity = object.instanceMatrix?.count;
        if (!Number.isSafeInteger(instanceCount) || instanceCount <= 0
            || !Number.isSafeInteger(matrixCapacity) || instanceCount > matrixCapacity) {
            failBakeSource('instance_count_mismatch', 'InstancedMesh.count must select at least one instance within its matrix capacity.', {
                ...transformContext,
                instanceCount,
                matrixCount: matrixCapacity ?? null
            });
        }
        instanceMatrix = await extractAccessor(
            object.instanceMatrix,
            'instanceMatrix',
            'instance_attribute:matrix',
            bufferRegistry,
            transformContext,
            instanceCount
        );
        if (instanceMatrix.itemSize !== 16 || instanceMatrix.normalized
            || !['f32', 'f64'].includes(instanceMatrix.componentType)) {
            failBakeSource('incompatible_instance_matrix', 'InstancedMesh.instanceMatrix must contain non-normalized f32/f64 matrices.', {
                ...transformContext,
                itemSize: instanceMatrix.itemSize,
                componentType: instanceMatrix.componentType,
                normalized: instanceMatrix.normalized
            });
        }
        if (object.instanceColor) {
            instanceColor = await extractAccessor(
                object.instanceColor,
                'instanceColor',
                'instance_attribute:color',
                bufferRegistry,
                transformContext,
                instanceCount
            );
            if (![3, 4].includes(instanceColor.itemSize) || instanceColor.count !== instanceCount) {
                failBakeSource('instance_color_count_mismatch', 'InstancedMesh.instanceColor must cover every live instance.', {
                    ...transformContext,
                    instanceCount,
                    colorCount: instanceColor.count,
                    itemSize: instanceColor.itemSize
                });
            }
        }
    }

    const identityProjection = {
        rootId: rootEntry.id,
        semanticPath,
        sourceKind: isInstanced ? 'InstancedMesh' : 'Mesh',
        geometryId: geometry.id,
        objectMatrix: objectMatrix.matrix,
        instanceCount,
        instanceMatrix,
        instanceColor
    };
    const identityBytes = canonicalJsonBytes(identityProjection);
    const identityHash = await hashWithStructuredFailure(hashBytes, identityBytes, 'object_identity', transformContext);
    const id = `object/${encodeIdPath(rootEntry.id)}/${semanticPath}`;
    const existingIdentity = objectIdentityBytes.get(id);
    if (existingIdentity) {
        failBakeSource('ambiguous_object_identity', 'Two source meshes resolve to the same producer-owned semantic path.', {
            ...transformContext,
            objectId: id,
            contentMatches: bytesEqual(existingIdentity, identityBytes)
        });
    }
    objectIdentityBytes.set(id, identityBytes);

    const instances = isInstanced
        ? await extractInstancedPlacements({
            object,
            objectId: id,
            objectMatrix: objectMatrix.matrix,
            geometry,
            category: rootEntry.category,
            rootId: rootEntry.id,
            semanticPath,
            instanceColor,
            hashBytes,
            matrixHelpers
        })
        : [await extractOrdinaryPlacement({
            objectId: id,
            matrix: objectMatrix.matrix,
            determinant: objectMatrix.determinant,
            geometry,
            category: rootEntry.category,
            rootId: rootEntry.id,
            semanticPath,
            hashBytes,
            matrixHelpers
        })];
    instances.sort((left, right) => compareCanonicalStrings(left.id, right.id));
    return {
        id,
        contentHash: identityHash,
        rootId: rootEntry.id,
        category: rootEntry.category,
        semanticPath,
        sourceKind: isInstanced ? 'InstancedMesh' : 'Mesh',
        geometryId: geometry.id,
        materialSlotCount: Array.isArray(object.material) ? object.material.length : 1,
        materialGroupingMode: Array.isArray(object.material)
            ? 'geometry_groups'
            : 'single_material_draw_range',
        instanceMatrix,
        instanceColor,
        instances
    };
}

async function extractOrdinaryPlacement(input) {
    const matrixBlenderWorld = convertThreeMatrixToBlender(input.matrix, input.matrixHelpers, {
        rootId: input.rootId,
        semanticPath: input.semanticPath
    });
    const boundsThreeWorld = transformBounds(input.geometry.bounds.box, input.matrix, input.matrixHelpers);
    const boundsBlenderWorld = convertThreeBoundsToBlender(boundsThreeWorld);
    const chunkId = createChunkId({
        category: input.category,
        rootId: input.rootId,
        semanticPath: input.semanticPath,
        objectId: input.objectId,
        boundsThreeWorld,
        matrixThreeWorld: input.matrix
    }, input.matrixHelpers);
    return {
        id: `${input.objectId}/instance/base`,
        contentHash: await hashWithStructuredFailure(
            input.hashBytes,
            canonicalJsonBytes({ matrixThreeWorld: input.matrix, instanceColor: null }),
            'instance_content',
            { rootId: input.rootId, semanticPath: input.semanticPath }
        ),
        sourceIndex: null,
        matrixThreeWorld: input.matrix,
        matrixBlenderWorld,
        determinant: input.determinant,
        boundsThreeWorld,
        boundsBlenderWorld,
        chunkId,
        instanceColorElement: null
    };
}

async function extractInstancedPlacements(input) {
    const instances = [];
    for (let sourceIndex = 0; sourceIndex < input.object.count; sourceIndex += 1) {
        const localMatrixValues = Array.from({ length: 16 }, (_, component) =>
            readRawAttributeComponent(input.object.instanceMatrix, sourceIndex, component));
        const localMatrix = validateAffineMatrix(
            localMatrixValues,
            'InstancedMesh.instanceMatrix',
            input.matrixHelpers,
            { rootId: input.rootId, semanticPath: input.semanticPath, sourceIndex }
        );
        const multiplied = multiplyMatrices(input.objectMatrix, localMatrix.matrix, input.matrixHelpers);
        const world = validateAffineMatrix(
            multiplied,
            'InstancedMesh world matrix',
            input.matrixHelpers,
            { rootId: input.rootId, semanticPath: input.semanticPath, sourceIndex }
        );
        const rawColor = input.object.instanceColor
            ? Array.from({ length: input.object.instanceColor.itemSize }, (_, component) =>
                readRawAttributeComponent(input.object.instanceColor, sourceIndex, component))
            : null;
        const identityBytes = canonicalJsonBytes({ matrixThreeWorld: world.matrix, instanceColor: rawColor });
        const identityHash = await hashWithStructuredFailure(input.hashBytes, identityBytes, 'instance_identity', {
            rootId: input.rootId,
            semanticPath: input.semanticPath,
            sourceIndex
        });
        const id = `${input.objectId}/instance/${String(sourceIndex).padStart(8, '0')}`;
        const matrixBlenderWorld = convertThreeMatrixToBlender(world.matrix, input.matrixHelpers, {
            rootId: input.rootId,
            semanticPath: input.semanticPath,
            sourceIndex
        });
        const boundsThreeWorld = transformBounds(input.geometry.bounds.box, world.matrix, input.matrixHelpers);
        const boundsBlenderWorld = convertThreeBoundsToBlender(boundsThreeWorld);
        const chunkId = createChunkId({
            category: input.category,
            rootId: input.rootId,
            semanticPath: input.semanticPath,
            objectId: input.objectId,
            instanceId: id,
            boundsThreeWorld,
            matrixThreeWorld: world.matrix
        }, input.matrixHelpers);
        instances.push({
            id,
            contentHash: identityHash,
            sourceIndex,
            matrixThreeWorld: world.matrix,
            matrixBlenderWorld,
            determinant: world.determinant,
            boundsThreeWorld,
            boundsBlenderWorld,
            chunkId,
            instanceColorElement: input.instanceColor ? sourceIndex : null
        });
    }
    return instances;
}

function validateAffineMatrix(source, label, matrixHelpers, context) {
    const values = matrixElements(source);
    for (let index = 0; index < values.length; index += 1) {
        if (!Number.isFinite(values[index])) {
            failBakeSource('non_finite_transform', `${label} contains a non-finite matrix element.`, {
                ...context,
                matrixIndex: index,
                actual: values[index]
            });
        }
        values[index] = normalizeNegativeZero(values[index]);
    }
    const bottomRowIndices = [3, 7, 11, 15];
    const expectedBottomRow = [0, 0, 0, 1];
    if (bottomRowIndices.some((matrixIndex, index) =>
        Math.abs(values[matrixIndex] - expectedBottomRow[index]) > AFFINE_EPSILON)) {
        failBakeSource('projective_transform', `${label} must be affine with bottom row [0, 0, 0, 1].`, context);
    }
    const determinant = determinant3x3(values);
    if (!Number.isFinite(determinant) || Math.abs(determinant) <= DETERMINANT_EPSILON) {
        failBakeSource('singular_transform', `${label} has a singular or near-singular linear transform.`, {
            ...context,
            determinant
        });
    }
    if (determinant < 0) {
        failBakeSource('negative_determinant_transform', `${label} has a negative determinant.`, {
            ...context,
            determinant
        });
    }
    if (typeof matrixHelpers.validateAffineTransform === 'function') {
        try {
            matrixHelpers.validateAffineTransform(values, label);
        } catch (error) {
            failBakeSource('unsupported_transform', `${label} was rejected by the configured matrix validator.`, {
                ...context,
                reason: error instanceof Error ? error.message : String(error)
            });
        }
    }
    return { matrix: values, determinant: normalizeNegativeZero(determinant) };
}

function matrixElements(source) {
    const elements = source?.elements ?? source;
    if (!elements || typeof elements.length !== 'number' || elements.length !== 16) {
        failBakeSource('invalid_transform', 'A bake-source transform must contain exactly 16 column-major elements.');
    }
    return Array.from(elements, Number);
}

function determinant3x3(matrix) {
    const m00 = matrix[0];
    const m01 = matrix[4];
    const m02 = matrix[8];
    const m10 = matrix[1];
    const m11 = matrix[5];
    const m12 = matrix[9];
    const m20 = matrix[2];
    const m21 = matrix[6];
    const m22 = matrix[10];
    return m00 * (m11 * m22 - m12 * m21)
        - m01 * (m10 * m22 - m12 * m20)
        + m02 * (m10 * m21 - m11 * m20);
}

function multiplyMatrices(left, right, matrixHelpers) {
    const helper = matrixHelpers.multiplyMatrices ?? matrixHelpers.multiply4x4;
    if (typeof helper === 'function') {
        try {
            return matrixElements(helper(left, right));
        } catch (error) {
            failBakeSource('matrix_multiply_failed', 'The configured matrix multiplication helper failed.', {
                reason: error instanceof Error ? error.message : String(error)
            });
        }
    }
    const result = new Array(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row < 4; row += 1) {
            for (let inner = 0; inner < 4; inner += 1) {
                result[column * 4 + row] += left[inner * 4 + row] * right[column * 4 + inner];
            }
        }
    }
    return result.map(normalizeNegativeZero);
}

function convertThreeMatrixToBlender(matrix, matrixHelpers, context) {
    if (typeof matrixHelpers.convertThreeMatrixToBlender === 'function') {
        try {
            return validateAffineMatrix(
                matrixHelpers.convertThreeMatrixToBlender(matrix),
                'Blender world matrix',
                {},
                context
            ).matrix;
        } catch (error) {
            if (error?.name === 'BakeSourceValidationError') throw error;
            failBakeSource('matrix_conversion_failed', 'Three.js-to-Blender matrix conversion failed.', {
                ...context,
                reason: error instanceof Error ? error.message : String(error)
            });
        }
    }
    const threeToBlender = [
        1, 0, 0, 0,
        0, 0, 1, 0,
        0, -1, 0, 0,
        0, 0, 0, 1
    ];
    const blenderToThree = [
        1, 0, 0, 0,
        0, 0, -1, 0,
        0, 1, 0, 0,
        0, 0, 0, 1
    ];
    return validateAffineMatrix(
        multiplyMatrices(multiplyMatrices(threeToBlender, matrix, {}), blenderToThree, {}),
        'Blender world matrix',
        {},
        context
    ).matrix;
}

function transformBounds(localBox, matrix, matrixHelpers) {
    const corners = [];
    for (const x of [localBox.min[0], localBox.max[0]]) {
        for (const y of [localBox.min[1], localBox.max[1]]) {
            for (const z of [localBox.min[2], localBox.max[2]]) {
                corners.push(transformPoint(matrix, [x, y, z], matrixHelpers));
            }
        }
    }
    const min = [0, 1, 2].map((component) =>
        normalizeNegativeZero(Math.min(...corners.map((point) => point[component]))));
    const max = [0, 1, 2].map((component) =>
        normalizeNegativeZero(Math.max(...corners.map((point) => point[component]))));
    return { min, max };
}

function convertThreeBoundsToBlender(bounds) {
    return {
        min: [bounds.min[0], normalizeNegativeZero(-bounds.max[2]), bounds.min[1]],
        max: [bounds.max[0], normalizeNegativeZero(-bounds.min[2]), bounds.max[1]]
    };
}

function transformPoint(matrix, point, matrixHelpers) {
    if (typeof matrixHelpers.transformPoint === 'function') {
        let result;
        try {
            result = matrixHelpers.transformPoint(matrix, point);
        } catch (error) {
            failBakeSource('point_transform_failed', 'The configured point-transform helper failed.', {
                reason: error instanceof Error ? error.message : String(error)
            });
        }
        const values = result && typeof result === 'object' && 'x' in result
            ? [result.x, result.y, result.z]
            : Array.from(result ?? []);
        if (values.length !== 3 || !values.every(Number.isFinite)) {
            failBakeSource('point_transform_failed', 'The configured point-transform helper returned an invalid point.');
        }
        return values.map(normalizeNegativeZero);
    }
    return [
        normalizeNegativeZero(matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12]),
        normalizeNegativeZero(matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13]),
        normalizeNegativeZero(matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14])
    ];
}

function createChunkId(context, matrixHelpers) {
    const helper = matrixHelpers.chunkIdForBounds ?? matrixHelpers.createChunkId;
    if (typeof helper === 'function') {
        let value;
        try {
            value = helper(context);
        } catch (error) {
            failBakeSource('chunk_id_failed', 'The configured spatial chunk-ID helper failed.', {
                reason: error instanceof Error ? error.message : String(error)
            });
        }
        return stableSourceString(value, 'Spatial chunk ID');
    }
    const bounds = context.boundsThreeWorld;
    const centerX = (bounds.min[0] + bounds.max[0]) * 0.5;
    const centerZ = (bounds.min[2] + bounds.max[2]) * 0.5;
    const size = matrixHelpers.spatialChunkSizeMeters;
    const cellX = Math.floor(centerX / size);
    const cellZ = Math.floor(centerZ / size);
    return `chunk/${encodeIdSegment(context.category)}/${signedCell(cellX)}/${signedCell(cellZ)}`;
}

function signedCell(value) {
    return `${value < 0 ? 'n' : 'p'}${Math.abs(value).toString().padStart(8, '0')}`;
}

function createBufferRegistry(hashBytes) {
    const byHash = new Map();
    const byArray = new WeakMap();
    return {
        async add(array, role) {
            const cached = byArray.get(array);
            if (cached) {
                cached.roles.add(role);
                return cached;
            }
            const bytes = canonicalLittleEndianBytes(array, role);
            if (bytes.byteLength === 0) {
                failBakeSource('empty_buffer', `Bake-source buffer '${role}' cannot be empty.`);
            }
            const hash = await hashWithStructuredFailure(hashBytes, bytes, 'buffer', { role });
            const id = `buffer/${encodeIdSegment(hash)}`;
            let record = byHash.get(hash);
            if (record) {
                if (!bytesEqual(record.data, bytes)) {
                    failBakeSource('hash_collision', 'Geometry-buffer hash collision detected.', { hash, role });
                }
                record.roles.add(role);
            } else {
                record = { id, hash, sha256: hash, byteLength: bytes.byteLength, roles: new Set([role]), data: bytes };
                byHash.set(hash, record);
            }
            byArray.set(array, record);
            return record;
        },
        values() {
            return Array.from(byHash.values(), (record) => ({
                id: record.id,
                hash: record.hash,
                sha256: record.sha256,
                byteLength: record.byteLength,
                roles: Array.from(record.roles).sort(compareCanonicalStrings),
                data: record.data
            })).sort((left, right) => compareCanonicalStrings(left.id, right.id));
        }
    };
}

function createGeometryRegistry(hashBytes) {
    const byHash = new Map();
    return {
        async add(descriptor) {
            const bytes = canonicalJsonBytes(descriptor);
            const hash = await hashWithStructuredFailure(hashBytes, bytes, 'geometry_descriptor', {});
            const id = `geometry/${encodeIdSegment(hash)}`;
            const existing = byHash.get(hash);
            if (existing) {
                if (!bytesEqual(existing.identityBytes, bytes)) {
                    failBakeSource('hash_collision', 'Geometry-descriptor hash collision detected.', { hash });
                }
                return existing.record;
            }
            const record = { id, contentHash: hash, ...descriptor, objectIds: [] };
            byHash.set(hash, { identityBytes: bytes, record });
            return record;
        },
        values() {
            return Array.from(byHash.values(), (entry) => entry.record)
                .sort((left, right) => compareCanonicalStrings(left.id, right.id));
        }
    };
}

function canonicalLittleEndianBytes(array, label) {
    const info = typedArrayInfo(array, label, {});
    const byteLength = array.length * info.byteSize;
    if (!Number.isSafeInteger(byteLength)) {
        failBakeSource('buffer_too_large', `Bake-source buffer '${label}' exceeds the safe integer range.`);
    }
    const bytes = new Uint8Array(byteLength);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < array.length; index += 1) {
        const value = Number(array[index]);
        if (!Number.isFinite(value)) {
            failBakeSource('non_finite_attribute', `Bake-source buffer '${label}' contains a non-finite value.`, {
                elementIndex: index,
                actual: value
            });
        }
        const offset = index * info.byteSize;
        if (info.byteSize === 1) view[info.setter](offset, value);
        else view[info.setter](offset, value, true);
    }
    return bytes;
}

async function hashWithStructuredFailure(hashBytes, bytes, purpose, context) {
    let value;
    try {
        value = await hashBytes(bytes.slice());
    } catch (error) {
        failBakeSource('hash_failed', `hashBytes failed while hashing ${purpose}.`, {
            ...context,
            reason: error instanceof Error ? error.message : String(error)
        });
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        const digest = value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        if (digest.byteLength === 0) failBakeSource('invalid_hash', `hashBytes returned an empty ${purpose} digest.`, context);
        return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
        failBakeSource('invalid_hash', `hashBytes returned an invalid ${purpose} digest.`, context);
    }
    return value;
}

function readAttributeComponent(attribute, index, component) {
    const raw = readRawAttributeComponent(attribute, index, component);
    if (attribute.normalized !== true) return normalizeNegativeZero(raw);
    const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const info = ARRAY_TYPES[array.constructor.name];
    if (info.signed === null) return normalizeNegativeZero(raw);
    const bits = info.byteSize * 8;
    const normalized = info.signed
        ? Math.max(raw / (2 ** (bits - 1) - 1), -1)
        : raw / (2 ** bits - 1);
    return normalizeNegativeZero(normalized);
}

function readRawAttributeComponent(attribute, index, component) {
    const interleaved = attribute.isInterleavedBufferAttribute === true || Boolean(attribute.data?.array);
    const array = interleaved ? attribute.data.array : attribute.array;
    const stride = interleaved ? attribute.data.stride : attribute.itemSize;
    const offset = interleaved ? attribute.offset : 0;
    return Number(array[index * stride + offset + component]);
}

function createInventory(roots, objects, geometries, buffers, excludedShadowMergeProxyCount) {
    const categories = new Map();
    const chunks = new Map();
    const geometryById = new Map(geometries.map((geometry) => [geometry.id, geometry]));
    let meshInstanceCount = 0;
    let expandedVertexCount = 0;
    let expandedTriangleCount = 0;
    for (const object of objects) {
        const geometry = geometryById.get(object.geometryId);
        const category = categories.get(object.category) ?? {
            id: `category/${encodeIdSegment(object.category)}`,
            category: object.category,
            objectCount: 0,
            meshInstanceCount: 0,
            expandedVertexCount: 0,
            expandedTriangleCount: 0
        };
        category.objectCount += 1;
        category.meshInstanceCount += object.instances.length;
        category.expandedVertexCount += geometry.vertexCount * object.instances.length;
        category.expandedTriangleCount += geometry.triangleCount * object.instances.length;
        categories.set(object.category, category);
        meshInstanceCount += object.instances.length;
        expandedVertexCount += geometry.vertexCount * object.instances.length;
        expandedTriangleCount += geometry.triangleCount * object.instances.length;
        for (const instance of object.instances) {
            let chunk = chunks.get(instance.chunkId);
            if (!chunk) {
                chunk = {
                    id: instance.chunkId,
                    category: object.category,
                    objectIds: new Set(),
                    meshInstanceCount: 0,
                    expandedTriangleCount: 0,
                    boundsThreeWorld: {
                        min: instance.boundsThreeWorld.min.slice(),
                        max: instance.boundsThreeWorld.max.slice()
                    }
                };
                chunks.set(instance.chunkId, chunk);
            } else if (chunk.category !== object.category) {
                failBakeSource('ambiguous_chunk_id', 'A spatial chunk ID cannot span multiple reporting categories.', {
                    chunkId: instance.chunkId,
                    firstCategory: chunk.category,
                    secondCategory: object.category
                });
            }
            chunk.objectIds.add(object.id);
            chunk.meshInstanceCount += 1;
            chunk.expandedTriangleCount += geometry.triangleCount;
            for (let component = 0; component < 3; component += 1) {
                chunk.boundsThreeWorld.min[component] = Math.min(
                    chunk.boundsThreeWorld.min[component],
                    instance.boundsThreeWorld.min[component]
                );
                chunk.boundsThreeWorld.max[component] = Math.max(
                    chunk.boundsThreeWorld.max[component],
                    instance.boundsThreeWorld.max[component]
                );
            }
        }
    }
    return {
        rootCount: roots.length,
        objectCount: objects.length,
        instancedObjectCount: objects.filter((object) => object.sourceKind === 'InstancedMesh').length,
        meshInstanceCount,
        geometryCount: geometries.length,
        sharedGeometryCount: geometries.filter((geometry) => geometry.objectIds.length > 1).length,
        bufferCount: buffers.length,
        bufferBytes: buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0),
        expandedVertexCount,
        expandedTriangleCount,
        excludedShadowMergeProxyCount,
        categories: Array.from(categories.values()).sort((left, right) => compareCanonicalStrings(left.id, right.id)),
        chunks: Array.from(chunks.values(), (chunk) => ({
            id: chunk.id,
            category: chunk.category,
            objectCount: chunk.objectIds.size,
            meshInstanceCount: chunk.meshInstanceCount,
            expandedTriangleCount: chunk.expandedTriangleCount,
            boundsThreeWorld: chunk.boundsThreeWorld
        })).sort((left, right) => compareCanonicalStrings(left.id, right.id))
    };
}

function stableSourceString(value, label) {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
        failBakeSource('invalid_stable_string', `${label} must be a non-empty stable string.`, { actual: value ?? null });
    }
    return value.normalize('NFC');
}

function semanticName(value) {
    const normalized = String(value ?? '').normalize('NFC').trim();
    return normalized || 'unnamed';
}

function encodeIdPath(value) {
    return String(value).split('/').map(encodeIdSegment).join('/');
}

function encodeIdSegment(value) {
    const bytes = new TextEncoder().encode(String(value).normalize('NFC'));
    let result = '';
    for (const byte of bytes) {
        const character = String.fromCharCode(byte);
        result += /[A-Za-z0-9._-]/.test(character)
            ? character
            : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    return result || 'unnamed';
}

function boundsEqual(left, right) {
    return Math.abs(left - right) <= BOUNDS_EPSILON;
}

function normalizeNegativeZero(value) {
    return Object.is(value, -0) ? 0 : value;
}

function bytesEqual(left, right) {
    if (left.byteLength !== right.byteLength) return false;
    for (let index = 0; index < left.byteLength; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}
