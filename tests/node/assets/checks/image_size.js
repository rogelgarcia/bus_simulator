// Basic PNG/JPEG dimension readers (no native deps).
import fs from 'node:fs/promises';

function readU32BE(buf, offset) {
    return (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
}

export async function readPngSize(filePath) {
    const fd = await fs.open(filePath, 'r');
    try {
        const buf = Buffer.alloc(24);
        const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
        if (bytesRead < 24) return null;

        const sig = buf.subarray(0, 8);
        const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (!sig.equals(expected)) return null;
        if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;

        const width = readU32BE(buf, 16) >>> 0;
        const height = readU32BE(buf, 20) >>> 0;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
        return { width, height };
    } finally {
        await fd.close();
    }
}

export async function readJpegSize(filePath) {
    const data = await fs.readFile(filePath);
    if (data.length < 4) return null;
    if (!(data[0] === 0xff && data[1] === 0xd8)) return null;

    let i = 2;
    while (i + 3 < data.length) {
        if (data[i] !== 0xff) { i += 1; continue; }
        const marker = data[i + 1];
        i += 2;

        if (marker === 0xd9 || marker === 0xda) break;
        if (i + 1 >= data.length) break;

        const len = (data[i] << 8) | data[i + 1];
        if (len < 2 || i + len - 2 >= data.length) break;

        const isSOF = (
            marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3
            || marker === 0xc5 || marker === 0xc6 || marker === 0xc7
            || marker === 0xc9 || marker === 0xca || marker === 0xcb
            || marker === 0xcd || marker === 0xce || marker === 0xcf
        );

        if (isSOF) {
            const height = (data[i + 3] << 8) | data[i + 4];
            const width = (data[i + 5] << 8) | data[i + 6];
            if (width > 0 && height > 0) return { width, height };
            return null;
        }

        i += len;
    }

    return null;
}

export async function readImageSize(filePath) {
    const lower = String(filePath).toLowerCase();
    if (lower.endsWith('.png')) return readPngSize(filePath);
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return readJpegSize(filePath);
    return null;
}

