// Verifies real camera/zoom-driven requests, budget fallback, independent leases and teardown.
// Pending native-build lifetime fixtures omit optional appearance so its residency cannot consume geometry staging capacity.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve(process.env.LANDSCAPE_EVIDENCE_ROOT ?? `tests/artifacts/screens/landscape/ai576/${process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'd3'}`);
const manifest = JSON.parse(await readFile(path.resolve('assets/public/landscape/coastal-city/manifest.json'), 'utf8'));
const detailedTile = manifest.chunks.filter(chunk => chunk.level === 2).sort((a, b) => b.geometricError - a.geometricError)[0];
const x = (detailedTile.bounds.minX + detailedTile.bounds.maxX) / 2;
const z = (detailedTile.bounds.minZ + detailedTile.bounds.maxZ) / 2;
const nearView = { position: [x + 120, detailedTile.maxHeight + 160, z - 160], target: [x, detailedTile.maxHeight / 2, z], projection: 'perspective', fov: 35, zoom: 1 };
const wideView = { position: [4400, 6000, -4300], target: [2000, 0, 2000], projection: 'perspective', fov: 70, zoom: 1 };
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
const consumerLeases = (state, names) => state.budget.entries.flatMap(entry => entry.leases).filter(lease => names.includes(lease.consumer));

async function open(page) {
    await mkdir(artifacts, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/screens/landscape_fabrication.html');
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready || window.__landscapeTestHooks?.snapshot().lastError, null, { timeout: 60000 });
    const state = await snapshot(page);
    expect(state.lastError).toBeNull();
    expect(state.ready).toBe(true);
}

