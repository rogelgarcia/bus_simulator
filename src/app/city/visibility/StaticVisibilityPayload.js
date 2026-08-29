// Decodes and validates versioned static-visibility payloads.
// @ts-check

import {
    STATIC_VISIBILITY_CATEGORIES,
    STATIC_VISIBILITY_GEOMETRY_REVISION,
    STATIC_VISIBILITY_HASH_SCHEMA,
    STATIC_VISIBILITY_PROFILE,
    STATIC_VISIBILITY_SCHEMA,
    STATIC_VISIBILITY_VERSION
} from './StaticVisibilityProfile.js';

function failure(reason) {
    return Object.freeze({ ok: false, reason });
}

function decodeBase64Uint32(encoded, expectedWords) {
    if (typeof encoded !== 'string' || !encoded) throw new Error('mask_data_missing');
    let binary = '';
    try {
        binary = atob(encoded);
    } catch {
        throw new Error('mask_data_base64_invalid');
    }
    if (binary.length !== expectedWords * 4) throw new Error('mask_data_length_mismatch');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const view = new DataView(bytes.buffer);
    const words = new Uint32Array(expectedWords);
    for (let index = 0; index < expectedWords; index += 1) words[index] = view.getUint32(index * 4, true);
    return words;
}

export function validateStaticVisibilityPayload(input, expectations) {
    const payload = input && typeof input === 'object' ? input : null;
    const expected = expectations && typeof expectations === 'object' ? expectations : {};
    if (!payload) return failure('payload_missing');
    if (payload.schema !== STATIC_VISIBILITY_SCHEMA) return failure('schema_unsupported');
    if (payload.version !== STATIC_VISIBILITY_VERSION) return failure('version_unsupported');
    if (payload.hashSchema !== STATIC_VISIBILITY_HASH_SCHEMA) return failure('hash_schema_unsupported');
    if (payload.cityId !== expected.cityId) return failure('city_id_mismatch');
    if (payload.cityConfigHash !== expected.cityConfigHash) return failure('city_config_hash_mismatch');
    if (payload.geometryRevision !== STATIC_VISIBILITY_GEOMETRY_REVISION) return failure('geometry_revision_mismatch');
    if (payload.profileId !== STATIC_VISIBILITY_PROFILE.id) return failure('profile_mismatch');

    const map = payload.map && typeof payload.map === 'object' ? payload.map : null;
    if (!map) return failure('map_metadata_missing');
    if (map.width !== expected.mapWidth || map.height !== expected.mapHeight
        || map.tileSize !== expected.tileSize || map.origin?.x !== expected.originX || map.origin?.z !== expected.originZ) {
        return failure('map_metadata_mismatch');
    }
    if (payload.directionCount !== STATIC_VISIBILITY_PROFILE.directionCount) return failure('direction_count_mismatch');

    const units = Array.isArray(payload.units) ? payload.units : null;
    const expectedUnits = Array.isArray(expected.units) ? expected.units : [];
    if (!units || units.length !== expectedUnits.length) return failure('unit_count_mismatch');
    const seenIds = new Set();
    for (let index = 0; index < units.length; index += 1) {
        const unit = units[index];
        const live = expectedUnits[index];
        if (!unit || unit.id !== live?.id || unit.category !== live?.category) return failure('unit_id_mismatch');
        if (seenIds.has(unit.id)) return failure('unit_id_duplicate');
        if (!STATIC_VISIBILITY_CATEGORIES.includes(unit.category)) return failure('unit_category_unsupported');
        seenIds.add(unit.id);
    }

    const mask = payload.mask && typeof payload.mask === 'object' ? payload.mask : null;
    if (!mask || mask.encoding !== 'base64-u32-le') return failure('mask_encoding_unsupported');
    const wordsPerMask = Math.ceil(units.length / 32);
    const entryCount = map.width * map.height * payload.directionCount;
    if (mask.wordsPerMask !== wordsPerMask || mask.entryCount !== entryCount) return failure('mask_shape_mismatch');
    let table;
    try {
        table = decodeBase64Uint32(mask.data, entryCount * wordsPerMask);
    } catch (error) {
        return failure(error instanceof Error ? error.message : 'mask_decode_failed');
    }

    return Object.freeze({
        ok: true,
        reason: null,
        payload: Object.freeze({
            schema: payload.schema,
            version: payload.version,
            cityId: payload.cityId,
            cityConfigHash: payload.cityConfigHash,
            geometryRevision: payload.geometryRevision,
            profileId: payload.profileId,
            directionCount: payload.directionCount,
            bake: payload.bake ?? null
        }),
        units: Object.freeze(units.map((unit) => Object.freeze({ id: unit.id, category: unit.category }))),
        table,
        wordsPerMask,
        entryCount
    });
}
