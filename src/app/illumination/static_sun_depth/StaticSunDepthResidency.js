// Gates static-sun depth sampling on an exact, complete and immutable tile set.
// @ts-check

import {canonicalJsonStringify} from '../bake_source/CanonicalJson.js';
import {
    validateStaticSunDepthIdentity,
    validateStaticSunDepthTileSetDescriptor
} from './StaticSunDepthContract.js';
import {unpackStaticSunDepthQuantizedRg8} from './StaticSunDepthEncoding.js';

export const STATIC_SUN_DEPTH_RESIDENCY_SCHEMA = 'static-sun-depth-residency-v1';

/** @type {WeakMap<object, StaticSunDepthResidencyState>} */
const RESIDENCY_STATES = new WeakMap();

/**
 * @typedef {{tileId: string, bytes: ArrayBuffer | ArrayBufferView, verifiedContentSha256: string}}
 * StaticSunDepthTileResource
 */

/**
 * @typedef {{
 *   descriptor: Readonly<import('./StaticSunDepthContract.js').StaticSunDepthTileSetDescriptor>,
 *   tileBytesById: ReadonlyMap<string, Uint8Array>,
 *   tileDescriptorById: ReadonlyMap<string, import('./StaticSunDepthContract.js').StaticSunDepthTileDescriptor>,
 *   status: string
 * }} StaticSunDepthResidencyState
 */

/**
 * @typedef {{
 *   schema: string,
 *   status: string,
 *   active: boolean,
 *   complete: boolean,
 *   identityMatched: boolean,
 *   residentTileCount: number,
 *   requiredTileCount: number,
 *   missingTileIds: readonly string[]
 * }} StaticSunDepthResidency
 */

/**
 * Creates a diagnostic residency value. It becomes active only when the caller
 * supplies the exact expected identity and every verified tile. Tile bytes are
 * snapshotted before validation so caller mutation cannot change active data.
 * `verifiedContentSha256` is deliberately named: cryptographic verification is
 * the package loader's responsibility, while this gate binds that verified
 * result to the descriptor tile ID and digest.
 *
 * @param {unknown} descriptorValue
 * @param {readonly StaticSunDepthTileResource[]} tileResources
 * @param {{expectedIdentity?: unknown}} [options]
 * @returns {Readonly<StaticSunDepthResidency>}
 */
export function createStaticSunDepthResidency(descriptorValue, tileResources, options = {}) {
    const descriptor = validateStaticSunDepthTileSetDescriptor(descriptorValue);
    const normalizedOptions = requireOptions(options);
    if (!Array.isArray(tileResources)) throw new TypeError('tileResources must be an array');
    if (tileResources.length > descriptor.tiles.length) {
        throw new Error('tileResources contains more entries than the descriptor tile set');
    }

    let identityMatched = false;
    let identityWasSupplied = false;
    if (normalizedOptions.hasExpectedIdentity) {
        identityWasSupplied = true;
        const expectedIdentity = validateStaticSunDepthIdentity(normalizedOptions.expectedIdentity);
        identityMatched = canonicalJsonStringify(expectedIdentity)
            === canonicalJsonStringify(descriptor.identity);
    }

    const descriptorTileById = new Map(descriptor.tiles.map((tile) => [tile.id, tile]));
    /** @type {Map<string, Uint8Array>} */
    const tileBytesById = new Map();
    for (let index = 0; index < tileResources.length; index += 1) {
        const resource = requireTileResource(tileResources[index], index);
        const tile = descriptorTileById.get(resource.tileId);
        if (!tile) throw new Error('tileResources[' + index + '] references unknown tile "' + resource.tileId + '"');
        if (tileBytesById.has(resource.tileId)) {
            throw new Error('tileResources contains duplicate tile "' + resource.tileId + '"');
        }
        if (resource.verifiedContentSha256 !== tile.contentSha256) {
            throw new Error('tileResources[' + index + '] verified digest does not match the descriptor');
        }
        const bytes = snapshotBytes(resource.bytes, 'tileResources[' + index + '].bytes');
        const expectedBytes = tile.storedTexels[0] * tile.storedTexels[1] * 2;
        if (bytes.byteLength !== expectedBytes) {
            throw new Error(
                'tileResources[' + index + '] byte length must be exactly ' + expectedBytes
            );
        }
        tileBytesById.set(resource.tileId, bytes);
    }

    const missingTileIds = descriptor.tiles
        .filter((tile) => !tileBytesById.has(tile.id))
        .map((tile) => tile.id);
    const complete = missingTileIds.length === 0;
    if (complete) validateGuardOverlap(descriptor, tileBytesById);

    let status = 'active';
    if (!identityWasSupplied) status = 'identity_unverified';
    else if (!identityMatched) status = 'identity_mismatch';
    else if (!complete) status = 'incomplete';
    const active = status === 'active';
    const residency = Object.freeze({
        schema: STATIC_SUN_DEPTH_RESIDENCY_SCHEMA,
        status,
        active,
        complete,
        identityMatched,
        residentTileCount: tileBytesById.size,
        requiredTileCount: descriptor.tiles.length,
        missingTileIds: Object.freeze(missingTileIds)
    });
    RESIDENCY_STATES.set(residency, {
        descriptor,
        tileBytesById,
        tileDescriptorById: descriptorTileById,
        status
    });
    return residency;
}

