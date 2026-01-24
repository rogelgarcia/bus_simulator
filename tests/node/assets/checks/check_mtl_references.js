// Validates that .mtl referenced texture files exist relative to the .mtl file.
import path from 'node:path';
import fs from 'node:fs/promises';

const KEYWORDS = new Set([
    'map_kd',
    'map_ka',
    'map_ks',
    'map_ns',
    'map_d',
    'map_bump',
    'bump',
    'disp',
    'decal'
]);

function extractMapPath(line) {
    const raw = String(line ?? '').trim();
    if (!raw) return null;
    const parts = raw.split(/\s+/);
    if (parts.length < 2) return null;
    const kw = parts[0].toLowerCase();
    if (!KEYWORDS.has(kw)) return null;

    const rest = parts.slice(1);
    const file = rest.find((p) => !p.startsWith('-'));
    return file ? file.trim() : null;
}

export async function checkMtlReferences({ files }) {
    const issues = [];
    const list = Array.isArray(files) ? files : [];

    for (const filePath of list) {
        if (!String(filePath).toLowerCase().endsWith('.mtl')) continue;
        const dir = path.dirname(filePath);
        const text = await fs.readFile(filePath, 'utf-8');
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const ref = extractMapPath(lines[i]);
            if (!ref) continue;
            const resolved = path.resolve(dir, ref);
            try {
                const st = await fs.stat(resolved);
                if (!st.isFile()) issues.push({ type: 'mtl', file: filePath, message: `Missing texture "${ref}" (line ${i + 1})` });
            } catch {
                issues.push({ type: 'mtl', file: filePath, message: `Missing texture "${ref}" (line ${i + 1})` });
            }
        }
    }

    return issues;
}

