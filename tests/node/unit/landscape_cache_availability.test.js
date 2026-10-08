// AI 595: a missing, stale, incomplete or corrupt local landscape cache is an availability state the city and viewer report, never a boot failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { LANDSCAPE_CACHE_GUIDE, LANDSCAPE_CACHE_ROOT, LANDSCAPE_DEFAULT_DIRECTORY, describeLandscapeCacheAvailability, landscapeCacheDirectory, probeLandscapeCache,
    resolveCityLandscape } from '../../../src/app/landscape/index.js';
import { createCoastalLandscapeCitySpec } from '../../../src/app/city/specs/CoastalLandscapeCitySpec.js';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const ORIGIN = 'https://cache.test/';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const root = fileURLToPath(new URL('../../../', import.meta.url));

/** In-memory static server over repository-relative paths; `fail` maps a path to a status code or a thrown error. */
function serve(files, { fail = {} } = {}) {
    const requests = [];
    const fetchImpl = async (url, { signal } = {}) => {
        signal?.throwIfAborted();
        const relative = new URL(url).pathname.slice(1);
        requests.push(relative);
        if (fail[relative] instanceof Error) throw fail[relative];
        if (fail[relative]) return new Response('failure', { status: fail[relative] });
        const bytes = files.get(relative);
        return bytes ? new Response(bytes) : new Response('', { status: 404 });
    };
    return { fetchImpl, requests };
}

function fixtureCache({ revision } = {}) {
    const fixture = createLandscapeModelFixture();
    const directory = landscapeCacheDirectory(fixture.manifest.id), files = new Map();
    for (const [relative, bytes] of fixture.resources) files.set(`${directory}/${relative}`, bytes);
    const manifestBytes = revision ? new TextEncoder().encode(JSON.stringify({ ...fixture.manifest, revision })) : fixture.resources.get('manifest.json');
    files.set(`${directory}/manifest.json`, manifestBytes);
    const pinned = `${directory}/manifest.${sha256(manifestBytes)}.json`;
    files.set(pinned, manifestBytes);
    const overview = fixture.manifest.chunks.find(chunk => chunk.id === fixture.manifest.overviewId);
    return { fixture, directory, files, pinned, current: `${directory}/manifest.json`, overview: Object.values(overview.channels).map(channel => `${directory}/${channel.url}`) };
}

test('Landscape cache: one gitignored root holds every landscape directory', () => {
    assert.equal(LANDSCAPE_CACHE_ROOT, 'assets/public/landscape');
    assert.equal(LANDSCAPE_DEFAULT_DIRECTORY, 'assets/public/landscape/coastal-city');
    assert.equal(landscapeCacheDirectory('synthetic-hill'), 'assets/public/landscape/synthetic-hill');
    for (const id of ['', '../x', 'a/b', '.hidden', 'x'.repeat(65)]) assert.throws(() => landscapeCacheDirectory(id), /one cache directory/);
});

test('Landscape cache: an installed current or pinned manifest with authentic overview payloads is available', async () => {
    const cache = fixtureCache(), server = serve(cache.files);
    const current = await probeLandscapeCache(ORIGIN + cache.current, { fetchImpl: server.fetchImpl });
    assert.equal(current.available, true);
    assert.equal(current.status, 'available');
    assert.equal(current.revision, cache.fixture.manifest.revision);
    assert.deepEqual(server.requests, [cache.current, ...cache.overview]);
    const pinned = await probeLandscapeCache(ORIGIN + cache.pinned, { fetchImpl: server.fetchImpl, expectedRevision: cache.fixture.manifest.revision });
    assert.equal(pinned.status, 'available');
    assert.match(describeLandscapeCacheAvailability(pinned), /^Landscape cache: available \(revision fixture-r1\)/);
    const metadataOnly = serve(cache.files);
    assert.equal((await probeLandscapeCache(ORIGIN + cache.current, { fetchImpl: metadataOnly.fetchImpl, payloads: false })).status, 'available');
    assert.deepEqual(metadataOnly.requests, [cache.current]);
});

