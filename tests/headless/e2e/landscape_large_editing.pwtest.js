// Exercises bounded multi-chunk authoring, real-source preparation, streaming revisit and whole-batch revert.
import { test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';

const run = promisify(execFile), root = path.resolve('.');
const artifacts = path.join(root, `tests/artifacts/screens/landscape/ai576/${process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'd5'}/large-editing`);
const source = path.join(root, 'assets/public/landscape/coastal-city');
let server, origin, directory;
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
const manifest = async () => JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const polygon = { type: 'polygon', points: [{ x: 1200, z: 1200 }, { x: 2700, z: 1300 }, { x: 2800, z: 2600 }, { x: 1800, z: 2800 }, { x: 1100, z: 2300 }] };
const closePose = { position: [2000, 180, 1750], target: [2000, 18, 2000], projection: 'perspective', fov: 50, zoom: 1 };
const widePose = { position: [2000, 6500, 1999], target: [2000, 0, 2000], projection: 'orthographic', orthoHeight: 12000, zoom: 1 };

test.beforeAll(async () => {
    await mkdir(artifacts, { recursive: true });
    directory = await mkdtemp(path.join(artifacts, 'coastal-run-'));
    for (const relative of ['manifest.json', 'payloads', 'appearance']) await cp(path.join(source, relative), path.join(directory, relative), { recursive: true });
    server = createLandscapeServer({ root, landscapeDirectory: directory });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});

async function settle(page) {
    await page.waitForTimeout(180);
    await expect.poll(async () => {
        const state = await snapshot(page);
        return state.streaming?.settled && state.appearance?.settled;
    }, { timeout: 60000 }).toBe(true);
    const state = await snapshot(page);
    expect(state.budget.cpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.gpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(state.streaming.uploadLimitBytes);
    return state;
}

async function query(page, revision, x, z) {
    const response = await page.request.post(`${origin}/api/landscape/query`, { data: { x, z, selectionId: `d5-point-${x}-${z}`, expectedRevision: revision } });
    const result = await response.json();
    expect(response.ok(), JSON.stringify(result)).toBe(true);
    return result;
}

// Only one native chunk and one neighbor are retained; checking the full border set does not assemble a raster.
async function checkNativeBorders(saved) {
    const native = saved.chunks.filter(chunk => chunk.level === saved.grid.maxLevel);
    const byCell = new Map(native.map(chunk => [`${chunk.column}/${chunk.row}`, chunk]));
    let borders = 0, samples = 0;
    for (const chunk of native) {
        const values = await readFile(path.join(directory, chunk.channels.height.url));
        for (const [neighbor, axis] of [[byCell.get(`${chunk.column + 1}/${chunk.row}`), 'x'], [byCell.get(`${chunk.column}/${chunk.row + 1}`), 'z']]) {
            if (!neighbor) continue;
            const other = await readFile(path.join(directory, neighbor.channels.height.url));
            for (let index = 0; index < chunk.columns; index++) {
                const a = axis === 'x' ? index * chunk.columns + chunk.columns - 1 : (chunk.rows - 1) * chunk.columns + index;
                const b = axis === 'x' ? index * neighbor.columns : index;
                expect(values.readUInt32LE(a * 4), `${chunk.id} / ${neighbor.id} sample ${index}`).toBe(other.readUInt32LE(b * 4));
                samples++;
            }
            borders++;
        }
    }
    return { borders, samples, maximumResidentHeightChunks: 2 };
}

test('Landscape D5: polygon grade and halo smoothing survive preparation, eviction, reopen and complete revert', async ({ page }) => {
    test.setTimeout(240000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID/i.test(message.text())) errors.push(message.text()); });
    const original = await manifest();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${origin}/screens/landscape_fabrication.html`);
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready);
    const beforeCenter = await query(page, original.revision, 2000, 2000), beforeOutside = await query(page, original.revision, 500, 500);
    await page.evaluate(async pose => { window.__landscapeTestHooks.setCamera(pose); await window.__landscapeTestHooks.select(2000, 2000); }, closePose);
    await settle(page);
    await page.screenshot({ path: path.join(artifacts, '01-before-terrain-grade.png') });
    const batch = {
        format: 'landscape-edit-batch', schemaVersion: 1, id: 'coastal-d5-polygon-grade-smooth', landscapeId: original.id, expectedRevision: original.revision,
        regions: [{ id: 'terrace-study', name: 'Graded coastal terrace', region: polygon }],
        operations: [
            { id: 'terrace-grade', type: 'grade', regionId: 'terrace-study', falloff: { type: 'linear', distance: 80 }, start: { x: 1250, z: 1500, heightMeters: 8 }, end: { x: 2750, z: 2500, heightMeters: 28 } },
            { id: 'center-rise', type: 'raise', region: { type: 'circle', center: { x: 2000, z: 2000 }, radius: 2 }, falloff: { type: 'none' }, deltaMeters: 8 },
            { id: 'terrace-smooth', type: 'smooth', regionId: 'terrace-study', falloff: { type: 'linear', distance: 80 }, radiusMeters: 7.8125, strength: 1 },
            { id: 'terrace-sand', type: 'assign-soil', regionId: 'terrace-study', falloff: { type: 'none' }, soilId: 'sand' }
        ]
    };
    const appliedResponse = await page.request.post(`${origin}/api/landscape/apply`, { data: batch, timeout: 120000 });
    const applied = await appliedResponse.json();
    expect(appliedResponse.ok(), JSON.stringify(applied)).toBe(true);
    expect(applied.summary.changedNativeIds.length).toBeGreaterThan(4);
    expect(applied.summary.workingBytes).toBeLessThanOrEqual(applied.summary.workingByteLimit);
    expect(applied.summary.heightDeltaRange.min).toBeLessThan(0);
    expect(applied.summary.heightDeltaRange.max).toBeGreaterThan(0);
    const saved = await manifest(), borders = await checkNativeBorders(saved);
    expect(borders.borders).toBe(112);
    expect(saved.regions.find(region => region.id === 'terrace-study').region).toEqual(polygon);
    for (const chunk of saved.chunks) expect(chunk.channels.landCover).toEqual(original.chunks.find(value => value.id === chunk.id).channels.landCover);
    expect(saved.chunks.find(chunk => chunk.id === 'l3/c0/r0')).toEqual(original.chunks.find(chunk => chunk.id === 'l3/c0/r0'));
    const editedCenter = await query(page, saved.revision, 2000, 2000), editedOutside = await query(page, saved.revision, 500, 500);
    // The center is on the 18m grade; a five-vertex +8m rise is averaged over the 9x9 source halo.
    expect(editedCenter.sample.height).toBeCloseTo(18 + 40 / 81, 5);
    expect(editedCenter.sample.soilId).toBe('sand');
    expect(editedCenter.sample.landCoverId).toBe(beforeCenter.sample.landCoverId);
    expect(editedOutside.sample.height).toBe(beforeOutside.sample.height);
    expect(editedOutside.sample.soilId).toBe(beforeOutside.sample.soilId);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await settle(page);
    expect((await snapshot(page)).selection.sample.height).toBeCloseTo(editedCenter.sample.height, 5);
    const conservativeError = saved.chunks.find(chunk => chunk.id === saved.overviewId).geometricError;
    const coarsenSpan = Math.max(12000, conservativeError * 1080 / 0.5);
    await page.evaluate(pose => window.__landscapeTestHooks.setCamera(pose), { ...widePose, orthoHeight: 20000, zoom: Math.max(0.1, Math.min(1, 20000 / coarsenSpan)) });
    const overview = await settle(page);
    expect(overview.streaming.residentLeafIds).toEqual([saved.overviewId]);
    await page.evaluate(pose => window.__landscapeTestHooks.setCamera(pose), { ...widePose, orthoHeight: 5400 });
    await settle(page);
    await page.screenshot({ path: path.join(artifacts, '02-saved-polygon-overview.png') });
    await page.evaluate(pose => window.__landscapeTestHooks.setCamera(pose), closePose);
    const revisited = await settle(page);
    expect(revisited.streaming.residentLeafIds.length).toBeGreaterThan(1);
    expect((await page.evaluate(() => window.__landscapeTestHooks.appearanceSample(2000, 2000))).soilId).toBe('sand');
    await page.evaluate(() => window.__landscapeTestHooks.setMode('combined'));
    await settle(page);
    await page.screenshot({ path: path.join(artifacts, '03-graded-terrain-wireframe.png') });
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    await page.goto('about:blank');

    // Run the real registered preparation leaf while no terrain page holds GPU resources.
    const defaultReceipt = path.join(root, 'tests/artifacts/screens/landscape/ai576/d3/hierarchy-validation.json');
    const priorReceipt = await readFile(defaultReceipt).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    try {
        const preparation = await run(process.execPath, ['tools/bake.mjs', '--target', 'landscape/hierarchy', '--set', `landscape/hierarchy:directory=${directory}`, '--publish'], { cwd: root, timeout: 120000, maxBuffer: 1024 * 1024 });
        await writeFile(path.join(artifacts, 'hierarchy-preparation.log'), preparation.stdout + preparation.stderr);
        await cp(defaultReceipt, path.join(artifacts, 'hierarchy-validation.json'));
    } finally {
        if (priorReceipt) await writeFile(defaultReceipt, priorReceipt);
    }
    const prepared = await manifest();
    expect(prepared.operations).toEqual(saved.operations);
    expect(prepared.regions).toEqual(saved.regions);
    expect(prepared.soil).toEqual(saved.soil);
    expect(prepared.editHistory.lastBatchId).toBe(batch.id);
    for (const chunk of saved.chunks.filter(value => value.level === saved.grid.maxLevel)) expect(prepared.chunks.find(value => value.id === chunk.id).channels).toEqual(chunk.channels);
    await page.goto(`${origin}/screens/landscape_fabrication.html`);
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready);
    await page.evaluate(async pose => { window.__landscapeTestHooks.setCamera(pose); await window.__landscapeTestHooks.select(2000, 2000); }, closePose);
    const reopened = await settle(page);
    expect(reopened.selection.sample.height).toBeCloseTo(editedCenter.sample.height, 5);
    expect(reopened.selection.sample.soilId).toBe('sand');
    await page.screenshot({ path: path.join(artifacts, '04-reopened-graded-terrain.png') });
    const revertResponse = await page.request.post(`${origin}/api/landscape/revert`, { data: { expectedRevision: prepared.revision }, timeout: 120000 });
    const reverted = await revertResponse.json();
    expect(revertResponse.ok(), JSON.stringify(reverted)).toBe(true);
    const restored = await manifest(), restoredBorders = await checkNativeBorders(restored);
    expect(restored.regions).toEqual(original.regions);
    expect(restored.operations).toEqual(original.operations);
    for (const chunk of original.chunks) expect(restored.chunks.find(value => value.id === chunk.id).channels).toEqual(chunk.channels);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await settle(page);
    const afterRevert = await snapshot(page);
    expect(afterRevert.selection.sample.height).toBe(beforeCenter.sample.height);
    expect(afterRevert.selection.sample.soilId).toBe(beforeCenter.sample.soilId);
    await page.screenshot({ path: path.join(artifacts, '05-reverted-original-terrain.png') });
    expect(errors).toEqual([]);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect(disposed.budget.cpuBytes).toBe(0);
    expect(disposed.budget.gpuBytes).toBe(0);
    await writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ directory, batch, applied, beforeCenter, editedCenter, borders, overview, revisited, preparedRevision: prepared.revision, reopened, reverted, restoredBorders, afterRevert, disposed, errors }, null, 2));
});
