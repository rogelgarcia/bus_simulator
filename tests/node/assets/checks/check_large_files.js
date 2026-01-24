// Detects unexpectedly large files in the repo (catch accidental commits).
import path from 'node:path';
import fs from 'node:fs/promises';

function isUnder(absPath, absDir) {
    const p = path.resolve(absPath);
    const d = path.resolve(absDir);
    return p === d || p.startsWith(`${d}${path.sep}`);
}

function allowLarge(absPath, repoRoot) {
    if (isUnder(absPath, path.join(repoRoot, 'assets/public/pbr'))) return true;
    if (isUnder(absPath, path.join(repoRoot, 'downloads'))) return true;
    if (isUnder(absPath, path.join(repoRoot, '.git'))) return true;
    return false;
}

export async function checkLargeFiles({ files, repoRoot }) {
    const issues = [];
    const list = Array.isArray(files) ? files : [];
    const maxBytes = 50 * 1024 * 1024;

    for (const filePath of list) {
        if (allowLarge(filePath, repoRoot)) continue;
        const st = await fs.stat(filePath);
        if (st.size <= maxBytes) continue;
        issues.push({ type: 'large_file', file: filePath, message: `File is ${st.size} bytes (> ${maxBytes})` });
    }

    return issues;
}

