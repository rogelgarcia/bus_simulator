// Node unit tests: lightweight guardrails for PROJECT_CODING_RULES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

async function walkFiles(rootDir) {
    const root = path.resolve(rootDir);
    const out = [];

    async function walk(current) {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'downloads') continue;
                if (entry.name === 'artifacts' && path.basename(path.dirname(full)) === 'tests') continue;
                await walk(full);
                continue;
            }
            if (entry.isFile()) out.push(full);
        }
    }

    await walk(root);
    return out;
}

function toRepoRelative(repoRoot, absPath) {
    const rel = path.relative(repoRoot, absPath);
    return rel.split(path.sep).join('/');
}

function extractModuleSpecifiers(sourceText) {
    const text = String(sourceText ?? '');
    const out = [];

    const staticRe = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    for (const re of [staticRe, dynamicRe]) {
        for (;;) {
            const match = re.exec(text);
            if (!match) break;
            out.push(match[1]);
        }
    }

    return out;
}

async function resolveImport({ importerAbsPath, specifier, repoRoot }) {
    const spec = String(specifier ?? '');
    if (!spec) return null;
    if (spec.startsWith('node:')) return null;
    if (!spec.startsWith('.') && !spec.startsWith('/')) return null;

    const base = spec.startsWith('/')
        ? path.resolve(repoRoot, spec.slice(1))
        : path.resolve(path.dirname(importerAbsPath), spec);

    const candidates = [];
    const hasExt = path.extname(base) !== '';
    if (hasExt) candidates.push(base);
    else candidates.push(base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js'), path.join(base, 'index.mjs'));

    for (const filePath of candidates) {
        try {
            const st = await fs.stat(filePath);
            if (st.isFile()) return filePath;
        } catch {}
    }

    return null;
}

function internalOwnerDir(resolvedAbsPath) {
    const parts = resolvedAbsPath.split(path.sep);
    const idx = parts.lastIndexOf('internal');
    if (idx <= 0) return null;
    return parts.slice(0, idx).join(path.sep);
}

test('Guardrails: no src/**/utils.js junk-drawer files', async () => {
    const repoRoot = path.resolve(process.cwd());
    const files = await walkFiles(path.join(repoRoot, 'src'));
    const offenders = files
        .filter((p) => path.basename(p).toLowerCase() === 'utils.js')
        .map((p) => toRepoRelative(repoRoot, p))
        .sort();

    assert.deepEqual(offenders, []);
});

test('Guardrails: src/app must not import GUI modules', async () => {
    const repoRoot = path.resolve(process.cwd());
    const srcRoot = path.join(repoRoot, 'src');
    const files = (await walkFiles(srcRoot)).filter((p) => p.endsWith('.js'));

    const offenders = [];
    for (const filePath of files) {
        const rel = toRepoRelative(repoRoot, filePath);
        if (!rel.startsWith('src/app/')) continue;
        const text = await fs.readFile(filePath, 'utf-8');
        const specs = extractModuleSpecifiers(text);
        for (const spec of specs) {
            if (String(spec).includes('graphics/gui/')) {
                offenders.push(`${rel} -> ${spec}`);
            }
        }
    }

    assert.deepEqual(offenders.sort(), []);
});

test('Guardrails: internal/* modules are only imported by their owning module', async () => {
    const repoRoot = path.resolve(process.cwd());
    const srcRoot = path.join(repoRoot, 'src');
    const files = (await walkFiles(srcRoot)).filter((p) => p.endsWith('.js'));

    const violations = [];
    for (const importerAbsPath of files) {
        const importerRel = toRepoRelative(repoRoot, importerAbsPath);
        const text = await fs.readFile(importerAbsPath, 'utf-8');
        const specs = extractModuleSpecifiers(text);

        for (const specifier of specs) {
            if (!String(specifier).includes('internal')) continue;
            const resolved = await resolveImport({ importerAbsPath, specifier, repoRoot });
            if (!resolved) continue;
            if (!resolved.split(path.sep).includes('internal')) continue;

            const ownerDir = internalOwnerDir(resolved);
            if (!ownerDir) continue;

            const importerDir = path.dirname(importerAbsPath);
            const allowedPrefix = `${ownerDir}${path.sep}`;
            if (!importerDir.startsWith(allowedPrefix) && importerDir !== ownerDir) {
                violations.push({
                    importer: importerRel,
                    specifier,
                    resolved: toRepoRelative(repoRoot, resolved),
                    owner: toRepoRelative(repoRoot, ownerDir)
                });
            }
        }
    }

    if (violations.length) {
        const preview = violations.slice(0, 10).map((v) => (
            `${v.importer} -> ${v.specifier} (resolved: ${v.resolved}, owner: ${v.owner})`
        )).join('\n');
        assert.fail(`Found forbidden imports from internal/* (${violations.length})\n${preview}`);
    }
});

