// Verifies the strict multiscale appearance companion contract, its bounded loaders, schema-1 fallback and micro texel decoding.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT, LANDSCAPE_APPEARANCE_MULTISCALE_TIERS, LandscapeAppearanceMultiscaleBindingError, decodeLandscapeAppearanceMicroTexel,
    landscapeAppearanceBindingKey, loadLandscapeAppearanceMultiscale, loadLandscapeAppearanceMultiscalePage, loadLandscapeAppearancePage,
    validateLandscapeAppearanceManifest, validateLandscapeAppearanceMultiscale } from '../../../src/app/landscape/index.js';

const directory = path.resolve('assets/public/landscape/coastal-city/appearance');
const extendedAppearance = 'e7856366836d5cbf8a0c7d5ebb77862ca625dd08460b7c4b710b3a0cc6801ca8';
const multiscaleSnapshot = '07ec6c0aa26a77487d75959480171c7c1aa4e85565aac643fb34c31d5b339683';
const olderAppearance = 'aec36e5b53837b67b6316803460980d4b805ce17bc8db7a1919f954bc4781b0b';
const url = 'https://fixture/terrain/appearance/multiscale.json';
const json = async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'));
const appearance = await json(`manifest.${extendedAppearance}.json`);
const sidecar = await json(`multiscale.${multiscaleSnapshot}.json`);
const sand = value => value.materials.find(material => material.soilId === 'sand');

function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorder(entry)]));
}

function mutated(change) {
    const value = structuredClone(sidecar);
    change(value);
    return value;
}

function isDeepFrozen(value) {
    return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(isDeepFrozen));
}

function respond(body, init) {
    return async () => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), init);
}

test('Appearance multiscale: the published companion validates strictly against the appearance it extends and is deeply frozen', async () => {
    const value = await validateLandscapeAppearanceMultiscale(sidecar, appearance);
    assert.ok(isDeepFrozen(value));
    assert.equal(value.appearanceRevision, appearance.revision);
    assert.equal(value.bindingKey, await landscapeAppearanceBindingKey(appearance));
    assert.deepEqual(value.capabilities, { encoding: 'rgba8', gpuCompression: 'none', maxPageBytes: 4194304, tiers: [32, 128, 512, 1024] });
    assert.deepEqual(value.materials.map(material => [material.soilId, material.materialId]), appearance.materials.map(material => [material.soilId, material.materialId]));
    assert.ok(value.materials.every(material => material.tiers.length === 1 && material.tiers[0].resolution === 1024));
    assert.deepEqual(value.materials.filter(material => material.micro).map(material => material.soilId), ['seabed', 'sand']);
    assert.deepEqual(sand(value).micro.tiers.map(tier => tier.resolution), LANDSCAPE_APPEARANCE_MULTISCALE_TIERS);
    assert.ok(Buffer.byteLength(JSON.stringify(sidecar)) < LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT);
});

test('Appearance multiscale: validation is independent of JSON key order in both the companion and the appearance', async () => {
    const reordered = await validateLandscapeAppearanceMultiscale(reorder(sidecar), reorder(appearance));
    assert.deepEqual(reordered, await validateLandscapeAppearanceMultiscale(sidecar, appearance));
    assert.equal(await landscapeAppearanceBindingKey(reorder(appearance)), sidecar.bindingKey);
});

test('Appearance multiscale: another landscape, appearance revision or binding is a typed binding mismatch', async () => {
    const cases = [
        mutated(value => { value.landscapeId = 'another-landscape'; }),
        mutated(value => { value.appearanceRevision = 'appearance-000000000000000000000000'; }),
        mutated(value => { value.bindingKey = 'f'.repeat(64); })
    ];
    for (const value of cases) await assert.rejects(validateLandscapeAppearanceMultiscale(value, appearance), LandscapeAppearanceMultiscaleBindingError);
    await assert.rejects(validateLandscapeAppearanceMultiscale(sidecar, await json(`manifest.${olderAppearance}.json`)), LandscapeAppearanceMultiscaleBindingError,
        'a pinned older appearance must receive a typed mismatch so the runtime keeps schema-1 tiers');
    const corruptAndMismatched = mutated(value => { value.appearanceRevision = 'appearance-other'; sand(value).tiers[0].channels.orm.byteLength++; });
    await assert.rejects(validateLandscapeAppearanceMultiscale(corruptAndMismatched, appearance), error => !(error instanceof LandscapeAppearanceMultiscaleBindingError) && /byte size/.test(error.message),
        'structural corruption is never reported as an innocent binding mismatch');
});

