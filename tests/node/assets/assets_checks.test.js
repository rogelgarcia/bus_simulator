// Node asset checks: validate common asset/pipeline regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { walkFiles, toRepoRelative } from './checks/file_walk.js';
import { checkGlbHeaders } from './checks/check_glb_headers.js';
import { checkMtlReferences } from './checks/check_mtl_references.js';
import { checkTextureLimits } from './checks/check_texture_limits.js';
import { checkLargeFiles } from './checks/check_large_files.js';

async function runChecks({ repoRoot }) {
    const files = await walkFiles(repoRoot, { excludeDirs: ['tests/artifacts'] });
    const checks = [
        () => checkGlbHeaders({ files, repoRoot }),
        () => checkMtlReferences({ files, repoRoot }),
        () => checkTextureLimits({ files, repoRoot }),
        () => checkLargeFiles({ files, repoRoot })
    ];

    const issues = [];
    for (const fn of checks) {
        const found = await fn();
        for (const entry of found) {
            issues.push({
                ...entry,
                file: toRepoRelative(repoRoot, entry.file)
            });
        }
    }

    issues.sort((a, b) => {
        const af = String(a.file ?? '');
        const bf = String(b.file ?? '');
        if (af < bf) return -1;
        if (af > bf) return 1;
        const at = String(a.type ?? '');
        const bt = String(b.type ?? '');
        if (at < bt) return -1;
        if (at > bt) return 1;
        return String(a.message ?? '').localeCompare(String(b.message ?? ''));
    });

    return { issues };
}

test('Assets: pipeline checks should pass', async () => {
    const repoRoot = path.resolve(process.cwd());
    const report = await runChecks({ repoRoot });

    const outDir = path.join(repoRoot, 'tests/artifacts/node/assets');
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

    if (report.issues.length) {
        const summary = report.issues.slice(0, 15).map((e) => `${e.type}: ${e.file} - ${e.message}`).join('\n');
        assert.fail(`Asset checks failed (${report.issues.length} issues)\n${summary}`);
    }
});

