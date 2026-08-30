// Provides browser-safe byte-array validation and deterministic composition.
// @ts-check

/**
 * @param {unknown} value
 * @param {string} [label]
 * @returns {Uint8Array}
 */
export function copyBytes(value, label = 'bytes') {
    if (value instanceof Uint8Array) return value.slice();
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    }
    throw new TypeError(label + ' must be an ArrayBuffer or ArrayBuffer view');
}

/**
 * @param {readonly Uint8Array[]} parts
 * @returns {Uint8Array}
 */
export function concatBytes(parts) {
    let byteLength = 0;
    for (const part of parts) {
        if (!(part instanceof Uint8Array)) throw new TypeError('Byte-array part must be a Uint8Array');
        byteLength += part.byteLength;
        if (!Number.isSafeInteger(byteLength)) throw new RangeError('Combined byte length exceeds the safe integer range');
    }
    const result = new Uint8Array(byteLength);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}

/**
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 * @returns {boolean}
 */
export function bytesEqual(left, right) {
    if (left.byteLength !== right.byteLength) return false;
    for (let index = 0; index < left.byteLength; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

/**
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 * @returns {number}
 */
export function compareBytes(left, right) {
    const sharedLength = Math.min(left.byteLength, right.byteLength);
    for (let index = 0; index < sharedLength; index += 1) {
        if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
    }
    if (left.byteLength === right.byteLength) return 0;
    return left.byteLength < right.byteLength ? -1 : 1;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
    let result = '';
    for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
    return result;
}

/**
 * @param {string} value
 * @returns {Uint8Array}
 */
export function hexToBytes(value) {
    if (!/^[0-9a-f]+$/.test(value) || value.length % 2 !== 0) {
        throw new TypeError('Hex value must contain an even number of lowercase hexadecimal characters');
    }
    const result = new Uint8Array(value.length / 2);
    for (let index = 0; index < result.length; index += 1) {
        result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return result;
}
