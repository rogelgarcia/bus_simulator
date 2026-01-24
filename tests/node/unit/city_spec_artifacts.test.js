// Node unit tests: city specs must not ship as JSON artifacts under src/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('City specs: no JSON artifacts live under src/app/city/specs', async () => {
    const repoRoot = path.resolve(process.cwd());
    const specDir = path.join(repoRoot, 'src/app/city/specs');
    const entries = await fs.readdir(specDir);
    const jsonFiles = entries.filter((name) => String(name).toLowerCase().endsWith('.json'));
    assert.equal(
        jsonFiles.length,
        0,
        `Expected no .json files under src/app/city/specs. Found: ${jsonFiles.join(', ') || '(none)'}`
        + '\nExport specs to JSON under tests/artifacts via: node tools/city_spec_exporter/run.mjs'
    );
});
