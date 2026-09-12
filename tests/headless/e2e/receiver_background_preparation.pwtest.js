// Background receiver work must retain authentication, atomic geometry and cancellation cleanup.
import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { buildPackageFixture } from '../../node/unit/illumination_package/package_fixture.js';

test('Background package verification preserves ownership, immutable descriptors and structured failures', async ({ page }) => {
    const fixture = await buildPackageFixture();
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async bytes => {
        const { parseTransferredIlluminationBinaryPackage: parse, transferIlluminationPackageOwnership: own,
            isTransferredIlluminationPackageParse: owned } = await import('/src/app/illumination/package/IlluminationBinaryPackage.js');
        const { IlluminationPackageError } = await import('/src/app/illumination/package/IlluminationPackageError.js');
        const raw = new Uint8Array(bytes), lease = own(raw);
        const parsed = await parse(lease, { background: true });
        const broken = new Uint8Array(bytes); broken[broken.length-1] ^= 1;
        const corrupt = await parse(own(broken), { background: true }).then(() => null, e => e instanceof IlluminationPackageError && !!e.code);
        const reused = await parse(lease, { background: true }).then(() => false, () => true);
        const controller = new AbortController(), pending = parse(own(new Uint8Array(bytes)), {background:true,signal:controller.signal});
        controller.abort(); const cancelled = await pending.then(() => null, e => e.name);
        return { detached: raw.length === 0, owned: owned(parsed), immutable: Object.isFrozen(parsed.chunks[0].descriptor),
            hash: parsed.aggregateSha256, corrupt, reused, cancelled };
    }, [...fixture.bytes]);
    expect(result).toEqual({detached:true,owned:true,immutable:true,hash:fixture.aggregateSha256,corrupt:true,reused:true,cancelled:'AbortError'});
});

test('Background source identities equal the offline hash functions', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const { buildSourceIdentityInBackground } = await import('/src/graphics/illumination/bake_source/BakeSourceIdentityLoading.js');
        const { buildBakeSourceHashSet } = await import('/src/app/illumination/bake_source/SourceHashSet.js');
        const { buildChannelSourceHashes } = await import('/src/graphics/illumination/bake_source/BakeSourceFreshness.js');
        const input = {resolvedSource:{city:'fixture'},geometry:{objects:[]},usedMaterials:[],profiles:[],channels:[],compiler:[]};
        const context = {lightingProfiles:[]};
        const expected = await buildBakeSourceHashSet(input);
        const result = await buildSourceIdentityInBackground(input, context, new AbortController().signal);
        return {expected:{hashSet:expected,channelSources:await buildChannelSourceHashes(input.channels,expected,context)},result};
    });
    expect(result.result).toEqual(result.expected);
});

test('Receiver worker authenticates bytes and terminates on success, corruption and cancellation', async ({ page, context }) => {
    const fixture = await buildPackageFixture(), good = gzipSync(fixture.bytes);
    const corrupt = fixture.bytes.slice(); corrupt[corrupt.length - 1] ^= 1;
    const bad = gzipSync(corrupt);
    await context.route('**/receiver-worker-fixture/*', async route => {
        if (route.request().url().endsWith('/slow')) await new Promise(resolve => setTimeout(resolve, 200));
        await route.fulfill({ body: route.request().url().endsWith('/bad') ? bad : good });
    });
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async ({ bytes, goodLength, badLength, hash }) => {
        const OriginalWorker = window.Worker, live = new Set(); let created = 0;
        window.Worker = class extends OriginalWorker {
            constructor(...args) { super(...args); live.add(this); created++; }
            terminate() { live.delete(this); super.terminate(); }
        };
        try {
            const { loadReceiverPackage } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverPackageLoading.js');
            const load = (path, compressedBytes, signal) => loadReceiverPackage({
                url: new URL('/receiver-worker-fixture/' + path, location.href).href,
                descriptor: { bytes, compressedBytes }, options: { expectations: { aggregateSha256: hash } }, signal });
            const good = await load('good', goodLength, new AbortController().signal);
            const failure = await load('bad', badLength, new AbortController().signal).then(() => null, e => e.message);
            const controller = new AbortController(), pending = load('slow', goodLength, controller.signal);
            controller.abort(); const cancelled = await pending.then(() => null, e => e.name);
            return { hash: good.parsed.aggregateSha256, compatible: good.parsed.compatibility.compatible,
                data: [...good.parsed.chunks.find(c => c.descriptor.id === 'direct.rgba32f').data],
                failure, cancelled, created, live: live.size };
        } finally { window.Worker = OriginalWorker; }
    }, { bytes: fixture.bytes.length, goodLength: good.length, badLength: bad.length, hash: fixture.aggregateSha256 });
    expect(result.hash).toBe(fixture.aggregateSha256); expect(result.compatible).toBe(true);
    expect(result.data).toEqual([0,0,128,63,0,0,0,63,0,0,128,62,0,0,128,63]);
    expect(result.failure).toBeTruthy(); expect(result.cancelled).toBe('AbortError');
    expect(result.created).toBe(3); expect(result.live).toBe(0);
});

test('Receiver geometry yields before a single commit and abort disposes its private clones', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { installEnhancedReceiverBindingsAsync } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverMaterialAdapter.js');
        const original = new T.PlaneGeometry(2, 2), material = new T.MeshStandardMaterial();
        const references = new Map(Array.from({length:3}, (_,i) => [String(i), new T.Mesh(original, material)]));
        const mapping = { profile: { irradianceRepresentation:'surface-diffuse-v1' },
            objects: [...references.keys()].map((id,i) => ({id, referenceCount:6, base:i*6})) };
        const coordinates = new Float32Array(3*6*4);
        for (let i=0;i<18;i++) coordinates.set([0,0,0,1],i*4);
        const clone = original.clone; let allocated = 0, disposed = 0;
        original.clone = function() {
            const g = clone.call(this); allocated++; g.addEventListener('dispose', () => disposed++);
            const start = performance.now(); while (performance.now()-start < 6) {}
            return g;
        };
        const controller = new AbortController();
        const task = installEnhancedReceiverBindingsAsync(mapping, references, {}, coordinates, controller.signal);
        const originalsDuringPreparation = [...references.values()].every(o => o.geometry === original);
        controller.abort(); const aborted = await task.then(() => null, e => e.name);
        const cleaned = allocated === disposed && [...references.values()].every(o => o.geometry === original);
        const binding = await installEnhancedReceiverBindingsAsync(mapping, references, {}, coordinates, new AbortController().signal);
        const committed = [...references.values()].every(o => o.geometry !== original);
        binding.restore(); const restored = [...references.values()].every(o => o.geometry === original);
        original.dispose(); material.dispose();
        return { originalsDuringPreparation, aborted, cleaned, committed, restored };
    });
    expect(result).toEqual({originalsDuringPreparation:true,aborted:'AbortError',cleaned:true,committed:true,restored:true});
});
