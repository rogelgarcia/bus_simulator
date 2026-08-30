// Validates the semantic AI 528 manifest and reconstructs geometry from package bytes.
// @ts-check

import {
    BAKE_SOURCE_HASH_SET_SCHEMA,
    buildBakeSourceHashSet,
    canonicalJsonStringify,
    compareCanonicalStrings,
    convertBlenderMatrixToThree,
    convertThreeMatrixToBlender,
    hashCanonicalJsonSha256,
    parseBakeSourcePackage,
    sha256Hex,
    validateAffineTransform
} from '../../../app/illumination/bake_source/index.js';
import {
    buildChannelSourceHashes,
    createGeometryFreshnessProjection,
    createResolvedSourceFreshnessProjection,
    createUsedMaterialsFreshnessInventory,
    resolvedCitySourceFromManifest
} from './BakeSourceFreshness.js';
import { BAKE_MATERIAL_SEMANTICS_DOMAIN } from './BakeSourceMaterials.js';
import { failBakeSource } from './BakeSourceErrors.js';
import {
    BAKE_TEXTURE_BINDING_DOMAIN,
    BAKE_TEXTURE_CONTENT_DOMAIN,
    BAKE_TEXTURE_COVERAGE_DOMAIN,
    BAKE_TEXTURE_SOURCE_DOMAIN
} from './BakeSourceTextures.js';

const GEOMETRY_CONTENT_DOMAIN = 'bus-simulator/illumination/bake-source/evaluated-geometry-buffer/v1';
const ALPHA_INPUT_DOMAIN = 'bus-simulator/illumination/bake-source/alpha-input/v1';
const PROFILE_ASSET_DOMAIN = 'bus-simulator/illumination/bake-source/profile-asset/v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MATRIX_ABSOLUTE_TOLERANCE = 1e-9;
const NORMAL_DIRECTION_TOLERANCE_RADIANS = 1e-6;
const ZERO_DIRECTION_LENGTH_SQUARED = 1e-30;

const REQUIRED_MANIFEST_KEYS = Object.freeze([
    'alphaInputs',
    'buffers',
    'casterMappings',
    'categories',
    'channelProfiles',
    'chunks',
    'colorContract',
    'compilerReferences',
    'containerVersion',
    'coordinateContract',
    'extractorContract',
    'format',
    'geometries',
    'hashes',
    'lightingProfiles',
    'materials',
    'meshInstances',
    'objects',
    'participantMappings',
    'readiness',
    'receiverMappings',
    'roots',
    'schemaVersion',
    'source',
    'textures'
]);

const COMPONENTS = Object.freeze({
    i8: { bytes: 1, read: 'getInt8' },
    u8: { bytes: 1, read: 'getUint8' },
    i16: { bytes: 2, read: 'getInt16' },
    u16: { bytes: 2, read: 'getUint16' },
    i32: { bytes: 4, read: 'getInt32' },
    u32: { bytes: 4, read: 'getUint32' },
    f32: { bytes: 4, read: 'getFloat32' },
    f64: { bytes: 8, read: 'getFloat64' }
});

const ARRAY_COMPONENT_TYPES = Object.freeze({
    Int8Array: 'i8',
    Uint8Array: 'u8',
    Uint8ClampedArray: 'u8',
    Int16Array: 'i16',
    Uint16Array: 'u16',
    Int32Array: 'i32',
    Uint32Array: 'u32',
    Float32Array: 'f32',
    Float64Array: 'f64'
});

function stableArray(value, name) {
    if (!Array.isArray(value)) failBakeSource('manifest_inventory_missing', `Manifest '${name}' must be an array.`, { path: name });
    const ids = new Set();
    let previous = null;
    for (let index = 0; index < value.length; index += 1) {
        const id = value[index]?.id;
        if (typeof id !== 'string' || !id || id.trim() !== id || /[\u0000-\u001f\u007f]/.test(id)) {
            failBakeSource('manifest_id_invalid', `Manifest '${name}[${index}]' has no stable ID.`, { path: `${name}[${index}].id` });
        }
        if (ids.has(id)) failBakeSource('manifest_id_duplicate', `Manifest '${name}' contains duplicate ID '${id}'.`, { path: name, id });
        if (previous !== null && previous >= id) {
            failBakeSource('manifest_inventory_unsorted', `Manifest '${name}' is not strictly ID-sorted.`, { path: name, previous, actual: id });
        }
        ids.add(id);
        previous = id;
    }
    return ids;
}

function requireReference(ids, id, path) {
    if (!ids.has(id)) failBakeSource('manifest_reference_missing', `Manifest reference '${id}' does not resolve.`, { path, id });
}

function recordsById(entries) {
    return new Map(entries.map((entry) => [entry.id, entry]));
}

function requireDigest(value, path) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
        failBakeSource('semantic_digest_invalid', `Semantic digest '${path}' must be lowercase SHA-256.`, {
            path,
            actual: value ?? null
        });
    }
}

function requireCanonicalMatch(actual, expected, code, message, context = {}) {
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(expected)) {
        failBakeSource(code, message, context);
    }
}

function requireSortedReferenceArray(value, path) {
    if (!Array.isArray(value)) {
        failBakeSource('manifest_reference_array_invalid', `Manifest reference array '${path}' is missing.`, { path });
    }
    let previous = null;
    const seen = new Set();
    for (const id of value) {
        if (typeof id !== 'string' || !id || seen.has(id) || (previous !== null && previous >= id)) {
            failBakeSource('manifest_reference_array_invalid', `Manifest reference array '${path}' is not strictly ID-sorted and unique.`, {
                path,
                id: id ?? null,
                previous
            });
        }
        seen.add(id);
        previous = id;
    }
    return seen;
}

function requireBooleanMap(value, allowedIds, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        failBakeSource('channel_relevance_invalid', `Channel relevance '${path}' must be an object.`, { path });
    }
    for (const [channelId, relevant] of Object.entries(value)) {
        if (!allowedIds.has(channelId) || typeof relevant !== 'boolean') {
            failBakeSource('channel_relevance_invalid', `Channel relevance '${path}.${channelId}' is invalid.`, {
                path,
                channelId,
                actual: relevant ?? null
            });
        }
    }
}

function requireFiniteVector(value, length, path) {
    if (!Array.isArray(value) || value.length !== length
        || value.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
        failBakeSource('finite_vector_invalid', `Semantic vector '${path}' must contain ${length} finite numbers.`, {
            path,
            actual: value ?? null
        });
    }
}

function validateBox(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        failBakeSource('bounds_invalid', `Bounds '${path}' must be an object.`, { path });
    }
    requireFiniteVector(value.min, 3, `${path}.min`);
    requireFiniteVector(value.max, 3, `${path}.max`);
    if (value.min.some((component, index) => component > value.max[index])) {
        failBakeSource('bounds_invalid', `Bounds '${path}' have an inverted axis.`, { path });
    }
}

function boundsMatch(actual, expected) {
    return actual && expected
        && actual.min.every((value, index) => withinAbsoluteTolerance(value, expected.min[index], 1e-6))
        && actual.max.every((value, index) => withinAbsoluteTolerance(value, expected.max[index], 1e-6));
}

function transformBounds(localBounds, matrix) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let corner = 0; corner < 8; corner += 1) {
        const x = corner & 1 ? localBounds.max[0] : localBounds.min[0];
        const y = corner & 2 ? localBounds.max[1] : localBounds.min[1];
        const z = corner & 4 ? localBounds.max[2] : localBounds.min[2];
        const point = [
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
        ];
        for (let component = 0; component < 3; component += 1) {
            min[component] = Math.min(min[component], point[component]);
            max[component] = Math.max(max[component], point[component]);
        }
    }
    return { min, max };
}

function convertThreeBoundsToBlender(bounds) {
    return {
        min: [bounds.min[0], -bounds.max[2], bounds.min[1]],
        max: [bounds.max[0], -bounds.min[2], bounds.max[1]]
    };
}

function effectiveMappingRanges(object, geometry) {
    const drawStart = geometry.drawRange.start;
    const drawEnd = drawStart + geometry.drawRange.count;
    const groups = object.materialGroupingMode === 'geometry_groups' && geometry.groups.length > 0
        ? geometry.groups.map((group, groupIndex) => ({ ...group, groupIndex }))
        : [{ start: drawStart, count: geometry.drawRange.count, materialIndex: 0, groupIndex: 0 }];
    return groups.map((group) => {
        const start = Math.max(drawStart, group.start);
        const end = Math.min(drawEnd, group.start + group.count);
        return {
            groupIndex: group.groupIndex,
            materialIndex: group.materialIndex,
            start,
            count: Math.max(0, end - start)
        };
    }).filter((range) => range.count > 0);
}

function materialIdForSlot(object, materialIndex) {
    return object.materialSlots.find((entry) => entry.index === materialIndex)?.id ?? null;
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

function encodeIdPath(value) {
    return String(value).split('/').map(encodeIdSegment).join('/');
}

function signedChunkCell(value) {
    return `${value < 0 ? 'n' : 'p'}${Math.abs(value).toString().padStart(8, '0')}`;
}

function expectedChunkId(category, bounds) {
    const centerX = (bounds.min[0] + bounds.max[0]) * 0.5;
    const centerZ = (bounds.min[2] + bounds.max[2]) * 0.5;
    return `chunk/${encodeIdSegment(category)}/${signedChunkCell(Math.floor(centerX / 128))}/${signedChunkCell(Math.floor(centerZ / 128))}`;
}

function withinAbsoluteTolerance(left, right, tolerance) {
    return Math.abs(left - right) <= tolerance;
}

function readComponent(view, type, offset) {
    const info = COMPONENTS[type];
    if (!info) failBakeSource('accessor_component_unsupported', `Unsupported accessor component type '${type}'.`, { componentType: type });
    return info.bytes === 1 ? view[info.read](offset) : view[info.read](offset, true);
}

function validateAccessor(accessor, parsed, bufferDescriptors, path) {
    if (!accessor || typeof accessor !== 'object') failBakeSource('accessor_missing', `Missing accessor at '${path}'.`, { path });
    const info = COMPONENTS[accessor.componentType];
    if (!info) failBakeSource('accessor_component_unsupported', `Unsupported accessor component type at '${path}'.`, { path, componentType: accessor.componentType });
    if (ARRAY_COMPONENT_TYPES[accessor.arrayType] !== accessor.componentType) {
        failBakeSource('accessor_array_type_mismatch', `Accessor '${path}' array type does not match its component type.`, {
            path,
            arrayType: accessor.arrayType ?? null,
            componentType: accessor.componentType
        });
    }
    if (typeof accessor.normalized !== 'boolean' || typeof accessor.interleaved !== 'boolean') {
        failBakeSource('accessor_shape_invalid', `Accessor '${path}' must declare normalized and interleaved booleans.`, { path });
    }
    const numeric = ['byteOffset', 'byteStride', 'itemSize', 'count'];
    for (const field of numeric) {
        if (!Number.isSafeInteger(accessor[field]) || accessor[field] < 0) {
            failBakeSource('accessor_shape_invalid', `Accessor '${path}.${field}' must be a non-negative safe integer.`, { path, field, actual: accessor[field] });
        }
    }
    if (accessor.itemSize < 1 || accessor.byteStride < accessor.itemSize * info.bytes
        || accessor.byteOffset % info.bytes !== 0 || accessor.byteStride % info.bytes !== 0) {
        failBakeSource('accessor_stride_invalid', `Accessor '${path}' has an invalid item size or stride.`, { path });
    }
    if (accessor.byteOffset + accessor.itemSize * info.bytes > accessor.byteStride) {
        failBakeSource('accessor_stride_invalid', `Accessor '${path}' components cross its declared stride.`, { path });
    }
    if (!accessor.interleaved && (accessor.byteOffset !== 0 || accessor.byteStride !== accessor.itemSize * info.bytes)) {
        failBakeSource('accessor_stride_invalid', `Non-interleaved accessor '${path}' must be tightly packed.`, { path });
    }
    const descriptor = bufferDescriptors.get(accessor.bufferId);
    if (!descriptor || descriptor.kind !== 'geometry') {
        failBakeSource('accessor_buffer_invalid', `Accessor '${path}' must reference a declared geometry buffer.`, {
            path,
            bufferId: accessor.bufferId ?? null
        });
    }
    if (!parsed.hasBuffer(accessor.bufferId)) {
        failBakeSource('accessor_buffer_missing', `Accessor '${path}' references missing package bytes.`, {
            path,
            bufferId: accessor.bufferId
        });
    }
    const bytes = parsed.getBuffer(accessor.bufferId);
    const required = accessor.count === 0
        ? accessor.byteOffset
        : accessor.byteOffset + (accessor.count - 1) * accessor.byteStride + accessor.itemSize * info.bytes;
    if (required > bytes.byteLength) {
        failBakeSource('accessor_range_invalid', `Accessor '${path}' exceeds its declared buffer.`, {
            path,
            bufferId: accessor.bufferId,
            required,
            actual: bytes.byteLength
        });
    }
    const expectedByteLength = accessor.count * accessor.byteStride;
    if (bytes.byteLength !== expectedByteLength) {
        failBakeSource('accessor_backing_length_mismatch', `Accessor '${path}' buffer does not match its exact active backing length.`, {
            path,
            bufferId: accessor.bufferId,
            expected: expectedByteLength,
            actual: bytes.byteLength
        });
    }
    const validated = { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), info };
    for (let index = 0; index < accessor.count; index += 1) {
        for (let component = 0; component < accessor.itemSize; component += 1) {
            const value = accessorValue(accessor, validated, index, component);
            if (!Number.isFinite(value)) {
                failBakeSource('attribute_non_finite', `Accessor '${path}' contains a non-finite value.`, {
                    path,
                    index,
                    component
                });
            }
        }
    }
    return validated;
}

