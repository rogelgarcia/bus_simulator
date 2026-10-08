// AI 595: a clean checkout of the committed branch has no landscape cache, still runs the fallback and tooling paths, and the registered bake
// leaves install or regenerate the cache into the ignored location. Evidence: tests/artifacts/landscape_cache_history/cold*.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, symlinkSync, unlinkSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LANDSCAPE_CACHE_ROOT, LANDSCAPE_DEFAULT_DIRECTORY } from '../../../src/app/landscape/index.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const evidence = path.join(root, 'tests/artifacts/landscape_cache_history');
const sourceZip = path.resolve(root, process.env.LANDSCAPE_COASTAL_SOURCE_ZIP ?? 'downloads/coastal_city_terrain_v2.zip');
// children run as top-level processes: an inherited NODE_TEST_CONTEXT would make a nested `node --test` skip its files
const { NODE_TEST_CONTEXT: _parentTestContext, ...inherited } = process.env;
const env = { ...inherited, GIT_LFS_SKIP_SMUDGE: '1', LANDSCAPE_COLD_CHECKOUT: '1', NO_COLOR: '1' };
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.longpaths=true', ...args], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 }).trim();
const run = (cwd, args) => {
    const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 });
    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

let skip = process.env.LANDSCAPE_COLD_CHECKOUT ? 'already running inside a cold checkout' : false;
if (!skip) { try { git(root, 'rev-parse', '--verify', 'HEAD'); } catch { skip = 'requires a Git checkout with a HEAD commit'; } }
if (!skip && !existsSync(path.join(root, 'node_modules'))) skip = 'requires installed node_modules (npm ci) to share with the clean checkout';

/** Clean clone of the committed HEAD (Git LFS smudge skipped; no cache, no assets) that shares node_modules like a worktree. */
async function cleanCheckout(name) {
    const directory = path.join(evidence, name), link = path.join(directory, 'node_modules');
    // unlink the shared node_modules junction first, so removing the previous clone can never reach the shared store
    if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(link);
    await rm(directory, { recursive: true, force: true });
    git(root, 'clone', '--quiet', '--shared', '--no-checkout', root, directory);
    git(directory, 'checkout', '--quiet', '--detach', git(root, 'rev-parse', 'HEAD'));
    return directory;
}
const shareNodeModules = directory => symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
// never leave a junction to the shared node_modules behind in the evidence tree; the clones stay for inspection
after(() => {
    for (const name of ['cold', 'cold-generate']) {
        const link = path.join(evidence, name, 'node_modules');
        if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(link);
    }
});
const record = (name, text) => writeFile(path.join(evidence, name), text);

