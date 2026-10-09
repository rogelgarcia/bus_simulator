// Writes and reads OpenEXR 2.0 single-part scanline images holding one float channel, for heightmap and mask interchange.
// @ts-check
// The writer emits NO_COMPRESSION FLOAT scanlines of one channel "Y" with the required header attributes and a custom string attribute
// landscapeMeta, so every EXR this engine produces is self-describing and byte identical across runs. The reader accepts what external
// tools export for heights: NO_COMPRESSION, ZIPS (one line per block) and ZIP (16 lines per block) scanline images (zlib inflate, then
// the EXR byte predictor and the two-half byte interleave undone, as in OpenEXR's ImfZip.cpp), FLOAT or HALF channels (half converted
// exactly to float32), the channel named Y, height, Z or R when several are present, any line order (every block carries its y) and
// sampling 1. Tiled, deep, multi-part files and the other compressions (RLE, PIZ, PXR24, B44, DWA) are rejected explicitly.
// Layout reference: OpenEXR "File Layout" (magic 20000630, version 2 with flags, null-terminated name/type/size attributes, offset
// table of uint64 block offsets, blocks of int32 y, int32 size, data).
import { inflateSync } from 'node:zlib';

export const EXR_MAGIC = 20000630;
export const EXR_COMPRESSION = Object.freeze({ NO_COMPRESSION: 0, RLE: 1, ZIPS: 2, ZIP: 3, PIZ: 4, PXR24: 5, B44: 6, B44A: 7, DWAA: 8, DWAB: 9 });
export const EXR_PIXEL_TYPE = Object.freeze({ UINT: 0, HALF: 1, FLOAT: 2 });
/** Channel names accepted as the height channel, in the priority used when several are present. */
export const EXR_HEIGHT_CHANNELS = Object.freeze(['Y', 'height', 'Z', 'R']);
const COMPRESSION_NAMES = Object.freeze(Object.fromEntries(Object.entries(EXR_COMPRESSION).map(([name, value]) => [value, name])));
const LINES_PER_BLOCK = Object.freeze({ 0: 1, 1: 1, 2: 1, 3: 16, 4: 32, 5: 16, 6: 32, 7: 32, 8: 32, 9: 256 });
const PIXEL_BYTES = Object.freeze({ 0: 4, 1: 2, 2: 4 });
const PIXEL_TYPE_NAMES = Object.freeze({ 0: 'UINT', 1: 'HALF', 2: 'FLOAT' });
const READABLE_COMPRESSIONS = Object.freeze([EXR_COMPRESSION.NO_COMPRESSION, EXR_COMPRESSION.ZIPS, EXR_COMPRESSION.ZIP]);
const FLAG_TILED = 0x200, FLAG_DEEP = 0x800, FLAG_MULTIPART = 0x1000, VERSION_MASK = 0xff;
const MAXIMUM_DIMENSION = 65536, MAXIMUM_NAME = 256;

const int32 = value => { const bytes = Buffer.alloc(4); bytes.writeInt32LE(value, 0); return bytes; };
const float32 = value => { const bytes = Buffer.alloc(4); bytes.writeFloatLE(value, 0); return bytes; };
const cstring = text => Buffer.concat([Buffer.from(text, 'latin1'), Buffer.from([0])]);
const box2i = (xMin, yMin, xMax, yMax) => Buffer.concat([int32(xMin), int32(yMin), int32(xMax), int32(yMax)]);
const attribute = (name, type, value) => Buffer.concat([cstring(name), cstring(type), int32(value.length), value]);

