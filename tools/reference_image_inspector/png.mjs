// tools/reference_image_inspector/png.mjs
// Minimal dependency-free PNG codec (8-bit, non-interlaced, color types 0/2/4/6)
// used by the reference image inspector to crop and profile reference photos.
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

export function decodePng(buffer) {
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file');
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idat = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset += 12 + length;
    }
    if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
    if (interlace !== 0) throw new Error('interlaced PNG not supported');
    const channelsByType = { 0: 1, 2: 3, 4: 2, 6: 4 };
    const channels = channelsByType[colorType];
    if (!channels) throw new Error(`unsupported color type ${colorType}`);

    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(height * stride);
    let pos = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[pos++];
        const line = raw.subarray(pos, pos + stride);
        pos += stride;
        const rowStart = y * stride;
        const prevStart = rowStart - stride;
        for (let x = 0; x < stride; x++) {
            const rawByte = line[x];
            const a = x >= channels ? out[rowStart + x - channels] : 0;
            const b = y > 0 ? out[prevStart + x] : 0;
            const c = (x >= channels && y > 0) ? out[prevStart + x - channels] : 0;
            let value;
            if (filter === 0) value = rawByte;
            else if (filter === 1) value = rawByte + a;
            else if (filter === 2) value = rawByte + b;
            else if (filter === 3) value = rawByte + ((a + b) >> 1);
            else if (filter === 4) value = rawByte + paeth(a, b, c);
            else throw new Error(`unsupported filter ${filter} on row ${y}`);
            out[rowStart + x] = value & 0xff;
        }
    }

    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, n = width * height; i < n; i++) {
        const s = i * channels;
        const d = i * 4;
        if (channels === 1) {
            rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s];
            rgba[d + 3] = 255;
        } else if (channels === 2) {
            rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s];
            rgba[d + 3] = out[s + 1];
        } else if (channels === 3) {
            rgba[d] = out[s];
            rgba[d + 1] = out[s + 1];
            rgba[d + 2] = out[s + 2];
            rgba[d + 3] = 255;
        } else {
            rgba[d] = out[s];
            rgba[d + 1] = out[s + 1];
            rgba[d + 2] = out[s + 2];
            rgba[d + 3] = out[s + 3];
        }
    }
    return { width, height, data: rgba };
}

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

export function encodePng({ width, height, data }) {
    const stride = width * 3;
    const raw = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        for (let x = 0; x < width; x++) {
            const s = (y * width + x) * 4;
            const d = y * (stride + 1) + 1 + x * 3;
            raw[d] = data[s];
            raw[d + 1] = data[s + 1];
            raw[d + 2] = data[s + 2];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([
        PNG_SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}
