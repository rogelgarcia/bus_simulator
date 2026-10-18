// Encodes and decodes float32 little-endian row-major rasters (.raw/.r32), the lowest common heightmap interchange format.
// @ts-check
// RAW carries no header, so the caller supplies the dimensions and the byte length is the only consistency check the codec itself can
// make; the interchange metadata sidecar carries everything else (frame, units, hash). Samples are written and read through DataView in
// little-endian order so the bytes are identical on every platform, and a finite float32 round trip is bit exact.

/** @param {Float32Array} values row-major, row 0 first @returns {Buffer} */
export function encodeRaw(values) {
    if (!(values instanceof Float32Array)) throw new Error('[RawCodec] encodeRaw needs a Float32Array of samples');
    const bytes = Buffer.alloc(values.length * 4), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i], true);
    return bytes;
}

/** @param {Uint8Array} bytes @param {number} columns @param {number} rows @returns {Float32Array} */
export function decodeRaw(bytes, columns, rows) {
    if (!(bytes instanceof Uint8Array)) throw new Error('[RawCodec] decodeRaw needs a byte array');
    if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) throw new Error(`[RawCodec] Invalid RAW dimensions ${columns}x${rows}`);
    const n = columns * rows;
    if (bytes.byteLength !== n * 4) throw new Error(`[RawCodec] ${bytes.byteLength} bytes do not hold ${columns}x${rows} float32 samples (${n * 4} bytes expected)`);
    const values = new Float32Array(n), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < n; i++) values[i] = view.getFloat32(i * 4, true);
    return values;
}
