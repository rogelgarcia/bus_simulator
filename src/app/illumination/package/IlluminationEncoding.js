// Encodes the uncompressed, little-endian texture/buffer payloads owned by AI 530.
// @ts-check

import { copyBytes } from './internal/ByteArrays.js';
import { failIlluminationPackage } from './IlluminationPackageError.js';

const FLOAT32_VALUE = new Float32Array(1);
const FLOAT32_BITS = new Uint32Array(FLOAT32_VALUE.buffer);

export const ILLUMINATION_ENCODING_LAYOUTS = Object.freeze({
    raw_u8: Object.freeze({ bytesPerComponent: 1, components: null, precision: 'uint8' }),
    r8_unorm: Object.freeze({ bytesPerComponent: 1, components: 1, precision: 'unorm8' }),
    rg8_unorm: Object.freeze({ bytesPerComponent: 1, components: 2, precision: 'unorm8' }),
    rgba8_unorm: Object.freeze({ bytesPerComponent: 1, components: 4, precision: 'unorm8' }),
    rgba16f_le: Object.freeze({ bytesPerComponent: 2, components: 4, precision: 'float16' }),
    rgba32f_le: Object.freeze({ bytesPerComponent: 4, components: 4, precision: 'float32' }),
    uint32_le: Object.freeze({ bytesPerComponent: 4, components: 1, precision: 'uint32' })
});

/**
 * Returns the exact decoded byte length implied by a supported descriptor.
 * @param {{encoding: string, precision: string, dimensions: {width: number, height: number, depth: number, components: number}}} descriptor
 */
export function getIlluminationDecodedByteLength(descriptor) {
    const layout = ILLUMINATION_ENCODING_LAYOUTS[descriptor.encoding];
    if (!layout) return null;
    if (descriptor.precision !== layout.precision) {
        failIlluminationPackage('encoding_precision_mismatch', 'Illumination encoding and precision do not agree.', {
            encoding: descriptor.encoding,
            expected: layout.precision,
            actual: descriptor.precision
        });
    }
    const dimensions = descriptor.dimensions;
    for (const key of ['width', 'height', 'depth', 'components']) {
        if (!Number.isSafeInteger(dimensions?.[key]) || dimensions[key] <= 0) {
            failIlluminationPackage('encoding_dimensions_invalid', 'Illumination dimensions must be positive safe integers.', {
                key,
                value: dimensions?.[key] ?? null
            });
        }
    }
    if (layout.components !== null && dimensions.components !== layout.components) {
        failIlluminationPackage('encoding_components_mismatch', 'Illumination encoding has the wrong component count.', {
            encoding: descriptor.encoding,
            expected: layout.components,
            actual: dimensions.components
        });
    }
    const texels = safeProduct(dimensions.width, dimensions.height, dimensions.depth);
    return safeProduct(texels, dimensions.components, layout.bytesPerComponent);
}

/** @param {ArrayLike<number>} values */
export function encodeRgba32fLittleEndian(values) {
    requireRgbaLength(values, 'RGBA32F');
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < values.length; index += 1) {
        const value = finiteNumber(values[index], `RGBA32F value ${index}`);
        const encoded = Math.fround(Object.is(value, -0) ? 0 : value);
        if (!Number.isFinite(encoded)) throw new RangeError(`RGBA32F value ${index} exceeds the finite representable range`);
        view.setFloat32(index * 4, encoded, true);
    }
    return bytes;
}

/** @param {ArrayBuffer | ArrayBufferView} value */
export function decodeRgba32fLittleEndian(value) {
    const bytes = copyBytes(value, 'RGBA32F bytes');
    if (bytes.byteLength % 16 !== 0) throw new TypeError('RGBA32F byte length must be divisible by 16');
    const values = new Float32Array(bytes.byteLength / 4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < values.length; index += 1) values[index] = view.getFloat32(index * 4, true);
    return values;
}

/** @param {ArrayLike<number>} values */
export function encodeRgba16fLittleEndian(values) {
    requireRgbaLength(values, 'RGBA16F');
    const bytes = new Uint8Array(values.length * 2);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < values.length; index += 1) {
        view.setUint16(index * 2, float32ToFloat16Bits(values[index]), true);
    }
    return bytes;
}

/** @param {ArrayBuffer | ArrayBufferView} value */
export function decodeRgba16fLittleEndian(value) {
    const bytes = copyBytes(value, 'RGBA16F bytes');
    if (bytes.byteLength % 8 !== 0) throw new TypeError('RGBA16F byte length must be divisible by 8');
    const values = new Float32Array(bytes.byteLength / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < values.length; index += 1) {
        values[index] = float16BitsToFloat32(view.getUint16(index * 2, true));
    }
    return values;
}

/** @param {ArrayLike<number>} values */
export function encodeUint32LittleEndian(values) {
    if (!values || !Number.isSafeInteger(values.length)) throw new TypeError('Uint32 values must be array-like');
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
            throw new TypeError(`Uint32 value ${index} must be an unsigned 32-bit integer`);
        }
        view.setUint32(index * 4, value, true);
    }
    return bytes;
}