function accessorValue(accessor, validated, index, component) {
    const offset = accessor.byteOffset + index * accessor.byteStride + component * validated.info.bytes;
    return readComponent(validated.view, accessor.componentType, offset);
}

function decodedAccessorValue(accessor, validated, index, component) {
    const value = accessorValue(accessor, validated, index, component);
    if (!accessor.normalized || accessor.componentType.startsWith('f')) return Object.is(value, -0) ? 0 : value;
    const bits = validated.info.bytes * 8;
    const normalized = accessor.componentType.startsWith('i')
        ? Math.max(value / (2 ** (bits - 1) - 1), -1)
        : value / (2 ** bits - 1);
    return Object.is(normalized, -0) ? 0 : normalized;
}

function representativeDirectionSamples(accessor, validated, semanticName, geometryId) {
    const expectedItemSize = semanticName === 'tangent' ? 4 : 3;
    if (accessor.itemSize !== expectedItemSize) {
        failBakeSource('direction_attribute_shape_invalid', `Geometry '${geometryId}' ${semanticName} accessor must have itemSize ${expectedItemSize}.`, {
            id: geometryId,
            attribute: semanticName,
            expected: expectedItemSize,
            actual: accessor.itemSize
        });
    }
    if (accessor.count === 0) return [];
    const indices = new Set([0, Math.floor((accessor.count - 1) * 0.5), accessor.count - 1]);
    for (let index = 0; index < accessor.count; index += 1) {
        const x = decodedAccessorValue(accessor, validated, index, 0);
        const y = decodedAccessorValue(accessor, validated, index, 1);
        const z = decodedAccessorValue(accessor, validated, index, 2);
        if (x * x + y * y + z * z > ZERO_DIRECTION_LENGTH_SQUARED) {
            indices.add(index);
            break;
        }
    }
    return Array.from(indices).sort((left, right) => left - right).map((index) => ({
        index,
        value: Array.from({ length: expectedItemSize }, (_, component) =>
            decodedAccessorValue(accessor, validated, index, component))
    }));
}

function convertThreeAttributeDirectionToBlender(value) {
    return value.length === 4
        ? [value[0], -value[2], value[1], value[3]]
        : [value[0], -value[2], value[1]];
}

function convertBlenderAttributeDirectionToThree(value) {
    return value.length === 4
        ? [value[0], value[2], -value[1], value[3]]
        : [value[0], value[2], -value[1]];
}

function transformInverseTransposeDirection(matrix, direction) {
    const a00 = matrix[0];
    const a01 = matrix[4];
    const a02 = matrix[8];
    const a10 = matrix[1];
    const a11 = matrix[5];
    const a12 = matrix[9];
    const a20 = matrix[2];
    const a21 = matrix[6];
    const a22 = matrix[10];
    const determinant = a00 * (a11 * a22 - a12 * a21)
        - a01 * (a10 * a22 - a12 * a20)
        + a02 * (a10 * a21 - a11 * a20);
    const inverse = [
        (a11 * a22 - a12 * a21) / determinant,
        (a02 * a21 - a01 * a22) / determinant,
        (a01 * a12 - a02 * a11) / determinant,
        (a12 * a20 - a10 * a22) / determinant,
        (a00 * a22 - a02 * a20) / determinant,
        (a02 * a10 - a00 * a12) / determinant,
        (a10 * a21 - a11 * a20) / determinant,
        (a01 * a20 - a00 * a21) / determinant,
        (a00 * a11 - a01 * a10) / determinant
    ];
    return [
        inverse[0] * direction[0] + inverse[3] * direction[1] + inverse[6] * direction[2],
        inverse[1] * direction[0] + inverse[4] * direction[1] + inverse[7] * direction[2],
        inverse[2] * direction[0] + inverse[5] * direction[1] + inverse[8] * direction[2]
    ];
}

function normalizedDirection(value) {
    const lengthSquared = value[0] * value[0] + value[1] * value[1] + value[2] * value[2];
    if (lengthSquared <= ZERO_DIRECTION_LENGTH_SQUARED) return null;
    const inverseLength = 1 / Math.sqrt(lengthSquared);
    return value.map((component) => component * inverseLength);
}

function validateDirectionRoundTrip(instance, semanticName, sample) {
    const blenderLocal = convertThreeAttributeDirectionToBlender(sample.value);
    const localRoundTrip = convertBlenderAttributeDirectionToThree(blenderLocal);
    if (localRoundTrip.some((value, index) =>
        !withinAbsoluteTolerance(value, sample.value[index], MATRIX_ABSOLUTE_TOLERANCE))) {
        failBakeSource('round_trip_direction_mismatch', `Mesh instance '${instance.id}' ${semanticName} basis conversion does not round-trip.`, {
            id: instance.id,
            attribute: semanticName,
            vertexIndex: sample.index
        });
    }

    const threeWorld = normalizedDirection(transformInverseTransposeDirection(
        instance.matrixThreeWorld,
        sample.value
    ));
    const blenderWorld = normalizedDirection(transformInverseTransposeDirection(
        instance.matrixBlenderWorld,
        blenderLocal
    ));
    const blenderWorldAsThree = blenderWorld
        ? normalizedDirection(convertBlenderAttributeDirectionToThree(blenderWorld))
        : null;
    if (!threeWorld && !blenderWorldAsThree) return;
    if (!threeWorld || !blenderWorldAsThree) {
        failBakeSource('round_trip_direction_mismatch', `Mesh instance '${instance.id}' ${semanticName} direction becomes singular under one coordinate path.`, {
            id: instance.id,
            attribute: semanticName,
            vertexIndex: sample.index
        });
    }
    const dot = Math.max(-1, Math.min(1,
        threeWorld[0] * blenderWorldAsThree[0]
        + threeWorld[1] * blenderWorldAsThree[1]
        + threeWorld[2] * blenderWorldAsThree[2]));
    const angleRadians = Math.acos(dot);
    if (angleRadians > NORMAL_DIRECTION_TOLERANCE_RADIANS) {
        failBakeSource('round_trip_direction_mismatch', `Mesh instance '${instance.id}' ${semanticName} world direction exceeds the angular tolerance.`, {
            id: instance.id,
            attribute: semanticName,
            vertexIndex: sample.index,
            expectedMaximumRadians: NORMAL_DIRECTION_TOLERANCE_RADIANS,
            actualRadians: angleRadians
        });
    }
}

