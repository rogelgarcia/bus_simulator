// Isolates installed receiver-package validation from scene construction and shader contention.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

test.use({ video: 'off', trace: 'off' });
for (const [variant, pass] of [['before', 1], ['after', 1], ['after', 2], ['before', 2], ['before', 3], ['after', 3]]) {
    test(`Validation buffers: ${variant} ${pass}`, async ({ page, context }) => {
        test.skip(process.env.BAKED_VALIDATION_BENCHMARK !== '1', 'Opt-in installed-package measurement.');
        test.setTimeout(120_000);
        const root = 'tests/artifacts/screens/ai574_baked_startup';
        const files = new Set(JSON.parse(await readFile(`${root}/step4-before-src/files.json`, 'utf8')));
        await context.route('**/src/**', async route => {
            const file = new URL(route.request().url()).pathname.slice(1);
            const worker = file.endsWith('/ReceiverPackageWorker.js');
            if (variant !== 'before' && !worker || !files.has(file)) return route.continue();
            let body = await readFile(variant === 'before' ? `${root}/step4-before-src/${file}` : file, 'utf8');
            if (worker) body = `
const validationBuffers = { digestCalls: 0, digestBytes: 0, digestSubmitMs: 0, maximumDigestSubmitMs: 0, sliceBytes: 0, maximumSliceBytes: 0 };
const savedDigest = crypto.subtle.digest, savedSlice = Uint8Array.prototype.slice, savedPost = self.postMessage;
crypto.subtle.digest = function(algorithm, value) {
    const start = performance.now(), result = savedDigest.call(this, algorithm, value);
    const ms = performance.now() - start;
    validationBuffers.digestCalls++; validationBuffers.digestBytes += value.byteLength;
    validationBuffers.digestSubmitMs += ms; validationBuffers.maximumDigestSubmitMs = Math.max(validationBuffers.maximumDigestSubmitMs, ms);
    return result;
};
Uint8Array.prototype.slice = function(...args) {
    const result = savedSlice.apply(this, args);
    validationBuffers.sliceBytes += result.byteLength; validationBuffers.maximumSliceBytes = Math.max(validationBuffers.maximumSliceBytes, result.byteLength);
    return result;
};
self.postMessage = function(data, transfer) { return savedPost.call(this, { ...data, validationBuffers }, transfer); };
` + body;
            await route.fulfill({ body, contentType: file.endsWith('.js') ? 'text/javascript' : 'text/plain' });
        });
        await page.goto('/tests/headless/harness/index.html');
        const result = await page.evaluate(async () => {
            const { loadReceiverPackage } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverPackageLoading.js');
            const indexUrl = new URL('/assets/baked_lighting/receivers/enhanced/package_index.json', location.href);
            const index = await (await fetch(indexUrl)).json(), descriptor = index.channels.indirect_irradiance;
            const options = { expectations: { cityId: index.cityId, lightingProfileId: index.profileId,
                aggregateSha256: descriptor.aggregateSha256, profileSha256: descriptor.profileSha256 },
                runtimeCapabilities: ['receiver_lightmap_sampling_v1', 'receiver_rgb9e5_sampling_v1'] };
            const before = performance.now();
            const loaded = await loadReceiverPackage({ url: new URL(descriptor.url, indexUrl).href, descriptor,
                options, signal: new AbortController().signal });
            return { elapsedMs: performance.now() - before, timings: loaded.timings, buffers: loaded.validationBuffers,
                packageBytes: descriptor.bytes, decodedBytes: loaded.parsed.metrics.decodedByteLength,
                expected: descriptor.aggregateSha256, actual: loaded.parsed.aggregateSha256, compatible: loaded.parsed.compatibility.compatible };
        });
        expect(result.actual).toBe(result.expected); expect(result.compatible).toBe(true);
        await mkdir(`${root}/step4-isolated`, { recursive: true });
        await writeFile(`${root}/step4-isolated/${variant}-${pass}.json`, JSON.stringify(result, null, 2));
        console.log(JSON.stringify({ variant, pass, ...result }));
    });
}
