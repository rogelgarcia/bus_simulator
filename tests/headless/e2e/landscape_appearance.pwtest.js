// Verifies independent texture/mask residency and revision-aware soil appearance on saved terrain.
import { test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { copyLandscapePlanningSources } from '../../shared/landscape_fixture_files.js';

const root = path.resolve('.');
const source = path.join(root, 'assets/public/landscape/coastal-city');
const artifacts = path.join(root, 'tests/artifacts/screens/landscape', process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'ai576/d4', 'appearance');
const canonical = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
const overviewDescriptor = canonical.chunks.find(chunk => chunk.id === canonical.overviewId);
const overviewCover = await readFile(path.join(source, overviewDescriptor.channels.landCover.url));
const coverPoints = canonical.landCover.catalog.map(entry => {
    const candidates = [];
    for (let row = 2; row < 255; row++) for (let column = 2; column < 255; column++) {
        const index = row * 257 + column;
        if (overviewCover[index] !== entry.id) continue;
        const interior = [-258, -257, -256, -1, 1, 256, 257, 258].every(offset => overviewCover[index + offset] === entry.id);
        candidates.push({ row, column, interior, distance: Math.hypot(column - 128, row - 128) });
    }
    const candidate = candidates.sort((a, b) => Number(b.interior) - Number(a.interior) || a.distance - b.distance)[0];
    if (!candidate) throw new Error(`Coastal fixture has no land-cover ${entry.id}`);
    return { coverId: entry.id, soilId: entry.soilId, x: candidate.column * 15.625, z: 4000 - candidate.row * 15.625 };
});
const x = 1750, z = 1750;
const wide = { position: [x, 5000, z - 1], target: [x, 0, z], projection: 'orthographic', orthoHeight: 12000, zoom: 1 };
let server, origin, directory, appearanceSource;
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());

function observeErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID/i.test(message.text())) errors.push(message.text());
    });
    return errors;
}

test.beforeAll(async () => {
    await mkdir(artifacts, { recursive: true });
    directory = await mkdtemp(path.join(artifacts, 'flat-run-'));
    await cp(path.join(source, 'payloads'), path.join(directory, 'payloads'), { recursive: true });
    await cp(path.join(source, 'appearance'), path.join(directory, 'appearance'), { recursive: true });
    await copyLandscapePlanningSources(canonical, source, directory);
    appearanceSource = JSON.parse(await readFile(path.join(directory, 'appearance/manifest.json'), 'utf8'));
    const flat = structuredClone(canonical);
    const heights = Buffer.alloc(257 * 257 * 4);
    for (let offset = 0; offset < heights.length; offset += 4) heights.writeFloatLE(10, offset);
    const hash = createHash('sha256').update(heights).digest('hex');
    const url = `payloads/${hash}.f32le`;
    await writeFile(path.join(directory, url), heights);
    flat.revision = 'd4-flat-fixture';
    flat.name = 'Flat coastal cover — independent appearance verification';
    flat.provenance.kind = 'synthetic-fixture';
    flat.provenance.preparation.algorithm = 'd4-flat-height-retained-coastal-cover';
    for (const chunk of flat.chunks) {
        chunk.minHeight = 10;
        chunk.maxHeight = 10;
        chunk.geometricError = 0;
        chunk.revision = flat.revision;
        chunk.channels.height = { ...chunk.channels.height, url, sha256: hash, revision: hash };
    }
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(flat));
    server = createLandscapeServer({ root, landscapeDirectory: directory });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});

async function open(page, address = '/screens/landscape_fabrication.html') {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(address);
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready || window.__landscapeTestHooks?.snapshot().lastError, null, { timeout: 60000 });
    expect((await snapshot(page)).lastError).toBeNull();
    await settle(page);
}

async function settle(page) {
    await page.waitForTimeout(180);
    await expect.poll(async () => {
        const state = await snapshot(page);
        return state.streaming?.settled && state.appearance?.settled;
    }, { timeout: 45000 }).toBe(true);
    return snapshot(page);
}

function assertBudget(state) {
    expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.budget.peakCpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.peakGpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.appearance.cpuBytes).toBeGreaterThan(0);
    expect(state.appearance.gpuBytes).toBeGreaterThan(0);
    expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(state.streaming.uploadLimitBytes);
}

