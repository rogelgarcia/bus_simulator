// Node unit tests: options preset promotion keeps toneMapping and
// sidewalkGrassEdgeStrip when rewriting defaults blocks, and emits
// single-quoted strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const toolPath = path.join(repoRoot, 'tools/options_presets/promote_to_defaults.mjs');

const MIRRORED_FILES = [
    'src/graphics/lighting/LightingSettings.js',
    'src/graphics/visuals/city/AsphaltNoiseSettings.js'
];

const FIXTURE_PRESET = {
    schema: 'bus_sim.options_preset',
    version: 1,
    settings: {
        lighting: {
            exposure: 1.13,
            toneMapping: 'agx',
            hemiIntensity: 2,
            sunIntensity: 3,
            ibl: { enabled: true, envMapIntensity: 0.5, setBackground: false }
        },
        colorGrading: {
            preset: 'vivid',
            intensity: 0.65
        },
        asphaltNoise: {
            livedIn: {
                sidewalkGrassEdgeStrip: {
                    enabled: true,
                    width: 0.8,
                    opacity: 0.5,
                    roughness: 0.9,
                    metalness: 0.1,
                    colorHex: 5064508,
                    fadePower: 2
                }
            }
        }
    }
};

function extractExportedBlock(source, constName) {
    const start = source.indexOf(`export const ${constName}`);
    assert.ok(start >= 0, `expected ${constName} in source`);
    const end = source.indexOf('\n});', start);
    assert.ok(end > start, `expected end of ${constName} block`);
    return source.slice(start, end);
}

async function setupTempRepo() {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'promote-defaults-'));
    for (const rel of MIRRORED_FILES) {
        const dst = path.join(tmp, rel);
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.copyFile(path.join(repoRoot, rel), dst);
    }
    const presetPath = path.join(tmp, 'preset.json');
    await fs.writeFile(presetPath, JSON.stringify(FIXTURE_PRESET, null, 2), 'utf8');
    return { tmp, presetPath };
}

test('promote_to_defaults: --write keeps toneMapping and sidewalkGrassEdgeStrip', async () => {
    const { tmp, presetPath } = await setupTempRepo();
    try {
        await execFileAsync(
            process.execPath,
            [toolPath, presetPath, '--write', '--only=lighting,asphaltNoise'],
            { cwd: tmp }
        );

        const lighting = await fs.readFile(path.join(tmp, MIRRORED_FILES[0]), 'utf8');
        const lightingBlock = extractExportedBlock(lighting, 'LIGHTING_DEFAULTS');
        assert.match(lightingBlock, /toneMapping: 'agx',/);
        assert.match(lightingBlock, /exposure: 1\.13,/);

        const asphalt = await fs.readFile(path.join(tmp, MIRRORED_FILES[1]), 'utf8');
        const asphaltBlock = extractExportedBlock(asphalt, 'ASPHALT_NOISE_DEFAULTS');
        const stripIdx = asphaltBlock.indexOf('sidewalkGrassEdgeStrip: Object.freeze({');
        assert.ok(stripIdx >= 0, 'expected sidewalkGrassEdgeStrip block');
        assert.ok(asphaltBlock.indexOf('edgeDirt: Object.freeze({') < stripIdx, 'strip after edgeDirt');
        assert.ok(stripIdx < asphaltBlock.indexOf('cracks: Object.freeze({'), 'strip before cracks');
        assert.match(asphaltBlock, /colorHex: 0x4d473c,/);
        assert.match(asphaltBlock, /fadePower: 2\n/);
        assert.match(asphaltBlock, /opacity: 0\.5,/);

        // The rewritten files must remain parseable modules with intact tails.
        assert.match(lighting, /export const LIGHTING_LIMITS/);
        assert.match(asphalt, /function sanitizeSidewalkGrassEdgeStripSettings/);
    } finally {
        await fs.rm(tmp, { recursive: true, force: true });
    }
});

test('promote_to_defaults: dry run emits single-quoted strings', async () => {
    const { tmp, presetPath } = await setupTempRepo();
    try {
        const { stdout } = await execFileAsync(
            process.execPath,
            [toolPath, presetPath, '--only=lighting,colorGrading'],
            { cwd: tmp }
        );
        assert.match(stdout, /preset: 'vivid',/);
        assert.match(stdout, /toneMapping: 'agx',/);
        assert.ok(!stdout.includes('"vivid"'), 'no double-quoted strings in output');
    } finally {
        await fs.rm(tmp, { recursive: true, force: true });
    }
});