test('Appearance multiscale: unknown soils, missing tiers, oversize pages, bad encodings and unknown fields are rejected', async () => {
    const rejections = {
        'unknown soil': value => { sand(value).soilId = 'dunes'; },
        'material order': value => { value.materials.reverse(); },
        'material identity': value => { sand(value).materialId = 'pbr.other_sand'; },
        'missing base tier': value => { sand(value).tiers = []; },
        'missing micro tier': value => { sand(value).micro.tiers.pop(); },
        'micro tier order': value => { sand(value).micro.tiers.reverse(); },
        'micro channel name': value => { const tier = sand(value).micro.tiers[0]; tier.channels = { detail: tier.channels.micro }; },
        'oversize page': value => { const page = sand(value).tiers[0].channels.baseColor; page.width = page.height = 2048; page.byteLength = page.decodedByteLength = 2048 * 2048 * 4; },
        'byte length': value => { sand(value).micro.tiers[2].channels.micro.byteLength--; },
        'page encoding': value => { sand(value).tiers[0].channels.normal.encoding = 'rgb8'; },
        'color space': value => { sand(value).tiers[0].channels.baseColor.colorSpace = 'linear'; },
        'micro encoding': value => { sand(value).micro.encoding = 'micro-normal-height-luminance-v2'; },
        'gpu compression': value => { value.capabilities.gpuCompression = 'bc7'; },
        'page limit': value => { value.capabilities.maxPageBytes = 1024 * 1024; },
        'capability tiers': value => { value.capabilities.tiers = [32, 128, 512]; },
        'luminance range': value => { sand(value).micro.luminanceRange = 1.5; },
        'tile meters': value => { sand(value).micro.tileMeters = 0; },
        'provenance source': value => { sand(value).micro.provenanceSourceIds.push('pbr/missing/basecolor.png'); },
        'content address': value => { sand(value).micro.tiers[3].channels.micro.sha256 = 'a'.repeat(64); },
        'unknown top-level field': value => { value.extra = true; },
        'unknown page field': value => { sand(value).tiers[0].channels.orm.mipLevels = 11; },
        'unsafe url': value => { sand(value).tiers[0].channels.orm.url = '../pages/escape.rgba8'; },
        'schema version': value => { value.schemaVersion = 2; },
        'provenance algorithm': value => { value.provenance.algorithm = 'landscape-appearance-v1'; }
    };
    for (const [label, change] of Object.entries(rejections)) {
        await assert.rejects(validateLandscapeAppearanceMultiscale(mutated(change), appearance), error => error.message.startsWith('[Landscape]') && !(error instanceof LandscapeAppearanceMultiscaleBindingError), label);
    }
    await assert.rejects(validateLandscapeAppearanceMultiscale(sidecar, { ...appearance, schemaVersion: 2 }), /unsupported appearance schema/);
});

test('Appearance multiscale: a missing companion resolves to null so the runtime keeps schema-1 behavior', async () => {
    const requests = [];
    let cancelled = false;
    const missing = new ReadableStream({ cancel() { cancelled = true; } });
    const result = await loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl: async (input, init) => { requests.push([input, init.cache]); return new Response(missing, { status: 404 }); } });
    assert.equal(result, null);
    assert.deepEqual(requests, [[url, 'no-store']]);
    assert.ok(cancelled, 'the 404 body is released instead of buffered');
    const loaded = await loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl: respond(sidecar) });
    assert.equal(loaded.revision, sidecar.revision);
    assert.ok(isDeepFrozen(loaded));
});

test('Appearance multiscale: network, size, JSON, binding and cancellation failures stay explicit', async () => {
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl: respond('{}', { status: 500 }) }), /HTTP 500/);
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl: respond('{}', { status: 403 }) }), /HTTP 403/);
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl: respond(new Uint8Array(LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT + 1)) }), /exceeds/);
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl: respond('{"format":') }), /not valid UTF-8 JSON/);
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl: respond(new Uint8Array([0x7b, 0xff, 0x7d])) }), /not valid UTF-8 JSON/);
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { appearance, fetchImpl: respond(mutated(value => { value.capabilities.encoding = 'astc'; })) }), /capabilities/);
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { appearance: await json(`manifest.${olderAppearance}.json`), fetchImpl: respond(sidecar) }), LandscapeAppearanceMultiscaleBindingError);
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { fetchImpl: respond(sidecar) }), /requires the schema-1 appearance/);
    const abort = new AbortController();
    await assert.rejects(loadLandscapeAppearanceMultiscale(url, { appearance, signal: abort.signal, fetchImpl: async () => { abort.abort(); return new Response(JSON.stringify(sidecar)); } }), { name: 'AbortError' });
    await assert.rejects(loadLandscapeAppearanceMultiscale('file:///multiscale.json', { appearance, fetchImpl: respond(sidecar) }), /HTTP\(S\)/);
});

