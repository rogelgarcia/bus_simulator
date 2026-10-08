// AI 595 guard: the generated landscape cache is local only; nothing of it may be tracked, staged or re-included by the ignore rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LANDSCAPE_CACHE_ROOT } from '../../../src/app/landscape/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
let skip = false;
try { git('rev-parse', '--is-inside-work-tree'); } catch (error) { skip = `requires a Git work tree: ${error.message.split('\n')[0]}`; }

// Cache publications by kind, also when moved outside the cache root: payloads, pages, content-addressed manifests, sidecars and binding aliases,
// the retained source archive and its raw terrain, and the supplied source ZIP.
const CACHE_PUBLICATIONS = Object.freeze([
    ['cache root', new RegExp(`^${LANDSCAPE_CACHE_ROOT}/`)],
    ['terrain payload', /(?:^|\/)payloads\/[a-f0-9]{64}\.[a-z0-9]+$/],
    ['field or appearance page', /(?:^|\/)pages\/[a-f0-9]{64}\.[a-z0-9]+$/],
    ['content-addressed manifest, sidecar or binding alias', /(?:^|\/)(?:manifest|multiscale|binding)\.[a-f0-9]{64}\.json$/],
    ['retained source archive', /(?:^|\/)source\/[a-f0-9]{64}\//],
    ['raw terrain raster', /(?:^|\/)height_m_float32_le\.raw$/],
    ['raw landscape channel', /\.(?:f32le|rgba8)$/],
    ['coastal source ZIP', /(?:^|\/)coastal_city_terrain_v\d+\.zip$/]
]);
const cachePublication = file => CACHE_PUBLICATIONS.find(([, pattern]) => pattern.test(file))?.[0] ?? null;
const offenders = files => files.filter(Boolean).map(file => [file, cachePublication(file)]).filter(([, kind]) => kind);

test('Landscape cache tracking: the detector recognizes every cache publication kind and leaves authored sources alone', () => {
    const hash = 'a'.repeat(64);
    for (const file of [`${LANDSCAPE_CACHE_ROOT}/coastal-city/manifest.json`, `${LANDSCAPE_CACHE_ROOT}/coastal-city/PROVENANCE.json`, `${LANDSCAPE_CACHE_ROOT}/other/fields/manifest.json`,
        `elsewhere/payloads/${hash}.f32le`, `elsewhere/payloads/${hash}.u8`, `x/appearance/pages/${hash}.rgba8`, `x/fields/pages/${hash}.rgba8`, `x/manifest.${hash}.json`,
        `x/appearance/multiscale.${hash}.json`, `x/appearance/binding.${hash}.json`, `x/source/${hash}/material_masks/water.png`, 'x/height_m_float32_le.raw',
        'tests/fixtures/terrain.f32le', 'downloads/coastal_city_terrain_v2.zip']) assert.ok(cachePublication(file), file);
    for (const file of ['src/app/landscape/LandscapeCache.js', 'tools/bake_landscape/CacheBundle.mjs', 'tools/bake_landscape/appearance/multiscale-v1.json',
        'tools/bake_landscape/terrain_fields/recipe-v1.json', 'assets/public/pbr/landscape_grass_uniform_v1/pbr.landscape.config.json', 'specs/landscape/LANDSCAPE_MODEL.md',
        'tools/landscape_authoring/examples/grade_smooth_polygon.template.json']) assert.equal(cachePublication(file), null, file);
});

test('Landscape cache tracking: no cache publication is committed in HEAD or staged in the index', { skip }, () => {
    const committed = git('ls-tree', '-r', '-z', '--name-only', 'HEAD').split('\0');
    const indexed = git('ls-files', '-z', '--cached').split('\0');
    const staged = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR').split('\0');
    assert.deepEqual(offenders(committed), [], 'committed landscape cache files; remove them from history, never just from the tip');
    assert.deepEqual(offenders(indexed), [], 'tracked landscape cache files in the index');
    assert.deepEqual(offenders(staged), [], 'staged landscape cache files; unstage them (git rm --cached) and keep the cache local');
});

test('Landscape cache tracking: the whole cache root is ignored and no rule re-includes anything beneath it', { skip }, async () => {
    const samples = ['coastal-city/manifest.json', 'coastal-city/PROVENANCE.json', `coastal-city/payloads/${'b'.repeat(64)}.f32le`, `coastal-city/fields/pages/${'c'.repeat(64)}.rgba8`,
        `coastal-city/source/${'d'.repeat(64)}/height_m_float32_le.raw`, 'coastal-city/authoring.lock', 'future-landscape/manifest.json'].map(file => `${LANDSCAPE_CACHE_ROOT}/${file}`);
    const ignored = git('check-ignore', '--no-index', '-v', ...samples).trim().split('\n');
    assert.equal(ignored.length, samples.length, `every cache path must be ignored:\n${ignored.join('\n')}`);
    for (const line of ignored) assert.match(line, new RegExp(`^\\.gitignore:\\d+:/${LANDSCAPE_CACHE_ROOT}/\\t`), `ignored by the whole-root rule: ${line}`);
    const rules = (await readFile(new URL('.gitignore', `file:///${root.replaceAll('\\', '/')}`), 'utf8')).split(/\r?\n/);
    // Git never re-includes a file below an excluded directory; the check-ignore results above prove no rule re-includes the root itself.
    assert.ok(rules.includes(`/${LANDSCAPE_CACHE_ROOT}/`), 'the cache root is ignored as one directory');
    assert.deepEqual(rules.filter(rule => rule.trim().startsWith('!') && /landscape\/?$|landscape\//.test(rule)), [], 'no negation may name the cache root');
});
