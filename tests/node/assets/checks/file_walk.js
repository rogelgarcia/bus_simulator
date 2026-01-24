// File walking utilities for asset checks.
import path from 'node:path';
import fs from 'node:fs/promises';

export async function walkFiles(rootDir, { excludeDirs = [] } = {}) {
    const root = path.resolve(rootDir);
    const excluded = new Set((excludeDirs ?? []).map((p) => path.resolve(root, p)));
    const out = [];

    async function walk(current) {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'downloads') continue;
                let skip = false;
                for (const ex of excluded) {
                    if (full === ex || full.startsWith(`${ex}${path.sep}`)) { skip = true; break; }
                }
                if (skip) continue;
                await walk(full);
                continue;
            }
            if (entry.isFile()) out.push(full);
        }
    }

    await walk(root);
    return out;
}

export function toRepoRelative(repoRoot, absPath) {
    const rel = path.relative(path.resolve(repoRoot), absPath);
    return rel.split(path.sep).join('/');
}