test('Landscape D4: retained cover aligns with soil materials and sea-level water preserves seabed queries', async ({ page }) => {
    test.setTimeout(120000);
    const errors = observeErrors(page);
    await open(page);
    for (const material of (await snapshot(page)).appearance.materials) {
        expect(material.calibration.resolvedBy).toBe('global_pbr_pipeline');
        expect(material.calibration.hasCalibration).toBe(true);
        expect(material.calibration.sourceByField.normalStrength).toBe('calibration');
    }
    const observed = [];
    for (const point of coverPoints) {
        const appearance = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), point);
        expect(appearance.coverId).toBe(point.coverId);
        expect(appearance.soilId).toBe(point.soilId);
        observed.push({ point, appearance });
    }
    const beach = coverPoints.find(point => point.coverId === 1);
    await page.evaluate(point => window.__landscapeTestHooks.setCamera({ position: [point.x + 100, 95, point.z - 140], target: [point.x, 2, point.z], projection: 'perspective', fov: 50 }), beach);
    const close = await settle(page);
    assertBudget(close);
    expect(close.appearance.materials.some(item => item.materialId === 'pbr.aerial_beach_01' && item.refCount > 0)).toBe(true);
    await page.screenshot({ path: path.join(artifacts, '03-coastal-sand-water.png') });
    const seabed = coverPoints.find(point => point.coverId === 0);
    await page.evaluate(async point => {
        window.__landscapeTestHooks.setSelectionRadius(0);
        await window.__landscapeTestHooks.select(point.x, point.z);
    }, seabed);
    const wet = await snapshot(page);
    expect(wet.water.seaLevel).toBe(0);
    expect(wet.selection.sample.height).toBeLessThan(0);
    expect(wet.selection.sample.submerged).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.setWater(false));
    await page.evaluate(point => window.__landscapeTestHooks.select(point.x, point.z), seabed);
    const dryView = await snapshot(page);
    expect(dryView.water.visible).toBe(false);
    expect(dryView.selection.sample.height).toBe(wet.selection.sample.height);
    expect(dryView.selection.sample.soilId).toBe(wet.selection.sample.soilId);
    await page.evaluate(() => window.__landscapeTestHooks.setWater(true));
    await page.evaluate(() => window.__landscapeTestHooks.setMode('combined'));
    await settle(page);
    await page.screenshot({ path: path.join(artifacts, '04-coastal-material-wireframe.png') });
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'cover-water-verification.json'), JSON.stringify({ observed, close, wet, dryView, errors }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D4: flat geometry still streams fine masks and texture pages when zoom changes', async ({ page }) => {
    test.setTimeout(150000);
    const requests = [], errors = observeErrors(page);
    page.on('request', request => { if (/appearance|payloads/.test(request.url())) requests.push(request.url()); });
    await open(page, `${origin}/screens/landscape_fabrication.html`);
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wide);
    const overview = await settle(page);
    expect(overview.streaming.residentLeafIds).toEqual([canonical.overviewId]);
    await page.evaluate(() => window.__landscapeTestHooks.setCamera({ orthoHeight: 2000, zoom: 100 }));
    const close = await settle(page);
    expect(close.streaming.residentLeafIds).toEqual([canonical.overviewId]);
    expect(close.appearance.residentMaskIds.some(id => !id.startsWith('l0/'))).toBe(true);
    expect(Math.max(...close.appearance.materials.map(item => item.resolution))).toBeGreaterThan(Math.max(...overview.appearance.materials.map(item => item.resolution)));
    close.camera.position.forEach((value, index) => expect(value).toBeCloseTo(overview.camera.position[index], 9));
    assertBudget(close);
    await page.screenshot({ path: path.join(artifacts, '01-flat-geometry-fine-appearance.png') });
    const repeated = [];
    for (let cycle = 0; cycle < 2; cycle++) {
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wide);
        await settle(page);
        await expect.poll(async () => (await snapshot(page)).appearance.residentMaskIds).toEqual([canonical.overviewId]);
        const returned = await snapshot(page);
        assertBudget(returned);
        repeated.push(returned);
        if (cycle === 0) {
            await page.evaluate(() => window.__landscapeTestHooks.setCamera({ orthoHeight: 2000, zoom: 100 }));
            await settle(page);
        }
    }
    expect(repeated[1].budget.cpuBytes).toBe(repeated[0].budget.cpuBytes);
    expect(repeated[1].budget.gpuBytes).toBe(repeated[0].budget.gpuBytes);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect(disposed.budget.cpuBytes).toBe(0);
    expect(disposed.budget.gpuBytes).toBe(0);
    await writeFile(path.join(artifacts, 'independent-residency.json'), JSON.stringify({ overview, close, repeated, requests, disposed, errors }, null, 2));
});