async function reconstructGeometry(geometry, parsed, bufferDescriptors) {
    if (!geometry.attributes || typeof geometry.attributes !== 'object' || Array.isArray(geometry.attributes)) {
        failBakeSource('geometry_attributes_invalid', `Geometry '${geometry.id}' attributes must be an object.`, { id: geometry.id });
    }
    const position = geometry.attributes?.position;
    const validatedAttributes = new Map();
    for (const [name, accessor] of Object.entries(geometry.attributes).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
        if (accessor.semanticName !== name || typeof accessor.name !== 'string') {
            failBakeSource('accessor_semantic_name_mismatch', `Geometry '${geometry.id}' attribute '${name}' semantic name is inconsistent.`, {
                id: geometry.id,
                attribute: name,
                semanticName: accessor.semanticName ?? null
            });
        }
        const validated = validateAccessor(accessor, parsed, bufferDescriptors, `geometries.${geometry.id}.attributes.${name}`);
        validatedAttributes.set(name, validated);
    }
    const positionData = validatedAttributes.get('position');
    if (!positionData) failBakeSource('accessor_missing', `Geometry '${geometry.id}' has no position accessor.`, { id: geometry.id });
    if (position.itemSize !== 3 || position.count !== geometry.vertexCount) {
        failBakeSource('position_shape_mismatch', `Geometry '${geometry.id}' position shape is inconsistent.`, { id: geometry.id });
    }
    for (const [name, accessor] of Object.entries(geometry.attributes)) {
        if (accessor.count !== position.count) failBakeSource('attribute_count_mismatch', `Geometry '${geometry.id}' attribute '${name}' has a different count.`, { id: geometry.id, attribute: name });
    }
    const directionSamples = {};
    for (const semanticName of ['normal', 'tangent']) {
        const accessor = geometry.attributes[semanticName];
        if (accessor) {
            directionSamples[semanticName] = representativeDirectionSamples(
                accessor,
                validatedAttributes.get(semanticName),
                semanticName,
                geometry.id
            );
        }
    }
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let vertex = 0; vertex < position.count; vertex += 1) {
        for (let component = 0; component < 3; component += 1) {
            const value = decodedAccessorValue(position, positionData, vertex, component);
            min[component] = Math.min(min[component], value);
            max[component] = Math.max(max[component], value);
        }
    }
    const expected = geometry.bounds?.box;
    if (!expected || min.some((value, index) => !withinAbsoluteTolerance(value, expected.min[index], 1e-6))
        || max.some((value, index) => !withinAbsoluteTolerance(value, expected.max[index], 1e-6))) {
        failBakeSource('round_trip_bounds_mismatch', `Geometry '${geometry.id}' bounds do not reconstruct.`, { id: geometry.id, expected, actual: { min, max } });
    }

    let indexData = null;
    if (geometry.index) {
        indexData = validateAccessor(geometry.index, parsed, bufferDescriptors, `geometries.${geometry.id}.index`);
        if (geometry.index.semanticName !== 'index' || typeof geometry.index.name !== 'string'
            || geometry.index.itemSize !== 1 || geometry.index.normalized
            || !['u8', 'u16', 'u32'].includes(geometry.index.componentType)) {
            failBakeSource('index_shape_invalid', `Geometry '${geometry.id}' index accessor is invalid.`, { id: geometry.id });
        }
        for (let offset = 0; offset < geometry.index.count; offset += 1) {
            const vertexIndex = accessorValue(geometry.index, indexData, offset, 0);
            if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= position.count) {
                failBakeSource('index_out_of_range', `Geometry '${geometry.id}' contains an out-of-range index.`, { id: geometry.id, offset, vertexIndex });
            }
        }
    }
    const center = [0, 1, 2].map((component) => (min[component] + max[component]) * 0.5);
    let radiusSquared = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
        const dx = decodedAccessorValue(position, positionData, vertex, 0) - center[0];
        const dy = decodedAccessorValue(position, positionData, vertex, 1) - center[1];
        const dz = decodedAccessorValue(position, positionData, vertex, 2) - center[2];
        radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
    }
    const expectedSphere = geometry.bounds?.sphere;
    const radius = Math.sqrt(radiusSquared);
    if (!expectedSphere || center.some((value, index) => !withinAbsoluteTolerance(value, expectedSphere.center?.[index], 1e-6))
        || !withinAbsoluteTolerance(radius, expectedSphere.radius, 1e-6)) {
        failBakeSource('round_trip_bounds_mismatch', `Geometry '${geometry.id}' bounding sphere does not reconstruct.`, {
            id: geometry.id,
            expected: expectedSphere,
            actual: { center, radius }
        });
    }
    const referenceCount = geometry.index?.count ?? position.count;
    if (geometry.referenceCount !== referenceCount || !Number.isSafeInteger(geometry.triangleCount) || geometry.triangleCount < 0) {
        failBakeSource('geometry_count_mismatch', `Geometry '${geometry.id}' declared counts are inconsistent.`, {
            id: geometry.id,
            expectedReferenceCount: referenceCount,
            actualReferenceCount: geometry.referenceCount,
            triangleCount: geometry.triangleCount
        });
    }
    const drawRange = geometry.drawRange;
    if (!drawRange || !Number.isSafeInteger(drawRange.start) || !Number.isSafeInteger(drawRange.count)
        || drawRange.start < 0 || drawRange.count < 0 || drawRange.start + drawRange.count > referenceCount
        || drawRange.start % 3 !== 0 || drawRange.count % 3 !== 0
        || typeof drawRange.countWasInfinite !== 'boolean') {
        failBakeSource('draw_range_invalid', `Geometry '${geometry.id}' draw range is invalid.`, { id: geometry.id });
    }
    if (!Array.isArray(geometry.groups)) failBakeSource('geometry_groups_invalid', `Geometry '${geometry.id}' groups must be an array.`, { id: geometry.id });
    const ranges = geometry.groups.length > 0 ? [] : [{ start: drawRange.start, count: drawRange.count }];
    for (let groupIndex = 0; groupIndex < geometry.groups.length; groupIndex += 1) {
        const group = geometry.groups[groupIndex];
        if (!Number.isSafeInteger(group.start) || !Number.isSafeInteger(group.count) || !Number.isSafeInteger(group.materialIndex)
            || group.start < 0 || group.count < 0 || group.materialIndex < 0 || group.start + group.count > referenceCount
            || group.start % 3 !== 0 || group.count % 3 !== 0) {
            failBakeSource('geometry_group_invalid', `Geometry '${geometry.id}' group ${groupIndex} is invalid.`, { id: geometry.id, groupIndex });
        }
        const start = Math.max(group.start, drawRange.start);
        const end = Math.min(group.start + group.count, drawRange.start + drawRange.count);
        const count = Math.max(0, end - start);
        if (start % 3 !== 0 || count % 3 !== 0) {
            failBakeSource('geometry_group_invalid', `Geometry '${geometry.id}' group ${groupIndex} splits a triangle.`, { id: geometry.id, groupIndex });
        }
        ranges.push({ start, count });
    }
    let triangleCount = 0;
    for (const range of ranges) {
        for (let offset = range.start; offset < range.start + range.count; offset += 3) {
            const vertexIndices = [0, 1, 2].map((component) => geometry.index
                ? accessorValue(geometry.index, indexData, offset + component, 0)
                : offset + component);
            if (new Set(vertexIndices).size !== 3) {
                failBakeSource('degenerate_topology', `Geometry '${geometry.id}' contains a degenerate triangle.`, { id: geometry.id, offset });
            }
            const points = vertexIndices.map((vertexIndex) => [0, 1, 2]
                .map((component) => decodedAccessorValue(position, positionData, vertexIndex, component)));
            const ab = points[1].map((value, component) => value - points[0][component]);
            const ac = points[2].map((value, component) => value - points[0][component]);
            const cross = [
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0]
            ];
            if (cross.every((value) => value === 0)) {
                failBakeSource('degenerate_topology', `Geometry '${geometry.id}' contains a zero-area triangle.`, { id: geometry.id, offset });
            }
            triangleCount += 1;
        }
    }
    if (triangleCount !== geometry.triangleCount) {
        failBakeSource('geometry_count_mismatch', `Geometry '${geometry.id}' triangle count does not reconstruct.`, {
            id: geometry.id,
            expected: geometry.triangleCount,
            actual: triangleCount
        });
    }
    if (geometry.winding !== 'counter_clockwise' || geometry.topology !== 'triangles') {
        failBakeSource('topology_unsupported', `Geometry '${geometry.id}' does not declare counter-clockwise triangles.`, { id: geometry.id });
    }
    requireSortedReferenceArray(geometry.objectIds, `geometries.${geometry.id}.objectIds`);
    const { id, contentHash, objectIds, ...contentDescriptor } = geometry;
    const computedContentHash = await hashCanonicalJsonSha256(GEOMETRY_CONTENT_DOMAIN, contentDescriptor);
    requireDigest(contentHash, `geometries.${id}.contentHash`);
    if (contentHash !== computedContentHash || id !== `geometry/${computedContentHash}`) {
        failBakeSource('geometry_content_digest_mismatch', `Geometry '${id}' content address does not reconstruct.`, {
            id,
            expected: computedContentHash,
            actual: contentHash
        });
    }
    return {
        id: geometry.id,
        vertexCount: position.count,
        referenceCount,
        normalCount: geometry.attributes?.normal?.count ?? 0,
        directionSamples,
        uvSets: Object.keys(geometry.attributes ?? {}).filter((name) => /^uv\d*$/.test(name)).sort(),
        bounds: { min, max }
    };
}

function bufferContentDomain(descriptor) {
    if (descriptor.kind === 'geometry') return GEOMETRY_CONTENT_DOMAIN;
    if (descriptor.kind === 'texture_source') return BAKE_TEXTURE_CONTENT_DOMAIN;
    if (descriptor.kind === 'texture_coverage_channel') {
        if (!['r', 'g', 'b', 'a'].includes(descriptor.coverageChannel)) {
            failBakeSource('texture_coverage_channel_invalid', `Coverage buffer '${descriptor.id}' has an invalid channel.`, {
                id: descriptor.id,
                channel: descriptor.coverageChannel ?? null
            });
        }
        return `${BAKE_TEXTURE_COVERAGE_DOMAIN}/${descriptor.coverageChannel}`;
    }
    if (descriptor.kind === 'lighting_profile_source') return PROFILE_ASSET_DOMAIN;
    failBakeSource('buffer_kind_unsupported', `Semantic buffer kind '${descriptor.kind}' is unsupported.`, { kind: descriptor.kind ?? null });
}

async function validateBufferInventory(manifest, parsed) {
    const parsedBuffers = new Map(parsed.buffers.map((entry) => [entry.id, entry]));
    const descriptors = recordsById(manifest.buffers);
    if (parsedBuffers.size !== manifest.buffers.length) {
        failBakeSource('buffer_inventory_mismatch', 'Semantic and stored buffer counts differ.');
    }
    for (const descriptor of manifest.buffers) {
        const stored = parsedBuffers.get(descriptor.id);
        if (!stored || !Number.isSafeInteger(descriptor.byteLength) || descriptor.byteLength <= 0
            || stored.byteLength !== descriptor.byteLength) {
            failBakeSource('buffer_inventory_mismatch', `Semantic buffer '${descriptor.id}' does not match stored bytes.`, {
                id: descriptor.id,
                expected: descriptor.byteLength ?? null,
                actual: stored?.byteLength ?? null
            });
        }
        requireDigest(descriptor.contentSha256, `buffers.${descriptor.id}.contentSha256`);
        const bytes = parsed.getBuffer(descriptor.id);
        const computed = await sha256Hex(bufferContentDomain(descriptor), bytes);
        if (computed !== descriptor.contentSha256) {
            failBakeSource('buffer_content_digest_mismatch', `Semantic buffer '${descriptor.id}' content digest does not match package bytes.`, {
                id: descriptor.id,
                expected: descriptor.contentSha256,
                actual: computed
            });
        }
        if (descriptor.kind === 'geometry' && descriptor.id !== `buffer/${computed}`) {
            failBakeSource('buffer_content_address_mismatch', `Geometry buffer '${descriptor.id}' is not addressed by its bytes.`, {
                id: descriptor.id,
                expected: `buffer/${computed}`
            });
        }
        if (descriptor.kind === 'lighting_profile_source' && descriptor.id !== `profile-asset/${computed}`) {
            failBakeSource('buffer_content_address_mismatch', `Lighting-profile buffer '${descriptor.id}' is not addressed by its bytes.`, {
                id: descriptor.id,
                expected: `profile-asset/${computed}`
            });
        }
    }
    return descriptors;
}

