// Validates that .glb files have a valid binary glTF header.
import fs from 'node:fs/promises';

function readU32LE(buf, offset) {
    return (buf[offset]) | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24);
}

export async function checkGlbHeaders({ files, repoRoot }) {
    const issues = [];
    const list = Array.isArray(files) ? files : [];
    for (const filePath of list) {
        if (!String(filePath).toLowerCase().endsWith('.glb')) continue;
        const fd = await fs.open(filePath, 'r');
        try {
            const buf = Buffer.alloc(12);
            const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
            if (bytesRead < 12) {
                issues.push({ type: 'glb', file: filePath, message: 'File too small for GLB header' });
                continue;
            }
            const magic = buf.subarray(0, 4).toString('ascii');
            const version = readU32LE(buf, 4) >>> 0;
            const length = readU32LE(buf, 8) >>> 0;

            if (magic !== 'glTF') issues.push({ type: 'glb', file: filePath, message: `Invalid magic "${magic}"` });
            if (version !== 2) issues.push({ type: 'glb', file: filePath, message: `Unexpected version ${version} (expected 2)` });
            const stat = await fs.stat(filePath);
            if (length !== stat.size) issues.push({ type: 'glb', file: filePath, message: `Header length ${length} != file size ${stat.size}` });
        } finally {
            await fd.close();
        }
    }
    return issues;
}