test('Landscape D4: soil appearance survives unload, saved reload, and revert without changing cover', async ({ page }) => {
    test.setTimeout(150000);
    const errors = observeErrors(page);
    await open(page, `${origin}/screens/landscape_fabrication.html`);
    await page.evaluate(view => window.__landscapeTestHooks.setCamera({ ...view, orthoHeight: 2000, zoom: 100 }), wide);
    await settle(page);
    await page.evaluate(async ({ x, z }) => {
        window.__landscapeTestHooks.setSelectionRadius(0);
        await window.__landscapeTestHooks.select(x, z);
    }, { x, z });
    const before = await snapshot(page);
    const initialAppearance = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), { x, z });
    const soilId = before.selection.sample.soilId === 'sand' ? 'rock' : 'sand';
    const batch = {
        format: 'landscape-edit-batch', schemaVersion: 1, id: 'd4-saved-soil-appearance',
        landscapeId: before.landscapeId ?? canonical.id, expectedRevision: before.revision,
        operations: [{ id: 'd4-soil-region', type: 'assign-soil', soilId, region: { type: 'circle', center: { x, z }, radius: 70 }, falloff: { type: 'none' } }]
    };
    const response = await page.request.post(`${origin}/api/landscape/apply`, { data: batch });
    const applied = await response.json();
    expect(response.ok(), JSON.stringify(applied)).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await settle(page);
    const edited = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), { x, z });
    expect(edited.soilId).toBe(soilId);
    expect(edited.coverId).toBe(initialAppearance.coverId);
    await page.screenshot({ path: path.join(artifacts, '02-saved-soil-appearance.png') });
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wide);
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).appearance.residentMaskIds).toEqual([canonical.overviewId]);
    expect((await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), { x, z })).soilId).toBe(soilId);
    await page.reload();
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready);
    await page.evaluate(view => window.__landscapeTestHooks.setCamera({ ...view, orthoHeight: 2000, zoom: 100 }), wide);
    await settle(page);
    const reopened = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), { x, z });
    expect(reopened.soilId).toBe(soilId);
    expect(reopened.coverId).toBe(initialAppearance.coverId);
    const restoredResponse = await page.request.post(`${origin}/api/landscape/revert`, { data: { expectedRevision: applied.revision } });
    const restored = await restoredResponse.json();
    expect(restoredResponse.ok(), JSON.stringify(restored)).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await settle(page);
    const reverted = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), { x, z });
    expect(reverted.soilId).toBe(initialAppearance.soilId);
    expect(reverted.coverId).toBe(initialAppearance.coverId);
    assertBudget(await snapshot(page));
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'soil-revision-residency.json'), JSON.stringify({ before, initialAppearance, batch, applied, edited, reopened, restored, reverted, errors }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D4: corrupt fine material pages keep valid coarse appearance and release failed reservations', async ({ page }) => {
    test.setTimeout(120000);
    const errors = observeErrors(page);
    await open(page, `${origin}/screens/landscape_fabrication.html`);
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wide);
    await settle(page);
    const suffixes = appearanceSource.materials.map(material => `/appearance/${material.tiers.find(tier => tier.resolution === 512).channels.baseColor.url}`);
    const filter = url => suffixes.some(suffix => url.pathname.endsWith(suffix));
    await page.route(filter, route => route.fulfill({ status: 200, body: Buffer.alloc(512 * 512 * 4) }));
    await page.evaluate(() => window.__landscapeTestHooks.setCamera({ orthoHeight: 2000, zoom: 100 }));
    await expect.poll(async () => (await snapshot(page)).appearance.errors.length, { timeout: 30000 }).toBeGreaterThan(0);
    const failed = await settle(page);
    expect(failed.streaming.residentLeafIds).toEqual([canonical.overviewId]);
    expect(failed.appearance.ready).toBe(true);
    expect(failed.appearance.materials.every(material => material.resolution < 512)).toBe(true);
    assertBudget(failed);
    const retained = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), { x, z });
    expect(Number.isInteger(retained.coverId)).toBe(true);
    await page.unroute(filter);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    const recovered = await settle(page);
    expect(recovered.appearance.materials.some(material => material.resolution === 512)).toBe(true);
    assertBudget(recovered);
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'failed-page-recovery.json'), JSON.stringify({ failed, retained, recovered, errors }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    expect((await snapshot(page)).budget.cpuBytes).toBe(0);
    expect((await snapshot(page)).budget.gpuBytes).toBe(0);
});

