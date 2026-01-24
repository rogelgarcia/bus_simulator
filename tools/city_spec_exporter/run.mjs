// tools/city_spec_exporter/run.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BIG_CITY_SPEC_SOURCE } from '../../src/app/city/specs/BigCitySpec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const EXPORTS = [
    {
        id: 'bigcity',
        outPath: 'tests/artifacts/city_specs/city_spec_bigcity.json',
        spec: BIG_CITY_SPEC_SOURCE
    }
];

function hasFlag(name) {
    const n = String(name ?? '');
    return process.argv.includes(n);
}

async function readFileIfExists(filePath) {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch {
        return null;
    }
}

async function run() {
    const checkOnly = hasFlag('--check');
    let ok = true;

    for (const entry of EXPORTS) {
        const absPath = path.resolve(repoRoot, entry.outPath);
        const expected = `${JSON.stringify(entry.spec, null, 2)}\n`;

        if (checkOnly) {
            const actual = await readFileIfExists(absPath);
            if (actual === expected) {
                console.log(`[citySpecExporter] OK: ${entry.id} (${entry.outPath})`);
            } else {
                ok = false;
                console.error(`[citySpecExporter] DRIFT: ${entry.id} (${entry.outPath})`);
                console.error('  Regenerate with: node tools/city_spec_exporter/run.mjs');
            }
            continue;
        }

        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, expected, 'utf-8');
        console.log(`[citySpecExporter] Wrote: ${entry.id} -> ${entry.outPath}`);
    }

    if (checkOnly && !ok) process.exitCode = 1;
}

run().catch((err) => {
    console.error('[citySpecExporter] Failed:', err);
    process.exitCode = 1;
});
