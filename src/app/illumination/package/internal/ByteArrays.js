// Provides package-owned browser-safe byte copying and hex conversion.
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

/** @param {Uint8Array} bytes */
export function bytesToHex(bytes) {
    let result = '';
    for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
    return result;
}

/** @param {string} value */
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
