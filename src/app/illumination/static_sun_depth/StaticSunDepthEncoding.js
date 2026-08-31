// Encodes the AI 531 static-sun depth channel into two deterministic UNORM bytes.
// @ts-check

export const STATIC_SUN_DEPTH_ENCODING_ID = 'rg8-packed-linear-depth-v1';
export const STATIC_SUN_DEPTH_MAX_QUANTIZED = 65534;
export const STATIC_SUN_DEPTH_EMPTY_QUANTIZED = 65535;

/**
 * @typedef {{
 *   id: string,
 *   quantization: string,
 *   redChannel: string,
 *   greenChannel: string,
 *   minDepthMeters: number,
 *   maxDepthMeters: number,
 *   maxQuantized: number,
 *   emptyQuantized: number
 * }} StaticSunDepthEncoding
 */

/**
 * Quantizes an occupied depth. Empty texels must use
 * STATIC_SUN_DEPTH_EMPTY_QUANTIZED explicitly.
 *
 * @param {number} depthMeters
 * @param {Readonly<StaticSunDepthEncoding>} encoding
 * @returns {number}
 */
export function encodeStaticSunDepthMeters(depthMeters, encoding) {
    assertStaticSunDepthEncoding(encoding);
    if (!Number.isFinite(depthMeters)) throw new TypeError('depthMeters must be finite');
    if (depthMeters < encoding.minDepthMeters || depthMeters > encoding.maxDepthMeters) {
        throw new RangeError('depthMeters is outside the declared encoding range');
    }
    const unitDepth = (depthMeters - encoding.minDepthMeters)
        / (encoding.maxDepthMeters - encoding.minDepthMeters);
    return Math.min(
        STATIC_SUN_DEPTH_MAX_QUANTIZED,
        Math.max(0, Math.round(unitDepth * STATIC_SUN_DEPTH_MAX_QUANTIZED))
    );
}

/**
 * Decodes an occupied depth, or null for the reserved empty value.
 *
 * @param {number} quantized
 * @param {Readonly<StaticSunDepthEncoding>} encoding
 * @returns {number | null}
 */
export function decodeStaticSunDepthMeters(quantized, encoding) {
    assertStaticSunDepthEncoding(encoding);
    assertQuantized(quantized);
    if (quantized === STATIC_SUN_DEPTH_EMPTY_QUANTIZED) return null;
    const unitDepth = quantized / STATIC_SUN_DEPTH_MAX_QUANTIZED;
    return encoding.minDepthMeters
        + unitDepth * (encoding.maxDepthMeters - encoding.minDepthMeters);
}

/**
 * Packs q so R is its high byte and G is its low byte. This is channel order,
 * not host byte order, and is therefore stable on every platform.
 *
 * @param {number} quantized
 * @param {Uint8Array} [target]
 * @param {number} [offset]
 * @returns {Uint8Array}
 */
export function packStaticSunDepthQuantizedRg8(quantized, target = new Uint8Array(2), offset = 0) {
    assertQuantized(quantized);
    if (!(target instanceof Uint8Array)) throw new TypeError('target must be a Uint8Array');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 2 > target.byteLength) {
        throw new RangeError('offset must address two bytes in target');
    }
    target[offset] = quantized >>> 8;
    target[offset + 1] = quantized & 0xff;
    return target;
}

/**
 * @param {Uint8Array} source
 * @param {number} [offset]
 * @returns {number}
 */
export function unpackStaticSunDepthQuantizedRg8(source, offset = 0) {
    if (!(source instanceof Uint8Array)) throw new TypeError('source must be a Uint8Array');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 2 > source.byteLength) {
        throw new RangeError('offset must address two bytes in source');
    }
    return source[offset] * 256 + source[offset + 1];
}

/**
 * @param {unknown} value
 * @returns {asserts value is Readonly<StaticSunDepthEncoding>}
 */
export function assertStaticSunDepthEncoding(value) {
    if (!value || typeof value !== 'object') throw new TypeError('encoding must be an object');
    const encoding = /** @type {Record<string, unknown>} */ (value);
    if (encoding.id !== STATIC_SUN_DEPTH_ENCODING_ID) {
        throw new Error('encoding.id must be "' + STATIC_SUN_DEPTH_ENCODING_ID + '"');
    }
    if (encoding.quantization !== 'linear-endpoints-inclusive-v1') {
        throw new Error('encoding.quantization is unsupported');
    }
    if (encoding.redChannel !== 'quantized-high-byte-v1'
        || encoding.greenChannel !== 'quantized-low-byte-v1') {
        throw new Error('encoding RG channel mapping is unsupported');
    }
    if (!Number.isFinite(encoding.minDepthMeters)
        || !Number.isFinite(encoding.maxDepthMeters)
        || Number(encoding.maxDepthMeters) <= Number(encoding.minDepthMeters)) {
        throw new RangeError('encoding depth range must contain two increasing finite values');
    }
    const minDepthFloat32 = requireFiniteFloat32(
        encoding.minDepthMeters,
        'encoding.minDepthMeters'
    );
    const maxDepthFloat32 = requireFiniteFloat32(
        encoding.maxDepthMeters,
        'encoding.maxDepthMeters'
    );
    const depthRangeFloat32 = Math.fround(maxDepthFloat32 - minDepthFloat32);
    if (!Number.isFinite(depthRangeFloat32) || depthRangeFloat32 <= 0) {
        throw new RangeError('encoding depth range must remain finite and positive in float32');
    }
    if (encoding.maxQuantized !== STATIC_SUN_DEPTH_MAX_QUANTIZED
        || encoding.emptyQuantized !== STATIC_SUN_DEPTH_EMPTY_QUANTIZED) {
        throw new Error('encoding quantized sentinels are unsupported');
    }
}

/** @param {unknown} value @param {string} label */
function requireFiniteFloat32(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(label + ' must be finite');
    }
    const rounded = Math.fround(value);
    if (!Number.isFinite(rounded)) {
        throw new RangeError(label + ' must round to a finite float32 value');
    }
    return rounded;
}

/**
 * @param {number} quantized
 */
function assertQuantized(quantized) {
    if (!Number.isInteger(quantized)
        || quantized < 0
        || quantized > STATIC_SUN_DEPTH_EMPTY_QUANTIZED) {
        throw new RangeError('quantized depth must be an integer from 0 through 65535');
    }
}
