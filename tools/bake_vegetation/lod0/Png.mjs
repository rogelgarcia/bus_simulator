// Reads the bake's non-interlaced 8-bit RGB/RGBA maps without an external image runtime.
import {deflateSync, inflateSync} from 'node:zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256).map((_, n) => {
    let value = n;
    for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});
function chunk(type, value) {
    const name = Buffer.from(type), data = Buffer.concat([name, value]);
    let crc = 0xffffffff;
    for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    const header = Buffer.alloc(4), tail = Buffer.alloc(4);
    header.writeUInt32BE(value.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, data, tail]);
}
export function decodePng(bytes) {
    if (!bytes.subarray(0, 8).equals(signature)) throw new Error('Expected PNG');
    let width, height, channels, packed = [];
    for (let offset = 8; offset < bytes.length;) {
        const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, offset + 8 + size);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12] !== 0) throw new Error('Expected 8-bit, non-interlaced RGB/RGBA');
            channels = data[9] === 6 ? 4 : 3;
        }
        if (type === 'IDAT') packed.push(data);
        offset += size + 12;
    }
    const raw = inflateSync(Buffer.concat(packed)), stride = width * channels;
    if (raw.length !== (stride + 1) * height) throw new Error('Invalid PNG scanlines');
    const data = new Uint8Array(width * height * 4);
    let previous = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
        const row = new Uint8Array(stride), start = y * (stride + 1), filter = raw[start];
        if (filter > 4) throw new Error('Unknown PNG filter');
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? row[x - channels] : 0, up = previous[x], corner = x >= channels ? previous[x - channels] : 0;
            const predictor = left + up - corner, a = Math.abs(predictor - left), b = Math.abs(predictor - up), c = Math.abs(predictor - corner);
            const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
            row[x] = raw[start + x + 1] + [0, left, up, Math.floor((left + up) / 2), paeth][filter];
        }
        for (let x = 0; x < width; x++) {
            const to = (y * width + x) * 4, from = x * channels;
            data.set(row.subarray(from, from + 3), to); data[to + 3] = channels === 4 ? row[from + 3] : 255;
        }
        previous = row;
    }
    return {width, height, data};
}
export function encodePng({width, height, data}) {
    const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
    return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
export function downsample(image, channel) {
    const width = Math.max(1, image.width >> 1), height = Math.max(1, image.height >> 1), data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const values = [0, 0, 0], to = (y * width + x) * 4;
        let alpha = 0, samples = 0;
        for (let dy = 0; dy < Math.min(2, image.height); dy++) for (let dx = 0; dx < Math.min(2, image.width); dx++) {
            const from = ((y * 2 + dy) * image.width + x * 2 + dx) * 4, a = image.data[from + 3] / 255;
            alpha += a; samples++;
            for (let c = 0; c < 3; c++) values[c] += (channel === 'color' ? linear(image.data[from + c] / 255) : image.data[from + c] / 255) * a;
        }
        for (let c = 0; c < 3; c++) values[c] /= Math.max(alpha, 1e-8);
        if (channel === 'normal') {
            const vector = values.map(value => value * 2 - 1), length = Math.hypot(...vector) || 1;
            for (let c = 0; c < 3; c++) values[c] = vector[c] / length * .5 + .5;
        }
        for (let c = 0; c < 3; c++) data[to + c] = Math.round(Math.max(0, Math.min(1, channel === 'color' ? srgb(values[c]) : values[c])) * 255);
        data[to + 3] = Math.round(alpha / samples * 255);
    }
    return {width, height, data};
}