/**
 * Creates an active set or throws. This is the production sampling gate: no
 * partial or identity-unverified set can be promoted through this function.
 *
 * @param {unknown} descriptorValue
 * @param {readonly StaticSunDepthTileResource[]} tileResources
 * @param {{expectedIdentity?: unknown}} [options]
 * @returns {Readonly<StaticSunDepthResidency>}
 */
export function createStaticSunDepthActiveSet(descriptorValue, tileResources, options = {}) {
    const residency = createStaticSunDepthResidency(descriptorValue, tileResources, options);
    if (!residency.active) {
        throw new Error('static sun depth active-set gate rejected residency: ' + residency.status);
    }
    return residency;
}

/**
 * Internal sampler bridge. It intentionally exposes no tile buffers through
 * the public barrel and rejects forged lookalike objects.
 *
 * @param {unknown} residency
 * @returns {StaticSunDepthResidencyState}
 */
export function getStaticSunDepthResidencyMetadata(residency) {
    const state = requireResidencyState(residency);
    return Object.freeze({descriptor: state.descriptor, status: state.status});
}

/**
 * Reads one packed value without exposing the owned tile allocation.
 *
 * @param {unknown} residency
 * @param {string} tileId
 * @param {number} storedX
 * @param {number} storedY
 * @returns {number | null}
 */
export function readStaticSunDepthResidentQuantized(residency, tileId, storedX, storedY) {
    const state = requireResidencyState(residency);
    const bytes = state.tileBytesById.get(tileId);
    if (!bytes) return null;
    const tile = state.tileDescriptorById.get(tileId);
    if (!tile) return null;
    if (!Number.isSafeInteger(storedX)
        || !Number.isSafeInteger(storedY)
        || storedX < 0
        || storedY < 0
        || storedX >= tile.storedTexels[0]
        || storedY >= tile.storedTexels[1]) {
        throw new RangeError('resident tile coordinate is outside storedTexels');
    }
    return unpackStaticSunDepthQuantizedRg8(
        bytes,
        (storedY * tile.storedTexels[0] + storedX) * 2
    );
}

/**
 * @param {unknown} residency
 * @returns {StaticSunDepthResidencyState}
 */
function requireResidencyState(residency) {
    if (!residency || typeof residency !== 'object') {
        throw new TypeError('residency must be created by createStaticSunDepthResidency');
    }
    const state = RESIDENCY_STATES.get(residency);
    if (!state) throw new TypeError('residency must be created by createStaticSunDepthResidency');
    return state;
}

/**
 * Validates that every guard byte equals the canonical owning interior texel.
 * This checks horizontal, vertical and corner overlap in one pass. Coordinates
 * outside the global half-open domain clamp to the nearest domain-edge texel.
 *
 * @param {Readonly<import('./StaticSunDepthContract.js').StaticSunDepthTileSetDescriptor>} descriptor
 * @param {ReadonlyMap<string, Uint8Array>} tileBytesById
 */