async function openGeometryOnly(page) {
    await page.route('**/coastal-city/appearance/manifest.json', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Optional appearance excluded from geometry lifetime fixture' }));
    await open(page);
}

async function settle(page) {
    await page.waitForTimeout(150);
    await expect.poll(async () => {
        const state = await snapshot(page);
        return state.streaming?.settled && (!state.appearance || state.appearance.settled);
    }, { timeout: 45000 }).toBe(true);
    return snapshot(page);
}

function assertBounds(state) {
    const stream = state.streaming;
    expect(stream.budget.cpuBytes).toBeLessThanOrEqual(stream.budget.limits.cpuBytes);
    expect(stream.budget.gpuBytes).toBeLessThanOrEqual(stream.budget.limits.gpuBytes);
    expect(stream.budget.peakCpuBytes).toBeLessThanOrEqual(stream.budget.limits.cpuBytes);
    expect(stream.budget.peakGpuBytes).toBeLessThanOrEqual(stream.budget.limits.gpuBytes);
    expect(stream.peakUploadedBytesPerFrame).toBeLessThanOrEqual(stream.uploadLimitBytes);
    expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(stream.uploadLimitBytes);
    expect(stream.activeWorkers).toBeLessThanOrEqual(2);
    expect(stream.prefetchIds.length).toBeLessThanOrEqual(2);
    expect(stream.residentLeafIds.reduce((sum, id) => sum + 1 / 4 ** manifest.chunks.find(chunk => chunk.id === id).level, 0)).toBe(1);
    if (!stream.targetMet) expect(stream.degradationReason).toBeTruthy();
}

test('Landscape D3: actual refinement, inspection, fixed-position perspective and orthographic zoom, and release', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [], requests = [], samples = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/payloads/')) requests.push(request.url()); });
    await open(page);
    const startup = await settle(page);
    expect(startup.streaming.residentLeafIds).toEqual([manifest.overviewId]);
    expect(new Set(requests.filter(url => url.endsWith('.f32le'))).size).toBe(1);
    await page.screenshot({ path: path.join(artifacts, '01-streamed-overview.png') });
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
    const close = await settle(page);
    assertBounds(close);
    expect(close.streaming.lods.some(lod => lod.level > 0)).toBe(true);
    expect(close.sourceBytes).toBeLessThan(64 * 257 * 257 * 5);
    await page.evaluate(() => window.__landscapeTestHooks.setInspection({ lod: true, boundaries: true }));
    const inspected = await settle(page);
    assertBounds(inspected);
    expect(inspected.streaming.overlayBytes).toBeGreaterThan(0);
    await expect(page.locator('[data-field="streaming"]')).toContainText('GPU est.');
    await page.screenshot({ path: path.join(artifacts, '02-streamed-lod-inspection.png') });
    await page.evaluate(() => window.__landscapeTestHooks.setInspection({ lod: false, boundaries: false }));
    await page.evaluate(() => window.__landscapeTestHooks.setMode('combined'));
    const wired = await settle(page);
    assertBounds(wired);
    expect(wired.streaming.overlayBytes).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(artifacts, '03-streamed-wireframe.png') });
    await page.evaluate(() => window.__landscapeTestHooks.setMode('shaded'));
    await settle(page);
    expect((await snapshot(page)).streaming.overlayBytes).toBe(0);

    const fixedPose = { position: [x + 3000, detailedTile.maxHeight + 4000, z - 4000], target: [x, 0, z], projection: 'perspective', fov: 100, zoom: 1 };
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), fixedPose);
    const perspectiveWide = await settle(page);
    await page.evaluate(() => window.__landscapeTestHooks.setCamera({ fov: 5 }));
    const perspectiveNarrow = await settle(page);
    perspectiveNarrow.camera.position.forEach((value, index) => expect(value).toBeCloseTo(perspectiveWide.camera.position[index], 9));
    expect(perspectiveNarrow.streaming.desiredLeafIds.length).toBeGreaterThan(perspectiveWide.streaming.desiredLeafIds.length);
    expect(perspectiveNarrow.streaming.lods.some(lod => lod.level > 0)).toBe(true);
    assertBounds(perspectiveNarrow);

    await page.evaluate(({ x, z }) => window.__landscapeTestHooks.setCamera({ position: [x, 5000, z - 1], target: [x, 0, z], projection: 'orthographic', orthoHeight: 12000, zoom: 1 }), { x, z });
    const orthoWide = await settle(page);
    expect(orthoWide.streaming.residentLeafIds).toEqual([manifest.overviewId]);
    await page.evaluate(() => window.__landscapeTestHooks.setCamera({ zoom: 70 }));
    const orthoNarrow = await settle(page);
    orthoNarrow.camera.position.forEach((value, index) => expect(value).toBeCloseTo(orthoWide.camera.position[index], 9));
    expect(orthoNarrow.streaming.desiredLeafIds.length).toBeGreaterThan(orthoWide.streaming.desiredLeafIds.length);
    expect(orthoNarrow.streaming.lods.some(lod => lod.level > 0)).toBe(true);
    assertBounds(orthoNarrow);
    await page.evaluate(() => window.__landscapeTestHooks.setCamera({ zoom: 1 }));
    const returned = await settle(page);
    await expect.poll(async () => (await snapshot(page)).streaming.residentIds.length).toBe(1);
    expect(returned.streaming.residentLeafIds).toEqual([manifest.overviewId]);
    expect(returned.streaming.evicted).toBeGreaterThan(0);
    const releasedBaseline = await snapshot(page);
    const repeatedRoutes = [];
    for (let cycle = 0; cycle < 2; cycle++) {
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
        assertBounds(await settle(page));
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wideView);
        await settle(page);
        await expect.poll(async () => (await snapshot(page)).streaming.residentIds.length).toBe(1);
        const released = await snapshot(page);
        expect(released.budget.cpuBytes).toBe(releasedBaseline.budget.cpuBytes);
        expect(released.budget.gpuBytes).toBe(releasedBaseline.budget.gpuBytes);
        expect(released.renderer.memory.geometries).toBe(releasedBaseline.renderer.memory.geometries);
        repeatedRoutes.push(released);
    }
    samples.push({ startup, close, inspected, wired, perspectiveWide, perspectiveNarrow, orthoWide, orthoNarrow, returned, repeatedRoutes });
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect(disposed.budget.cpuBytes).toBe(0);
    expect(disposed.budget.gpuBytes).toBe(0);
    expect(disposed.memory).toBeNull();
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'streaming-verification.json'), JSON.stringify({ samples, requests, disposed, errors }, null, 2));
});