async function validateSemanticContentDigests(manifest, parsed, bufferDescriptors) {
    const textureSources = new Map(manifest.textures.filter((entry) => entry.kind === 'source').map((entry) => [entry.id, entry]));
    const textureBindings = new Map(manifest.textures.filter((entry) => entry.kind === 'binding').map((entry) => [entry.id, entry]));
    for (const texture of manifest.textures) {
        if (texture.kind === 'source') {
            if (!Number.isSafeInteger(texture.width) || texture.width <= 0
                || !Number.isSafeInteger(texture.height) || texture.height <= 0
                || !Number.isSafeInteger(texture.depth) || texture.depth <= 0
                || !['encoded_source', 'raw_typed_pixels', 'raw_rgba8'].includes(texture.storage)
                || typeof texture.componentType !== 'string' || !texture.componentType
                || texture.rowOrigin !== 'native_source_with_flipY_declared_by_binding') {
                failBakeSource('texture_source_shape_invalid', `Texture source '${texture.id}' has unsupported V1 dimensions, storage, or row semantics.`, {
                    id: texture.id
                });
            }
            const { id, kind, sourceSha256, alphaSamples, coverageChannels, ...sourceProjection } = texture;
            requireDigest(sourceSha256, `textures.${id}.sourceSha256`);
            requireDigest(texture.contentSha256, `textures.${id}.contentSha256`);
            const computed = await hashCanonicalJsonSha256(BAKE_TEXTURE_SOURCE_DOMAIN, sourceProjection);
            if (sourceSha256 !== computed || id !== `texture-source:${computed}`) {
                failBakeSource('texture_source_digest_mismatch', `Texture source '${id}' semantic identity does not reconstruct.`, {
                    id,
                    expected: computed,
                    actual: sourceSha256
                });
            }
            const bufferId = `${id}:bytes`;
            const descriptor = bufferDescriptors.get(bufferId);
            if (!descriptor || descriptor.kind !== 'texture_source' || descriptor.textureSourceId !== id
                || descriptor.contentSha256 !== texture.contentSha256 || descriptor.byteLength !== texture.byteLength) {
                failBakeSource('texture_buffer_reference_mismatch', `Texture source '${id}' does not match its byte buffer descriptor.`, {
                    id,
                    bufferId
                });
            }
            for (const [channel, sample] of Object.entries(alphaSamples ?? {})) {
                requireDigest(sample.sha256, `textures.${id}.alphaSamples.${channel}.sha256`);
                if (!Number.isSafeInteger(sample.sampleCount) || sample.sampleCount <= 0
                    || !Number.isSafeInteger(sample.coveredAtHalf) || sample.coveredAtHalf < 0
                    || sample.coveredAtHalf > sample.sampleCount) {
                    failBakeSource('texture_alpha_sample_invalid', `Texture source '${id}' alpha sample '${channel}' is invalid.`, {
                        id,
                        channel
                    });
                }
            }
            for (const [channel, coverage] of Object.entries(coverageChannels ?? {})) {
                if (!['r', 'g', 'b', 'a'].includes(channel)) {
                    failBakeSource('texture_coverage_channel_invalid', `Texture source '${id}' has an invalid exact coverage channel.`, { id, channel });
                }
                requireDigest(coverage.sha256, `textures.${id}.coverageChannels.${channel}.sha256`);
                if (!Number.isSafeInteger(coverage.byteLength) || coverage.byteLength <= 0
                    || !Number.isSafeInteger(coverage.pixelCount) || coverage.pixelCount !== texture.width * texture.height) {
                    failBakeSource('texture_coverage_channel_invalid', `Texture source '${id}' exact coverage channel '${channel}' is invalid.`, { id, channel });
                }
            }
        } else if (texture.kind === 'binding') {
            const finiteVector = (value, length) => Array.isArray(value) && value.length === length
                && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
            if (!finiteVector(texture.offset, 2) || !finiteVector(texture.repeat, 2)
                || !finiteVector(texture.center, 2) || !finiteVector(texture.matrix, 9)
                || typeof texture.rotation !== 'number' || !Number.isFinite(texture.rotation)
                || typeof texture.matrixAutoUpdate !== 'boolean' || typeof texture.flipY !== 'boolean'
                || typeof texture.generateMipmaps !== 'boolean' || typeof texture.premultiplyAlpha !== 'boolean') {
                failBakeSource('texture_binding_shape_invalid', `Texture binding '${texture.id}' has unsupported V1 sampling semantics.`, {
                    id: texture.id
                });
            }
            const { id, kind, ...bindingProjection } = texture;
            const computed = await hashCanonicalJsonSha256(BAKE_TEXTURE_BINDING_DOMAIN, bindingProjection);
            if (id !== `texture-binding:${computed}`) {
                failBakeSource('texture_binding_digest_mismatch', `Texture binding '${id}' semantic identity does not reconstruct.`, {
                    id,
                    expected: computed
                });
            }
            if (!textureSources.has(texture.sourceId)) {
                failBakeSource('texture_source_reference_missing', `Texture binding '${id}' references missing source '${texture.sourceId}'.`, {
                    id,
                    sourceId: texture.sourceId ?? null
                });
            }
        } else {
            failBakeSource('texture_kind_unsupported', `Texture record '${texture.id}' has unsupported kind '${texture.kind}'.`, {
                id: texture.id,
                kind: texture.kind ?? null
            });
        }
    }

    const alphaById = recordsById(manifest.alphaInputs);
    const alphaByMaterial = new Map();
    for (const alpha of manifest.alphaInputs) {
        const { id, sha256, ...projection } = alpha;
        requireDigest(sha256, `alphaInputs.${id}.sha256`);
        const computed = await hashCanonicalJsonSha256(ALPHA_INPUT_DOMAIN, projection);
        if (sha256 !== computed || id !== `alpha-input/${computed}`) {
            failBakeSource('alpha_input_digest_mismatch', `Alpha input '${id}' semantic digest does not reconstruct.`, {
                id,
                expected: computed,
                actual: sha256
            });
        }
        if (alphaByMaterial.has(alpha.materialId)) {
            failBakeSource('alpha_material_ambiguous', `Material '${alpha.materialId}' has more than one alpha input.`, {
                materialId: alpha.materialId
            });
        }
        alphaByMaterial.set(alpha.materialId, alpha);
        const alphaBindingIds = requireSortedReferenceArray(alpha.textureBindingIds, `alphaInputs.${id}.textureBindingIds`);
        for (const bindingId of alphaBindingIds) {
            if (!textureBindings.has(bindingId)) {
                failBakeSource('texture_binding_reference_missing', `Alpha input '${id}' references missing texture binding '${bindingId}'.`, {
                    id,
                    bindingId
                });
            }
        }
    }

    const materialById = recordsById(manifest.materials);
    const expectedCoverageBufferIds = new Set();
    for (const material of manifest.materials) {
        const { id, alphaInputId, ...semanticProjection } = material;
        const computed = await hashCanonicalJsonSha256(BAKE_MATERIAL_SEMANTICS_DOMAIN, semanticProjection);
        if (id !== `material:${computed}`) {
            failBakeSource('material_digest_mismatch', `Material '${id}' semantic identity does not reconstruct.`, {
                id,
                expected: computed
            });
        }
        const alpha = alphaById.get(alphaInputId);
        if (!alpha || alpha.materialId !== id || alphaByMaterial.get(id)?.id !== alphaInputId) {
            failBakeSource('material_alpha_reference_mismatch', `Material '${id}' does not resolve to its unique alpha input.`, {
                id,
                alphaInputId: alphaInputId ?? null
            });
        }
        const bindingIds = Object.values(material.textureBindings ?? {});
        for (const bindingId of bindingIds) {
            if (!textureBindings.has(bindingId)) {
                failBakeSource('texture_binding_reference_missing', `Material '${id}' references missing texture binding '${bindingId}'.`, {
                    id,
                    bindingId
                });
            }
        }
        const alphaBindingIds = (material.alpha?.inputs ?? []).map((entry) => entry.bindingId).sort();
        requireCanonicalMatch(
            alpha.textureBindingIds,
            alphaBindingIds,
            'material_alpha_reference_mismatch',
            `Material '${id}' alpha bindings do not match its alpha input.`,
            { id }
        );
        if (material.alpha?.mode !== 'opaque') {
            for (const input of (material.alpha?.inputs ?? [])) {
                const binding = textureBindings.get(input.bindingId);
                const source = binding ? textureSources.get(binding.sourceId) : null;
                const coverage = source?.coverageChannels?.[input.channel];
                const bufferId = source ? `${source.id}:coverage:${input.channel}` : null;
                const descriptor = bufferId ? bufferDescriptors.get(bufferId) : null;
                if (!source || !coverage || !descriptor
                    || descriptor.kind !== 'texture_coverage_channel'
                    || descriptor.textureSourceId !== source.id
                    || descriptor.coverageChannel !== input.channel
                    || descriptor.contentSha256 !== coverage.sha256
                    || descriptor.byteLength !== coverage.byteLength) {
                    failBakeSource('texture_coverage_buffer_mismatch', `Material '${id}' alpha input is not backed by exact package coverage bytes.`, {
                        materialId: id,
                        bindingId: input.bindingId,
                        channel: input.channel,
                        bufferId
                    });
                }
                expectedCoverageBufferIds.add(bufferId);
            }
        }
    }
    const actualCoverageBufferIds = new Set(manifest.buffers
        .filter((entry) => entry.kind === 'texture_coverage_channel')
        .map((entry) => entry.id));
    requireCanonicalMatch(
        Array.from(actualCoverageBufferIds).sort(compareCanonicalStrings),
        Array.from(expectedCoverageBufferIds).sort(compareCanonicalStrings),
        'texture_coverage_buffer_inventory_mismatch',
        'Exact texture coverage buffers do not match the non-opaque material inputs.'
    );

    for (const profile of manifest.lightingProfiles) {
        const reference = profile.sourceReference;
        if (!reference) continue;
        const descriptor = bufferDescriptors.get(reference.bufferId);
        if (!descriptor || descriptor.kind !== 'lighting_profile_source'
            || descriptor.byteLength !== reference.byteLength || descriptor.contentSha256 !== reference.sha256) {
            failBakeSource('lighting_profile_buffer_mismatch', `Lighting profile '${profile.id}' source reference is inconsistent.`, {
                id: profile.id,
                bufferId: reference.bufferId ?? null
            });
        }
        requireDigest(reference.sha256, `lightingProfiles.${profile.id}.sourceReference.sha256`);
        const bytes = parsed.getBuffer(reference.bufferId);
        const computed = await sha256Hex(PROFILE_ASSET_DOMAIN, bytes);
        if (computed !== reference.sha256) {
            failBakeSource('lighting_profile_digest_mismatch', `Lighting profile '${profile.id}' bytes do not match its digest.`, {
                id: profile.id,
                expected: reference.sha256,
                actual: computed
            });
        }
    }
    return { textureSources, textureBindings, alphaById, materialById };
}