/** Exact half (binary16) to float conversion, subnormals, infinities and NaN included. @param {number} half uint16 */
export function halfToFloat(half) {
    const sign = half & 0x8000 ? -1 : 1, exponent = (half >> 10) & 0x1f, mantissa = half & 0x3ff;
    if (exponent === 0) return sign * mantissa * 2 ** -24;
    if (exponent === 31) return mantissa ? NaN : sign * Infinity;
    return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

/**
 * Encodes one float32 channel "Y" as an uncompressed scanline EXR; `landscapeMeta` (a string, normally JSON) travels as a custom attribute.
 * @param {{width:number,height:number,values:Float32Array,landscapeMeta?:string|null}} image @returns {Buffer}
 */
export function encodeExr({ width, height, values, landscapeMeta = null }) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAXIMUM_DIMENSION || height > MAXIMUM_DIMENSION) throw new Error(`[ExrCodec] Invalid EXR dimensions ${width}x${height}`);
    if (!(values instanceof Float32Array) || values.length !== width * height) throw new Error(`[ExrCodec] EXR data must be a Float32Array of ${width * height} samples`);
    if (landscapeMeta !== null && typeof landscapeMeta !== 'string') throw new Error('[ExrCodec] landscapeMeta must be a string or null');
    const channels = Buffer.concat([cstring('Y'), int32(EXR_PIXEL_TYPE.FLOAT), Buffer.from([0, 0, 0, 0]), int32(1), int32(1), Buffer.from([0])]);
    const attributes = [attribute('channels', 'chlist', channels), attribute('compression', 'compression', Buffer.from([EXR_COMPRESSION.NO_COMPRESSION])),
        attribute('dataWindow', 'box2i', box2i(0, 0, width - 1, height - 1)), attribute('displayWindow', 'box2i', box2i(0, 0, width - 1, height - 1))];
    if (landscapeMeta !== null) attributes.push(attribute('landscapeMeta', 'string', Buffer.from(landscapeMeta, 'utf8')));
    attributes.push(attribute('lineOrder', 'lineOrder', Buffer.from([0])), attribute('pixelAspectRatio', 'float', float32(1)),
        attribute('screenWindowCenter', 'v2f', Buffer.concat([float32(0), float32(0)])), attribute('screenWindowWidth', 'float', float32(1)));
    const header = Buffer.concat([int32(EXR_MAGIC), int32(2), ...attributes, Buffer.from([0])]);
    const lineBytes = width * 4, blockBytes = 8 + lineBytes, table = Buffer.alloc(height * 8), blocks = Buffer.alloc(height * blockBytes), first = header.length + table.length;
    for (let y = 0; y < height; y++) {
        const at = y * blockBytes;
        table.writeBigUInt64LE(BigInt(first + at), y * 8);
        blocks.writeInt32LE(y, at); blocks.writeInt32LE(lineBytes, at + 4);
        for (let x = 0; x < width; x++) blocks.writeFloatLE(values[y * width + x], at + 8 + x * 4);
    }
    return Buffer.concat([header, table, blocks]);
}

function cursor(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 0;
    const need = count => { if (at + count > bytes.length) throw new Error('[ExrCodec] Truncated EXR header'); };
    return {
        get at() { return at; },
        int32() { need(4); const value = view.getInt32(at, true); at += 4; return value; },
        uint8() { need(1); return bytes[at++]; },
        float32() { need(4); const value = view.getFloat32(at, true); at += 4; return value; },
        uint64() { need(8); const value = view.getBigUint64(at, true); at += 8; if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('[ExrCodec] Block offset exceeds the addressable range'); return Number(value); },
        bytes(count) { need(count); const slice = bytes.subarray(at, at + count); at += count; return slice; },
        cstring() {
            const start = at;
            while (at < bytes.length && bytes[at] !== 0) { if (++at - start > MAXIMUM_NAME) throw new Error('[ExrCodec] Unterminated EXR string'); }
            need(1);
            const text = Buffer.from(bytes.buffer, bytes.byteOffset + start, at - start).toString('latin1');
            at++;
            return text;
        }
    };
}

function parseChannels(value) {
    const r = cursor(value), channels = [];
    while (r.at < value.length && value[r.at] !== 0) {
        const name = r.cstring(), pixelType = r.int32();
        r.bytes(4);
        channels.push({ name, pixelType, xSampling: r.int32(), ySampling: r.int32() });
    }
    if (!channels.length) throw new Error('[ExrCodec] EXR declares no channels');
    return channels;
}

