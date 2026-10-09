// Encodes and decodes non-interlaced 8-bit and 16-bit gray/gray-alpha/RGB/RGBA PNG rasters without external dependencies.
// @ts-check
// Review images and height/mask interchange must never depend on a native or third-party image library, and identical rasters must
// encode to identical bytes: the codec writes IHDR/IDAT/IEND with CRC-32 on every chunk, compresses through node:zlib at a fixed deflate
// level, decodes all five scanline filters, and on encode uses filter 0 or the per-scanline minimum-sum-of-absolute-differences
// heuristic (ties resolved toward the lowest filter type), so repeated runs are bit identical. Interlaced, palette and sub-byte images
// are rejected rather than partially decoded.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const COLOR_TYPE_OF_CHANNELS = Object.freeze({ 1: 0, 2: 4, 3: 2, 4: 6 });
const CHANNELS_OF_COLOR_TYPE = Object.freeze({ 0: 1, 2: 3, 4: 2, 6: 4 });
const MAXIMUM_DIMENSION = 65536;
const FILTERS = Object.freeze(['none', 'adaptive']);

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

/** @param {Uint8Array} bytes @param {number} [start] @param {number} [end] */
export function crc32(bytes, start = 0, end = bytes.length) {
    let crc = 0xFFFFFFFF;
    for (let i = start; i < end; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function chunk(type, data) {
    const bytes = Buffer.alloc(12 + data.length);
    bytes.writeUInt32BE(data.length, 0);
    bytes.write(type, 4, 'latin1');
    data.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes, 4, 8 + data.length), 8 + data.length);
    return bytes;
}

// filtered[i] for one scanline under one filter type, reading the unfiltered current and prior lines
function filterLine(type, line, prior, bpp, out, offset) {
    const stride = line.length;
    for (let i = 0; i < stride; i++) {
        const x = line[i], a = i >= bpp ? line[i - bpp] : 0, b = prior[i], c = i >= bpp ? prior[i - bpp] : 0;
        let value;
        if (type === 0) value = x;
        else if (type === 1) value = x - a;
        else if (type === 2) value = x - b;
        else if (type === 3) value = x - ((a + b) >> 1);
        else value = x - paeth(a, b, c);
        out[offset + i] = value & 0xFF;
    }
}

function unfilterLine(type, line, prior, bpp) {
    const stride = line.length;
    for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0, b = prior[i], c = i >= bpp ? prior[i - bpp] : 0;
        let value = line[i];
        if (type === 1) value += a;
        else if (type === 2) value += b;
        else if (type === 3) value += (a + b) >> 1;
        else if (type === 4) value += paeth(a, b, c);
        else if (type !== 0) throw new Error(`[PngCodec] Unsupported scanline filter type ${type}`);
        line[i] = value & 0xFF;
    }
}

/**
 * @typedef {{width:number,height:number,channels:1|2|3|4,bitDepth:8|16,data:Uint8Array|Uint16Array}} PngRaster
 */

/** @param {PngRaster & {filter?:'none'|'adaptive',deflateLevel?:number}} raster @returns {Buffer} */
export function encodePng({ width, height, channels, bitDepth, data, filter = 'adaptive', deflateLevel = 9 }) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > MAXIMUM_DIMENSION || height > MAXIMUM_DIMENSION) throw new Error(`[PngCodec] Invalid PNG dimensions ${width}x${height}`);
    if (!(channels in COLOR_TYPE_OF_CHANNELS)) throw new Error(`[PngCodec] Unsupported channel count ${channels}`);
    if (bitDepth !== 8 && bitDepth !== 16) throw new Error(`[PngCodec] Unsupported bit depth ${bitDepth}`);
    if (!FILTERS.includes(filter)) throw new Error(`[PngCodec] Unsupported filter strategy ${filter}`);
    if (!Number.isInteger(deflateLevel) || deflateLevel < 0 || deflateLevel > 9) throw new Error(`[PngCodec] Deflate level must be 0..9`);
    const expectedType = bitDepth === 8 ? Uint8Array : Uint16Array;
    if (!(data instanceof expectedType) || data.length !== width * height * channels) throw new Error(`[PngCodec] PNG data must be a ${expectedType.name} of ${width * height * channels} samples`);
    const bytesPerSample = bitDepth / 8, bpp = channels * bytesPerSample, stride = width * bpp;
    const raw = Buffer.alloc((stride + 1) * height);
    const line = new Uint8Array(stride), prior = new Uint8Array(stride), candidate = new Uint8Array(stride);
    for (let row = 0; row < height; row++) {
        const base = row * width * channels;
        if (bitDepth === 8) line.set(data.subarray(base, base + stride));
        else for (let i = 0; i < width * channels; i++) { const value = data[base + i]; line[i * 2] = value >> 8; line[i * 2 + 1] = value & 0xFF; }
        const offset = row * (stride + 1);
        let chosen = 0;
        if (filter === 'adaptive') {
            let best = Infinity;
            for (let type = 0; type < 5; type++) {
                filterLine(type, line, prior, bpp, candidate, 0);
                let sum = 0;
                for (let i = 0; i < stride; i++) { const v = candidate[i]; sum += v < 128 ? v : 256 - v; }
                if (sum < best) { best = sum; chosen = type; }
            }
        }
        raw[offset] = chosen;
        filterLine(chosen, line, prior, bpp, raw, offset + 1);
        prior.set(line);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
    header[8] = bitDepth; header[9] = COLOR_TYPE_OF_CHANNELS[channels]; header[10] = 0; header[11] = 0; header[12] = 0;
    return Buffer.concat([Buffer.from(SIGNATURE), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: deflateLevel })), chunk('IEND', Buffer.alloc(0))]);
}

