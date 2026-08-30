// Serializes strict JSON data with deterministic sorted object keys.
// @ts-check

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
export function compareCanonicalStrings(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

/**
 * @param {unknown} id
 * @param {string} [label]
 * @returns {asserts id is string}
 */
export function assertStableId(id, label = 'ID') {
    if (typeof id !== 'string' || id.length === 0 || id.trim() !== id || CONTROL_CHARACTER_PATTERN.test(id)) {
        throw new TypeError(label + ' must be a non-empty stable string without surrounding whitespace or control characters');
    }
}

/**
 * @param {Iterable<unknown>} ids
 * @param {string} [label]
 */
export function assertUniqueIds(ids, label = 'IDs') {
    if (typeof ids === 'string' || !ids || typeof ids[Symbol.iterator] !== 'function') {
        throw new TypeError(label + ' must be an iterable of stable IDs');
    }
    const seen = new Set();
    for (const id of ids) {
        assertStableId(id, label + ' entry');
        if (seen.has(id)) throw new Error(label + ' contains duplicate ID "' + id + '"');
        seen.add(id);
    }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJsonStringify(value) {
    const active = new Set();
    return encodeCanonicalValue(value, '$', active);
}

/**
 * @param {unknown} value
 * @returns {Uint8Array}
 */
export function canonicalJsonBytes(value) {
    return new TextEncoder().encode(canonicalJsonStringify(value));
}

/**
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
export function cloneCanonicalJson(value) {
    const cloned = JSON.parse(canonicalJsonStringify(value));
    return /** @type {Readonly<T>} */ (freezeJson(cloned));
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Set<object>} active
 * @returns {string}
 */
function encodeCanonicalValue(value, path, active) {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError(path + ' contains a non-finite number');
        return Object.is(value, -0) ? '0' : JSON.stringify(value);
    }
    if (typeof value !== 'object') {
        throw new TypeError(path + ' contains unsupported JSON type "' + typeof value + '"');
    }
    if (active.has(value)) throw new TypeError(path + ' contains a cyclic reference');
    active.add(value);
    try {
        if (Array.isArray(value)) return encodeArray(value, path, active);
        return encodeObject(value, path, active);
    } finally {
        active.delete(value);
    }
}

/**
 * @param {unknown[]} value
 * @param {string} path
 * @param {Set<object>} active
 * @returns {string}
 */
function encodeArray(value, path, active) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError(path + ' contains symbol-keyed array properties');
    }
    const ownKeys = Object.getOwnPropertyNames(value).filter((key) => key !== 'length');
    if (ownKeys.length !== value.length) {
        throw new TypeError(path + ' must be a dense array without custom properties');
    }
    const parts = [];
    for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
            throw new TypeError(path + ' must be a dense array');
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            throw new TypeError(path + '[' + index + '] must be an enumerable data property');
        }
        parts.push(encodeCanonicalValue(descriptor.value, path + '[' + index + ']', active));
    }
    return '[' + parts.join(',') + ']';
}

/**
 * @param {object} value
 * @param {string} path
 * @param {Set<object>} active
 * @returns {string}
 */
function encodeObject(value, path, active) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(path + ' must contain only plain JSON objects');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError(path + ' contains symbol-keyed object properties');
    }
    const keys = Object.getOwnPropertyNames(value).sort(compareCanonicalStrings);
    const parts = [];
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            throw new TypeError(path + '.' + key + ' must be an enumerable data property');
        }
        parts.push(JSON.stringify(key) + ':' + encodeCanonicalValue(descriptor.value, path + '.' + key, active));
    }
    return '{' + parts.join(',') + '}';
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function freezeJson(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    if (Array.isArray(value)) {
        for (const item of value) freezeJson(item);
    } else {
        for (const key of Object.keys(value)) freezeJson(/** @type {Record<string, unknown>} */ (value)[key]);
    }
    return Object.freeze(value);
}
