// Checks retained-map cleanup independently of expensive city loading.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });

test('Receiver illumination: disabled caches cancel pending work and release on teardown', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const results = await page.evaluate(async () => {
        const { ReceiverLightmapRuntime } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverLightmapRuntime.js');
        const { EnhancedReceiverLightmapRuntime } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
        const results = [];
        for (const Runtime of [ReceiverLightmapRuntime, EnhancedReceiverLightmapRuntime]) {
        for (const teardown of ['city_change', 'context_loss', 'dispose']) {
            const city = {};
            const engine = { context: { city }, renderer: { domElement: document.createElement('canvas') } };
            const runtime = new Runtime(engine);
            let disposed = 0, restored = 0;
            const resource = { metrics: { gpuBytes: 16, cpuBytes: 16 }, mapping: { statistics: {} },
                mappingTexture: { image: { data: new Float32Array(4) } }, scale: [], bias: [], dispose: () => disposed++ };
            const sourceAbort = new AbortController();
            const loadAbort = new AbortController();
            runtime.city = city;
            runtime.source = { references: new Map() };
            runtime.watch = () => true;
            runtime.resources = { indirect_irradiance: resource };
            runtime.bindings = { restore: () => restored++ };
            runtime.sourceJob = { abort: sourceAbort };
            runtime.abort = loadAbort;
            runtime.active = true;
            runtime.uniforms.receiverIndirectEnabled.value = 1;
            runtime.uniforms.receiverAtlasEnabled.value = 1;
            runtime.uniforms.receiverIndirectAtlas.value = resource;
            await runtime.refresh();
            runtime.frameBegin();
            const disabled = { retained: runtime.resources.indirect_irradiance === resource,
                sourceRetained: !!runtime.source, restored, disposed, status: runtime.getDiagnostics().reason,
                effective: runtime.getDiagnostics().effective,
                cancelled: sourceAbort.signal.aborted && loadAbort.signal.aborted && !runtime.sourceJob };
            if (teardown === 'city_change') { engine.context.city = null; runtime.frameBegin(); }
            else if (teardown === 'context_loss') runtime.onContextLost();
            else runtime.dispose();
            results.push({ teardown, disabled, disposed, empty: Object.keys(runtime.resources).length === 0,
                detached: !runtime.source && !runtime.watch && runtime.uniforms.receiverIndirectAtlas.value === runtime.empty });
            if (teardown !== 'dispose') runtime.dispose();
        }
        }
        return results;
    });
    for (const result of results) {
        expect(result.disabled).toEqual({ retained: true, sourceRetained: true, restored: 1, disposed: 0,
            status: 'disabled_cached', effective: { direct: false, indirect: false }, cancelled: true });
        expect(result.disposed).toBe(1);
        expect(result.empty).toBe(true);
        expect(result.detached).toBe(true);
    }
});