test('Landscape D3: hard low budgets retain coverage and independent native leases survive a camera turn', async ({ page }) => {
    test.setTimeout(90000);
    await open(page);
    await page.evaluate(() => window.__landscapeTestHooks.setBudgets({ cpuBytes: 16 * 1024 * 1024, gpuBytes: 8 * 1024 * 1024 }));
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
    const constrained = await settle(page);
    assertBounds(constrained);
    expect(constrained.streaming.residentLeafIds).toEqual([manifest.overviewId]);
    expect(constrained.streaming.degradationReason).toMatch(/budget/);
    const native = manifest.chunks.find(chunk => chunk.level === 3 && chunk.bounds.minX <= x && chunk.bounds.maxX >= x && chunk.bounds.minZ <= z && chunk.bounds.maxZ >= z);
    await page.evaluate(id => window.__landscapeTestHooks.acquireConsumer([id], { consumer: 'shadow-test', priority: 20, accuracy: 'authoritative' }), native.id);
    await page.evaluate(id => window.__landscapeTestHooks.acquireConsumer([id], { consumer: 'collision-test', priority: 200, accuracy: 'authoritative' }), native.id);
    await page.evaluate(() => window.__landscapeTestHooks.setCamera({ position: [15000, 8000, 15000], target: [20000, 10000, 20000], fov: 70 }));
    await settle(page);
    const leased = await snapshot(page);
    expect(leased.streaming.residentSourceIds).toContain(native.id);
    expect(consumerLeases(leased, ['shadow-test', 'collision-test'])).toHaveLength(2);
    await page.evaluate(() => window.__landscapeTestHooks.releaseConsumer('shadow-test'));
    expect((await snapshot(page)).streaming.residentSourceIds).toContain(native.id);
    await page.evaluate(() => window.__landscapeTestHooks.releaseConsumer('collision-test'));
    await expect.poll(async () => (await snapshot(page)).streaming.residentSourceIds.includes(native.id)).toBe(false);
    const released = await snapshot(page);
    expect(consumerLeases(released, ['shadow-test', 'collision-test'])).toHaveLength(0);
    assertBounds(released);
    await page.evaluate(() => window.__landscapeTestHooks.setBudgets({ cpuBytes: 16 * 1024 * 1024, gpuBytes: 1 }));
    const impossible = await snapshot(page);
    expect(impossible.ready).toBe(false);
    expect(impossible.lastError).toMatch(/Minimum terrain coverage cannot fit/);
    expect(impossible.budget.cpuBytes).toBe(0);
    expect(impossible.budget.gpuBytes).toBe(0);
    await writeFile(path.join(artifacts, 'budget-and-consumers.json'), JSON.stringify({ constrained, leased, released, impossible }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D3: corrupt detail and rapid reversal keep covering terrain without obsolete uploads', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page);
    const failing = manifest.chunks.find(chunk => chunk.level === 1);
    await page.route(`**/${failing.channels.height.url}`, route => route.fulfill({ status: 200, body: Buffer.alloc(failing.channels.height.byteLength) }));
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
    await expect.poll(async () => (await snapshot(page)).streaming.errors.length, { timeout: 20000 }).toBeGreaterThan(0);
    const failed = await settle(page);
    assertBounds(failed);
    expect(failed.streaming.residentLeafIds).toEqual([manifest.overviewId]);
    expect(failed.streaming.degradationReason).toMatch(/failed/);
    await page.unroute(`**/${failing.channels.height.url}`);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    for (let i = 0; i < 4; i++) {
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
        await page.waitForTimeout(50);
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wideView);
        await page.waitForTimeout(50);
    }
    const reversed = await settle(page);
    assertBounds(reversed);
    await expect.poll(async () => (await snapshot(page)).streaming.residentIds.length).toBe(1);
    expect(reversed.streaming.residentLeafIds).toEqual([manifest.overviewId]);
    expect(reversed.streaming.canceled).toBeGreaterThan(0);
    await page.setViewportSize({ width: 1280, height: 720 });
    const resized = await settle(page);
    assertBounds(resized);
    const camera = resized.camera;
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    const reloaded = await settle(page);
    for (const field of ['position', 'target']) reloaded.camera[field].forEach((value, index) => expect(value).toBeCloseTo(camera[field][index], 9));
    for (const field of ['projection', 'fov', 'zoom', 'orthoHeight']) expect(reloaded.camera[field]).toEqual(camera[field]);
    assertBounds(reloaded);
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'failure-cancellation.json'), JSON.stringify({ failed, reversed, resized, reloaded, errors }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D3: camera owns pending native children after a shared query releases them', async ({ page }) => {
    test.setTimeout(60000);
    await openGeometryOnly(page);
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
    await page.waitForFunction(() => {
        const state = window.__landscapeTestHooks.snapshot();
        if (state.streaming?.transition?.phase === 'loading' && state.streaming.transition.parentId.startsWith('l2/')) {
            window.__landscapeTestHooks.pause();
            return true;
        }
        return false;
    }, null, { timeout: 30000 });
    const paused = await snapshot(page);
    const child = manifest.chunks.find(chunk => chunk.parentId === paused.streaming.transition.parentId);
    await page.evaluate(id => window.__landscapeTestHooks.acquireConsumer([id], { consumer: 'shared-selection', priority: 100, accuracy: 'authoritative' }), child.id);
    await page.evaluate(() => window.__landscapeTestHooks.releaseConsumer('shared-selection'));
    const released = await snapshot(page);
    expect(released.streaming.residentSourceIds).toContain(child.id);
    await page.evaluate(() => window.__landscapeTestHooks.resume());
    const completed = await settle(page);
    expect(completed.streaming.residentLeafIds).toContain(child.id);
    assertBounds(completed);
    await writeFile(path.join(artifacts, 'shared-query-camera-lifetime.json'), JSON.stringify({ paused, released, completed }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D3: denied sibling admission restores an existing source-only lease reservation', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__landscapeTestHooks.setBudgets({ cpuBytes: 16 * 1024 * 1024, gpuBytes: 8 * 1024 * 1024 }));
    const id = manifest.chunks.find(chunk => chunk.level === 1).id;
    await page.evaluate(id => window.__landscapeTestHooks.acquireConsumer([id], { consumer: 'held-source', priority: 20, accuracy: 'approximate' }), id);
    const before = await snapshot(page);
    const resource = state => state.budget.entries.find(entry => entry.key.includes(JSON.stringify(id)));
    expect(resource(before).gpuBytes).toBe(0);
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
    const denied = await settle(page);
    expect(denied.streaming.degradationReason).toMatch(/budget/);
    expect(resource(denied).gpuBytes).toBe(0);
    expect(resource(denied).cpuBytes).toBe(resource(before).cpuBytes);
    expect(denied.streaming.pending).toBe(0);
    await page.evaluate(() => window.__landscapeTestHooks.releaseConsumer('held-source'));
    await writeFile(path.join(artifacts, 'reservation-rollback.json'), JSON.stringify({ before, denied }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D3: camera reuses a pending leased build after canceling and revisiting its area', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => {
        window.__terrainDispatches = [];
        const BaseWorker = window.Worker;
        window.Worker = class extends BaseWorker {
            postMessage(message, ...rest) {
                if (message.chunkId) window.__terrainDispatches.push({ id: message.id, chunkId: message.chunkId, sourceOnly: message.sourceOnly });
                return super.postMessage(message, ...rest);
            }
        };
    });
    await openGeometryOnly(page);
    const child = manifest.chunks.find(chunk => chunk.parentId === detailedTile.id);
    let releaseResponse;
    const responseGate = new Promise(resolve => { releaseResponse = resolve; });
    let requested = false;
    await page.route(`**/${child.channels.height.url}`, async route => {
        requested = true;
        await responseGate;
        await route.continue();
    });
    try {
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
        await expect.poll(() => requested, { timeout: 30000 }).toBe(true);
        await page.evaluate(id => {
            window.__pendingTerrainConsumer = window.__landscapeTestHooks.acquireConsumer([id], { consumer: 'pending-query', priority: 100, accuracy: 'authoritative' });
        }, child.id);
        await expect.poll(async () => consumerLeases(await snapshot(page), ['pending-query']).length).toBe(1);
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wideView);
        await expect.poll(async () => (await snapshot(page)).streaming.residentLeafIds).toEqual([manifest.overviewId]);
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), nearView);
        await expect.poll(async () => (await snapshot(page)).streaming.transition?.parentId, { timeout: 30000 }).toBe(detailedTile.id);
        const dispatches = await page.evaluate(id => window.__terrainDispatches.filter(job => job.chunkId === id && job.sourceOnly === false), child.id);
        expect(dispatches).toHaveLength(1);
    } finally { releaseResponse(); }
    await page.evaluate(() => window.__pendingTerrainConsumer);
    const completed = await settle(page);
    expect(completed.streaming.residentLeafIds).toContain(child.id);
    assertBounds(completed);
    await page.evaluate(() => window.__landscapeTestHooks.releaseConsumer('pending-query'));
    expect(consumerLeases(await snapshot(page), ['pending-query'])).toHaveLength(0);
    await writeFile(path.join(artifacts, 'pending-build-reuse.json'), JSON.stringify({ completed, dispatches: await page.evaluate(() => window.__terrainDispatches) }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});
