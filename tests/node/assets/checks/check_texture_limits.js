// Validates texture dimensions and file sizes for common asset folders.
import path from 'node:path';
import fs from 'node:fs/promises';
import { readImageSize } from './image_size.js';

function isUnder(absPath, absDir) {
    const p = path.resolve(absPath);
    const d = path.resolve(absDir);
    return p === d || p.startsWith(`${d}${path.sep}`);
}

function isPbrPack(absPath, repoRoot) {
    return isUnder(absPath, path.join(repoRoot, 'assets/public/pbr'));
}

function isHdri(absPath, repoRoot) {
    return isUnder(absPath, path.join(repoRoot, 'assets/public/lighting/hdri'));
}

export async function checkTextureLimits({ files, repoRoot }) {
    const issues = [];
    const list = Array.isArray(files) ? files : [];
    const maxDim = 4096;
    const maxSizePublic = 10 * 1024 * 1024;
    const maxSizeHdri = 25 * 1024 * 1024;

    for (const filePath of list) {
        const lower = String(filePath).toLowerCase();
        if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.hdr')) continue;
        if (isPbrPack(filePath, repoRoot)) continue;

        const st = await fs.stat(filePath);
        const limit = isHdri(filePath, repoRoot) ? maxSizeHdri : maxSizePublic;
        if (st.size > limit) {
            issues.push({
                type: 'asset_size',
                file: filePath,
                message: `File size ${st.size} exceeds limit ${limit}`
            });
        }

        const size = await readImageSize(filePath);
        if (!size) continue;
        if (size.width > maxDim || size.height > maxDim) {
            issues.push({
                type: 'texture_dim',
                file: filePath,
                message: `Texture ${size.width}x${size.height} exceeds ${maxDim} max dimension`
            });
        }
    }

    return issues;
}