test('Landscape cache: an absent cache is reported as missing with the generate/install guidance', async () => {
    const cache = fixtureCache(), empty = serve(new Map());
    for (const url of [cache.current, cache.pinned]) {
        const result = await probeLandscapeCache(ORIGIN + url, { fetchImpl: empty.fetchImpl });
        assert.equal(result.available, false);
        assert.equal(result.status, 'missing');
        assert.match(result.reason, /^no landscape cache is installed \(.*returned HTTP 404\)$/);
        assert.match(result.action, /landscape\/cache-install/);
        assert.ok(describeLandscapeCacheAvailability(result).includes(LANDSCAPE_CACHE_GUIDE));
    }
});

test('Landscape cache: a regenerated cache that does not retain the pinned manifest, or another revision, is stale', async () => {
    const pinnedCache = fixtureCache(), regenerated = fixtureCache({ revision: 'fixture-r2' });
    regenerated.files.delete(regenerated.pinned);
    const result = await probeLandscapeCache(ORIGIN + pinnedCache.pinned, { fetchImpl: serve(regenerated.files).fetchImpl, expectedRevision: 'fixture-r1' });
    assert.equal(result.status, 'stale');
    assert.equal(result.currentRevision, 'fixture-r2');
    assert.match(result.reason, /does not retain the pinned manifest manifest\.[a-f0-9]{64}\.json/);
    assert.match(result.action, /explicitly rebind/);
    const revision = await probeLandscapeCache(ORIGIN + regenerated.current, { fetchImpl: serve(regenerated.files).fetchImpl, expectedRevision: 'fixture-r1' });
    assert.equal(revision.status, 'stale');
    assert.match(revision.reason, /revision fixture-r2 differs from the pinned revision fixture-r1/);
});

test('Landscape cache: missing overview payloads are incomplete; corrupt bytes or names are invalid', async () => {
    const cache = fixtureCache();
    const withoutPayload = new Map(cache.files); withoutPayload.delete(cache.overview[1]);
    assert.equal((await probeLandscapeCache(ORIGIN + cache.current, { fetchImpl: serve(withoutPayload).fetchImpl })).status, 'incomplete');
    const corrupt = new Map(cache.files), bytes = new Uint8Array(corrupt.get(cache.overview[0])); bytes[0] ^= 0xff; corrupt.set(cache.overview[0], bytes);
    const corruptResult = await probeLandscapeCache(ORIGIN + cache.current, { fetchImpl: serve(corrupt).fetchImpl });
    assert.equal(corruptResult.status, 'invalid');
    assert.match(corruptResult.reason, /SHA-256 mismatch/);
    const renamed = new Map(cache.files); renamed.set(cache.pinned, new TextEncoder().encode(JSON.stringify({ ...cache.fixture.manifest, name: 'edited' })));
    assert.match((await probeLandscapeCache(ORIGIN + cache.pinned, { fetchImpl: serve(renamed).fetchImpl })).reason, /content-addressed landscape manifest SHA-256 mismatch/);
    const garbage = new Map(cache.files); garbage.set(cache.current, new TextEncoder().encode('{"format":'));
    assert.equal((await probeLandscapeCache(ORIGIN + cache.current, { fetchImpl: serve(garbage).fetchImpl })).status, 'invalid');
});

