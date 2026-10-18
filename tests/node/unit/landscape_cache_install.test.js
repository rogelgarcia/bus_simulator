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
import { installLandscapeCacheBundle, landscapeCacheBundleDestination, verifyLandscapeCacheBundle, LANDSCAPE_CACHE_POINTERS } from '../../../tools/bake_landscape/CacheBundle.mjs';
import { cacheInstallJob, resolveCacheInstallDirectory } from '../../../tools/bake_landscape/CacheInstallJob.mjs';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const work = path.join(root, 'tests/artifacts/landscape_cache_history/install_fixture');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Writes the synthetic landscape as a cache bundle: current manifest, its content-addressed snapshot and record-verified channels. */
async function writeBundle(name, { revision = 'fixture-r1', id, extra = {} } = {}) {
    const fixture = createLandscapeModelFixture(), directory = path.join(work, name);
    await rm(directory, { recursive: true, force: true });
    const manifest = new TextEncoder().encode(JSON.stringify({ ...fixture.manifest, ...(id ? { id } : {}), revision }));
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
    assert.deepEqual(resolveBakeOptions(plan, parseBakeOptions([])).get('landscape/cache-install'), { directory: 'auto' });
    assert.equal(resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/cache-install:bundle=downloads/coastal-city'])).get('landscape/cache-install').bundle, 'downloads/coastal-city');
    assert.equal(resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/cache-install:directory=assets/public/landscape/coastal-city-v3'])).get('landscape/cache-install').directory, 'assets/public/landscape/coastal-city-v3');
    assert.throws(() => resolveBakeOptions(plan, parseBakeOptions(['--set', 'landscape/cache-install:source=x.zip'])), /No selected job consumes/);
    assert.ok(planBakes(bakeJobs, 'all').every(job => !job.id.startsWith('landscape')));
    assert.ok(planBakes(bakeJobs, 'landscape').every(job => job.id !== 'landscape/cache-install'));
});

// AI 596 D4: the city pins coastal-city-v3 while the viewer default stays coastal-city, so a bundle installs into its own id's directory by default.
test('Cache install: the destination follows the bundle landscape id unless a directory is named, and never another landscape\'s cache', async () => {
    const v3 = { landscapeId: 'coastal-city-v3' }, v2 = { landscapeId: 'coastal-city' };
    assert.equal(landscapeCacheBundleDestination(v3), 'assets/public/landscape/coastal-city-v3');
    assert.equal(landscapeCacheBundleDestination(v2), 'assets/public/landscape/coastal-city');
    assert.throws(() => landscapeCacheBundleDestination({ landscapeId: 'nested/id' }), /does not name a cache directory/);
    assert.throws(() => landscapeCacheBundleDestination({ landscapeId: null }), /no landscape id/);
    assert.equal(resolveCacheInstallDirectory(root, { directory: 'auto' }, v3), path.resolve(root, 'assets/public/landscape/coastal-city-v3'));
    assert.equal(resolveCacheInstallDirectory(root, {}, v2), path.resolve(root, 'assets/public/landscape/coastal-city'));
    assert.equal(resolveCacheInstallDirectory(root, { directory: 'tests/artifacts/elsewhere' }, v3), path.resolve(root, 'tests/artifacts/elsewhere'));
    const hill = await writeBundle('identity-hill'), other = await writeBundle('identity-other', { id: 'synthetic-hill-v3' });
    const target = path.join(work, 'identity-target');
    await rm(target, { recursive: true, force: true });
    await installLandscapeCacheBundle(await verifyLandscapeCacheBundle(hill.directory), target);
    const verifiedOther = await verifyLandscapeCacheBundle(other.directory);
    assert.equal(verifiedOther.landscapeId, 'synthetic-hill-v3');
    await assert.rejects(installLandscapeCacheBundle(verifiedOther, target), /holds landscape synthetic-hill; the bundle is synthetic-hill-v3\. Install it into its own directory \(assets\/public\/landscape\/synthetic-hill-v3\)/);
    assert.deepEqual(await readFile(path.join(target, 'manifest.json')), Buffer.from(hill.manifest), 'the refused install left the other landscape untouched');
    // the AI 596 geology and AI 599 ecosystem sidecars are current pointers like the appearance and field sidecars: authenticated by schema and switched before the terrain manifest
    assert.deepEqual([...LANDSCAPE_CACHE_POINTERS], ['appearance/manifest.json', 'appearance/multiscale.json', 'appearance/layers.json', 'fields/manifest.json', 'geology/manifest.json', 'surround/manifest.json', 'ecosystem/manifest.json', 'manifest.json']);
    const page = new Uint8Array([1, 2, 3, 4]), geology = new TextEncoder().encode(JSON.stringify({ format: 'landscape-geology', pages: [{ url: `pages/${sha256(page)}.u8`, sha256: sha256(page), byteLength: page.length }] }));
    const withGeology = await writeBundle('geology', { extra: { 'geology/manifest.json': geology, [`geology/manifest.${sha256(geology)}.json`]: geology, [`geology/pages/${sha256(page)}.u8`]: page } });
    const verified = await verifyLandscapeCacheBundle(withGeology.directory);
    assert.equal(verified.passed, true, verified.problems.join('\n'));
    assert.deepEqual(Object.keys(verified.pointers), ['geology/manifest.json', 'manifest.json']);
    assert.equal(verified.files.find(file => file.relative === 'geology/manifest.json').verifiedBy, 'schema');
    const geologyTarget = path.join(work, 'geology-target');
    await rm(geologyTarget, { recursive: true, force: true });
    const installed = await installLandscapeCacheBundle(verified, geologyTarget);
    assert.deepEqual(installed.slice(-2).map(file => path.relative(geologyTarget, file).split(path.sep).join('/')), ['geology/manifest.json', 'manifest.json']);
    // the AI 596 D5 far-field surround is its own saved landscape under surround/: validated as a landscape manifest, its chunks record-verified
    // relative to it, switched before the terrain manifest, and bound to the terrain's id, revision and current manifest bytes
    const surroundOf = (terrainManifest, binding) => {
        const document = createLandscapeModelFixture().manifest, bytes = new TextEncoder().encode(JSON.stringify({ ...document, id: 'synthetic-hill-surround', revision: 'surround-r1',
            provenance: { ...document.provenance, preparation: { ...document.provenance.preparation, surround: { landscapeId: 'synthetic-hill', revision: 'fixture-r1', manifestSha256: sha256(terrainManifest), extent: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 }, boundaryHash: 'ab'.repeat(32), ...binding } } } }));
        const extra = { 'surround/manifest.json': bytes, [`surround/manifest.${sha256(bytes)}.json`]: bytes };
        for (const [url, resource] of createLandscapeModelFixture().resources) if (url !== 'manifest.json') extra[`surround/${url}`] = resource;
        return extra;
    };
    const terrain = await writeBundle('surround-terrain'), withSurround = await writeBundle('surround', { extra: surroundOf(terrain.manifest, {}) });
    const surround = await verifyLandscapeCacheBundle(withSurround.directory);
    assert.equal(surround.passed, true, surround.problems.join('\n'));
    assert.deepEqual(Object.keys(surround.pointers), ['surround/manifest.json', 'manifest.json']);
    assert.equal(surround.files.find(file => file.relative === 'surround/manifest.json').verifiedBy, 'schema');
    assert.ok(surround.files.filter(file => file.relative.startsWith('surround/chunks/')).every(file => file.verifiedBy === 'record'), 'the surround chunks authenticate through the surround manifest');
    assert.deepEqual(surround.surround, { id: 'synthetic-hill-surround', revision: 'surround-r1', binding: { landscapeId: 'synthetic-hill', revision: 'fixture-r1', manifestSha256: sha256(terrain.manifest), extent: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 }, boundaryHash: 'ab'.repeat(32) } });
    const surroundTarget = path.join(work, 'surround-target');
    await rm(surroundTarget, { recursive: true, force: true });
    const installedSurround = await installLandscapeCacheBundle(surround, surroundTarget);
    assert.deepEqual(installedSurround.slice(-2).map(file => path.relative(surroundTarget, file).split(path.sep).join('/')), ['surround/manifest.json', 'manifest.json']);
    assert.equal((await verifyLandscapeCacheBundle(surroundTarget)).passed, true);
    const stale = await verifyLandscapeCacheBundle((await writeBundle('surround-stale', { extra: surroundOf(terrain.manifest, { revision: 'fixture-r0', manifestSha256: 'cd'.repeat(32) }) })).directory);
    assert.equal(stale.passed, false);
    assert.match(stale.problems.join('\n'), /surround\/manifest\.json continues revision fixture-r0, the terrain manifest is fixture-r1/);
    assert.match(stale.problems.join('\n'), /surround\/manifest\.json binds terrain manifest cdcdcdcdcdcd/);
    const foreign = await verifyLandscapeCacheBundle((await writeBundle('surround-foreign', { extra: surroundOf(terrain.manifest, { landscapeId: 'synthetic-hill-v3' }) })).directory);
    assert.match(foreign.problems.join('\n'), /continues landscape synthetic-hill-v3, the cache holds synthetic-hill/);
    const unbound = await verifyLandscapeCacheBundle((await writeBundle('surround-unbound', { extra: surroundOf(terrain.manifest, { landscapeId: undefined, revision: undefined, manifestSha256: undefined }) })).directory);
    assert.equal(unbound.passed, false, 'a surround without the binding fields is refused');
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
