// Regression: a protected GPU slot must not cause repeated downloads/decompression.
import { test, expect } from '@playwright/test';

test('Streamed shadows retain decoded pages while old residency leases expire', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks?.getEngine?.());
    const result = await page.evaluate(async () => {
        const { StreamedShadowResidency } = await import('/src/graphics/illumination/static_sun_depth/StreamedShadowResidency.js');
        const { ShadowPageResidency } = await import('/src/app/illumination/static_sun_depth/StreamedShadowPages.js');
        const uniforms = { staticSunStreamTime: { value: 0 } };
        const requests = []; let uploads = 0;
        const manager = new StreamedShadowResidency({ uniforms }, { initTexture() { uploads++; } });
        manager.enabled = true; manager.nextSelection = Infinity;
        manager.worker = { postMessage: value => requests.push(value) };
        manager.residency = new ShadowPageResidency(1);
        manager.residency.select([3], 0); manager.residency.admit(3, 0);
        manager.residency.select([4], .5); manager.wanted = [4];
        manager.pages = new Map([[4, { path: 'pages/4.rg8.gz' }]]);
        manager.baseUrl = new URL(location.href); manager.pageBytes = 4;
        manager.pool = { image: { data: new Uint8Array(4) }, addLayerUpdate() {} };
        manager.table = { image: { data: new Float32Array(24) } };
        manager.ready.push({ id: 4, raw: new Uint8Array([1, 2, 3, 4]) });
        for (let i = 0; i < 100; i++) manager.update({}, .5 + i * .014);
        const waiting = { queued: manager.ready.length, requests: requests.length, uploads, ids: [...manager.residency.entries.keys()] };
        manager.update({}, 2.1);
        return { waiting, uploaded: { queued: manager.ready.length, requests: requests.length, uploads,
            ids: [...manager.residency.entries.keys()], bytes: [...manager.pool.image.data] } };
    });
    expect(result.waiting).toEqual({ queued: 1, requests: 0, uploads: 0, ids: [3] });
    expect(result.uploaded).toEqual({ queued: 0, requests: 0, uploads: 1, ids: [4], bytes: [1, 2, 3, 4] });
});
