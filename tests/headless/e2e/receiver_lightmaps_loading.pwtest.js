import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });
const enhanced = process.env.AI548_VARIANT === 'enhanced';
const artifacts = path.resolve(process.env.RECEIVER_LOADING_ARTIFACTS ?? `tests/artifacts/screens/illumination_${enhanced ? '548' : '533'}/loading`);
if (!artifacts.startsWith(path.resolve('tests/artifacts') + path.sep)) throw new Error('Loading artifacts must stay under tests/artifacts');

test('Receiver illumination: default start-screen flow activates both channels from Options', async ({ page }) => {
    test.setTimeout(900_000);
    page.setDefaultTimeout(30_000);
    const errors = [];
    const corePageErrors = [];
    const startupErrors = [];
    const mapRequests = [];
    page.on('request', (request) => { if (/\/receivers\/.*\.gz$/.test(request.url())) mapRequests.push(request.url()); });
    let checkingReceivers = false;
    page.on('pageerror', (error) => {
        const target = error.stack?.includes('/tests/core.test.js') ? corePageErrors : checkingReceivers ? errors : startupErrors;
        target.push(error.message);
    });
    await mkdir(artifacts, { recursive: true });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { direct: false, indirect: false, linked: false }
    })));
    await page.setViewportSize({ width: 1280, height: 720 });
    console.log('Loading check: opening gameplay');
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120_000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'bus_select');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    checkingReceivers = true;
    await page.evaluate(async (enhanced) => {
        if (enhanced) {
            const engine = window.__busSim.engine;
            await engine.setBakedLightingSettings({ ...engine._bakedLighting.getSettings(),
                receivers: { direct: false, indirect: false, linked: false, enhanced: true } });
        }
        const runtime = window.__busSim.engine._bakedLighting.receivers;
        performance.setResourceTimingBufferSize(10000);
        performance.clearResourceTimings();
        window.__receiverLoadingCheck = { exports: 0, refreshes: 0, start: performance.now(), bindingPreparations: [] };
        const pipeline = window.__busSim.engine.getIlluminationPipeline();
        const matches = pipeline._liveIdentityMatches.bind(pipeline);
        pipeline._liveIdentityMatches = (descriptor, active, identity) => {
            const result = matches(descriptor, active, identity);
            if (!result) {
                const engine = window.__busSim.engine, city = engine.context.city, lights = [];
                engine.scene.traverse((o) => { if (o.isDirectionalLight) lights.push({ name: o.name, id: o.id, visible: o.visible,
                    intensity: o.intensity, allowed: city._csm?.csm?.lights.includes(o), position: o.position.toArray(), target: o.target.position.toArray() }); });
                window.__receiverLoadingCheck.shadowMismatch = { state: window.__busSim.sm.currentName, cityId: city.cityId,
                    attached: (() => { for (let o = city.group; o; o = o.parent) if (o === engine.scene) return true; return false; })(),
                    sun: city.sunRef.direction.toArray(), allowed: city._csm?.csm?.lights.map((o) => ({ id: o.id, visible: o.visible, intensity: o.intensity })),
                    live: pipeline._getLiveIdentity(), expected: descriptor.identity, packageIdentity: identity ?? active?.packageIdentity, lights };
            }
            return result;
        };
        const install = runtime.installBindings;
        runtime.installBindings = (...args) => {
            const start = performance.now(), binding = install(...args), durationMs = performance.now() - start;
            const buffers = new Set();
            for (const { geometry } of binding.geometries) for (const attribute of [...Object.values(geometry.attributes), geometry.index]) {
                if (attribute?.array) buffers.add(attribute.array.buffer);
            }
            window.__receiverLoadingCheck.bindingPreparations.push({ durationMs, receivers: binding.geometries.length,
                indexed: binding.geometries.filter(({ geometry }) => geometry.index).length,
                attributeBackingBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) });
            return binding;
        };
        const initialMaps = new Map();
        window.__busSim.engine.context.city.group.traverse((object) => {
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (material) initialMaps.set(material, { object: object.name, map: material.map });
            }
        });
        window.__receiverMapChanges = () => [...initialMaps].filter(([material, before]) => material.map !== before.map)
            .map(([material, before]) => ({ object: before.object, material: material.name,
                before: before.map?.source?.data?.src ?? before.map?.name,
                after: material.map?.source?.data?.src ?? material.map?.name }));
        const original = runtime.refresh.bind(runtime);
        runtime.refresh = (...args) => { window.__receiverLoadingCheck.refreshes++; return original(...args); };
        runtime.onSourceExport = (manifest) => {
            window.__receiverLoadingCheck.exports++;
            window.__receiverLoadingSource = manifest;
        };
    }, enhanced);
    console.log('Loading check: opening Options');
    await page.keyboard.press('0');
    await page.locator('.options-tab', { hasText: /^Baked lighting$/i }).click();
    console.log('Loading check: enabling indirect and direct');
    await page.locator('.options-row', { hasText: 'Enable baked indirect illumination' }).locator('.options-toggle-switch').click();
    await page.locator('.options-row', { hasText: 'Enable baked direct illumination' }).locator('.options-toggle-switch').click();
    let lastPhase;
    let diagnostics;
    for (let elapsed = 0; elapsed < 300; elapsed++) {
        diagnostics = await page.evaluate(() => ({ ...window.__busSim.engine._bakedLighting.receivers.getDiagnostics(),
            shadowStatus: window.__busSim.engine._bakedLighting.shadows.getDiagnostics().status }));
        const phase = diagnostics.state + ':' + diagnostics.reason + ' / shadows: ' + diagnostics.shadowStatus.state + ':' + diagnostics.shadowStatus.reason;
        if (phase !== lastPhase) { console.log('Receiver loading: ' + phase); lastPhase = phase; }
        if ((diagnostics.state === 'active' && diagnostics.effective.direct && diagnostics.effective.indirect) || diagnostics.state === 'fallback') break;
        if (diagnostics.state === 'active' && diagnostics.shadowStatus.state === 'fallback') break;
        await page.waitForTimeout(1000);
    }
    const result = await page.evaluate(() => ({ ...window.__receiverLoadingCheck,
        elapsedMs: performance.now() - window.__receiverLoadingCheck.start,
        pageUrl: location.href,
        coreTestsDone: window.__coreTestsDone,
        resources: performance.getEntriesByType('resource').filter((entry) => entry.startTime >= window.__receiverLoadingCheck.start)
            .map((entry) => ({ name: entry.name, initiator: entry.initiatorType, start: entry.startTime, duration: entry.duration,
                fetchStart: entry.fetchStart, requestStart: entry.requestStart, responseStart: entry.responseStart,
                responseEnd: entry.responseEnd, transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize })),
        ornamentTestErrors: (window.__testErrors ?? []).filter((error) => /portal def emits|pilaster shafts with a capital/.test(error.name)),
        shadows: window.__busSim.engine._bakedLighting.shadows.getDiagnostics(),
        diagnostics: window.__busSim.engine._bakedLighting.receivers.getDiagnostics() }));
    await writeFile(path.join(artifacts, 'result.json'), JSON.stringify({ ...result, corePageErrors, startupErrors }, null, 2));
    if (result.diagnostics.state !== 'active') {
        await writeFile(path.join(artifacts, 'map-changes.json'), JSON.stringify(await page.evaluate(() => window.__receiverMapChanges()), null, 2));
        const manifest = await page.evaluate(() => window.__receiverLoadingSource ?? null);
        await writeFile(path.join(artifacts, 'live-source.json'), JSON.stringify(manifest));
    }
    await page.locator('.options-row', { hasText: 'Illumination status' }).evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(artifacts, 'options-result.png') });
    expect(result.coreTestsDone).toBe(true);
    expect(result.ornamentTestErrors).toEqual([]);
    expect(result.diagnostics.state, JSON.stringify(result)).toBe('active');
    expect(result.diagnostics.effective).toEqual({ direct: true, indirect: true });
    expect(result.exports).toBe(1);
    const initialMapRequests = mapRequests.length;
    await page.evaluate(() => {
        const runtime = window.__busSim.engine._bakedLighting.receivers;
        window.__receiverCachedResources = { ...runtime.resources };
        window.__receiverOriginalGeometry = runtime.bindings.geometries.map(({ object, original }) => ({ object, original }));
    });
    for (const channel of ['direct', 'indirect']) {
        await page.locator('.options-row', { hasText: `Enable baked ${channel} illumination` }).locator('.options-toggle-switch').click();
    }
    await expect.poll(() => page.evaluate(() => window.__busSim.engine._bakedLighting.receivers.getDiagnostics().state)).toBe('current');
    const disabled = await page.evaluate(() => {
        const runtime = window.__busSim.engine._bakedLighting.receivers;
        return { diagnostics: runtime.getDiagnostics(), bindings: !!runtime.bindings,
            retained: Object.entries(window.__receiverCachedResources).every(([id, value]) => runtime.resources[id] === value),
            restored: window.__receiverOriginalGeometry.every(({ object, original }) => object.geometry === original) };
    });
    await writeFile(path.join(artifacts, 'disabled.json'), JSON.stringify(disabled, null, 2));
    expect(disabled.retained).toBe(true);
    expect(disabled.bindings).toBe(false);
    expect(disabled.restored).toBe(true);
    expect(disabled.diagnostics.effective).toEqual({ direct: false, indirect: false });
    expect(Object.keys(disabled.diagnostics.channels)).toHaveLength(2);
    const reenabledAt = Date.now();
    for (const channel of ['indirect', 'direct']) {
        await page.locator('.options-row', { hasText: `Enable baked ${channel} illumination` }).locator('.options-toggle-switch').click();
    }
    await expect.poll(() => page.evaluate(() => window.__busSim.engine._bakedLighting.receivers.getDiagnostics().effective), { timeout: 30_000 })
        .toEqual({ direct: true, indirect: true });
    const cached = await page.evaluate(() => {
        const runtime = window.__busSim.engine._bakedLighting.receivers;
        return { diagnostics: runtime.getDiagnostics(), exports: window.__receiverLoadingCheck.exports,
            reused: Object.entries(window.__receiverCachedResources).every(([id, value]) => runtime.resources[id] === value) };
    });
    expect(cached.reused).toBe(true);
    expect(cached.exports).toBe(1);
    expect(mapRequests.length).toBe(initialMapRequests);
    await writeFile(path.join(artifacts, 'cache-reuse.json'), JSON.stringify({ disabled, cached, reenableMs: Date.now() - reenabledAt, mapRequests }, null, 2));
    if (enhanced) {
        const lifecycle = await page.evaluate(async () => {
            const engine = window.__busSim.engine, coordinator = engine._bakedLighting;
            const settings = engine._bakedLighting.getSettings(), enhanced = coordinator.receivers;
            const resources = { ...enhanced.resources };
            await engine.setBakedLightingSettings({ ...settings, receivers: { ...settings.receivers, enhanced: false } });
            engine.updateFrame(0);
            const legacyActive = coordinator.receivers.getDiagnostics().effective;
            const legacy = coordinator.receivers, legacyResources = { ...legacy.resources };
            const start = performance.now();
            await engine.setBakedLightingSettings(settings); engine.updateFrame(0);
            const returnMs = performance.now() - start;
            const reused = Object.entries(resources).every(([id, value]) => enhanced.resources[id] === value);
            await Promise.all([false, true, false, true].map((flag) => engine.setBakedLightingSettings({ ...settings,
                receivers: { ...settings.receivers, enhanced: flag } })));
            engine.updateFrame(0);
            return { legacyActive, reused, returnMs, effective: coordinator.receivers.getDiagnostics().effective,
                selectedEnhanced: coordinator.receivers === enhanced, legacyUnbound: !legacy.bindings,
                legacyRetained: Object.entries(legacyResources).every(([id, value]) => legacy.resources[id] === value) };
        });
        await writeFile(path.join(artifacts, 'implementation-cache.json'), JSON.stringify(lifecycle, null, 2));
        expect(lifecycle.legacyActive).toEqual({ direct: true, indirect: true });
        expect(lifecycle.effective).toEqual({ direct: true, indirect: true });
        for (const key of ['reused', 'selectedEnhanced', 'legacyUnbound', 'legacyRetained']) expect(lifecycle[key], key).toBe(true);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__busSim.engine._bakedLighting.receivers.getDiagnostics().state)).toBe('current');
        const cancelled = await page.evaluate(() => {
            const runtime = window.__busSim.engine._bakedLighting.receivers;
            return { retained: Object.entries(window.__receiverCachedResources).every(([id, value]) => runtime.resources[id] === value),
                exports: window.__receiverLoadingCheck.exports, settings: window.__busSim.engine._bakedLighting.getSettings().receivers };
        });
        expect(cancelled.retained).toBe(true);
        expect(cancelled.exports).toBe(1);
        expect(cancelled.settings).toMatchObject({ direct: false, indirect: false, enhanced: true });
        await writeFile(path.join(artifacts, 'cancel-cache.json'), JSON.stringify(cancelled, null, 2));
        await page.evaluate(async () => {
            const engine = window.__busSim.engine, settings = engine._bakedLighting.getSettings();
            await engine.setBakedLightingSettings({ ...settings, receivers: { ...settings.receivers, enhanced: false } });
        });
        await page.keyboard.press('0');
        await page.locator('.options-tab', { hasText: /^Baked lighting$/i }).click();
        for (const channel of ['indirect', 'direct']) {
            await page.locator('.options-row', { hasText: `Enable baked ${channel} illumination` }).locator('.options-toggle-switch').click();
        }
        await expect.poll(() => page.evaluate(() => window.__busSim.engine._bakedLighting.receivers.getDiagnostics().effective), { timeout: 30_000 })
            .toEqual({ direct: true, indirect: true });
        await page.locator('.options-row', { hasText: 'Enhanced baked illumination (AI 548)' }).locator('.options-toggle-switch').click();
        await expect.poll(() => page.evaluate(() => window.__busSim.engine._bakedLighting.receivers.getDiagnostics().effective), { timeout: 30_000 })
            .toEqual({ direct: true, indirect: true });
        const revisited = await page.evaluate(() => ({ exports: window.__receiverLoadingCheck.exports,
            reused: Object.entries(window.__receiverCachedResources).every(([id, value]) => window.__busSim.engine._bakedLighting.receivers.resources[id] === value) }));
        expect(revisited).toEqual({ exports: 1, reused: true });
        await writeFile(path.join(artifacts, 'reopened-options-cache.json'), JSON.stringify(revisited, null, 2));
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    expect(startupErrors.filter((message) => message !== '[PostProcessingPipeline] renderer is required')).toEqual([]);
    expect(errors).toEqual([]);
});