/**
 * Rejects non-finite or non-canonical floating-point payload bits without allocating decoded arrays.
 * @param {ArrayBuffer | ArrayBufferView} value
 * @param {string} encoding
 * @returns {Uint8Array}
 */
export function validateIlluminationEncodedBytes(value, encoding) {
    const bytes = copyBytes(value, 'Illumination encoded bytes');
    if (encoding === 'rgba32f_le') {
        if (bytes.byteLength % 4 !== 0) throw new TypeError('RGBA32F byte length must be divisible by four');
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let offset = 0; offset < bytes.byteLength; offset += 4) {
            const decoded = view.getFloat32(offset, true);
            if (!Number.isFinite(decoded)) {
                failIlluminationPackage('encoding_value_nonfinite', 'RGBA32F payload contains a non-finite value.', { offset });
            }
            if (Object.is(decoded, -0)) {
                failIlluminationPackage('encoding_value_noncanonical', 'RGBA32F payload contains non-canonical negative zero.', { offset });
            }
        }
    } else if (encoding === 'rgba16f_le') {
        if (bytes.byteLength % 2 !== 0) throw new TypeError('RGBA16F byte length must be divisible by two');
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let offset = 0; offset < bytes.byteLength; offset += 2) {
            const bits = view.getUint16(offset, true);
            if ((bits & 0x7c00) === 0x7c00) {
                failIlluminationPackage('encoding_value_nonfinite', 'RGBA16F payload contains a non-finite value.', { offset });
            }
            if (bits === 0x8000) {
                failIlluminationPackage('encoding_value_noncanonical', 'RGBA16F payload contains non-canonical negative zero.', { offset });
            }
        }
    }
    return bytes;
}

/** @param {number} value */
export function float32ToFloat16Bits(value) {
    const finite = finiteNumber(value, 'Float16 value');
    FLOAT32_VALUE[0] = Object.is(finite, -0) ? 0 : finite;
    const bits = FLOAT32_BITS[0];
    const sign = (bits >>> 16) & 0x8000;
    const exponent = (bits >>> 23) & 0xff;
    let mantissa = bits & 0x7fffff;
    if (exponent === 0xff) throw new RangeError('Float16 value must not be infinite or NaN');
    let halfExponent = exponent - 127 + 15;
    if (halfExponent >= 31) throw new RangeError('Float16 value exceeds the finite representable range');
    if (halfExponent <= 0) {
        if (halfExponent < -10) return sign;
        mantissa |= 0x800000;
        const shift = 14 - halfExponent;
        let halfMantissa = mantissa >>> shift;
        const remainder = mantissa & ((1 << shift) - 1);
        const halfway = 1 << (shift - 1);
        if (remainder > halfway || (remainder === halfway && (halfMantissa & 1) !== 0)) halfMantissa += 1;
        return sign | halfMantissa;
    }
    let halfMantissa = mantissa >>> 13;
    const remainder = mantissa & 0x1fff;
    if (remainder > 0x1000 || (remainder === 0x1000 && (halfMantissa & 1) !== 0)) {
        halfMantissa += 1;
        if (halfMantissa === 0x400) {
            halfMantissa = 0;
            halfExponent += 1;
            if (halfExponent >= 31) throw new RangeError('Float16 rounding exceeded the finite representable range');
        }
    }
    return sign | (halfExponent << 10) | halfMantissa;
}

/** @param {number} bits */
export function float16BitsToFloat32(bits) {
    if (!Number.isInteger(bits) || bits < 0 || bits > 0xffff) throw new TypeError('Float16 bits must be an unsigned 16-bit integer');
    const sign = (bits & 0x8000) !== 0 ? -1 : 1;
    const exponent = (bits >>> 10) & 0x1f;
    const mantissa = bits & 0x3ff;
    if (exponent === 0x1f) return mantissa === 0 ? sign * Infinity : NaN;
    if (exponent === 0) {
        if (mantissa === 0) return sign < 0 ? -0 : 0;
        return sign * Math.pow(2, -14) * (mantissa / 1024);
    }
    return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

/** @param {ArrayLike<number>} values @param {string} label */
function requireRgbaLength(values, label) {
    if (!values || !Number.isSafeInteger(values.length) || values.length === 0 || values.length % 4 !== 0) {
        throw new TypeError(label + ' values must be a non-empty array-like sequence divisible by four');
    }
}

/** @param {unknown} value @param {string} label */
function finiteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(label + ' must be finite');
    return value;
}

/** @param {...number} values */
function safeProduct(...values) {
    let result = 1;
    for (const value of values) {
        result *= value;
        if (!Number.isSafeInteger(result)) throw new RangeError('Illumination decoded byte length exceeds the safe integer range');
    }
    return result;
}