function undoZip(inflated, expected) {
    if (inflated.length !== expected) throw new Error(`[ExrCodec] ZIP block inflated to ${inflated.length} bytes, ${expected} expected`);
    for (let i = 1; i < expected; i++) inflated[i] = (inflated[i - 1] + inflated[i] - 128) & 0xff;
    const out = Buffer.alloc(expected), half = (expected + 1) >> 1;
    let s = 0, t1 = 0, t2 = half;
    while (s < expected) { out[s++] = inflated[t1++]; if (s < expected) out[s++] = inflated[t2++]; }
    return out;
}

function chooseChannel(channels) {
    const usable = channels.filter(channel => EXR_HEIGHT_CHANNELS.includes(channel.name) && (channel.pixelType === EXR_PIXEL_TYPE.FLOAT || channel.pixelType === EXR_PIXEL_TYPE.HALF));
    const describe = channel => `${channel.name} (${PIXEL_TYPE_NAMES[channel.pixelType] ?? channel.pixelType})`;
    if (!usable.length) throw new Error(`[ExrCodec] No FLOAT or HALF channel named ${EXR_HEIGHT_CHANNELS.join(', ')} among ${channels.map(describe).join(', ')}`);
    const chosen = usable.sort((a, b) => EXR_HEIGHT_CHANNELS.indexOf(a.name) - EXR_HEIGHT_CHANNELS.indexOf(b.name))[0];
    if (chosen.xSampling !== 1 || chosen.ySampling !== 1) throw new Error(`[ExrCodec] Channel ${chosen.name} is subsampled (${chosen.xSampling}x${chosen.ySampling}); only sampling 1 is supported`);
    return chosen;
}

/**
 * Decodes the height channel of a scanline EXR into float32 (row 0 = dataWindow yMin, the top of the image).
 * @param {Uint8Array} input
 * @returns {{width:number,height:number,values:Float32Array,channel:string,pixelType:string,compression:string,attributes:string[],landscapeMeta:string|null,lineOrder:number,dataWindow:number[],displayWindow:number[]|null}}
 */
