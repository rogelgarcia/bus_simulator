// Lightweight image header parsing for deterministic map sanity checks.
import fs from 'node:fs/promises';
import path from 'node:path';

function readUint16BE(buf, offset) {
    return (buf[offset] << 8) | buf[offset + 1];
}

function readUint32BE(buf, offset) {
    return (
        (buf[offset] * 0x1000000)
        + ((buf[offset + 1] << 16) >>> 0)
        + ((buf[offset + 2] << 8) >>> 0)
        + (buf[offset + 3] >>> 0)
    ) >>> 0;
}

function parsePngHeader(buf) {
    if (!buf || buf.length < 33) return null;
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < sig.length; i++) {
        if (buf[i] !== sig[i]) return null;
    }
    const ihdrType = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (ihdrType !== 'IHDR') return null;
    const width = readUint32BE(buf, 16);
    const height = readUint32BE(buf, 20);
    const bitDepth = buf[24];
    const colorType = buf[25];
    return Object.freeze({
        format: 'png',
        width,
        height,
        bitDepth: Number.isFinite(bitDepth) ? bitDepth : null,
        colorType: Number.isFinite(colorType) ? colorType : null
    });
}

function parseJpegHeader(buf) {
    if (!buf || buf.length < 4) return null;
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;

    let offset = 2;
    while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        let marker = buf[offset + 1];
        while (marker === 0xff && offset + 2 < buf.length) {
            offset += 1;
            marker = buf[offset + 1];
        }

        offset += 2;
        if (marker === 0xd9 || marker === 0xda) break;
        if (offset + 2 > buf.length) break;

        const segmentLength = readUint16BE(buf, offset);
        if (!(segmentLength >= 2) || (offset + segmentLength > buf.length)) break;

        const isSof = (
            marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3
            || marker === 0xc5 || marker === 0xc6 || marker === 0xc7
            || marker === 0xc9 || marker === 0xca || marker === 0xcb
            || marker === 0xcd || marker === 0xce || marker === 0xcf
        );
        if (isSof && segmentLength >= 7) {
            const precision = buf[offset + 2];
            const height = readUint16BE(buf, offset + 3);
            const width = readUint16BE(buf, offset + 5);
            return Object.freeze({
                format: 'jpeg',
                width,
                height,
                bitDepth: Number.isFinite(precision) ? precision : null
            });
        }

        offset += segmentLength;
    }
    return null;
}

function inferFormatFromExt(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'png';
    if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
    return 'unknown';
}

export async function readImageFileMeta(filePath) {
    const abs = path.resolve(filePath);
    let stat = null;
    try {
        stat = await fs.stat(abs);
    } catch {
        return Object.freeze({
            exists: false,
            format: inferFormatFromExt(abs),
            width: null,
            height: null,
            bitDepth: null,
            fileSize: null
        });
    }
    if (!stat.isFile()) {
        return Object.freeze({
            exists: false,
            format: inferFormatFromExt(abs),
            width: null,
            height: null,
            bitDepth: null,
            fileSize: null
        });
    }

    const maxHeader = 512 * 1024;
    const raw = await fs.readFile(abs);
    const header = raw.length > maxHeader ? raw.subarray(0, maxHeader) : raw;
    const png = parsePngHeader(header);
    const jpg = png ? null : parseJpegHeader(header);
    const parsed = png ?? jpg;
    const inferred = inferFormatFromExt(abs);

    return Object.freeze({
        exists: true,
        format: parsed?.format ?? inferred,
        width: Number.isFinite(parsed?.width) ? parsed.width : null,
        height: Number.isFinite(parsed?.height) ? parsed.height : null,
        bitDepth: Number.isFinite(parsed?.bitDepth) ? parsed.bitDepth : null,
        fileSize: stat.size
    });
}