async function validateSemanticRelationships(manifest, parsed, bufferDescriptors, inventories, semanticCatalog, reconstructedById) {
    const categoriesByName = new Map(manifest.categories.map((entry) => [entry.category, entry]));
    const rootsById = recordsById(manifest.roots);
    const objectsById = recordsById(manifest.objects);
    const geometriesById = recordsById(manifest.geometries);
    const instancesById = recordsById(manifest.meshInstances);
    const materialsById = semanticCatalog.materialById;
    const channelIds = inventories.channelProfiles;
    const lightingProfileIds = inventories.lightingProfiles;
    const directionComparisons = { normal: 0, tangent: 0 };

    for (const category of manifest.categories) {
        if (category.id !== `category/${encodeIdSegment(category.category)}`) {
            failBakeSource('category_identity_mismatch', `Category '${category.id}' does not match its semantic name.`, {
                id: category.id,
                category: category.category ?? null
            });
        }
    }
    for (const root of manifest.roots) {
        if (!root.provenance || typeof root.provenance !== 'object' || Array.isArray(root.provenance)
            || Object.keys(root.provenance).length === 0) {
            failBakeSource('root_provenance_missing', `Root '${root.id}' has no structured provenance.`, { id: root.id });
        }
        if (typeof root.category !== 'string' || !root.category || !categoriesByName.has(root.category)) {
            failBakeSource('root_category_invalid', `Root '${root.id}' has no stable category.`, { id: root.id });
        }
        if (!['ignore_camera_pvs_root_visibility', 'respect_evaluated_root_visibility'].includes(root.visibilityPolicy)) {
            failBakeSource('root_visibility_policy_unsupported', `Root '${root.id}' has an unsupported visibility policy.`, {
                id: root.id,
                visibilityPolicy: root.visibilityPolicy ?? null
            });
        }
    }

    const expectedGeometryObjects = new Map(manifest.geometries.map((geometry) => [geometry.id, []]));
    const expectedCategoryInventory = new Map();
    const expectedChunkInventory = new Map();
    const expectedReceiverIds = new Set();
    const expectedCasterIds = new Set();
    const expectedParticipantIds = new Set();
    const expectedUnsupportedCases = new Map();
    const expectedSemanticConflicts = new Map();
    const objectAccessorData = new Map();
    const expectedGeometryBufferRoles = new Map();
    const referencedBufferIds = new Set();
    const addGeometryBufferRole = (accessor, role) => {
        referencedBufferIds.add(accessor.bufferId);
        const roles = expectedGeometryBufferRoles.get(accessor.bufferId) ?? new Set();
        roles.add(role);
        expectedGeometryBufferRoles.set(accessor.bufferId, roles);
    };

    for (const geometry of manifest.geometries) {
        for (const [name, accessor] of Object.entries(geometry.attributes)) {
            addGeometryBufferRole(accessor, `geometry_attribute:${name}`);
        }
        if (geometry.index) addGeometryBufferRole(geometry.index, 'geometry_index');
    }

    for (const object of manifest.objects) {
        const path = `objects.${object.id}`;
        requireReference(inventories.roots, object.rootId, `${path}.rootId`);
        requireReference(inventories.geometries, object.geometryId, `${path}.geometryId`);
        const root = rootsById.get(object.rootId);
        const geometry = geometriesById.get(object.geometryId);
        if (object.category !== root.category || !categoriesByName.has(object.category)) {
            failBakeSource('object_category_mismatch', `Object '${object.id}' category does not match its root.`, {
                id: object.id,
                objectCategory: object.category ?? null,
                rootCategory: root.category ?? null
            });
        }
        if (!object.provenance || object.provenance.rootId !== object.rootId
            || object.provenance.semanticPath !== object.semanticPath
            || object.provenance.sourceKind !== object.sourceKind) {
            failBakeSource('object_provenance_mismatch', `Object '${object.id}' provenance does not reconstruct.`, { id: object.id });
        }
        if (!['Mesh', 'InstancedMesh'].includes(object.sourceKind)
            || !['geometry_groups', 'single_material_draw_range'].includes(object.materialGroupingMode)
            || !Number.isSafeInteger(object.materialSlotCount) || object.materialSlotCount < 1
            || !Array.isArray(object.materialIds) || !Array.isArray(object.materialSlots)
            || object.materialIds.length !== object.materialSlots.length || object.materialSlots.length < 1) {
            failBakeSource('object_shape_invalid', `Object '${object.id}' has inconsistent source/material shape.`, { id: object.id });
        }
        let previousMaterialIndex = -1;
        for (const slot of object.materialSlots) {
            if (!slot || !Number.isSafeInteger(slot.index) || slot.index < 0 || slot.index >= object.materialSlotCount
                || slot.index <= previousMaterialIndex || typeof slot.id !== 'string' || !slot.id) {
                failBakeSource('object_material_slots_invalid', `Object '${object.id}' active material slots are invalid.`, {
                    id: object.id,
                    slot: slot ?? null
                });
            }
            previousMaterialIndex = slot.index;
        }
        requireCanonicalMatch(
            object.materialIds,
            object.materialSlots.map((entry) => entry.id),
            'object_material_slots_invalid',
            `Object '${object.id}' material IDs do not match its active slots.`,
            { id: object.id }
        );
        if (object.id !== `object/${encodeIdPath(object.rootId)}/${object.semanticPath}`) {
            failBakeSource('object_identity_mismatch', `Object '${object.id}' does not match its root and semantic path.`, { id: object.id });
        }
        if (typeof object.resolvedCaster !== 'boolean' || typeof object.resolvedReceiver !== 'boolean'
            || typeof object.mergeShadowAsOpaque !== 'boolean') {
            failBakeSource('object_policy_invalid', `Object '${object.id}' has incomplete caster/receiver policy.`, { id: object.id });
        }
        for (const materialId of object.materialIds) requireReference(inventories.materials, materialId, `${path}.materialIds`);
        const instanceIds = requireSortedReferenceArray(object.instanceIds, `${path}.instanceIds`);
        for (const instanceId of instanceIds) requireReference(inventories.meshInstances, instanceId, `${path}.instanceIds`);

        let instanceMatrixData = null;
        let instanceColorData = null;
        if (object.sourceKind === 'InstancedMesh') {
            instanceMatrixData = validateAccessor(object.instanceMatrix, parsed, bufferDescriptors, `${path}.instanceMatrix`);
            addGeometryBufferRole(object.instanceMatrix, 'instance_attribute:matrix');
            if (object.instanceMatrix.semanticName !== 'instanceMatrix' || typeof object.instanceMatrix.name !== 'string'
                || object.instanceMatrix.itemSize !== 16 || object.instanceMatrix.normalized
                || !['f32', 'f64'].includes(object.instanceMatrix.componentType)
                || object.instanceMatrix.count !== object.instanceIds.length) {
                failBakeSource('instance_matrix_shape_invalid', `Object '${object.id}' instance matrix accessor is inconsistent.`, { id: object.id });
            }
            if (object.instanceColor) {
                instanceColorData = validateAccessor(object.instanceColor, parsed, bufferDescriptors, `${path}.instanceColor`);
                addGeometryBufferRole(object.instanceColor, 'instance_attribute:color');
                if (object.instanceColor.semanticName !== 'instanceColor' || typeof object.instanceColor.name !== 'string'
                    || ![3, 4].includes(object.instanceColor.itemSize)
                    || object.instanceColor.count !== object.instanceIds.length) {
                    failBakeSource('instance_color_shape_invalid', `Object '${object.id}' instance color accessor is inconsistent.`, { id: object.id });
                }
            }
        } else if (object.instanceMatrix !== null || object.instanceColor !== null || object.instanceIds.length !== 1) {
            failBakeSource('ordinary_mesh_instance_shape_invalid', `Ordinary mesh '${object.id}' must own exactly one base instance.`, { id: object.id });
        }
        objectAccessorData.set(object.id, { instanceMatrixData, instanceColorData });
        expectedGeometryObjects.get(object.geometryId).push(object.id);

        const category = expectedCategoryInventory.get(object.category) ?? {
            id: `category/${encodeIdSegment(object.category)}`,
            category: object.category,
            objectCount: 0,
            meshInstanceCount: 0,
            expandedVertexCount: 0,
            expandedTriangleCount: 0
        };
        category.objectCount += 1;
        category.meshInstanceCount += object.instanceIds.length;
        category.expandedVertexCount += geometry.vertexCount * object.instanceIds.length;
        category.expandedTriangleCount += geometry.triangleCount * object.instanceIds.length;
        expectedCategoryInventory.set(object.category, category);

        const ranges = effectiveMappingRanges(object, geometry);
        for (const range of ranges) {
            const materialId = materialIdForSlot(object, range.materialIndex);
            const material = materialsById.get(materialId);
            if (!material) continue;
            const visible = material.visible !== false;
            const casterCoverageSupport = object.mergeShadowAsOpaque && material.alpha.mode !== 'opaque'
                ? { supported: true, reasons: [] }
                : material.channelSupport.static_sun_depth;
            const requirements = [
                ['static_sun_depth', 'caster', object.resolvedCaster && visible, casterCoverageSupport],
                ['direct_receiver', 'receiver', object.resolvedReceiver && visible, material.channelSupport.direct_receiver],
                ['direct_receiver', 'caster', object.resolvedCaster && visible, casterCoverageSupport],
                ['indirect_irradiance', 'participant', visible, material.channelSupport.indirect_irradiance],
                ['static_ao_bent_normal', 'participant', visible, material.channelSupport.static_ao_bent_normal]
            ];
            for (const [channelId, role, relevant, support] of requirements) {
                if (relevant && support?.supported === false) {
                    const id = `unsupported/${channelId}/${role}/${materialId}`;
                    expectedUnsupportedCases.set(id, {
                        id,
                        channelId,
                        role,
                        materialId,
                        reasons: support.reasons
                    });
                }
            }
            if (object.mergeShadowAsOpaque && material.alpha.mode !== 'opaque') {
                const id = `spec-runtime-conflict/${object.id}/${String(range.groupIndex).padStart(4, '0')}`;
                expectedSemanticConflicts.set(id, {
                    id,
                    code: 'SPEC_RUNTIME_SEMANTIC_CONFLICT',
                    objectId: object.id,
                    materialId,
                    resolvedBehavior: 'forced_opaque_shadow_silhouette'
                });
            }
        }
        for (const instanceId of object.instanceIds) {
            for (const range of ranges) {
                const material = materialsById.get(materialIdForSlot(object, range.materialIndex));
                if (!material) {
                    failBakeSource('material_group_reference_missing', `Object '${object.id}' has no material for group ${range.groupIndex}.`, {
                        id: object.id,
                        groupIndex: range.groupIndex,
                        materialIndex: range.materialIndex
                    });
                }
                const suffix = `${instanceId}/group/${String(range.groupIndex).padStart(4, '0')}`;
                if (material.visible !== false) expectedParticipantIds.add(`participant/${suffix}`);
                if (object.resolvedReceiver && material.visible !== false) expectedReceiverIds.add(`receiver/${suffix}`);
                if (object.resolvedCaster && material.visible !== false) expectedCasterIds.add(`caster/${suffix}`);
            }
        }
    }

    for (const geometry of manifest.geometries) {
        const expected = expectedGeometryObjects.get(geometry.id).sort();
        requireCanonicalMatch(
            geometry.objectIds,
            expected,
            'geometry_reverse_reference_mismatch',
            `Geometry '${geometry.id}' object reverse references do not reconstruct.`,
            { id: geometry.id }
        );
    }

    for (const instance of manifest.meshInstances) {
        const path = `meshInstances.${instance.id}`;
        requireReference(inventories.objects, instance.objectId, `${path}.objectId`);
        requireReference(inventories.roots, instance.rootId, `${path}.rootId`);
        requireReference(inventories.geometries, instance.geometryId, `${path}.geometryId`);
        requireReference(inventories.chunks, instance.chunkId, `${path}.chunkId`);
        const object = objectsById.get(instance.objectId);
        const geometry = geometriesById.get(instance.geometryId);
        if (instance.rootId !== object.rootId || instance.category !== object.category
            || instance.geometryId !== object.geometryId) {
            failBakeSource('instance_object_reference_mismatch', `Mesh instance '${instance.id}' does not match its owning object.`, { id: instance.id });
        }
        requireCanonicalMatch(
            instance.materialIds,
            object.materialIds,
            'instance_material_reference_mismatch',
            `Mesh instance '${instance.id}' material slots do not match its object.`,
            { id: instance.id }
        );
        const sourceIndex = instance.sourceIndex;
        const expectedId = object.sourceKind === 'Mesh'
            ? `${object.id}/instance/base`
            : `${object.id}/instance/${String(sourceIndex).padStart(8, '0')}`;
        if (instance.id !== expectedId
            || (object.sourceKind === 'Mesh' && (sourceIndex !== null || instance.instanceColorElement !== null))
            || (object.sourceKind === 'InstancedMesh'
                && (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= object.instanceIds.length
                    || instance.instanceColorElement !== (object.instanceColor ? sourceIndex : null)))) {
            failBakeSource('instance_identity_mismatch', `Mesh instance '${instance.id}' source identity is inconsistent.`, { id: instance.id });
        }

        requireFiniteVector(instance.matrixThreeWorld, 16, `${path}.matrixThreeWorld`);
        requireFiniteVector(instance.matrixBlenderWorld, 16, `${path}.matrixBlenderWorld`);
        let transform;
        try {
            transform = validateAffineTransform(instance.matrixThreeWorld, path);
        } catch (error) {
            failBakeSource('instance_transform_invalid', `Mesh instance '${instance.id}' has an invalid world transform.`, {
                id: instance.id,
                reason: error instanceof Error ? error.message : String(error)
            });
        }
        if (!withinAbsoluteTolerance(instance.determinant, transform.determinant, 1e-9)) {
            failBakeSource('instance_determinant_mismatch', `Mesh instance '${instance.id}' determinant does not reconstruct.`, {
                id: instance.id,
                expected: transform.determinant,
                actual: instance.determinant ?? null
            });
        }
        const converted = convertThreeMatrixToBlender(instance.matrixThreeWorld);
        if (converted.some((value, index) => !withinAbsoluteTolerance(value, instance.matrixBlenderWorld[index], MATRIX_ABSOLUTE_TOLERANCE))) {
            failBakeSource('round_trip_transform_mismatch', `Mesh instance '${instance.id}' basis conversion does not reconstruct.`, { id: instance.id });
        }
        const inverseConverted = convertBlenderMatrixToThree(instance.matrixBlenderWorld);
        if (inverseConverted.some((value, index) =>
            !withinAbsoluteTolerance(value, instance.matrixThreeWorld[index], MATRIX_ABSOLUTE_TOLERANCE))) {
            failBakeSource('round_trip_inverse_transform_mismatch', `Mesh instance '${instance.id}' inverse basis conversion does not reconstruct.`, { id: instance.id });
        }
        const reconstructedGeometry = reconstructedById.get(instance.geometryId);
        for (const semanticName of ['normal', 'tangent']) {
            for (const sample of reconstructedGeometry.directionSamples[semanticName] ?? []) {
                validateDirectionRoundTrip(instance, semanticName, sample);
                directionComparisons[semanticName] += 1;
            }
        }
        validateBox(instance.boundsThreeWorld, `${path}.boundsThreeWorld`);
        validateBox(instance.boundsBlenderWorld, `${path}.boundsBlenderWorld`);
        const expectedThreeBounds = transformBounds(geometry.bounds.box, instance.matrixThreeWorld);
        const expectedBlenderBounds = convertThreeBoundsToBlender(expectedThreeBounds);
        if (!boundsMatch(instance.boundsThreeWorld, expectedThreeBounds)
            || !boundsMatch(instance.boundsBlenderWorld, expectedBlenderBounds)) {
            failBakeSource('round_trip_world_bounds_mismatch', `Mesh instance '${instance.id}' world bounds do not reconstruct.`, {
                id: instance.id,
                expectedThreeBounds,
                actualThreeBounds: instance.boundsThreeWorld
            });
        }
        const spatialChunkId = expectedChunkId(instance.category, expectedThreeBounds);
        if (instance.chunkId !== spatialChunkId) {
            failBakeSource('instance_chunk_identity_mismatch', `Mesh instance '${instance.id}' spatial chunk does not reconstruct.`, {
                id: instance.id,
                expected: spatialChunkId,
                actual: instance.chunkId
            });
        }
        const accessorData = objectAccessorData.get(object.id);
        let instanceColor = null;
        if (object.instanceColor) {
            instanceColor = Array.from({ length: object.instanceColor.itemSize }, (_, component) =>
                accessorValue(object.instanceColor, accessorData.instanceColorData, sourceIndex, component));
        }
        const contentHash = await hashCanonicalJsonSha256(
            GEOMETRY_CONTENT_DOMAIN,
            { matrixThreeWorld: instance.matrixThreeWorld, instanceColor }
        );
        requireDigest(instance.contentHash, `${path}.contentHash`);
        if (instance.contentHash !== contentHash) {
            failBakeSource('instance_content_digest_mismatch', `Mesh instance '${instance.id}' content digest does not reconstruct.`, {
                id: instance.id,
                expected: contentHash,
                actual: instance.contentHash
            });
        }
        if (object.sourceKind === 'Mesh') {
            const objectHash = await hashCanonicalJsonSha256(GEOMETRY_CONTENT_DOMAIN, {
                rootId: object.rootId,
                semanticPath: object.semanticPath,
                sourceKind: object.sourceKind,
                geometryId: object.geometryId,
                objectMatrix: instance.matrixThreeWorld,
                instanceCount: 1,
                instanceMatrix: null,
                instanceColor: null
            });
            requireDigest(object.contentHash, `objects.${object.id}.contentHash`);
            if (object.contentHash !== objectHash) {
                failBakeSource('object_content_digest_mismatch', `Object '${object.id}' content digest does not reconstruct.`, {
                    id: object.id,
                    expected: objectHash,
                    actual: object.contentHash
                });
            }
        } else {
            requireDigest(object.contentHash, `objects.${object.id}.contentHash`);
            const localMatrix = Array.from({ length: 16 }, (_, component) =>
                accessorValue(object.instanceMatrix, accessorData.instanceMatrixData, sourceIndex, component));
            try {
                validateAffineTransform(localMatrix, `${path}.sourceInstanceMatrix`);
            } catch (error) {
                failBakeSource('instance_transform_invalid', `Mesh instance '${instance.id}' has invalid source instance-matrix bytes.`, {
                    id: instance.id,
                    reason: error instanceof Error ? error.message : String(error)
                });
            }
        }

        let chunk = expectedChunkInventory.get(instance.chunkId);
        if (!chunk) {
            chunk = {
                id: instance.chunkId,
                category: instance.category,
                objectIds: new Set(),
                meshInstanceCount: 0,
                expandedTriangleCount: 0,
                boundsThreeWorld: {
                    min: instance.boundsThreeWorld.min.slice(),
                    max: instance.boundsThreeWorld.max.slice()
                }
            };
            expectedChunkInventory.set(instance.chunkId, chunk);
        }
        if (chunk.category !== instance.category) {
            failBakeSource('chunk_category_mismatch', `Chunk '${instance.chunkId}' spans more than one category.`, { id: instance.chunkId });
        }
        chunk.objectIds.add(instance.objectId);
        chunk.meshInstanceCount += 1;
        chunk.expandedTriangleCount += geometry.triangleCount;
        for (let component = 0; component < 3; component += 1) {
            chunk.boundsThreeWorld.min[component] = Math.min(chunk.boundsThreeWorld.min[component], instance.boundsThreeWorld.min[component]);
            chunk.boundsThreeWorld.max[component] = Math.max(chunk.boundsThreeWorld.max[component], instance.boundsThreeWorld.max[component]);
        }
    }

    for (const object of manifest.objects) {
        const actual = manifest.meshInstances.filter((instance) => instance.objectId === object.id).map((instance) => instance.id).sort();
        requireCanonicalMatch(
            object.instanceIds,
            actual,
            'object_instance_reverse_reference_mismatch',
            `Object '${object.id}' instance reverse references do not reconstruct.`,
            { id: object.id }
        );
    }
    const expectedCategories = Array.from(expectedCategoryInventory.values()).sort((left, right) => left.id < right.id ? -1 : 1);
    requireCanonicalMatch(
        manifest.categories,
        expectedCategories,
        'category_inventory_mismatch',
        'Category inventory does not reconstruct from objects and geometry.'
    );
    const expectedChunks = Array.from(expectedChunkInventory.values(), (chunk) => ({
        id: chunk.id,
        category: chunk.category,
        objectCount: chunk.objectIds.size,
        meshInstanceCount: chunk.meshInstanceCount,
        expandedTriangleCount: chunk.expandedTriangleCount,
        boundsThreeWorld: chunk.boundsThreeWorld
    })).sort((left, right) => left.id < right.id ? -1 : 1);
    requireCanonicalMatch(
        manifest.chunks,
        expectedChunks,
        'chunk_inventory_mismatch',
        'Chunk inventory does not reconstruct from mesh instances.'
    );

    for (const mappingName of ['participantMappings', 'receiverMappings', 'casterMappings']) {
        const mappingKind = mappingName === 'participantMappings'
            ? 'participant'
            : mappingName === 'receiverMappings' ? 'receiver' : 'caster';
        const expectedIds = mappingKind === 'participant'
            ? expectedParticipantIds
            : mappingKind === 'receiver' ? expectedReceiverIds : expectedCasterIds;
        const actualIds = new Set(manifest[mappingName].map((entry) => entry.id));
        requireCanonicalMatch(
            Array.from(actualIds).sort(),
            Array.from(expectedIds).sort(),
            'mapping_inventory_mismatch',
            `Manifest '${mappingName}' does not reconstruct from object policy.`,
            { mappingName }
        );
        for (const mapping of manifest[mappingName]) {
            const path = `${mappingName}.${mapping.id}`;
            requireReference(inventories.meshInstances, mapping.meshInstanceId, `${path}.meshInstanceId`);
            requireReference(inventories.objects, mapping.objectId, `${path}.objectId`);
            requireReference(inventories.geometries, mapping.geometryId, `${path}.geometryId`);
            requireReference(inventories.materials, mapping.materialId, `${path}.materialId`);
            requireReference(inventories.chunks, mapping.chunkId, `${path}.chunkId`);
            requireReference(inventories.alphaInputs, mapping.alphaInputId, `${path}.alphaInputId`);
            requireBooleanMap(mapping.channelRelevance, channelIds, `${path}.channelRelevance`);
            const instance = instancesById.get(mapping.meshInstanceId);
            const object = objectsById.get(mapping.objectId);
            const geometry = geometriesById.get(mapping.geometryId);
            if (instance.objectId !== object.id || instance.geometryId !== geometry.id
                || mapping.geometryId !== object.geometryId || mapping.chunkId !== instance.chunkId
                || mapping.category !== object.category || mapping.category !== instance.category) {
                failBakeSource('mapping_reference_mismatch', `Mapping '${mapping.id}' ownership references are inconsistent.`, { id: mapping.id });
            }
            const range = effectiveMappingRanges(object, geometry).find((entry) => entry.groupIndex === mapping.groupIndex);
            const expectedMaterialId = range ? materialIdForSlot(object, range.materialIndex) : null;
            if (!range || mapping.materialIndex !== range.materialIndex || mapping.start !== range.start
                || mapping.count !== range.count || mapping.materialId !== expectedMaterialId) {
                failBakeSource('mapping_range_mismatch', `Mapping '${mapping.id}' geometry/material range does not reconstruct.`, { id: mapping.id });
            }
            const alpha = semanticCatalog.alphaById.get(mapping.alphaInputId);
            if (!alpha || alpha.materialId !== mapping.materialId
                || materialsById.get(mapping.materialId).alphaInputId !== mapping.alphaInputId) {
                failBakeSource('mapping_alpha_reference_mismatch', `Mapping '${mapping.id}' alpha input does not match its material.`, { id: mapping.id });
            }
            const expectedId = `${mappingKind}/${mapping.meshInstanceId}/group/${String(mapping.groupIndex).padStart(4, '0')}`;
            if (mapping.id !== expectedId) {
                failBakeSource('mapping_identity_mismatch', `Mapping '${mapping.id}' does not match its stable ownership path.`, {
                    id: mapping.id,
                    expected: expectedId
                });
            }
            const material = materialsById.get(mapping.materialId);
            if (mappingKind === 'participant') {
                const expectedParticipant = {
                    indirect_irradiance: material.channelSupport.indirect_irradiance.supported,
                    static_ao_bent_normal: material.channelSupport.static_ao_bent_normal.supported
                };
                requireCanonicalMatch(
                    mapping.channelRelevance,
                    expectedParticipant,
                    'participant_semantics_mismatch',
                    `Participant mapping '${mapping.id}' channel relevance does not reconstruct.`,
                    { id: mapping.id }
                );
            } else if (mappingKind === 'receiver') {
                const expectedReceiver = {
                    direct_receiver: material.channelSupport.direct_receiver.supported,
                    indirect_irradiance: material.channelSupport.indirect_irradiance.supported,
                    static_ao_bent_normal: material.channelSupport.static_ao_bent_normal.supported
                };
                const expectedUvs = Object.keys(geometry.attributes).filter((name) => /^uv\d*$/.test(name)).sort();
                if (mapping.lightmapMappingId !== `lightmap/${mapping.meshInstanceId}/group/${String(mapping.groupIndex).padStart(4, '0')}`
                    || mapping.geometricNormalAttribute !== (geometry.attributes.normal ? 'normal' : null)
                    || mapping.normalMapPreventsScalarPromotion !== Boolean(material.textureBindings.normalMap)) {
                    failBakeSource('receiver_semantics_mismatch', `Receiver mapping '${mapping.id}' semantics do not reconstruct.`, { id: mapping.id });
                }
                requireCanonicalMatch(mapping.uvSets, expectedUvs, 'receiver_semantics_mismatch', `Receiver mapping '${mapping.id}' UV sets do not reconstruct.`, { id: mapping.id });
                requireCanonicalMatch(mapping.channelRelevance, expectedReceiver, 'receiver_semantics_mismatch', `Receiver mapping '${mapping.id}' channel relevance does not reconstruct.`, { id: mapping.id });
            } else {
                const coverageMode = object.mergeShadowAsOpaque
                    ? 'forced_opaque'
                    : material.alpha.mode === 'opaque'
                        ? 'opaque'
                        : material.alpha.mode === 'cutout'
                            ? 'cutout'
                            : material.alpha.mode === 'procedural_coverage'
                                ? 'procedural_coverage'
                                : 'unsupported_blend_or_transmission';
                const supported = coverageMode !== 'unsupported_blend_or_transmission';
                const expectedCaster = {
                    static_sun_depth: supported,
                    direct_receiver: supported,
                    indirect_irradiance: supported,
                    static_ao_bent_normal: supported
                };
                if (mapping.coverageMode !== coverageMode || mapping.side !== material.side
                    || mapping.shadowSide !== material.shadowSide
                    || mapping.policySource !== (object.mergeShadowAsOpaque ? 'mergeShadowAsOpaque' : 'evaluated_original_caster')) {
                    failBakeSource('caster_semantics_mismatch', `Caster mapping '${mapping.id}' semantics do not reconstruct.`, { id: mapping.id });
                }
                requireCanonicalMatch(mapping.channelRelevance, expectedCaster, 'caster_semantics_mismatch', `Caster mapping '${mapping.id}' channel relevance does not reconstruct.`, { id: mapping.id });
            }
        }
    }

    for (const channel of manifest.channelProfiles) {
        const references = [channel.lightProfileId, ...(channel.lightProfileIds ?? [])].filter(Boolean);
        if (new Set(references).size !== references.length) {
            failBakeSource('channel_profile_reference_duplicate', `Channel '${channel.id}' repeats a lighting-profile reference.`, { id: channel.id });
        }
        for (const profileId of references) requireReference(lightingProfileIds, profileId, `channelProfiles.${channel.id}`);
    }
    requireCanonicalMatch(
        manifest.source.unsupportedCases,
        Array.from(expectedUnsupportedCases.values()).sort((left, right) => left.id < right.id ? -1 : 1),
        'unsupported_case_inventory_mismatch',
        'Unsupported material/channel cases do not reconstruct from evaluated policy.'
    );
    requireCanonicalMatch(
        manifest.source.semanticConflicts,
        Array.from(expectedSemanticConflicts.values()).sort((left, right) => left.id < right.id ? -1 : 1),
        'semantic_conflict_inventory_mismatch',
        'Runtime/spec semantic conflicts do not reconstruct from evaluated policy.'
    );
    for (const unsupported of manifest.source.unsupportedCases ?? []) {
        requireReference(channelIds, unsupported.channelId, `source.unsupportedCases.${unsupported.id}.channelId`);
        requireReference(inventories.materials, unsupported.materialId, `source.unsupportedCases.${unsupported.id}.materialId`);
    }
    for (const conflict of manifest.source.semanticConflicts ?? []) {
        requireReference(inventories.objects, conflict.objectId, `source.semanticConflicts.${conflict.id}.objectId`);
        requireReference(inventories.materials, conflict.materialId, `source.semanticConflicts.${conflict.id}.materialId`);
    }

    for (const descriptor of manifest.buffers) {
        if (descriptor.kind === 'geometry') {
            if (descriptor.encoding !== 'typed_array_little_endian' || !Array.isArray(descriptor.roles)) {
                failBakeSource('geometry_buffer_descriptor_invalid', `Geometry buffer '${descriptor.id}' descriptor is invalid.`, { id: descriptor.id });
            }
            const expectedRoles = Array.from(expectedGeometryBufferRoles.get(descriptor.id) ?? []).sort();
            requireCanonicalMatch(
                descriptor.roles,
                expectedRoles,
                'geometry_buffer_role_mismatch',
                `Geometry buffer '${descriptor.id}' roles do not reconstruct from accessors.`,
                { id: descriptor.id }
            );
        } else if (descriptor.kind === 'texture_source') {
            requireReference(new Set(semanticCatalog.textureSources.keys()), descriptor.textureSourceId, `buffers.${descriptor.id}.textureSourceId`);
            referencedBufferIds.add(descriptor.id);
            if (!['raw_source', 'typed_array_little_endian'].includes(descriptor.encoding)) {
                failBakeSource('texture_buffer_descriptor_invalid', `Texture buffer '${descriptor.id}' encoding is invalid.`, { id: descriptor.id });
            }
        } else if (descriptor.kind === 'texture_coverage_channel') {
            requireReference(new Set(semanticCatalog.textureSources.keys()), descriptor.textureSourceId, `buffers.${descriptor.id}.textureSourceId`);
            referencedBufferIds.add(descriptor.id);
            if (descriptor.encoding !== 'exact_channel_typed_bytes'
                || !['r', 'g', 'b', 'a'].includes(descriptor.coverageChannel)) {
                failBakeSource('texture_coverage_buffer_descriptor_invalid', `Texture coverage buffer '${descriptor.id}' encoding or channel is invalid.`, { id: descriptor.id });
            }
        } else if (descriptor.kind === 'lighting_profile_source' && descriptor.encoding !== 'raw_source') {
            failBakeSource('profile_buffer_descriptor_invalid', `Profile buffer '${descriptor.id}' encoding is invalid.`, { id: descriptor.id });
        }
    }
    for (const profile of manifest.lightingProfiles) {
        if (profile.sourceReference) referencedBufferIds.add(profile.sourceReference.bufferId);
    }
    const declaredBufferIds = new Set(manifest.buffers.map((entry) => entry.id));
    requireCanonicalMatch(
        Array.from(referencedBufferIds).sort(),
        Array.from(declaredBufferIds).sort(),
        'semantic_buffer_reference_mismatch',
        'Every semantic buffer must be referenced by a geometry, texture source, or lighting profile.'
    );
    return directionComparisons;
}