/** @param {Uint8Array} input @returns {PngRaster} */
export function decodePng(input) {
    const bytes = input instanceof Uint8Array ? input : null;
    if (!bytes || bytes.length < SIGNATURE.length + 12) throw new Error('[PngCodec] PNG input must be a byte array with at least a signature and one chunk');
    for (let i = 0; i < SIGNATURE.length; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('[PngCodec] Missing PNG signature');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = SIGNATURE.length, header = null, ended = false;
    const idat = [];
    while (at < bytes.length) {
        if (at + 12 > bytes.length) throw new Error('[PngCodec] Truncated PNG chunk header');
        const length = view.getUint32(at), type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
        const dataStart = at + 8, dataEnd = dataStart + length;
        if (dataEnd + 4 > bytes.length) throw new Error(`[PngCodec] Truncated PNG chunk ${type}`);
        if (crc32(bytes, at + 4, dataEnd) !== view.getUint32(dataEnd)) throw new Error(`[PngCodec] CRC mismatch in PNG chunk ${type}`);
        if (type === 'IHDR') {
            if (header || length !== 13) throw new Error('[PngCodec] Invalid or repeated IHDR');
            header = { width: view.getUint32(dataStart), height: view.getUint32(dataStart + 4), bitDepth: bytes[dataStart + 8], colorType: bytes[dataStart + 9],
                compression: bytes[dataStart + 10], filterMethod: bytes[dataStart + 11], interlace: bytes[dataStart + 12] };
        } else if (type === 'IDAT') {
            if (!header) throw new Error('[PngCodec] IDAT before IHDR');
            idat.push(bytes.subarray(dataStart, dataEnd));
        } else if (type === 'IEND') { ended = true; at = dataEnd + 4; break; }
        at = dataEnd + 4;
    }
    if (!header || !ended) throw new Error('[PngCodec] PNG is missing IHDR or IEND');
    const { width, height, bitDepth, colorType } = header;
    if (width <= 0 || height <= 0 || width > MAXIMUM_DIMENSION || height > MAXIMUM_DIMENSION) throw new Error(`[PngCodec] Invalid PNG dimensions ${width}x${height}`);
    if (!(colorType in CHANNELS_OF_COLOR_TYPE)) throw new Error(`[PngCodec] Unsupported PNG color type ${colorType} (palette images are not supported)`);
    if (bitDepth !== 8 && bitDepth !== 16) throw new Error(`[PngCodec] Unsupported PNG bit depth ${bitDepth}`);
    if (header.compression !== 0 || header.filterMethod !== 0) throw new Error('[PngCodec] Unsupported PNG compression or filter method');
    if (header.interlace !== 0) throw new Error('[PngCodec] Interlaced PNG is not supported');
    const channels = /** @type {1|2|3|4} */ (CHANNELS_OF_COLOR_TYPE[colorType]), bpp = channels * bitDepth / 8, stride = width * bpp;
    const raw = inflateSync(Buffer.concat(idat));
    if (raw.length !== (stride + 1) * height) throw new Error(`[PngCodec] Decompressed PNG size ${raw.length} differs from ${(stride + 1) * height}`);
    const samples = width * height * channels;
    const data = bitDepth === 8 ? new Uint8Array(samples) : new Uint16Array(samples);
    let prior = new Uint8Array(stride);
    for (let row = 0; row < height; row++) {
        const offset = row * (stride + 1), line = new Uint8Array(raw.buffer, raw.byteOffset + offset + 1, stride);
        unfilterLine(raw[offset], line, prior, bpp);
        const base = row * width * channels;
        if (bitDepth === 8) data.set(line, base);
        else for (let i = 0; i < width * channels; i++) data[base + i] = (line[i * 2] << 8) | line[i * 2 + 1];
        prior = line;
    }
    return { width, height, channels, bitDepth: /** @type {8|16} */ (bitDepth), data };
}
