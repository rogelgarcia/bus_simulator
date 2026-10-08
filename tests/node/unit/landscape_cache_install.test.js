// AI 595: the registered landscape/cache-install leaf authenticates a local cache bundle and installs it manifest last, under the authoring lock.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';
import { installLandscapeCacheBundle, verifyLandscapeCacheBundle, LANDSCAPE_CACHE_POINTERS } from '../../../tools/bake_landscape/CacheBundle.mjs';
import { cacheInstallJob } from '../../../tools/bake_landscape/CacheInstallJob.mjs';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const work = path.join(root, 'tests/artifacts/landscape_cache_history/install_fixture');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Writes the synthetic landscape as a cache bundle: current manifest, its content-addressed snapshot and record-verified channels. */
async function writeBundle(name, { revision = 'fixture-r1', extra = {} } = {}) {
    const fixture = createLandscapeModelFixture(), directory = path.join(work, name);
    await rm(directory, { recursive: true, force: true });
    const manifest = new TextEncoder().encode(JSON.stringify({ ...fixture.manifest, revision }));
    const files = new Map([...fixture.resources, ['manifest.json', manifest], [`manifest.${sha256(manifest)}.json`, manifest], ...Object.entries(extra)]);
    for (const [relative, bytes] of files) {
        await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
        await writeFile(path.join(directory, relative), bytes);
    }
    return { directory, manifest, fixture };
}