function validateNamedDigestInventory(entries, name) {
    stableArray(entries, name);
    for (const entry of entries) {
        const keys = Object.keys(entry).sort();
        if (keys.length !== 2 || keys[0] !== 'id' || keys[1] !== 'sha256') {
            failBakeSource('freshness_hash_shape_invalid', `Freshness inventory '${name}' has an invalid entry shape.`, {
                path: name,
                id: entry.id ?? null,
                actual: keys
            });
        }
        requireDigest(entry.sha256, `${name}.${entry.id}.sha256`);
    }
}

async function validateFreshnessHashProjections(manifest) {
    const hashes = manifest.hashes;
    const expectedHashKeys = [
        'channelSources',
        'channels',
        'compiler',
        'geometry',
        'profiles',
        'resolvedSource',
        'schema',
        'usedMaterials'
    ];
    if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)
        || canonicalJsonStringify(Object.keys(hashes).sort()) !== canonicalJsonStringify(expectedHashKeys)) {
        failBakeSource('freshness_hash_shape_invalid', 'Manifest freshness hashes do not have the exact V1 shape.', {
            expected: expectedHashKeys,
            actual: hashes && typeof hashes === 'object' && !Array.isArray(hashes) ? Object.keys(hashes).sort() : null
        });
    }
    if (hashes.schema !== BAKE_SOURCE_HASH_SET_SCHEMA) {
        failBakeSource('freshness_hash_schema_unsupported', 'Manifest freshness hash schema is unsupported.', {
            expected: BAKE_SOURCE_HASH_SET_SCHEMA,
            actual: hashes.schema ?? null
        });
    }
    for (const field of ['resolvedSource', 'geometry', 'usedMaterials', 'compiler']) {
        requireDigest(hashes[field], `hashes.${field}`);
    }
    validateNamedDigestInventory(hashes.profiles, 'hashes.profiles');
    validateNamedDigestInventory(hashes.channels, 'hashes.channels');
    validateNamedDigestInventory(hashes.channelSources, 'hashes.channelSources');

    const geometry = createGeometryFreshnessProjection({
        objects: manifest.objects,
        meshInstances: manifest.meshInstances,
        geometries: manifest.geometries,
        buffers: manifest.buffers.filter((entry) => entry.kind === 'geometry')
    });
    const usedMaterials = createUsedMaterialsFreshnessInventory({
        materials: manifest.materials,
        textures: manifest.textures,
        alphaInputs: manifest.alphaInputs,
        receiverMappings: manifest.receiverMappings,
        casterMappings: manifest.casterMappings,
        participantMappings: manifest.participantMappings
    });
    const resolvedSource = createResolvedSourceFreshnessProjection({
        city: resolvedCitySourceFromManifest(manifest.source),
        sourceProfile: {
            id: manifest.source.exportProfileId,
            coordinateContract: manifest.coordinateContract.id,
            colorContract: manifest.colorContract,
            sourceSelection: manifest.source.sourceSelection
        },
        roots: manifest.roots,
        categories: manifest.categories,
        chunks: manifest.chunks,
        unsupportedCases: manifest.source.unsupportedCases,
        semanticConflicts: manifest.source.semanticConflicts,
        receiverMappings: manifest.receiverMappings
    });
    const computedBase = await buildBakeSourceHashSet({
        resolvedSource,
        geometry,
        usedMaterials,
        profiles: manifest.lightingProfiles,
        channels: manifest.channelProfiles,
        compiler: manifest.compilerReferences
    });
    const computedChannelSources = await buildChannelSourceHashes(
        manifest.channelProfiles,
        computedBase,
        {
            objects: manifest.objects,
            meshInstances: manifest.meshInstances,
            geometries: manifest.geometries,
            receiverMappings: manifest.receiverMappings,
            casterMappings: manifest.casterMappings,
            participantMappings: manifest.participantMappings,
            materials: manifest.materials,
            textures: manifest.textures,
            alphaInputs: manifest.alphaInputs,
            lightingProfiles: manifest.lightingProfiles
        }
    );
    const computed = { ...computedBase, channelSources: computedChannelSources };
    requireCanonicalMatch(
        hashes,
        computed,
        'freshness_hash_projection_mismatch',
        'Manifest freshness hashes do not reconstruct from the parsed semantic records.',
        {
            claimedResolvedSource: hashes.resolvedSource,
            computedResolvedSource: computed.resolvedSource
        }
    );
    return computed;
}