export function decodeExr(input) {
    const bytes = input instanceof Uint8Array ? input : null;
    if (!bytes || bytes.length < 16) throw new Error('[ExrCodec] EXR input must be a byte array with a header');
    const r = cursor(bytes);
    if (r.int32() !== EXR_MAGIC) throw new Error('[ExrCodec] Missing EXR magic number');
    const version = r.int32();
    if ((version & VERSION_MASK) !== 2) throw new Error(`[ExrCodec] Unsupported EXR version ${version & VERSION_MASK}`);
    if (version & FLAG_TILED) throw new Error('[ExrCodec] Tiled EXR images are not supported (export scanline images)');
    if (version & FLAG_DEEP) throw new Error('[ExrCodec] Deep EXR images are not supported');
    if (version & FLAG_MULTIPART) throw new Error('[ExrCodec] Multi-part EXR images are not supported');
    const attributes = new Map();
    while (true) {
        if (r.at >= bytes.length) throw new Error('[ExrCodec] Truncated EXR header');
        if (bytes[r.at] === 0) { r.bytes(1); break; }
        const name = r.cstring(), type = r.cstring(), size = r.int32();
        if (size < 0) throw new Error(`[ExrCodec] Attribute ${name} has a negative size`);
        attributes.set(name, { type, value: r.bytes(size) });
    }
    const required = (name, type, size = null) => {
        const entry = attributes.get(name);
        if (!entry) throw new Error(`[ExrCodec] EXR header lacks the ${name} attribute`);
        if (entry.type !== type || (size !== null && entry.value.length !== size)) throw new Error(`[ExrCodec] Attribute ${name} must be a ${type}${size === null ? '' : ` of ${size} bytes`}`);
        return entry.value;
    };
    const channels = parseChannels(required('channels', 'chlist')), compression = required('compression', 'compression', 1)[0], window = required('dataWindow', 'box2i', 16);
    if (!READABLE_COMPRESSIONS.includes(compression)) throw new Error(`[ExrCodec] Compression ${COMPRESSION_NAMES[compression] ?? compression} is not supported (use NO_COMPRESSION, ZIPS or ZIP)`);
    const windowView = new DataView(window.buffer, window.byteOffset, 16), xMin = windowView.getInt32(0, true), yMin = windowView.getInt32(4, true), xMax = windowView.getInt32(8, true), yMax = windowView.getInt32(12, true);
    const width = xMax - xMin + 1, height = yMax - yMin + 1;
    if (width < 1 || height < 1 || width > MAXIMUM_DIMENSION || height > MAXIMUM_DIMENSION) throw new Error(`[ExrCodec] Invalid dataWindow ${xMin},${yMin}-${xMax},${yMax}`);
    const chosen = chooseChannel(channels), half = chosen.pixelType === EXR_PIXEL_TYPE.HALF;
    const scanlineBytes = channels.reduce((sum, channel) => sum + width * PIXEL_BYTES[channel.pixelType], 0);
    let channelOffset = 0;
    for (const channel of channels) { if (channel === chosen) break; channelOffset += width * PIXEL_BYTES[channel.pixelType]; }
    const linesPerBlock = LINES_PER_BLOCK[compression], blockCount = Math.ceil(height / linesPerBlock), offsets = [];
    for (let k = 0; k < blockCount; k++) offsets.push(r.uint64());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), values = new Float32Array(width * height), filled = new Uint8Array(height), sampleBytes = half ? 2 : 4;
    for (const offset of offsets) {
        if (offset + 8 > bytes.length) throw new Error('[ExrCodec] Scanline block offset lies outside the file');
        const y = view.getInt32(offset, true), dataSize = view.getInt32(offset + 4, true);
        if (dataSize < 0 || offset + 8 + dataSize > bytes.length) throw new Error('[ExrCodec] Truncated scanline block');
        const row0 = y - yMin;
        if (row0 < 0 || row0 >= height) throw new Error(`[ExrCodec] Scanline y ${y} lies outside the dataWindow`);
        const lines = Math.min(linesPerBlock, height - row0), expected = lines * scanlineBytes, data = bytes.subarray(offset + 8, offset + 8 + dataSize);
        let raw;
        if (dataSize === expected) raw = data;
        else if (compression === EXR_COMPRESSION.NO_COMPRESSION || dataSize > expected) throw new Error(`[ExrCodec] Scanline block at y ${y} holds ${dataSize} bytes, ${expected} expected`);
        else raw = undoZip(inflateSync(data, { maxOutputLength: expected }), expected);
        for (let line = 0; line < lines; line++) {
            const row = row0 + line;
            if (filled[row]) throw new Error(`[ExrCodec] Scanline ${row + yMin} appears twice`);
            filled[row] = 1;
            const samples = new DataView(raw.buffer, raw.byteOffset + line * scanlineBytes + channelOffset, width * sampleBytes), base = row * width;
            if (half) for (let x = 0; x < width; x++) values[base + x] = halfToFloat(samples.getUint16(x * 2, true));
            else for (let x = 0; x < width; x++) values[base + x] = samples.getFloat32(x * 4, true);
        }
    }
    for (let row = 0; row < height; row++) if (!filled[row]) throw new Error(`[ExrCodec] Scanline ${row + yMin} is missing`);
    const display = attributes.get('displayWindow'), meta = attributes.get('landscapeMeta'), order = attributes.get('lineOrder');
    const displayWindow = display && display.type === 'box2i' && display.value.length === 16 ? [0, 4, 8, 12].map(k => new DataView(display.value.buffer, display.value.byteOffset, 16).getInt32(k, true)) : null;
    return { width, height, values, channel: chosen.name, pixelType: PIXEL_TYPE_NAMES[chosen.pixelType], compression: COMPRESSION_NAMES[compression], attributes: [...attributes.keys()],
        landscapeMeta: meta && meta.type === 'string' ? Buffer.from(meta.value.buffer, meta.value.byteOffset, meta.value.length).toString('utf8') : null,
        lineOrder: order && order.type === 'lineOrder' && order.value.length === 1 ? order.value[0] : 0, dataWindow: [xMin, yMin, xMax, yMax], displayWindow };
}