test('Appearance multiscale: 1024 pages load through the companion page loader with hash, size and budget authentication', async () => {
    const page = sand(sidecar).tiers[0].channels.baseColor, bytes = await readFile(path.join(directory, page.url));
    const requests = [];
    const loaded = await loadLandscapeAppearanceMultiscalePage(page, { manifestUrl: url, fetchImpl: async input => { requests.push(input); return new Response(bytes); } });
    assert.equal(createHash('sha256').update(loaded).digest('hex'), page.sha256);
    assert.deepEqual(requests, [new URL(page.url, url).href]);
    await assert.rejects(loadLandscapeAppearancePage(page, { manifestUrl: url, fetchImpl: async () => new Response(bytes) }), /unsupported bounded dimensions/, 'schema-1 page loading stays bounded to 512');
    const corrupt = Buffer.from(bytes); corrupt[0] ^= 1;
    await assert.rejects(loadLandscapeAppearanceMultiscalePage(page, { manifestUrl: url, fetchImpl: async () => new Response(corrupt) }), /SHA-256 mismatch/);
    await assert.rejects(loadLandscapeAppearanceMultiscalePage(page, { manifestUrl: url, fetchImpl: async () => new Response(bytes.subarray(0, 1000)) }), /truncated/);
    let fetched = false;
    await assert.rejects(loadLandscapeAppearanceMultiscalePage(page, { manifestUrl: url, maxDecodedBytes: 1024 * 1024, fetchImpl: async () => { fetched = true; return new Response(bytes); } }), /budget/);
    assert.equal(fetched, false, 'budget admission precedes I/O');
    await assert.rejects(loadLandscapeAppearanceMultiscalePage({ ...page, width: 2048, height: 2048, byteLength: 2048 * 2048 * 4, decodedByteLength: 2048 * 2048 * 4 }, { manifestUrl: url, fetchImpl: respond(bytes) }), /unsupported bounded dimensions/);
});

test('Appearance multiscale: micro texels decode the encoding round trip within 8-bit quantization', () => {
    const range = .625, encode = value => Math.round(Math.min(1, Math.max(0, value)) * 255);
    let random = 0x12345678;
    const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 2 ** 32; };
    let worstNormal = 0, worstHeight = 0, worstRatio = 0;
    for (let i = 0; i < 4096; i++) {
        const tilt = Math.acos(.3 + .7 * next()), azimuth = next() * 2 * Math.PI;
        const normal = [Math.sin(tilt) * Math.cos(azimuth), Math.sin(tilt) * Math.sin(azimuth), Math.cos(tilt)];
        const height = next(), ratio = 1 - range + 2 * range * next();
        const texel = decodeLandscapeAppearanceMicroTexel(encode(normal[0] * .5 + .5), encode(normal[1] * .5 + .5), encode(height), encode(.5 + .5 * (ratio - 1) / range), range);
        assert.ok(Math.abs(Math.hypot(...texel.normal) - 1) < 1e-12);
        worstNormal = Math.max(worstNormal, Math.acos(Math.min(1, texel.normal.reduce((sum, value, axis) => sum + value * normal[axis], 0))));
        worstHeight = Math.max(worstHeight, Math.abs(texel.height - height));
        worstRatio = Math.max(worstRatio, Math.abs(texel.luminanceRatio - ratio));
    }
    assert.ok(worstHeight <= .5 / 255 + 1e-12 && worstRatio <= range / 255 + 1e-12, `${worstHeight} ${worstRatio}`);
    assert.ok(worstNormal < .03, `worst normal error ${worstNormal} rad`);
    const neutral = decodeLandscapeAppearanceMicroTexel(128, 128, 128, 128, range);
    assert.ok(Math.abs(neutral.luminanceRatio - 1) <= range / 255 && neutral.normal[2] > .9999 && Math.abs(neutral.height - .5) < .002);
    assert.deepEqual(decodeLandscapeAppearanceMicroTexel(255, 128, 0, 255, 1).normal.map(value => Math.round(value * 1000) / 1000), [1, .004, 0].map(value => Math.round(value * 1000) / 1000));
    assert.equal(decodeLandscapeAppearanceMicroTexel(0, 0, 0, 0, .5).luminanceRatio, .5);
    for (const invalid of [[256, 0, 0, 0, .5], [0, 0, 0, 1.5, .5], [0, 0, 0, 0, 0], [0, 0, 0, 0, 2]]) assert.throws(() => decodeLandscapeAppearanceMicroTexel(...invalid));
});

test('Appearance multiscale: schema-1 consumers and their sidecar remain unchanged by the companion', async () => {
    const current = await readFile(path.join(directory, 'manifest.json'));
    assert.equal(createHash('sha256').update(current).digest('hex'), extendedAppearance, 'the D4 companion publication did not rewrite the schema-1 sidecar');
    const value = validateLandscapeAppearanceManifest(JSON.parse(current));
    assert.ok(value.materials.every(material => material.tiers.map(tier => tier.resolution).join(',') === '32,128,512'));
    assert.equal(sidecar.appearanceRevision, value.revision);
});