/**
 * Parses package bytes, validates the AI 528 semantic layer, and reconstructs representative data.
 * @param {ArrayBuffer | ArrayBufferView} packageBytes
 * @param {{
 *   resolvedSource?: {
 *     manifest: Record<string, unknown>,
 *     buffers: Array<{ id: string, data: ArrayBuffer | ArrayBufferView }>
 *   }
 * }} [options]
 */
export async function validateResolvedCityBakePackage(packageBytes, options = {}) {
    const parsed = await parseBakeSourcePackage(packageBytes);
    const manifest = parsed.manifest;
    const keys = Object.keys(manifest).sort();
    if (JSON.stringify(keys) !== JSON.stringify(REQUIRED_MANIFEST_KEYS)) {
        failBakeSource('manifest_shape_invalid', 'The bake-source manifest top-level shape is not V1.', {
            expected: REQUIRED_MANIFEST_KEYS,
            actual: keys
        });
    }
    if (manifest.format !== 'bus-sim-illumination-bake-input-v1' || manifest.schemaVersion !== 1) {
        failBakeSource('manifest_version_unsupported', 'The bake-source semantic manifest version is unsupported.', {
            format: manifest.format,
            schemaVersion: manifest.schemaVersion
        });
    }
    if (!manifest.containerVersion || typeof manifest.containerVersion !== 'object' || Array.isArray(manifest.containerVersion)
        || canonicalJsonStringify(manifest.containerVersion) !== '{"major":1,"minor":0}'
        || typeof manifest.colorContract !== 'string' || !manifest.colorContract || manifest.colorContract.trim() !== manifest.colorContract
        || typeof manifest.coordinateContract?.id !== 'string' || !manifest.coordinateContract.id
        || manifest.coordinateContract?.source !== 'three_right_handed_y_up_column_major'
        || manifest.coordinateContract?.target !== 'blender_right_handed_z_up_column_major'
        || manifest.coordinateContract?.units !== 'meters'
        || manifest.coordinateContract?.logicalUvOrigin !== 'lower_left'
        || canonicalJsonStringify(manifest.coordinateContract?.threeToBlenderBasisColumnMajor)
            !== '[1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1]') {
        failBakeSource('manifest_contract_unsupported', 'The bake-source manifest declares an unsupported V1 coordinate, color, or container contract.');
    }
    if (manifest.extractorContract?.sourceHashSetSchema !== BAKE_SOURCE_HASH_SET_SCHEMA) {
        failBakeSource('manifest_contract_unsupported', 'The bake-source extractor contract declares an unsupported hash-set schema.', {
            expected: BAKE_SOURCE_HASH_SET_SCHEMA,
            actual: manifest.extractorContract?.sourceHashSetSchema ?? null
        });
    }
    if (manifest.readiness?.schema !== 'resolved-city-bake-readiness-v1'
        || !Number.isSafeInteger(manifest.readiness.expectedTrees) || manifest.readiness.expectedTrees < 0
        || !Number.isSafeInteger(manifest.readiness.textureStablePasses) || manifest.readiness.textureStablePasses < 0
        || typeof manifest.readiness.lightingProfileSourcesReady !== 'boolean'
        || typeof manifest.readiness.freshSourceEqualityVerified !== 'boolean') {
        failBakeSource('manifest_readiness_invalid', 'The bake-source readiness record is incomplete or invalid.');
    }
    if (!manifest.source || typeof manifest.source !== 'object' || Array.isArray(manifest.source)
        || !Array.isArray(manifest.source.unsupportedCases) || !Array.isArray(manifest.source.semanticConflicts)
        || typeof manifest.source.exportProfileId !== 'string' || !manifest.source.exportProfileId
        || !Object.prototype.hasOwnProperty.call(manifest.source, 'sourceSelection')) {
        failBakeSource('manifest_source_invalid', 'The bake-source manifest source projection is incomplete.');
    }
    stableArray(manifest.source.unsupportedCases, 'source.unsupportedCases');
    stableArray(manifest.source.semanticConflicts, 'source.semanticConflicts');

    const inventories = {};
    for (const name of ['categories', 'chunks', 'roots', 'objects', 'geometries', 'meshInstances', 'materials', 'textures', 'alphaInputs', 'participantMappings', 'receiverMappings', 'casterMappings', 'lightingProfiles', 'channelProfiles', 'compilerReferences', 'buffers']) {
        inventories[name] = stableArray(manifest[name], name);
    }
    const bufferDescriptors = await validateBufferInventory(manifest, parsed);
    const semanticCatalog = await validateSemanticContentDigests(manifest, parsed, bufferDescriptors);
    const reconstructed = await Promise.all(manifest.geometries.map((geometry) =>
        reconstructGeometry(geometry, parsed, bufferDescriptors)));
    const reconstructedById = recordsById(reconstructed);
    const directionComparisons = await validateSemanticRelationships(
        manifest,
        parsed,
        bufferDescriptors,
        inventories,
        semanticCatalog,
        reconstructedById
    );
    await validateFreshnessHashProjections(manifest);
    const expectedSource = options.resolvedSource ?? null;
    const resolvedExportSourceComparison = {
        performed: false,
        verified: false,
        reason: 'No resolved Three.js export source was supplied to this package-only validation call.'
    };
    if (expectedSource) {
        if (!expectedSource.manifest || typeof expectedSource.manifest !== 'object'
            || Array.isArray(expectedSource.manifest) || !Array.isArray(expectedSource.buffers)) {
            failBakeSource('resolved_export_source_invalid', 'Resolved export-source comparison requires a manifest and logical buffer inventory.');
        }
        requireCanonicalMatch(
            manifest,
            expectedSource.manifest,
            'resolved_export_source_manifest_mismatch',
            'Parsed package manifest does not match the manifest derived from the resolved Three.js source.'
        );
        const expectedBuffers = new Map();
        for (const entry of expectedSource.buffers) {
            if (!entry || typeof entry.id !== 'string' || !entry.id || expectedBuffers.has(entry.id)
                || (!ArrayBuffer.isView(entry.data) && !(entry.data instanceof ArrayBuffer))) {
                failBakeSource('resolved_export_source_buffer_invalid', 'Resolved export-source buffers contain an invalid or duplicate logical entry.', {
                    id: entry?.id ?? null
                });
            }
            expectedBuffers.set(entry.id, entry.data);
        }
        if (expectedBuffers.size !== parsed.buffers.length) {
            failBakeSource('resolved_export_source_buffer_inventory_mismatch', 'Parsed package buffer inventory does not match the resolved Three.js source.', {
                packageBufferCount: parsed.buffers.length,
                sourceBufferCount: expectedBuffers.size
            });
        }
        for (const descriptor of parsed.buffers) {
            const sourceData = expectedBuffers.get(descriptor.id);
            if (!sourceData) {
                failBakeSource('resolved_export_source_buffer_missing', `Resolved Three.js source is missing logical buffer '${descriptor.id}'.`, {
                    id: descriptor.id
                });
            }
            const expectedBytes = ArrayBuffer.isView(sourceData)
                ? new Uint8Array(sourceData.buffer, sourceData.byteOffset, sourceData.byteLength)
                : new Uint8Array(sourceData);
            const packageBuffer = parsed.getBuffer(descriptor.id);
            if (packageBuffer.byteLength !== expectedBytes.byteLength
                || packageBuffer.some((value, index) => value !== expectedBytes[index])) {
                failBakeSource('resolved_export_source_buffer_mismatch', `Package buffer '${descriptor.id}' does not match the resolved Three.js source bytes.`, {
                    id: descriptor.id,
                    packageByteLength: packageBuffer.byteLength,
                    sourceByteLength: expectedBytes.byteLength
                });
            }
        }
        resolvedExportSourceComparison.performed = true;
        resolvedExportSourceComparison.verified = true;
        resolvedExportSourceComparison.reason = 'Parsed canonical manifest and every logical package buffer exactly match the fully prewarmed resolved Three.js source used for export.';
    }
    const report = {
        schema: 'bus-sim-illumination-bake-round-trip-report-v1',
        valid: true,
        package: {
            containerSchema: parsed.schema,
            version: parsed.version,
            logicalBufferCount: parsed.bufferCount,
            uniqueBlobCount: parsed.uniqueBufferCount
        },
        checks: {
            canonicalManifest: true,
            semanticInventories: true,
            packageBufferIntegrity: true,
            declaredBufferDigestsRecomputed: true,
            geometryAccessorsAndContentAddresses: true,
            geometryCountsBoundsAndWinding: true,
            objectInstanceAndMappingForeignKeys: true,
            transformsAndWorldBoundsReconstructed: true,
            inverseTransformsAndDirectionParity: true,
            materialTextureAndAlphaContentAddresses: true,
            packageFreshnessProjectionsRecomputed: true,
            ...(resolvedExportSourceComparison.verified
                ? { resolvedExportSourceManifestAndBuffers: true }
                : {})
        },
        freshness: {
            parsedPackageProjectionConsistency: 'verified',
            exporterDeclaredFreshSourceEquality: manifest.readiness?.freshSourceEqualityVerified === true,
            liveResolvedSourceComparison: {
                performed: false,
                verified: false,
                reason: 'This package-only validator has no live resolved city. Runtime activation must independently derive and compare live source hashes.'
            },
            resolvedExportSourceComparison
        },
        counts: {
            roots: manifest.roots.length,
            objects: manifest.objects.length,
            meshInstances: manifest.meshInstances.length,
            geometries: reconstructed.length,
            vertices: reconstructed.reduce((sum, entry) => sum + entry.vertexCount, 0),
            references: reconstructed.reduce((sum, entry) => sum + entry.referenceCount, 0),
            normalDirectionComparisons: directionComparisons.normal,
            tangentDirectionComparisons: directionComparisons.tangent,
            participantMappings: manifest.participantMappings.length,
            receiverMappings: manifest.receiverMappings.length,
            casterMappings: manifest.casterMappings.length
        }
    };
    return { manifest, report };
}