function validateGuardOverlap(descriptor, tileBytesById) {
    const layout = descriptor.identity.layout;
    const guard = layout.guardTexels;
    if (guard === 0) return;
    const interiorWidth = layout.interiorTexels[0];
    const interiorHeight = layout.interiorTexels[1];
    const globalWidth = interiorWidth * layout.tileCount[0];
    const globalHeight = interiorHeight * layout.tileCount[1];

    for (const tile of descriptor.tiles) {
        const bytes = /** @type {Uint8Array} */ (tileBytesById.get(tile.id));
        const storedWidth = tile.storedTexels[0];
        const storedHeight = tile.storedTexels[1];
        for (let storedY = 0; storedY < storedHeight; storedY += 1) {
            for (let storedX = 0; storedX < storedWidth; storedX += 1) {
                const isGuard = storedX < guard
                    || storedX >= guard + interiorWidth
                    || storedY < guard
                    || storedY >= guard + interiorHeight;
                if (!isGuard) continue;
                const globalX = tile.coordinates[0] * interiorWidth + storedX - guard;
                const globalY = tile.coordinates[1] * interiorHeight + storedY - guard;
                const actualOffset = (storedY * storedWidth + storedX) * 2;
                const actual = unpackStaticSunDepthQuantizedRg8(bytes, actualOffset);
                const ownerGlobalX = Math.min(globalWidth - 1, Math.max(0, globalX));
                const ownerGlobalY = Math.min(globalHeight - 1, Math.max(0, globalY));
                const ownerTileX = Math.floor(ownerGlobalX / interiorWidth);
                const ownerTileY = Math.floor(ownerGlobalY / interiorHeight);
                const ownerIndex = ownerTileY * layout.tileCount[0] + ownerTileX;
                const ownerTile = descriptor.tiles[ownerIndex];
                const ownerBytes = /** @type {Uint8Array} */ (tileBytesById.get(ownerTile.id));
                const ownerX = guard + ownerGlobalX - ownerTileX * interiorWidth;
                const ownerY = guard + ownerGlobalY - ownerTileY * interiorHeight;
                const ownerOffset = (ownerY * ownerTile.storedTexels[0] + ownerX) * 2;
                const expected = unpackStaticSunDepthQuantizedRg8(ownerBytes, ownerOffset);
                if (actual !== expected) {
                    throw new Error(
                        'tile "' + tile.id + '" guard does not match owning tile "'
                        + ownerTile.id + '" at clamped global texel ['
                        + ownerGlobalX + ', ' + ownerGlobalY + ']'
                    );
                }
            }
        }
    }
}

/**
 * @param {unknown} value
 * @returns {{hasExpectedIdentity: boolean, expectedIdentity: unknown}}
 */
function requireOptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('residency options must be a plain object');
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('residency options must be a plain object');
    }
    const keys = Object.keys(value);
    if (keys.some((key) => key !== 'expectedIdentity')) {
        throw new Error('residency options only supports expectedIdentity');
    }
    if (keys.length === 0) return {hasExpectedIdentity: false, expectedIdentity: undefined};
    const property = Object.getOwnPropertyDescriptor(value, 'expectedIdentity');
    if (!property || !property.enumerable || !Object.prototype.hasOwnProperty.call(property, 'value')) {
        throw new TypeError('residency options expectedIdentity must be an enumerable data property');
    }
    return {hasExpectedIdentity: true, expectedIdentity: property.value};
}

/**
 * @param {unknown} value
 * @param {number} index
 * @returns {StaticSunDepthTileResource}
 */
function requireTileResource(value, index) {
    const label = 'tileResources[' + index + ']';
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(label + ' must be a plain object');
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(label + ' must be a plain object');
    }
    const actual = Object.keys(value).sort();
    const expected = ['bytes', 'tileId', 'verifiedContentSha256'];
    if (actual.length !== expected.length || actual.some((key, keyIndex) => key !== expected[keyIndex])) {
        throw new Error(label + ' must contain exactly: ' + expected.join(', '));
    }
    /** @type {Record<string, unknown>} */
    const resource = {};
    for (const key of expected) {
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (!property || !property.enumerable || !Object.prototype.hasOwnProperty.call(property, 'value')) {
            throw new TypeError(label + '.' + key + ' must be an enumerable data property');
        }
        resource[key] = property.value;
    }
    if (typeof resource.tileId !== 'string' || resource.tileId.length === 0) {
        throw new TypeError(label + '.tileId must be a non-empty string');
    }
    if (typeof resource.verifiedContentSha256 !== 'string') {
        throw new TypeError(label + '.verifiedContentSha256 must be a string');
    }
    return /** @type {StaticSunDepthTileResource} */ (resource);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Uint8Array}
 */
function snapshotBytes(value, label) {
    try {
        if (value instanceof ArrayBuffer) return new Uint8Array(value).slice();
        if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
            return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
        }
    } catch (error) {
        throw new TypeError(label + ' must reference an attached byte buffer', {cause: error});
    }
    throw new TypeError(label + ' must be an ArrayBuffer or ArrayBuffer view');
}
