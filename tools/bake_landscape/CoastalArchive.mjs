// Reads the authenticated coastal ZIP and its categorical grayscale PNG without executing source code.
// @ts-check
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { inflateRawSync, inflateSync } from 'node:zlib';

export const COASTAL_SOURCE_SHA256 = '21702aab6210e2b576666b3fd5a4b6d48884e0372447357bee10dd8ea3d463ce';
export const COASTAL_SOURCE_PREFIX = 'coastal_city_terrain_v2/';
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
});

/** @param {Uint8Array} bytes */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
}

/** @param {Buffer} bytes @returns {Map<string, Buffer>} */
export function decodeCoastalZip(bytes) {
    if (bytes.length > MAX_ARCHIVE_BYTES || bytes.length < 22) throw new Error('Coastal ZIP has an invalid size');
    let end = bytes.length - 22;
    for (; end >= Math.max(0, bytes.length - 65557); end--) {
        if (bytes.readUInt32LE(end) === 0x06054b50 && end + 22 + bytes.readUInt16LE(end + 20) === bytes.length) break;
    }
    if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50) throw new Error('Coastal ZIP end directory is missing');
    const count = bytes.readUInt16LE(end + 10), directorySize = bytes.readUInt32LE(end + 12);
    let offset = bytes.readUInt32LE(end + 16), expanded = 0;
    if (bytes.readUInt32LE(end + 4) !== 0 || count !== bytes.readUInt16LE(end + 8)
        || count === 65535 || offset + directorySize !== end) throw new Error('Unsupported coastal ZIP directory');
    const files = new Map();
    for (let index = 0; index < count; index++) {
        if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid coastal ZIP entry');
        const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
        const crc = bytes.readUInt32LE(offset + 16), packedSize = bytes.readUInt32LE(offset + 20);
        const size = bytes.readUInt32LE(offset + 24), nameSize = bytes.readUInt16LE(offset + 28);
        const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
        const local = bytes.readUInt32LE(offset + 42);
        expanded += size;
        if ((flags & ~0x800) || ![0, 8].includes(method) || expanded > MAX_ARCHIVE_BYTES
            || local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error(`Unsupported coastal ZIP entry: ${name}`);
        if (!name.startsWith(COASTAL_SOURCE_PREFIX) || name.includes('\\') || name.includes('\0')
            || name.split('/').some(part => !part || part === '.' || part === '..') || files.has(name.slice(COASTAL_SOURCE_PREFIX.length))) {
            throw new Error(`Unsafe or duplicate coastal ZIP path: ${name}`);
        }
        const localNameSize = bytes.readUInt16LE(local + 26);
        const dataStart = local + 30 + localNameSize + bytes.readUInt16LE(local + 28);
        if (bytes.subarray(local + 30, local + 30 + localNameSize).toString('utf8') !== name
            || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method
            || bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== packedSize
            || bytes.readUInt32LE(local + 22) !== size || dataStart + packedSize > offset) throw new Error(`Coastal ZIP local header mismatch: ${name}`);
        const packed = bytes.subarray(dataStart, dataStart + packedSize);
        const data = method === 8 ? inflateRawSync(packed, { maxOutputLength: Math.max(1, size) }) : Buffer.from(packed);
        if (data.length !== size || crc32(data) !== crc) throw new Error(`Coastal ZIP integrity mismatch: ${name}`);
        files.set(name.slice(COASTAL_SOURCE_PREFIX.length), data);
        offset += 46 + nameSize + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    }
    if (offset !== end) throw new Error('Coastal ZIP directory length mismatch');
    return files;
}

/** @param {string} file */
export async function readCoastalArchive(file) {
    if ((await stat(file)).size > MAX_ARCHIVE_BYTES) throw new Error('Coastal archive exceeds 128 MiB import limit');
    const bytes = await readFile(file), sourceSha256 = sha256(bytes);
    if (sourceSha256 !== COASTAL_SOURCE_SHA256) throw new Error(`Coastal archive SHA-256 mismatch: expected ${COASTAL_SOURCE_SHA256}, received ${sourceSha256}`);
    return { sourceSha256, archiveByteLength: bytes.length, files: decodeCoastalZip(bytes) };
}

/** @param {Buffer} bytes @param {{width:number,height:number}} expected */
export function decodeGrayscaleIdsPng(bytes, expected) {
    if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid land-cover PNG signature');
    let offset = 8, width = 0, height = 0, ended = false;
    const compressed = [];
    while (offset + 12 <= bytes.length) {
        const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
        if (offset + size + 12 > bytes.length || crc32(bytes.subarray(offset + 4, offset + 8 + size)) !== bytes.readUInt32BE(offset + 8 + size)) throw new Error(`Land-cover PNG ${type} integrity mismatch`);
        const data = bytes.subarray(offset + 8, offset + 8 + size);
        if (type === 'IHDR') {
            if (offset !== 8 || size !== 13) throw new Error('Invalid land-cover PNG header');
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            if (width !== expected.width || height !== expected.height || data[8] !== 8 || data[9] !== 0
                || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error('Land-cover PNG must be the expected non-interlaced 8-bit grayscale raster');
        } else if (type === 'IDAT') {
            if (!width) throw new Error('Land-cover PNG data precedes header');
            compressed.push(data);
        } else if (type === 'IEND') {
            if (size || offset + 12 !== bytes.length) throw new Error('Invalid land-cover PNG end');
            ended = true; break;
        } else if (type[0] === type[0].toUpperCase()) throw new Error(`Unsupported critical land-cover PNG chunk ${type}`);
        offset += size + 12;
    }
    if (!ended || !compressed.length) throw new Error('Incomplete land-cover PNG');
    const rowBytes = width + 1, expectedBytes = rowBytes * height;
    const filtered = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedBytes });
    if (filtered.length !== expectedBytes) throw new Error('Land-cover PNG decoded length mismatch');
    const values = Buffer.alloc(width * height);
    for (let row = 0; row < height; row++) {
        const filter = filtered[row * rowBytes];
        if (filter > 4) throw new Error(`Unsupported PNG row filter ${filter}`);
        for (let column = 0; column < width; column++) {
            const index = row * width + column;
            const left = column ? values[index - 1] : 0, up = row ? values[index - width] : 0;
            const corner = row && column ? values[index - width - 1] : 0;
            let predictor = 0;
            if (filter === 1) predictor = left;
            if (filter === 2) predictor = up;
            if (filter === 3) predictor = Math.floor((left + up) / 2);
            if (filter === 4) {
                const base = left + up - corner, a = Math.abs(base - left), b = Math.abs(base - up), c = Math.abs(base - corner);
                predictor = a <= b && a <= c ? left : b <= c ? up : corner;
            }
            values[index] = (filtered[row * rowBytes + column + 1] + predictor) & 255;
        }
    }
    return values;
}
