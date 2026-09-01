// CPU mirror of Three r183's post-r167 packDepthToRGBA byte significance.
// @ts-check

/**
 * Decodes one RGBA8 pixel emitted by THREE.RGBADepthPacking.
 * Three r183 stores the most-significant depth byte in red. Its final alpha
 * contribution uses 1 / (255 * 2^24), matching UnpackFactors4 exactly.
 * The all-255 value is the exact cleared/far depth sentinel.
 * @param {Uint8Array|Uint8ClampedArray} bytes
 * @param {number} [offset]
 * @returns {number}
 */
export function unpackThreeRgbaDepthBytes(bytes, offset = 0) {
    const red = bytes[offset];
    const green = bytes[offset + 1];
    const blue = bytes[offset + 2];
    const alpha = bytes[offset + 3];
    if (red === 255 && green === 255 && blue === 255 && alpha === 255) return 1;
    return Math.min(1, Math.max(0,
        red / 256
        + green / 65536
        + blue / 16777216
        + alpha / 4278190080
    ));
}
