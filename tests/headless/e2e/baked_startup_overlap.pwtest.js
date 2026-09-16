// Independent receiver loading may overlap shadows, but binding and activation remain gated.
import { test, expect } from '@playwright/test';

for (const outcome of ['ready', 'failed', 'cancelled']) {
    test(`Baked startup overlap preserves the ${outcome} shadow boundary`, async ({ page }) => {
        await page.goto('/tests/headless/harness/index.html');
        const result = await page.evaluate(async outcome => {
            const { BakedLightingRuntime } = await import('/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js');
            const { EnhancedReceiverLightmapRuntime } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
            const events = []; let releaseShadow, shadowReady = false, disposed = 0, installed = 0;
            const shadowWait = new Promise(resolve => { releaseShadow = resolve; });
            const engine = { context: { city: { cityId: 'fixture' } }, renderer: { domElement: document.createElement('canvas') } };
            const receivers = new EnhancedReceiverLightmapRuntime(engine);
            receivers.validateLightingProfile = () => {};
            receivers.lightingKey = () => 'fixture'; receivers.makeWatch = () => () => true;
            receivers.fetchIndex = async () => ({ schema: 'bus-sim-receiver-lightmap-index-v1', cityId: 'fixture', profileId: 'p',
                channels: { indirect_irradiance: { sourceSha256: 'exact', url: '/fixture' } } });
            receivers.getSource = async () => { events.push('source'); return { liveObjectReferences: new Map(),
                sourceIdentity: { channelSources: [{ id: 'indirect_irradiance', sha256: 'exact' }] } }; };
            receivers.loadChannel = async () => { events.push('loaded'); return { mapping: { profile: { mipLevels: 1 } },
                mappingTexture: { image: { data: new Float32Array(4) } }, texture: {}, scale: [], bias: [], identity: {}, metrics: {}, dispose() { disposed++; } }; };
            receivers.installBindings = async () => { installed++; events.push('bound'); return { geometries: [], restore() {} }; };
            const shadows = { suspend() {}, commitCurrent() {}, dispose() {},
                async setSettings(settings) { if (!settings.shadows.enabled) return; events.push('shadow-start'); await shadowWait; shadowReady = outcome === 'ready'; events.push('shadow-end'); },
                getSnapshot: () => ({ pendingTransition: shadowReady ? 'baked' : null }),
                getDiagnostics: () => ({ status: { reason: 'shadow_fixture_failed' } }) };
            const bus = { configure() {}, suspend() {}, cancelStaging() {}, dispose() {}, getDiagnostics: () => ({}) };
            const runtime = new BakedLightingRuntime(engine, { shadows, receivers, bus }); engine._bakedLighting = runtime;
            runtime.settings = { ...runtime.settings, mode: 'auto', shadows: { ...runtime.settings.shadows, enabled: true },
                receivers: { ...runtime.settings.receivers, indirect: true }, bus: { ...runtime.settings.bus, enabled: false } };
            const task = runtime.refresh({ background: true });
            await new Promise(resolve => setTimeout(resolve, 30));
            const overlapping = events.includes('loaded'), untouched = installed === 0 && receivers.uniforms.receiverAtlasMapping.value === null && !runtime.ready;
            if (outcome === 'cancelled') await runtime.setSettings({ ...runtime.settings, mode: 'current' });
            releaseShadow(); await task;
            const final = { overlapping, untouched, installed, disposed, ready: runtime.ready, pending: receivers.pending === true,
                mode: runtime.effectiveMode, reason: runtime.reason, ordered: events.indexOf('bound') > events.indexOf('shadow-end') };
            runtime.dispose(); final.disposedAfterTeardown = disposed; return final;
        }, outcome);
        expect(result.overlapping).toBe(true); expect(result.untouched).toBe(true);
        expect(result.mode).toBe('current');
        expect(result.disposedAfterTeardown).toBe(1);
        if (outcome === 'ready') {
            expect(result).toMatchObject({ installed: 1, disposed: 0, ready: true, pending: true, ordered: true });
        } else {
            expect(result).toMatchObject({ installed: 0, ready: false, pending: false });
            if (outcome === 'failed') expect(result.reason).toBe('shadow_fixture_failed');
            else expect(result.reason).toBe('current_requested');
        }
    });
}

