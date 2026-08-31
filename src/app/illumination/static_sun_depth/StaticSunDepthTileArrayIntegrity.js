// Authenticates and validates an immutable snapshot of an AI 531 RG8 tile array.
// @ts-check

import {rawSha256OwnedHex} from '../package/RawSha256.js';
import {validateStaticSunDepthTileSetDescriptor} from './StaticSunDepthContract.js';

export const STATIC_SUN_DEPTH_TILE_ARRAY_INTEGRITY_SCHEMA =
    'static-sun-depth-tile-array-integrity-v1';

/**
 * @typedef {{tileId: string, layerIndex: number, contentSha256: string}}
 * StaticSunDepthLayerIntegrity
 */

/**
 * @typedef {{
 *   schema: string,
 *   descriptor: Readonly<import('./StaticSunDepthContract.js').StaticSunDepthTileSetDescriptor>,
 *   byteLength: number,
 *   bytesPerLayer: number,
 *   layerCount: number,
 *   validatedGuardTexelCount: number,
 *   layers: readonly Readonly<StaticSunDepthLayerIntegrity>[]
 * }} StaticSunDepthTileArrayIntegrity
 */

/**
 * Authenticates each row-major tile layer and validates every guard texel.
 * The input is copied exactly once, synchronously, before hashing begins so
 * later caller mutation cannot change which bytes are authenticated.
 *
 * @param {unknown} descriptorValue
 * @param {unknown} payloadValue
 * @param {((verifiedPayload: Uint8Array) => unknown) | null} [consumeVerifiedPayload]
 * @returns {Promise<Readonly<StaticSunDepthTileArrayIntegrity>>}
 */
export async function validateStaticSunDepthTileArrayIntegrity(
    descriptorValue,
    payloadValue,
    consumeVerifiedPayload = null
) {
    const prepared = prepareValidation(
        descriptorValue,
        payloadValue,
        consumeVerifiedPayload
    );
    const snapshot = snapshotPayload(prepared.payload);
    return validateOwnedPayload(
        prepared.descriptor,
        snapshot,
        prepared.bytesPerLayer,
        consumeVerifiedPayload
    );
}

/**
 * Authenticates a caller-owned, unaliased payload without allocating another
 * full-array snapshot. The caller must not mutate or expose the bytes until
 * the returned promise settles.
 *
 * @param {unknown} descriptorValue
 * @param {unknown} payloadValue
 * @param {((verifiedPayload: Uint8Array) => unknown) | null} [consumeVerifiedPayload]
 * @returns {Promise<Readonly<StaticSunDepthTileArrayIntegrity>>}
 */
export async function validateOwnedStaticSunDepthTileArrayIntegrity(
    descriptorValue,
    payloadValue,
    consumeVerifiedPayload = null
) {
    const prepared = prepareValidation(
        descriptorValue,
        payloadValue,
        consumeVerifiedPayload
    );
    return validateOwnedPayload(
        prepared.descriptor,
        prepared.payload,
        prepared.bytesPerLayer,
        consumeVerifiedPayload
    );
}

/**
 * @param {unknown} descriptorValue
 * @param {unknown} payloadValue
 * @param {((verifiedPayload: Uint8Array) => unknown) | null} consumeVerifiedPayload
 */
function prepareValidation(descriptorValue, payloadValue, consumeVerifiedPayload) {
    if (consumeVerifiedPayload !== null && typeof consumeVerifiedPayload !== 'function') {
        throw new TypeError('verified static sun depth payload consumer must be a function');
    }
    const descriptor = validateStaticSunDepthTileSetDescriptor(descriptorValue);
    const payload = requireUint8Array(payloadValue);
    const storedWidth = descriptor.tiles[0].storedTexels[0];
    const storedHeight = descriptor.tiles[0].storedTexels[1];
    const bytesPerLayer = storedWidth * storedHeight * 2;
    const expectedByteLength = bytesPerLayer * descriptor.tiles.length;
    if (payload.byteLength !== expectedByteLength) {
        throw new Error(
            'static sun depth tile-array byte length must be exactly '
            + expectedByteLength + ', received ' + payload.byteLength
        );
    }
    return {descriptor, payload, bytesPerLayer};
}

/**
 * @param {Readonly<import('./StaticSunDepthContract.js').StaticSunDepthTileSetDescriptor>} descriptor
 * @param {Uint8Array} payload
 * @param {number} bytesPerLayer
 * @param {((verifiedPayload: Uint8Array) => unknown) | null} consumeVerifiedPayload
 * @returns {Promise<Readonly<StaticSunDepthTileArrayIntegrity>>}
 */