test('Cache install: an explicit Node-only leaf of the landscape domain, outside production and import defaults', () => {
    const plan = planBakes(bakeJobs, 'landscape/cache-install');
    assert.deepEqual(plan.map(job => job.id), ['landscape/cache-install']);
    assert.deepEqual(plan[0].configurationPaths, []);
    assert.equal(plan[0].always, true);
    assert.deepEqual(plan[0].outputs, ['tests/artifacts/landscape_cache_history/cache-install-validation.json']);
    assert.deepEqual(resolveBakeOptions(plan, parseBakeOptions([])).get('landscape/cache-install'), { directory: 'assets/public/landscape/coastal-city' });
    assert.equal(resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/cache-install:bundle=downloads/coastal-city'])).get('landscape/cache-install').bundle, 'downloads/coastal-city');
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/cache-install:source=x.zip'])), /No selected job consumes/);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => job.id !== 'landscape/cache-install'));
});

test('Cache install: every bundle file authenticates by name, hashed record or schema; corruption and transient state are refused', async () => {
    const bundle = await writeBundle('verify');
    const verified = await verifyLandscapeCacheBundle(bundle.directory);
    assert.equal(verified.passed, true, verified.problems.join('\n'));
    assert.equal(verified.landscapeId, 'synthetic-hill');
    assert.deepEqual(Object.keys(verified.pointers), ['manifest.json']);
    assert.deepEqual([...new Set(verified.files.map(file => file.verifiedBy))].sort(), ['name', 'record', 'schema']);
    const chunk = path.join(bundle.directory, bundle.fixture.manifest.chunks[0].channels.height.url);
    const bytes = await readFile(chunk); bytes[0] ^= 0xff; await writeFile(chunk, bytes);
    const corrupt = await verifyLandscapeCacheBundle(bundle.directory);
    assert.equal(corrupt.passed, false);
    assert.match(corrupt.problems.join('\n'), /hash or size mismatch/);
    await assert.rejects(installLandscapeCacheBundle(corrupt, path.join(work, 'verify-target')), /Refusing an unverified bundle/);
    const stray = await writeBundle('stray', { extra: { 'authoring.lock': '{}', 'notes.bin': 'unauthenticated' } });
    const strayResult = await verifyLandscapeCacheBundle(stray.directory);
    assert.match(strayResult.problems.join('\n'), /authoring\.lock is transient authoring state/);
    assert.match(strayResult.problems.join('\n'), /notes\.bin is not authenticated/);
    await rm(path.join(stray.directory, 'manifest.json'));
    await assert.rejects(verifyLandscapeCacheBundle(stray.directory), /has no manifest\.json/);
});

test('Cache install: a cold install, an identical rerun and a resumed partial install all end authenticated with the manifest switched last', async () => {
    const bundle = await writeBundle('cold'), target = path.join(work, 'cold-target');
    await rm(target, { recursive: true, force: true });
    const verified = await verifyLandscapeCacheBundle(bundle.directory);
    const installed = await installLandscapeCacheBundle(verified, target);
    assert.equal(path.basename(installed.at(-1)), 'manifest.json', 'the current terrain manifest switches last');
    assert.equal(installed.length, verified.files.length);
    const result = await verifyLandscapeCacheBundle(target);
    assert.equal(result.passed, true, result.problems.join('\n'));
    assert.deepEqual(result.pointers, verified.pointers);
    assert.deepEqual(await installLandscapeCacheBundle(verified, target).then(files => files.length), verified.files.length, 'identical reinstall is a no-op success');
    const partial = path.join(work, 'partial-target');
    await rm(partial, { recursive: true, force: true });
    const half = verified.files.filter(file => !LANDSCAPE_CACHE_POINTERS.includes(file.relative)).slice(0, 3);
    for (const file of half) { await mkdir(path.dirname(path.join(partial, file.relative)), { recursive: true }); await writeFile(path.join(partial, file.relative), await readFile(path.join(bundle.directory, file.relative))); }
    await installLandscapeCacheBundle(verified, partial);
    assert.equal((await verifyLandscapeCacheBundle(partial)).passed, true);
});

test('Cache install: local revisions, conflicting immutable files and a held lock are never overwritten', async () => {
    const older = await writeBundle('older', { revision: 'fixture-r0' }), newer = await writeBundle('newer', { revision: 'fixture-r2' });
    const target = path.join(work, 'protected-target');
    await rm(target, { recursive: true, force: true });
    await installLandscapeCacheBundle(await verifyLandscapeCacheBundle(older.directory), target);
    await assert.rejects(installLandscapeCacheBundle(await verifyLandscapeCacheBundle(newer.directory), target), /local revision the bundle does not retain/);
    assert.deepEqual(await readFile(path.join(target, 'manifest.json')), Buffer.from(older.manifest), 'the refused install left the current manifest untouched');
    // a bundle that retains the installed revision as a snapshot may supersede it
    const successor = await writeBundle('successor', { revision: 'fixture-r2', extra: { [`manifest.${sha256(older.manifest)}.json`]: older.manifest } });
    await installLandscapeCacheBundle(await verifyLandscapeCacheBundle(successor.directory), target);
    assert.match((await readFile(path.join(target, 'manifest.json'), 'utf8')), /"revision":"fixture-r2"/);
    const conflicting = path.join(work, 'conflict-target');
    await rm(conflicting, { recursive: true, force: true });
    const chunk = older.fixture.manifest.chunks[0].channels.height.url;
    await mkdir(path.dirname(path.join(conflicting, chunk)), { recursive: true });
    await writeFile(path.join(conflicting, chunk), 'different immutable bytes');
    await assert.rejects(installLandscapeCacheBundle(await verifyLandscapeCacheBundle(older.directory), conflicting), /Immutable content changed/);
    await assert.rejects(readFile(path.join(conflicting, 'manifest.json')), { code: 'ENOENT' }, 'no pointer switched after the refused immutable write');
    const locked = path.join(work, 'locked-target');
    await rm(locked, { recursive: true, force: true }); await mkdir(locked, { recursive: true });
    await writeFile(path.join(locked, 'authoring.lock'), JSON.stringify({ pid: process.pid, token: '00000000-0000-4000-8000-000000000000' }));
    await assert.rejects(installLandscapeCacheBundle(await verifyLandscapeCacheBundle(older.directory), locked), /Another authoring transaction owns this landscape/);
});

test('Cache install: the leaf validates without --publish and installs with it, writing its receipt', async () => {
    const bundle = await writeBundle('leaf'), target = path.join(work, 'leaf-target'), stage = path.join(work, 'leaf-stage');
    await rm(target, { recursive: true, force: true }); await mkdir(stage, { recursive: true });
    const lines = [];
    const ctx = publish => ({ id: cacheInstallJob.id, root, stage, publish, options: { bundle: path.relative(root, bundle.directory), directory: path.relative(root, target) },
        log: { line: (_, text) => lines.push(text) }, assertInputsStable: async () => {} });
    assert.ok((await cacheInstallJob.inputs(ctx(false))).length > 0);
    const validated = await cacheInstallJob.run(ctx(false));
    assert.equal(validated.state, 'validated');
    await assert.rejects(readFile(path.join(target, 'manifest.json')), { code: 'ENOENT' });
    const published = await cacheInstallJob.run(ctx(true));
    assert.equal(published.state, 'published');
    await cacheInstallJob.validate(published);
    const receipt = JSON.parse(await readFile(path.join(root, 'tests/artifacts/landscape_cache_history/cache-install-validation.json'), 'utf8'));
    assert.equal(receipt.passed, true);
    assert.equal(receipt.published, true);
    assert.equal(receipt.installed.revision, 'fixture-r1');
    assert.match(lines.at(-1), /installed into/);
    await assert.rejects(cacheInstallJob.inputs({ ...ctx(false), options: { directory: 'x' } }), /requires --set landscape\/cache-install:bundle=/);
});