for (const outcome of ['ready', 'failed', 'cancelled', 'changed']) {
    test(`Early shaders preserve the ${outcome} receiver publication boundary`, async ({ page }) => {
        await page.goto('/tests/headless/harness/index.html');
        const result = await page.evaluate(async outcome => {
            const { BakedLightingRuntime } = await import('/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js');
            const { EnhancedReceiverLightmapRuntime } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
            let finishMaps, finishCompile, started = 0, released = 0, installed = 0, ready = false, stale = false;
            const maps = new Promise(resolve => { finishMaps = resolve; }), compile = new Promise(resolve => { finishCompile = resolve; });
            const engine = { context: { city: { cityId: 'fixture' } }, renderer: { domElement: document.createElement('canvas') } };
            const receivers = new EnhancedReceiverLightmapRuntime(engine);
            receivers.validateLightingProfile = () => {};
            receivers.lightingKey = () => 'fixture'; receivers.makeWatch = () => () => !stale;
            receivers.fetchIndex = async () => ({ schema: 'bus-sim-receiver-lightmap-index-v1', cityId: 'fixture', profileId: 'p',
                channels: { indirect_irradiance: { sourceSha256: 'exact', url: '/fixture' } } });
            receivers.getSource = async () => ({ liveObjectReferences: new Map(), sourceIdentity: { channelSources: [{ id: 'indirect_irradiance', sha256: 'exact' }] } });
            receivers.loadChannel = async ({ onMappingReady }) => {
                onMappingReady({ mapping: {}, coordinates: new Float32Array(4) });
                await maps;
                if (outcome === 'failed') throw new Error('invalid_page_hash');
                return { mapping: { profile: { mipLevels: 1 } }, mappingTexture: { image: { data: new Float32Array(4) } },
                    texture: {}, scale: [], bias: [], identity: {}, metrics: { gpuBytes: 0, cpuBytes: 0 }, dispose() {} };
            };
            receivers.installBindings = async () => { installed++; return { geometries: [], restore() {} }; };
            const shadows = { suspend() { ready = false; }, commitCurrent() {}, dispose() {}, async setSettings() { ready = true; },
                getSnapshot: () => ({ pendingTransition: ready ? 'baked' : null }), getDiagnostics: () => ({ status: {} }), getPreparedShaderBinding: () => ({}) };
            const bus = { configure() {}, suspend() {}, cancelStaging() {}, dispose() {}, getDiagnostics: () => ({}) };
            let cancelled = false;
            const runtime = new BakedLightingRuntime(engine, { shadows, receivers, bus, prepareShaderStage: async ({ signal }) => {
                started++; signal.addEventListener('abort', () => { cancelled = true; }); await compile;
                return { programCount: 1, dispose() { released++; return { programs: 1, reused: 1 }; } };
            } }); engine._bakedLighting = runtime;
            runtime.settings = { ...runtime.settings, mode: 'auto', shadows: { ...runtime.settings.shadows, enabled: true },
                receivers: { ...runtime.settings.receivers, indirect: true }, bus: { ...runtime.settings.bus, enabled: false } };
            const pending = runtime.refresh({ background: true });
            await new Promise(resolve => setTimeout(resolve, 20));
            const overlapped = started === 1 && !runtime.ready && installed === 0;
            if (outcome === 'cancelled') await runtime.setSettings({ ...runtime.settings, mode: 'current' });
            finishCompile(); await new Promise(resolve => setTimeout(resolve, 10));
            const gated = installed === 0 && receivers.uniforms.receiverAtlasMapping.value === null;
            stale = outcome === 'changed'; finishMaps(); await pending;
            const result = { overlapped, gated, installed, ready: runtime.ready, mode: runtime.effectiveMode, reason: runtime.reason,
                overlapCleared: runtime.timings.shaderOverlap === null };
            runtime.dispose(); await new Promise(resolve => setTimeout(resolve, 10));
            return { ...result, released, cancelled };
        }, outcome);
        expect(result).toMatchObject({ overlapped: true, gated: true, mode: 'current', released: 1 });
        if (outcome === 'ready') expect(result).toMatchObject({ installed: 1, ready: true });
        else expect(result).toMatchObject({ installed: 0, ready: false, cancelled: true,
            reason: outcome === 'failed' ? 'invalid_page_hash' : outcome === 'changed' ? 'source_or_profile_changed' : 'current_requested' });
        if (outcome === 'cancelled') expect(result.overlapCleared).toBe(true);
    });
}