async function validateOwnedPayload(
    descriptor,
    payload,
    bytesPerLayer,
    consumeVerifiedPayload
) {
    const layers = [];
    const mismatches = [];
    for (let layerIndex = 0; layerIndex < descriptor.tiles.length; layerIndex += 1) {
        const tile = descriptor.tiles[layerIndex];
        const start = layerIndex * bytesPerLayer;
        const contentSha256 = await rawSha256OwnedHex(
            payload.subarray(start, start + bytesPerLayer)
        );
        layers.push(Object.freeze({tileId: tile.id, layerIndex, contentSha256}));
        if (contentSha256 !== tile.contentSha256) {
            mismatches.push({tile, layerIndex, contentSha256});
        }
    }
    if (mismatches.length > 0) {
        const mismatch = mismatches[0];
        throw new Error(
            'static sun depth tile layer ' + mismatch.layerIndex
            + ' ("' + mismatch.tile.id + '") SHA-256 mismatch: expected '
            + mismatch.tile.contentSha256 + ', received ' + mismatch.contentSha256
            + (mismatches.length > 1 ? '; mismatched layers: ' + mismatches.length : '')
        );
    }

    const validatedGuardTexelCount = validateGuards(descriptor, payload, bytesPerLayer);
    const integrity = Object.freeze({
        schema: STATIC_SUN_DEPTH_TILE_ARRAY_INTEGRITY_SCHEMA,
        descriptor,
        byteLength: payload.byteLength,
        bytesPerLayer,
        layerCount: descriptor.tiles.length,
        validatedGuardTexelCount,
        layers: Object.freeze(layers)
    });
    consumeVerifiedPayload?.(payload);
    return integrity;
}

/** @param {unknown} value @returns {Uint8Array} */
function requireUint8Array(value) {
    if (!(value instanceof Uint8Array)) {
        throw new TypeError('static sun depth tile-array payload must be a Uint8Array');
    }
    let buffer;
    try {
        buffer = value.buffer;
        void value.byteLength;
    } catch (error) {
        throw new TypeError('static sun depth tile-array payload must have an attached buffer', {
            cause: error
        });
    }
    if (!(buffer instanceof ArrayBuffer)) {
        throw new TypeError(
            'static sun depth tile-array payload must use a non-shared ArrayBuffer'
        );
    }
    return value;
}

/** @param {Uint8Array} value @returns {Uint8Array} */
function snapshotPayload(value) {
    try {
        const snapshot = new Uint8Array(value.byteLength);
        snapshot.set(value);
        return snapshot;
    } catch (error) {
        throw new TypeError('static sun depth tile-array payload could not be snapshotted', {
            cause: error
        });
    }
}

/**
 * @param {Readonly<import('./StaticSunDepthContract.js').StaticSunDepthTileSetDescriptor>} descriptor
 * @param {Uint8Array} payload
 * @param {number} bytesPerLayer
 * @returns {number}
 */
function validateGuards(descriptor, payload, bytesPerLayer) {
    const layout = descriptor.identity.layout;
    const guard = layout.guardTexels;
    if (guard === 0) return 0;
    const interiorWidth = layout.interiorTexels[0];
    const interiorHeight = layout.interiorTexels[1];
    const storedWidth = descriptor.tiles[0].storedTexels[0];
    const storedHeight = descriptor.tiles[0].storedTexels[1];
    const globalWidth = interiorWidth * layout.tileCount[0];
    const globalHeight = interiorHeight * layout.tileCount[1];
    let validatedGuardTexelCount = 0;

    for (let tileIndex = 0; tileIndex < descriptor.tiles.length; tileIndex += 1) {
        const tile = descriptor.tiles[tileIndex];
        for (let storedY = 0; storedY < storedHeight; storedY += 1) {
            for (let storedX = 0; storedX < storedWidth; storedX += 1) {
                if (isInterior(storedX, storedY, guard, interiorWidth, interiorHeight)) continue;
                const globalX = tile.coordinates[0] * interiorWidth + storedX - guard;
                const globalY = tile.coordinates[1] * interiorHeight + storedY - guard;
                const ownerGlobalX = Math.min(globalWidth - 1, Math.max(0, globalX));
                const ownerGlobalY = Math.min(globalHeight - 1, Math.max(0, globalY));
                const ownerTileX = Math.floor(ownerGlobalX / interiorWidth);
                const ownerTileY = Math.floor(ownerGlobalY / interiorHeight);
                const ownerIndex = ownerTileY * layout.tileCount[0] + ownerTileX;
                const ownerTile = descriptor.tiles[ownerIndex];
                const ownerStoredX = guard + ownerGlobalX - ownerTileX * interiorWidth;
                const ownerStoredY = guard + ownerGlobalY - ownerTileY * interiorHeight;
                const actualOffset = tileIndex * bytesPerLayer
                    + (storedY * storedWidth + storedX) * 2;
                const expectedOffset = ownerIndex * bytesPerLayer
                    + (ownerStoredY * storedWidth + ownerStoredX) * 2;
                if (payload[actualOffset] !== payload[expectedOffset]
                    || payload[actualOffset + 1] !== payload[expectedOffset + 1]) {
                    throw new Error(
                        'static sun depth tile "' + tile.id + '" guard ['
                        + storedX + ', ' + storedY + '] does not match owning tile "'
                        + ownerTile.id + '" interior at clamped global texel ['
                        + ownerGlobalX + ', ' + ownerGlobalY + ']'
                    );
                }
                validatedGuardTexelCount += 1;
            }
        }
    }
    return validatedGuardTexelCount;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} guard
 * @param {number} width
 * @param {number} height
 */
function isInterior(x, y, guard, width, height) {
    return x >= guard
        && x < guard + width
        && y >= guard
        && y < guard + height;
}