test('Landscape D4: replacing color pages cannot change semantic soil or authoritative terrain', async ({ page }) => {
    test.setTimeout(90000);
    const errors = observeErrors(page);
    await open(page, `${origin}/screens/landscape_fabrication.html`);
    await page.evaluate(async ({ x, z }) => {
        window.__landscapeTestHooks.setSelectionRadius(0);
        await window.__landscapeTestHooks.select(x, z);
    }, { x, z });
    const before = await snapshot(page);
    const recolored = structuredClone(appearanceSource);
    recolored.revision = 'd4-color-replacement-fixture';
    for (const material of recolored.materials) for (const tier of material.tiers) {
        tier.channels.baseColor = { ...tier.channels.normal, colorSpace: 'srgb' };
    }
    await page.route('**/appearance/manifest.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(recolored) }));
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).selection?.editingReady).toBe(true);
    const after = await snapshot(page);
    const material = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), { x, z });
    expect(after.revision).toBe(before.revision);
    expect(after.selection.sample.soilId).toBe(before.selection.sample.soilId);
    expect(after.selection.sample.landCoverId).toBe(before.selection.sample.landCoverId);
    expect(after.selection.sample.height).toBe(before.selection.sample.height);
    expect(material.soilId).toBe(before.selection.sample.soilId);
    assertBudget(after);
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'appearance-semantic-independence.json'), JSON.stringify({ before, after, material, errors }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D4: an old in-flight mask cannot restore old soil after a saved revision reload', async ({ page }) => {
    test.setTimeout(120000);
    const errors = observeErrors(page);
    await open(page, `${origin}/screens/landscape_fabrication.html`);
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wide);
    await settle(page);
    const before = await snapshot(page);
    const native = canonical.chunks.find(chunk => chunk.level === canonical.grid.maxLevel && x > chunk.bounds.minX && x < chunk.bounds.maxX && z > chunk.bounds.minZ && z < chunk.bounds.maxZ);
    const originalSoil = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z).soilId, { x, z });
    const soilId = originalSoil === 'forest' ? 'sand' : 'forest';
    let requested = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(`**/${native.channels.landCover.url}`, async route => {
        if (!requested) { requested = true; await gate; }
        await route.continue().catch(() => {});
    });
    let applied;
    try {
        await page.evaluate(() => window.__landscapeTestHooks.setCamera({ orthoHeight: 2000, zoom: 100 }));
        await expect.poll(() => requested, { timeout: 30000 }).toBe(true);
        const batch = { format: 'landscape-edit-batch', schemaVersion: 1, id: 'd4-inflight-soil-revision', landscapeId: canonical.id, expectedRevision: before.revision,
            operations: [{ id: 'inflight-soil', type: 'assign-soil', soilId, region: { type: 'circle', center: { x, z }, radius: 70 }, falloff: { type: 'none' } }] };
        const response = await page.request.post(`${origin}/api/landscape/apply`, { data: batch });
        applied = await response.json();
        expect(response.ok(), JSON.stringify(applied)).toBe(true);
        await page.evaluate(() => window.__landscapeTestHooks.reload());
        await settle(page);
    } finally { release(); }
    await page.waitForTimeout(200);
    const current = await snapshot(page);
    const sample = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), { x, z });
    expect(current.revision).toBe(applied.revision);
    expect(current.appearance.sourceRevision).toBe(applied.revision);
    expect(sample.soilId).toBe(soilId);
    expect(sample.revision).toBe(applied.revision);
    expect(current.budget.entries.some(entry => entry.key.includes(`/mask/${before.revision}/`))).toBe(false);
    assertBudget(current);
    const revert = await page.request.post(`${origin}/api/landscape/revert`, { data: { expectedRevision: applied.revision } });
    expect(revert.ok(), await revert.text()).toBe(true);
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'old-mask-revision-cancellation.json'), JSON.stringify({ before, applied, current, sample, errors }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    expect((await snapshot(page)).budget.cpuBytes).toBe(0);
});