test('Cold checkout: no cache is checked out, and the fallback and tooling paths report it instead of failing', { skip, timeout: 10 * 60 * 1000 }, async () => {
    const clone = await cleanCheckout('cold');
    assert.equal(git(clone, 'ls-files', '--', LANDSCAPE_CACHE_ROOT), '', 'nothing under the cache root is tracked');
    assert.equal(existsSync(path.join(clone, LANDSCAPE_CACHE_ROOT)), false, 'a clean checkout has no landscape cache');
    assert.equal(git(clone, 'status', '--porcelain'), '');
    shareNodeModules(clone);

    const tests = run(clone, ['--test', 'tests/node/unit/landscape_cache_tracking.test.js', 'tests/node/unit/landscape_cache_availability.test.js',
        'tests/node/unit/landscape_cache_install.test.js', 'tests/node/unit/landscape_city_binding.test.js', 'tests/node/unit/landscape_server.test.js']);
    await record('cold-node-tests.txt', tests.output);
    assert.equal(tests.status, 0, tests.output.slice(-4000));
    assert.match(tests.output, /^(?:ℹ|#) fail 0$/m);
    assert.match(tests.output, /local landscape cache not installed/, 'cache-dependent cases skip with the guidance');

    const server = run(clone, ['--input-type=module', '-e', `
        import { createLandscapeServer } from ${JSON.stringify(pathToFileURL(path.join(clone, 'tools/landscape_server/Server.mjs')).href)};
        const server = createLandscapeServer({ root: ${JSON.stringify(clone)} });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = 'http://127.0.0.1:' + server.address().port;
        const viewer = await fetch(origin + '/'), manifest = await fetch(origin + '/${LANDSCAPE_DEFAULT_DIRECTORY}/manifest.json');
        console.log(JSON.stringify({ viewer: viewer.status, manifest: manifest.status, error: (await manifest.json()).error }));
        server.close();`]);
    await record('cold-server.txt', server.output);
    const served = JSON.parse(server.output.trim().split('\n').at(-1));
    assert.equal(served.viewer, 200, 'the viewer page is served without a cache');
    assert.equal(served.manifest, 404);
    assert.match(served.error, /Landscape cache not installed/);

    const setup = run(clone, ['tools/bake.mjs', '--target', 'landscape/hierarchy']);
    assert.equal(setup.status, 2, setup.output);
    assert.match(setup.output, /Bake setup required/, 'the first bake in a clean checkout creates the shared local configuration');
    const hierarchy = run(clone, ['tools/bake.mjs', '--target', 'landscape/hierarchy']);
    const authoring = run(clone, ['tools/landscape_authoring/run.mjs', 'state']);
    await record('cold-tooling.txt', `${setup.output}\n---\n${hierarchy.output}\n---\n${authoring.output}`);
    assert.equal(hierarchy.status, 1);
    assert.match(hierarchy.output, /\[LandscapeCache\] manifest\.json is not installed/);
    assert.equal(authoring.status, 1);
    assert.match(authoring.output, /\[LandscapeCache\] manifest\.json is not installed/);
});

test('Cold checkout: landscape/cache-install installs a verified bundle into the ignored cache and the city pin becomes available',
    { skip: skip || landscapeCacheSkip(), timeout: 10 * 60 * 1000 }, async () => {
        const clone = path.join(evidence, 'cold');
        assert.ok(existsSync(path.join(clone, 'tools/baking/blender.local.json')), 'runs after the fallback test prepared the clean checkout');
        const bundle = path.join(root, LANDSCAPE_DEFAULT_DIRECTORY);
        const install = run(clone, ['tools/bake.mjs', '--target', 'landscape/cache-install', '--set', `landscape/cache-install:bundle=${bundle}`, '--publish']);
        await record('cold-install.txt', install.output);
        assert.equal(install.status, 0, install.output.slice(-4000));
        assert.equal(git(clone, 'status', '--porcelain'), '', 'the installed cache stays ignored');
        assert.equal(git(clone, 'ls-files', '--', LANDSCAPE_CACHE_ROOT), '');
        const receipt = JSON.parse(await readFile(path.join(clone, 'tests/artifacts/landscape_cache_history/cache-install-validation.json'), 'utf8'));
        assert.equal(receipt.published, true);
        const tests = run(clone, ['--test', 'tests/node/unit/landscape_cache_availability.test.js', 'tests/node/unit/landscape_city_binding.test.js']);
        await record('cold-installed-node-tests.txt', tests.output);
        assert.equal(tests.status, 0, tests.output.slice(-4000));
        assert.match(tests.output, /^(?:ℹ|#) skipped 0$/m, 'with the installed cache nothing skips, including the byte-exact city pin');
    });

test('Cold checkout: the import and hierarchy leaves regenerate the cache from the source ZIP; the city pin then reports stale',
    { skip: skip || (!existsSync(sourceZip) && `source ZIP not found at ${sourceZip}; set LANDSCAPE_COASTAL_SOURCE_ZIP`), timeout: 10 * 60 * 1000 }, async () => {
        const clone = await cleanCheckout('cold-generate');
        shareNodeModules(clone);
        assert.equal(run(clone, ['tools/bake.mjs', '--target', 'landscape/coastal-import', '--dry-run']).status, 2, 'first run creates the local configuration');
        const imported = run(clone, ['tools/bake.mjs', '--target', 'landscape/coastal-import', '--set', `landscape/coastal-import:source=${sourceZip}`, '--publish']);
        const hierarchy = run(clone, ['tools/bake.mjs', '--target', 'landscape/hierarchy', '--publish']);
        await record('cold-generate.txt', `${imported.output}\n---\n${hierarchy.output}`);
        assert.equal(imported.status, 0, imported.output.slice(-4000));
        assert.equal(hierarchy.status, 0, hierarchy.output.slice(-4000));
        assert.equal(git(clone, 'status', '--porcelain'), '', 'the regenerated cache stays ignored');
        const probe = run(clone, ['--input-type=module', '-e', `
            import { readFile } from 'node:fs/promises';
            import path from 'node:path';
            import { resolveCityLandscape, probeLandscapeCache } from ${JSON.stringify(pathToFileURL(path.join(clone, 'src/app/landscape/index.js')).href)};
            import { createCoastalLandscapeCitySpec } from ${JSON.stringify(pathToFileURL(path.join(clone, 'src/app/city/specs/CoastalLandscapeCitySpec.js')).href)};
            const fetchImpl = async url => { try { return new Response(await readFile(path.join(${JSON.stringify(clone)}, decodeURIComponent(new URL(url).pathname.slice(1))))); }
                catch (error) { if (error.code === 'ENOENT') return new Response('', { status: 404 }); throw error; } };
            const city = await resolveCityLandscape(createCoastalLandscapeCitySpec().landscape, { baseUrl: 'https://cache.test/', fetchImpl });
            const current = await probeLandscapeCache('https://cache.test/${LANDSCAPE_DEFAULT_DIRECTORY}/manifest.json', { fetchImpl });
            console.log(JSON.stringify({ city: city.status, cityReason: city.reason ?? null, current: current.status, revision: current.revision ?? null }));`]);
        await record('cold-generate-probe.txt', probe.output);
        const states = JSON.parse(probe.output.trim().split('\n').at(-1));
        assert.equal(states.current, 'available', 'the regenerated cache is a usable landscape');
        assert.equal(states.city, 'stale', 'the city pin is reported, not thrown, when regeneration does not retain it');
    });