test('Landscape cache: an unreachable server is reported, while cancellation still aborts', async () => {
    const cache = fixtureCache();
    const offline = serve(cache.files, { fail: { [cache.current]: new TypeError('fetch failed') } });
    assert.equal((await probeLandscapeCache(ORIGIN + cache.current, { fetchImpl: offline.fetchImpl })).status, 'unreachable');
    const broken = serve(cache.files, { fail: { [cache.current]: 500 } });
    assert.match((await probeLandscapeCache(ORIGIN + cache.current, { fetchImpl: broken.fetchImpl })).reason, /HTTP 500/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(probeLandscapeCache(ORIGIN + cache.current, { fetchImpl: serve(cache.files).fetchImpl, signal: controller.signal }), { name: 'AbortError' });
});

test('Landscape cache: the coastal city boots without its cache and reports missing or stale instead of throwing', async () => {
    const binding = createCoastalLandscapeCitySpec().landscape;
    const missing = await resolveCityLandscape(binding, { baseUrl: ORIGIN, fetchImpl: serve(new Map()).fetchImpl });
    assert.equal(missing.available, false);
    assert.equal(missing.status, 'missing');
    assert.equal(missing.binding.landscapeId, 'coastal-city');
    assert.equal(missing.manifestUrl, ORIGIN + binding.manifestUrl);
    const pointerOnly = new Map([[`${LANDSCAPE_DEFAULT_DIRECTORY}/manifest.json`, new TextEncoder().encode(JSON.stringify({ revision: 'materials-regenerated' }))]]);
    const stale = await resolveCityLandscape(binding, { baseUrl: ORIGIN, fetchImpl: serve(pointerOnly).fetchImpl });
    assert.equal(stale.status, 'stale');
    assert.equal(stale.currentRevision, 'materials-regenerated');
    await assert.rejects(resolveCityLandscape({ ...binding, transform: { ...binding.transform, scale: 2 } }, { baseUrl: ORIGIN, fetchImpl: serve(new Map()).fetchImpl }), /scale:1/);
});

// Runs against the developer's installed cache; a clean checkout has none, which is exactly the condition the tests above cover.
test('Landscape cache: the installed coastal cache retains the city pin byte for byte', { skip: landscapeCacheSkip() }, async () => {
    const fetchImpl = async url => {
        try { return new Response(await readFile(path.join(root, decodeURIComponent(new URL(url).pathname.slice(1))))); }
        catch (error) { if (error.code === 'ENOENT') return new Response('', { status: 404 }); throw error; }
    };
    const binding = createCoastalLandscapeCitySpec().landscape;
    const result = await resolveCityLandscape(binding, { baseUrl: ORIGIN, fetchImpl });
    assert.equal(result.status, 'available', result.reason);
    assert.equal(result.revision, binding.revision);
    const bytes = await readFile(path.join(root, binding.manifestUrl));
    assert.equal(sha256(bytes), binding.manifestUrl.match(/manifest\.([a-f0-9]{64})\.json$/)[1]);
});

test('Landscape cache: the landscape server serves the viewer without a cache and picks up a cache installed while it runs', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'landscape-cache-server-'));
    await mkdir(path.join(base, 'screens'), { recursive: true });
    await writeFile(path.join(base, 'screens/landscape_fabrication.html'), '<!doctype html><title>viewer</title>');
    const server = createLandscapeServer({ root: base });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`, manifestUrl = `${origin}/${LANDSCAPE_DEFAULT_DIRECTORY}/manifest.json`;
    try {
        assert.equal((await fetch(`${origin}/`)).status, 200, 'the viewer page does not depend on the cache');
        const missing = await fetch(manifestUrl);
        assert.equal(missing.status, 404);
        assert.match((await missing.json()).error, new RegExp(`Landscape cache not installed at ${LANDSCAPE_DEFAULT_DIRECTORY}; see .*Local landscape cache`));
        assert.equal((await probeLandscapeCache(manifestUrl)).status, 'missing');
        await mkdir(path.join(base, LANDSCAPE_DEFAULT_DIRECTORY), { recursive: true });
        await writeFile(path.join(base, LANDSCAPE_DEFAULT_DIRECTORY, 'manifest.json'), '{"id":"coastal-city"}');
        assert.equal((await fetch(manifestUrl)).status, 200, 'a cache installed while the server runs is served without a restart');
        assert.equal((await probeLandscapeCache(manifestUrl)).status, 'invalid');
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await rm(base, { recursive: true, force: true });
    }
});
