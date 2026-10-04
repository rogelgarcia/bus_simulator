// Verifies generated fine surface-coverage pages in the viewer: residency, cache reuse, failures, edits, modes, profiles and teardown.
import { test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { copyLandscapePlanningSources } from '../../shared/landscape_fixture_files.js';
import { validateLandscapeManifest, createLandscapeSurfaceDetailIndex, landscapeRegionIntersectsBounds } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailRecipe.js';
import { LANDSCAPE_SURFACE_SOIL_COLORS, landscapeColorBytes } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainDiagnostics.js';

const root = path.resolve('.');
const source = path.join(root, 'assets/public/landscape/coastal-city');
const artifacts = path.resolve(process.env.LANDSCAPE_DETAIL_EVIDENCE_ROOT ?? 'tests/artifacts/screens/landscape/ai577/d2/detail');
const manifest = validateLandscapeManifest(JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8')));
const MiB = 1024 * 1024, viewport = { width: 1920, height: 1080 };
const anchor = { x: 1071.2890625, z: 914.0625, y: 6.4459381103515625 };
const { x, z, y } = anchor;
const poses = {
    'game-pov': { position: [x - 10, y + 4.5, z - 26], target: [x + 2, y, z + 16], projection: 'perspective', fov: 55, orthoHeight: 50, zoom: 1 },
    oblique: { position: [x - 18, y + 16, z - 24], target: [x, y, z], projection: 'perspective', fov: 55, orthoHeight: 50, zoom: 1 },
    'top-down': { position: [x, y + 150, z - .001], target: [x, y, z], projection: 'orthographic', fov: 55, orthoHeight: 50, zoom: 1 },
    medium: { position: [x - 60, y + 55, z - 80], target: [x, y, z], projection: 'perspective', fov: 55, orthoHeight: 50, zoom: 1 },
    away: { position: [4400, 3000, -2300], target: [2000, 0, 2000], projection: 'perspective', fov: 55, orthoHeight: 50, zoom: 1 }
};
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
test.use({ viewport, deviceScaleFactor: 1, trace: 'off', video: 'off' });

function observe(page) {
    const issues = { errors: [], warnings: [] };
    page.on('pageerror', error => issues.errors.push(error.message));
    page.on('console', message => {
        if (!['error', 'warning'].includes(message.type()) || !/shader|webgl|program|THREE|GL_INVALID/i.test(message.text())) return;
        const value = message.text(), target = message.type() === 'error' ? issues.errors : issues.warnings;
        if (!target.includes(value)) target.push(value);
    });
    return issues;
}

async function open(page, address = '/screens/landscape_fabrication.html', view = null) {
    const started = Date.now();
    await page.goto(address);
    await page.waitForFunction(() => !!window.__landscapeTestHooks, null, { timeout: 30000 });
    if (view) await page.evaluate(value => window.__landscapeTestHooks.setCamera(value), view);
    await page.waitForFunction(() => window.__landscapeTestHooks.snapshot().ready || window.__landscapeTestHooks.snapshot().lastError, null, { timeout: 60000 });
    expect((await snapshot(page)).lastError).toBeNull();
    return started;
}

async function settle(page, timeout = 90000, { geometry = true } = {}) {
    let stable = 0, state;
    const deadline = Date.now() + timeout;
    while (stable < 2) {
        await page.waitForTimeout(150);
        state = await snapshot(page);
        if (state.lastError) throw new Error(state.lastError);
        stable = (!geometry || state.streaming?.settled) && state.appearance?.settled && state.planning?.settled ? stable + 1 : 0;
        if (Date.now() > deadline) throw new Error(`Landscape did not settle: ${JSON.stringify({ streaming: state.streaming?.settled, appearance: state.appearance?.settled, detail: { pending: state.appearance?.detail?.pending, missing: state.appearance?.detail?.missingWork, transitioning: state.appearance?.detail?.transitioning } })}`);
    }
    return state;
}

async function visit(page, view) {
    await page.evaluate(value => window.__landscapeTestHooks.setCamera(value), view);
    return settle(page);
}

function assertBounded(state) {
    expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.budget.peakCpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.peakGpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
    expect(state.appearance.detail.uploads?.peakFrameBytes ?? 0).toBeLessThanOrEqual(4 * 261 * 261 * 4);
}

const detailOf = state => ({ residentByLevel: state.appearance.detail.residentByLevel, wantedByLevel: state.appearance.detail.wantedByLevel, uniform: state.appearance.detail.uniformIds.length,
    capacity: state.appearance.detail.capacity, cache: state.appearance.detail.cache, generation: state.appearance.detail.generation, uploads: state.appearance.detail.uploads,
    bytes: state.appearance.detail.bytes, degradationReason: state.appearance.detail.degradationReason, cpuBytes: state.budget.cpuBytes, gpuBytes: state.budget.gpuBytes,
    appearanceCpuBytes: state.appearance.cpuBytes, appearanceGpuBytes: state.appearance.gpuBytes, peakUploadedBytesPerFrame: state.peakUploadedBytesPerFrame,
    nativeResident: state.appearance.residentMaskIds.length, geometryLeaves: state.streaming.residentLeafIds.length });

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test('Surface detail: a cold load at the game POV settles generated L4/L5/L6 coverage with uniform pages and bounded uploads', async ({ page }, testInfo) => {
    test.setTimeout(240000);
    expect(new URL(String(testInfo.project.use.baseURL)).port, 'Landscape verification uses port 8002').toBe('8002');
    const issues = observe(page);
    const started = await open(page, '/screens/landscape_fabrication.html', poses['game-pov']);
    const state = await settle(page), settledMs = Date.now() - started, detail = state.appearance.detail;
    expect(detail.enabled).toBe(true);
    expect(detail.levels).toBe(3);
    expect(detail.finestLevel).toBe(6);
    expect(detail.capacity).toBe(64);
    for (const level of [4, 5, 6]) expect(detail.residentByLevel[level], `resident L${level} pages`).toBeGreaterThan(0);
    expect(detail.uniformIds.length, 'single-soil supports resolve as uniform pages').toBeGreaterThan(0);
    expect(detail.pending).toBe(0);
    expect(detail.missingWork).toBe(false);
    expect(detail.errors).toEqual([]);
    expect(detail.residentIds.length).toBeLessThanOrEqual(detail.capacity);
    expect(new Set(detail.pages.filter(entry => entry.status === 'resident').map(entry => entry.slot)).size).toBe(detail.residentIds.length);
    for (const entry of detail.pages.filter(value => value.status === 'resident')) {
        expect(entry.slot).toBeGreaterThanOrEqual(detail.firstSlot);
        expect(entry.identity).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(state.appearance.maskCapacity, 'native mask capacity is unchanged').toBe(17);
    expect(state.appearance.residentMaskIds.every(id => Number(id.slice(1, id.indexOf('/'))) <= manifest.grid.maxLevel)).toBe(true);
    const point = { x: x - 4, z: z - 14 };
    const coverage = await page.evaluate(value => window.__landscapeTestHooks.coverageSample(value.x, value.z), point);
    expect(coverage.generated).toBe(true);
    expect(coverage.measured).toBe(false);
    expect(coverage.level).toBe(6);
    expect(coverage.spacing.x).toBe(.244140625);
    expect(coverage.identity).toMatch(/^[0-9a-f]{16}$/);
    expect(coverage.inputs.page.id).toBe(coverage.maskId);
    expect(coverage.detailRecipe.id).toBe(LANDSCAPE_SURFACE_DETAIL_RECIPE.id);
    expect(coverage.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 9);
    const categorical = await page.evaluate(value => window.__landscapeTestHooks.appearanceSample(value.x, value.z), point);
    expect(categorical.level, 'categorical inspection keeps reporting the native source').toBe(manifest.grid.maxLevel);
    const inspection = await page.evaluate(value => window.__landscapeTestHooks.detailSample(value.x, value.z), point);
    expect(inspection.id).toBe(coverage.maskId);
    expect(inspection.key).toBe(coverage.identity);
    expect(inspection.generated).toBe(true);
    expect(Number.isFinite(inspection.warp.x) && Number.isFinite(inspection.warp.z)).toBe(true);
    expect(inspection.resident.identity).toBe(coverage.identity);
    const entries = state.budget.entries.filter(entry => entry.key.includes('/detail/'));
    expect(entries.every(entry => entry.kind === 'appearance-surface-detail-resident-slot' && entry.cpuBytes === 0 && entry.gpuBytes === 0)).toBe(true);
    expect(entries.every(entry => entry.leases.every(lease => lease.accuracy === 'approximate' && lease.consumer.startsWith('appearance-detail/')))).toBe(true);
    expect(state.budget.entries.filter(entry => entry.kind === 'appearance-surface-detail-worker-context')).toHaveLength(2);
    expect(state.budget.entries.find(entry => entry.kind === 'appearance-surface-detail-array').gpuBytes).toBe(64 * 261 * 261 * 4);
    assertBounded(state);
    await page.screenshot({ path: path.join(artifacts, '01-game-pov.png') });
    const route = [{ id: 'game-pov', settledMs, ...detailOf(state) }];
    for (const name of ['oblique', 'top-down', 'medium']) {
        const visited = await visit(page, poses[name]);
        assertBounded(visited);
        expect(visited.appearance.detail.errors).toEqual([]);
        route.push({ id: name, ...detailOf(visited) });
        await page.screenshot({ path: path.join(artifacts, `01-${name}.png`) });
    }
    expect(issues.errors).toEqual([]);
    expect(issues.warnings).toEqual([]);
    await writeFile(path.join(artifacts, 'cold-load.json'), JSON.stringify({ settledMs, route, detail: { ...detail, pages: detail.pages.length }, coverage: { ...coverage, inputs: undefined }, inspection, issues }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect([disposed.budget.cpuBytes, disposed.budget.gpuBytes, disposed.budget.entries.length]).toEqual([0, 0, 0]);
});

test('Surface detail: repeated travel away and back reuses cached pages without regenerating them', async ({ page }) => {
    test.setTimeout(240000);
    const issues = observe(page);
    await open(page, '/screens/landscape_fabrication.html', poses['game-pov']);
    const first = await settle(page), returns = [];
    const resident = first.appearance.detail.residentIds.length;
    for (let cycle = 0; cycle < 2; cycle++) {
        const away = await visit(page, poses.away);
        expect(away.appearance.detail.residentIds).toEqual([]);
        const cached = away.appearance.detail.cache.view.pages, before = away.appearance.detail;
        const back = await visit(page, poses['game-pov']), detail = back.appearance.detail;
        const hits = detail.cache.hits - before.cache.hits, misses = detail.cache.misses - before.cache.misses;
        returns.push({ cycle, cached, hits, misses, resident: detail.residentIds.length, uniformFromMemo: detail.uniformResolutions.memo, cpuBytes: back.budget.cpuBytes, gpuBytes: back.budget.gpuBytes });
        expect(detail.residentIds.length).toBe(resident);
        expect(hits, 'every cached page of this view returns as a cache hit').toBe(cached);
        expect(misses, 'only pages the 48-page cache could not retain are regenerated').toBe(resident - cached);
        expect(misses).toBeLessThanOrEqual(Math.max(0, resident - 48));
        expect(detail.uniformResolutions.memo, 'uniform pages return from remembered identities').toBeGreaterThan(0);
        assertBounded(back);
    }
    expect(returns[1].cpuBytes, 'controlled CPU bytes are identical after each return').toBe(returns[0].cpuBytes);
    expect(returns[1].gpuBytes, 'controlled GPU bytes are identical after each return').toBe(returns[0].gpuBytes);
    const top = await visit(page, poses['top-down']);
    await visit(page, poses.away);
    const generatedBefore = (await snapshot(page)).appearance.detail.generation.completed;
    const topAgain = await visit(page, poses['top-down']);
    expect(topAgain.appearance.detail.residentIds.sort()).toEqual(top.appearance.detail.residentIds.sort());
    expect(topAgain.appearance.detail.generation.completed, 'a view within the cache capacity regenerates nothing').toBe(generatedBefore);
    expect(issues.errors).toEqual([]);
    await writeFile(path.join(artifacts, 'travel-cache.json'), JSON.stringify({ resident, returns, top: detailOf(top), topAgain: detailOf(topAgain) }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Surface detail: a failed native cover payload keeps parent coverage, reports the identity and retries once', async ({ page }) => {
    test.setTimeout(240000);
    const issues = observe(page), native = manifest.chunks.find(chunk => chunk.id === 'l3/c2/r6'), suffix = `/${native.channels.landCover.url}`;
    const failed = [];
    const handler = async route => {
        const headers = await route.request().allHeaders();
        if (/LandscapeSurfaceDetailWorker\.js/.test(headers.referer ?? '')) { failed.push(Date.now()); return route.fulfill({ status: 500, body: 'injected failure' }); }
        return route.fallback();
    };
    const matcher = url => url.pathname.endsWith(suffix);
    await page.route(matcher, handler);
    await open(page, '/screens/landscape_fabrication.html', poses['game-pov']);
    await expect.poll(async () => (await snapshot(page)).appearance.detail.errors.some(entry => entry.attempts >= 2), { timeout: 60000 }).toBe(true);
    const state = await settle(page), detail = state.appearance.detail;
    expect(detail.errors.length).toBeGreaterThan(0);
    for (const error of detail.errors) {
        expect(error.identity).toMatch(/^[0-9a-f]{16}$/);
        expect(error.attempts).toBe(2);
        expect(error.message).toContain('HTTP 500');
        expect(detail.residentIds.includes(error.id) || detail.pendingIds.includes(error.id), `${error.id} keeps no layer`).toBe(false);
    }
    expect(state.appearance.residentMaskIds, 'the native parent coverage is retained').toContain('l3/c2/r6');
    expect(state.appearance.errors, 'native masks are unaffected by detail-worker failures').toEqual([]);
    expect(detail.degradationReason).not.toBeNull();
    expect(failed.length, 'each failed page fetches the failing cover once per attempt').toBe(detail.errors.reduce((sum, error) => sum + error.attempts, 0));
    const coverage = await page.evaluate(value => window.__landscapeTestHooks.coverageSample(value.x, value.z), { x: x - 4, z: z - 14 });
    expect(coverage.generated, 'pages below the failed support fall back to the native parent').toBe(false);
    const requests = failed.length;
    await page.waitForTimeout(3500);
    const later = await snapshot(page);
    expect(failed.length, 'no further retries').toBe(requests);
    expect(later.appearance.detail.errors.map(error => error.attempts)).toEqual(detail.errors.map(() => 2));
    assertBounded(state);
    await page.screenshot({ path: path.join(artifacts, '03-failed-support.png') });
    await page.unroute(matcher, handler);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    const recovered = await settle(page);
    expect(recovered.appearance.detail.errors).toEqual([]);
    expect(recovered.appearance.detail.residentByLevel[6]).toBeGreaterThan(0);
    expect((await page.evaluate(value => window.__landscapeTestHooks.coverageSample(value.x, value.z), { x: x - 4, z: z - 14 })).generated).toBe(true);
    expect(issues.errors).toEqual([]);
    await writeFile(path.join(artifacts, 'failure-injection.json'), JSON.stringify({ errors: detail.errors, requests, recovered: detailOf(recovered) }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Surface detail: landscapeSurfaceDetail off, 50cm and invalid values behave as specified', async ({ page }) => {
    test.setTimeout(180000);
    const issues = observe(page);
    await open(page, '/screens/landscape_fabrication.html?landscapeSurfaceDetail=off', poses['game-pov']);
    const off = await settle(page);
    expect(off.surfaceDetail).toEqual({ mode: 'off', levels: 0, cache: null });
    expect([off.appearance.detail.enabled, off.appearance.detail.reason, off.appearance.detail.capacity, off.appearance.detail.workerPool]).toEqual([false, 'surface-detail-off', 0, null]);
    expect(off.budget.entries.some(entry => entry.kind.includes('surface-detail'))).toBe(false);
    expect(off.appearance.surfaceWarp.enabled, 'native coverage keeps the shared recipe warp').toBe(true);
    expect((await page.evaluate(value => window.__landscapeTestHooks.coverageSample(value.x, value.z), { x, z })).generated).toBe(false);
    await expect(page.evaluate(() => window.__landscapeTestHooks.detailSample(1071, 914))).rejects.toThrow(/surface-detail-off/);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    await open(page, '/screens/landscape_fabrication.html?landscapeSurfaceDetail=50cm', poses['game-pov']);
    const half = await settle(page), detail = half.appearance.detail;
    expect([detail.enabled, detail.levels, detail.finestLevel]).toEqual([true, 2, 5]);
    expect(Object.keys(detail.residentByLevel)).toEqual(['4', '5']);
    expect(detail.residentByLevel[5]).toBeGreaterThan(0);
    expect(detail.pages.every(entry => entry.level <= 5)).toBe(true);
    expect((await page.evaluate(value => window.__landscapeTestHooks.coverageSample(value.x, value.z), { x: x - 4, z: z - 14 })).level).toBe(5);
    assertBounded(half);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto('/screens/landscape_fabrication.html?landscapeSurfaceDetail=10cm');
    await expect.poll(() => failures.join('\n')).toContain('landscapeSurfaceDetail must be one of off, 50cm, 25cm; received 10cm');
    expect(issues.warnings).toEqual([]);
    await writeFile(path.join(artifacts, 'modes.json'), JSON.stringify({ off: detailOf(off), half: detailOf(half), failures }, null, 2));
});

test('Surface detail: the 16/8 MiB profile has zero fine capacity and keeps the previous five-slot behavior', async ({ page }) => {
    test.setTimeout(180000);
    const issues = observe(page);
    await open(page);
    await page.evaluate(() => window.__landscapeTestHooks.setBudgets({ cpuBytes: 16 * 1024 * 1024, gpuBytes: 8 * 1024 * 1024 }));
    await page.evaluate(value => window.__landscapeTestHooks.setCamera(value), poses['game-pov']);
    const state = await settle(page, 90000, { geometry: false });
    expect(state.budget.limits).toEqual({ cpuBytes: 16 * MiB, gpuBytes: 8 * MiB });
    expect(state.appearance.maskCapacity).toBe(5);
    expect([state.appearance.detail.enabled, state.appearance.detail.reason, state.appearance.detail.capacity]).toEqual([false, 'appearance-gpu-below-8-mib', 0]);
    expect(state.surfaceDetail.cache).toBeNull();
    expect(state.budget.entries.some(entry => entry.kind.includes('surface-detail'))).toBe(false);
    expect(state.appearance.coverage.allocatedMaskBytes).toBe(5 * 261 * 261 * 4);
    expect(state.appearance.coverage.arrayLayers).toBe(5);
    expect((await page.evaluate(value => window.__landscapeTestHooks.coverageSample(value.x, value.z), { x, z })).generated).toBe(false);
    assertBounded(state);
    expect(issues.errors).toEqual([]);
    await writeFile(path.join(artifacts, 'constrained-profile.json'), JSON.stringify(detailOf(state), null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect([disposed.budget.cpuBytes, disposed.budget.gpuBytes]).toEqual([0, 0]);
});

test('Surface detail: fine streaming is independent of geometry and native-query leases, and disposal frees every byte', async ({ page }) => {
    test.setTimeout(180000);
    const issues = observe(page);
    await open(page, '/screens/landscape_fabrication.html', poses['game-pov']);
    const before = await settle(page);
    const lease = await page.evaluate(() => window.__landscapeTestHooks.acquireConsumer(['l3/c2/r6', 'l3/c1/r6', 'l3/c2/r5', 'l3/c1/r5'], { consumer: 'detail-independence', accuracy: 'authoritative' }));
    expect(lease.chunkIds).toHaveLength(4);
    const held = await settle(page);
    expect(held.appearance.detail.residentIds.sort()).toEqual(before.appearance.detail.residentIds.sort());
    const consumers = held.budget.entries.flatMap(entry => entry.leases.map(value => ({ key: entry.key, ...value })));
    expect(consumers.filter(value => value.consumer === 'detail-independence').every(value => !value.key.includes('/detail/'))).toBe(true);
    expect(consumers.filter(value => value.key.includes('/detail/')).every(value => value.consumer.startsWith('appearance-detail/') && value.accuracy === 'approximate')).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.releaseConsumer('detail-independence'));
    const released = await settle(page);
    expect(released.appearance.detail.residentIds.sort()).toEqual(before.appearance.detail.residentIds.sort());
    expect(released.appearance.detail.generation.completed).toBe(before.appearance.detail.generation.completed);
    expect(issues.errors).toEqual([]);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect([disposed.budget.cpuBytes, disposed.budget.gpuBytes, disposed.budget.entries.length]).toEqual([0, 0, 0]);
});

test('Surface detail: native coverage inspection applies the same warp as the terrain shader', async ({ page }) => {
    test.setTimeout(180000);
    const issues = observe(page);
    await open(page, '/screens/landscape_fabrication.html?landscapeSurfaceDetail=off');
    await page.waitForFunction(() => window.__landscapeTestHooks.snapshot().planning.ready, null, { timeout: 60000 });
    await page.evaluate(() => {
        document.body.classList.add('perf-bar-hidden');
        document.querySelectorAll('.landscape-ui, .ui-perf-bar').forEach(element => element.classList.add('hidden'));
        window.dispatchEvent(new Event('resize'));
        window.__landscapeTestHooks.setWater(false);
        window.__landscapeTestHooks.setPlanning({ diagnostic: 'surface-coverage' });
    });
    const palette = manifest.soil.catalog.map(soil => landscapeColorBytes(LANDSCAPE_SURFACE_SOIL_COLORS[soil.id].hex));
    const scale = viewport.height / poses['top-down'].orthoHeight, points = [];
    for (let row = 60; row < viewport.height - 60; row += 12) for (let column = 80; column < viewport.width - 80; column += 12) points.push([column, row]);
    const world = ([column, row]) => ({ x: x - (column + .5 - viewport.width / 2) / scale, z: z + (viewport.height / 2 - (row + .5)) / scale });
    async function compare(label) {
        const state = await visit(page, poses['top-down']);
        expect(state.canvas).toEqual(viewport);
        const png = await page.screenshot();
        await writeFile(path.join(artifacts, `07-${label}.png`), png);
        const result = await page.evaluate(async ({ base64, points, coordinates, palette, step }) => {
            const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob(), bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
            context.drawImage(bitmap, 0, 0);
            const image = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
            let maxBytes = 0, sum = 0, boundary = 0, worst = null;
            const differences = points.map(([column, row], index) => {
                const sample = window.__landscapeTestHooks.coverageSample(coordinates[index].x, coordinates[index].z, { dx: [-step, 0], dy: [0, step] });
                const expected = [0, 1, 2].map(channel => sample.weights.reduce((total, weight, soil) => total + weight * palette[soil][channel], 0));
                const offset = (row * bitmap.width + column) * 4, actual = [image[offset], image[offset + 1], image[offset + 2]];
                const delta = Math.max(...expected.map((value, channel) => Math.abs(value - actual[channel])));
                if (Math.max(...sample.weights) < .99) boundary++;
                if (delta > maxBytes) { maxBytes = delta; worst = { column, row, expected, actual, weights: sample.weights, warp: sample.warp, maskId: sample.maskId }; }
                sum += delta;
                return delta;
            });
            const sorted = differences.slice().sort((a, b) => a - b);
            return { samples: points.length, boundary, maxBytes, meanBytes: sum / points.length, p999Bytes: sorted[Math.floor(sorted.length * .999)], worst, warp: window.__landscapeTestHooks.coverageSample(coordinates[0].x, coordinates[0].z).warp };
        }, { base64: png.toString('base64'), points, coordinates: points.map(world), palette, step: 1 / scale });
        return { ...result, png };
    }
    const warped = await compare('native-warp-on');
    expect(warped.warp.enabled).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.setSurfaceWarp(false));
    const unwarped = await compare('native-warp-off');
    expect(unwarped.warp.enabled).toBe(false);
    for (const result of [warped, unwarped]) {
        expect(result.boundary, 'the sample grid crosses material boundaries').toBeGreaterThan(50);
        expect(result.p999Bytes, 'rendered coverage matches inspection').toBeLessThanOrEqual(3);
        expect(result.meanBytes).toBeLessThanOrEqual(.5);
    }
    const changed = await page.evaluate(async ({ a, b }) => {
        const decode = async base64 => { const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob()); const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); return context.getImageData(0, 0, bitmap.width, bitmap.height).data; };
        const first = await decode(a), second = await decode(b);
        let count = 0;
        for (let offset = 0; offset < first.length; offset += 4) if (Math.abs(first[offset] - second[offset]) + Math.abs(first[offset + 1] - second[offset + 1]) + Math.abs(first[offset + 2] - second[offset + 2]) > 30) count++;
        return count;
    }, { a: warped.png.toString('base64'), b: unwarped.png.toString('base64') });
    expect(changed, 'the warp visibly moves native boundaries').toBeGreaterThan(1000);
    expect(issues.errors).toEqual([]);
    await writeFile(path.join(artifacts, 'native-warp-inspection.json'), JSON.stringify({ warped: { ...warped, png: undefined }, unwarped: { ...unwarped, png: undefined }, changedPixels: changed }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test.describe('Surface detail edits', () => {
    let server, origin, directory;
    test.beforeAll(async () => {
        directory = await mkdtemp(path.join(artifacts, 'edit-run-'));
        await cp(path.join(source, 'manifest.json'), path.join(directory, 'manifest.json'));
        await cp(path.join(source, 'payloads'), path.join(directory, 'payloads'), { recursive: true });
        await cp(path.join(source, 'appearance'), path.join(directory, 'appearance'), { recursive: true });
        await copyLandscapePlanningSources(manifest, source, directory);
        server = createLandscapeServer({ root, landscapeDirectory: directory });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${server.address().port}`;
    });
    test.afterAll(async () => {
        if (!server) return;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });

    test('Surface detail: a soil edit regenerates only pages whose influence it intersects and renders through generated pages', async ({ page }) => {
        test.setTimeout(240000);
        const issues = observe(page), view = { position: [x, y + 150, z - .001], target: [x, y, z], projection: 'orthographic', fov: 55, orthoHeight: 150, zoom: 1 };
        await open(page, `${origin}/screens/landscape_fabrication.html`, view);
        const before = await settle(page), original = before.appearance.detail.pages;
        expect(before.appearance.detail.residentIds.length).toBeGreaterThan(2);
        expect(before.appearance.detail.residentIds.length).toBeLessThanOrEqual(48);
        const region = { type: 'circle', center: { x: x + 3, z: z - 9 }, radius: 3 };
        const batch = { format: 'landscape-edit-batch', schemaVersion: 1, id: 'd2-detail-soil-edit', landscapeId: manifest.id, expectedRevision: before.revision,
            operations: [{ id: 'detail-rock-patch', type: 'assign-soil', soilId: 'rock', region, falloff: { type: 'none' } }] };
        const response = await page.request.post(`${origin}/api/landscape/apply`, { data: batch });
        const applied = await response.json();
        expect(response.ok(), JSON.stringify(applied)).toBe(true);
        await page.evaluate(() => window.__landscapeTestHooks.reload());
        await expect.poll(async () => (await snapshot(page)).revision).toBe(applied.revision);
        const after = await settle(page), edited = validateLandscapeManifest(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')));
        const index = createLandscapeSurfaceDetailIndex(edited, { levels: 3 });
        const classified = after.appearance.detail.pages.map(entry => {
            const affected = landscapeRegionIntersectsBounds(region, index.support(entry.id, LANDSCAPE_SURFACE_DETAIL_RECIPE).influenceBounds);
            const previous = original.find(value => value.id === entry.id);
            return { id: entry.id, status: entry.status, source: entry.source, affected, identity: entry.identity, previousIdentity: previous?.identity ?? null, previousSource: previous?.source ?? null };
        });
        const resident = classified.filter(entry => entry.status === 'resident');
        expect(resident.some(entry => entry.affected), 'the edit lies inside resident fine pages').toBe(true);
        expect(resident.some(entry => !entry.affected), 'some resident pages are unaffected').toBe(true);
        for (const entry of resident) {
            if (entry.affected) {
                expect(entry.source, `${entry.id} regenerates`).toBe('worker');
                expect(entry.identity, `${entry.id} has a new identity`).not.toBe(entry.previousIdentity);
            } else if (entry.previousIdentity) {
                expect(entry.source, `${entry.id} returns from the cache`).toBe('cache');
                expect(entry.identity).toBe(entry.previousIdentity);
            }
        }
        const coverage = await page.evaluate(value => window.__landscapeTestHooks.coverageSample(value.x, value.z), region.center);
        const rock = edited.soil.catalog.findIndex(soil => soil.id === 'rock');
        expect(coverage.generated).toBe(true);
        expect(coverage.source).toBe('worker');
        expect(coverage.weights[rock]).toBeGreaterThan(.99);
        expect(coverage.inputs.overrides.some(override => override.soilId === 'rock' && override.region.radius === 3)).toBe(true);
        expect(after.appearance.detail.errors).toEqual([]);
        assertBounded(after);
        await page.screenshot({ path: path.join(artifacts, '04-edited-soil.png') });
        const revert = await page.request.post(`${origin}/api/landscape/revert`, { data: { expectedRevision: applied.revision } });
        expect(revert.ok(), await revert.text()).toBe(true);
        expect(issues.errors).toEqual([]);
        await writeFile(path.join(artifacts, 'edit-invalidation.json'), JSON.stringify({ region, applied: applied.revision, classified, coverage: { ...coverage, inputs: { overrides: coverage.inputs.overrides } } }, null, 2));
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
    });
});
