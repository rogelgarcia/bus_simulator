// Produces immutable, ID-sorted canonical inventories independent of discovery order.
// @ts-check

import {
    assertStableId,
    assertUniqueIds,
    cloneCanonicalJson,
    compareCanonicalStrings
} from './CanonicalJson.js';

/**
 * @typedef {{
 *   label?: string,
 *   idKey?: string
 * }} StableInventoryOptions
 */

/**
 * @param {unknown} items
 * @param {StableInventoryOptions} [options]
 * @returns {readonly Readonly<Record<string, unknown>>[]}
 */
export function createStableInventory(items, options = {}) {
    const label = options.label ?? 'inventory';
    const idKey = options.idKey ?? 'id';
    assertStableId(idKey, label + ' ID key');
    if (!Array.isArray(items)) throw new TypeError(label + ' must be an array');
    const canonicalItems = items.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new TypeError(label + '[' + index + '] must be a plain canonical object');
        }
        const canonical = /** @type {Readonly<Record<string, unknown>>} */ (cloneCanonicalJson(item));
        assertStableId(canonical[idKey], label + '[' + index + '].' + idKey);
        return canonical;
    });
    assertUniqueIds(canonicalItems.map((item) => item[idKey]), label);
    canonicalItems.sort((left, right) => compareCanonicalStrings(
        /** @type {string} */ (left[idKey]),
        /** @type {string} */ (right[idKey])
    ));
    return Object.freeze(canonicalItems);
}

/**
 * @param {Iterable<unknown | PromiseLike<unknown>>} items
 * @param {StableInventoryOptions} [options]
 * @returns {Promise<readonly Readonly<Record<string, unknown>>[]>}
 */
export async function createStableInventoryAsync(items, options = {}) {
    if (typeof items === 'string' || !items || typeof items[Symbol.iterator] !== 'function') {
        throw new TypeError((options.label ?? 'inventory') + ' must be an iterable');
    }
    return createStableInventory(await Promise.all(Array.from(items)), options);
}

/**
 * @param {unknown} items
 * @param {Iterable<unknown>} selectedIds
 * @param {StableInventoryOptions} [options]
 * @returns {readonly Readonly<Record<string, unknown>>[]}
 */
export function selectStableInventoryById(items, selectedIds, options = {}) {
    const label = options.label ?? 'inventory';
    const idKey = options.idKey ?? 'id';
    const inventory = createStableInventory(items, options);
    if (typeof selectedIds === 'string' || !selectedIds || typeof selectedIds[Symbol.iterator] !== 'function') {
        throw new TypeError(label + ' selected IDs must be an iterable of stable IDs');
    }
    const ids = Array.from(selectedIds);
    assertUniqueIds(ids, label + ' selected IDs');
    ids.sort(compareCanonicalStrings);
    const byId = new Map(inventory.map((item) => [item[idKey], item]));
    const selected = ids.map((id) => {
        const item = byId.get(id);
        if (!item) throw new Error(label + ' is missing selected ID "' + id + '"');
        return item;
    });
    return Object.freeze(selected);
}
