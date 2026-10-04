// Verifies the real coastal edit/save/reopen/revert loop through the viewer and local authoring API.
import { test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { createLandscapeModelFixture } from '../../node/unit/landscape_model_fixture.js';
import { copyLandscapePlanningSources } from '../../shared/landscape_fixture_files.js';

const root = path.resolve('.');
const artifacts = path.join(root, `tests/artifacts/screens/landscape/ai576/${process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'regression'}/authoring`);
let server, origin, directory;

test.beforeAll(async () => {
    await mkdir(artifacts, { recursive: true });
    directory = await mkdtemp(path.join(artifacts, 'coastal-run-'));
    const source = path.join(root, 'assets/public/landscape/coastal-city');
    await cp(path.join(source, 'manifest.json'), path.join(directory, 'manifest.json'));
    await cp(path.join(source, 'payloads'), path.join(directory, 'payloads'), { recursive: true });
    await cp(path.join(source, 'appearance'), path.join(directory, 'appearance'), { recursive: true });
    await copyLandscapePlanningSources(JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8')), source, directory);
    server = createLandscapeServer({ root, landscapeDirectory: directory });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});

test('Landscape D2: rendering precision does not move soil queries outside fractional bounds', async ({ page }) => {
    const fixture = createLandscapeModelFixture({ minX: 1000.1, minZ: 1000.1 });
    const chunk = fixture.decoded.get(fixture.manifest.overviewId);
    await page.goto(`${origin}/screens/landscape_fabrication.html`);
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready);
    const encodedX = await page.evaluate(async ({ manifest, descriptor, heights, landCover }) => {
        const { createLandscapeMesh } = await import('/src/graphics/engine3d/landscape/LandscapeMesh.js');
        const { buildLandscapeMeshBuffers } = await import('/src/graphics/engine3d/landscape/LandscapeMeshBuffers.js');
        const coverageSlots = window.__landscapeTestHooks.snapshot().appearance.coverageSlots.total;
        const model = createLandscapeMesh(buildLandscapeMeshBuffers({ chunk: { descriptor, heights: new Float32Array(heights), landCover: new Uint8Array(landCover) }, manifest }), new Float32Array(heights), { coverageSlots });
        const value = model.mesh.geometry.attributes.position.getX(0);
        model.dispose();
        window.__landscapeTestHooks.dispose();
        return value;
    }, { manifest: fixture.manifest, descriptor: chunk.descriptor, heights: [...chunk.heights], landCover: [...chunk.landCover] });
    expect(encodedX).toBeLessThan(fixture.manifest.bounds.minX);
});

test('Landscape D2: native area, raise and sand, persistent reopen, stale refusal, and revert', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${origin}/screens/landscape_fabrication.html`);
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready);
    const original = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    await page.getByLabel('Selection radius in meters').fill('80');
    await page.getByLabel('Selection radius in meters').press('Tab');
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    const canvas = await page.locator('#game-canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width * .5, canvas.y + canvas.height * .5);
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection?.editingReady)).toBe(true);
    await expect(page.locator('[data-field="handoff"]')).toContainText('Native context saved');
    const before = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(before.selection.provisional).toBe(false);
    expect(before.selection.region.radius).toBe(80);
    expect(before.selection.sample.sampleSpacing.x).toBe(1.953125);
    await page.getByRole('button', { name: 'Focus selection', exact: true }).click();
    await page.waitForTimeout(150);
    const pose = (await page.evaluate(() => window.__landscapeTestHooks.snapshot())).camera;
    await page.screenshot({ path: path.join(artifacts, '01-native-selection.png') });

    const region = before.selection.region;
    const batch = {
        format: 'landscape-edit-batch', schemaVersion: 1, id: 'coastal-d2-raise-and-sand',
        landscapeId: original.id, expectedRevision: original.revision,
        operations: [
            { id: 'raise-two-meters', type: 'raise', region, falloff: { type: 'linear', distance: 30 }, deltaMeters: 2 },
            { id: 'assign-sand', type: 'assign-soil', region, falloff: { type: 'none' }, soilId: 'sand' }
        ]
    };
    const appliedResponse = await page.request.post(`${origin}/api/landscape/apply`, { data: batch });
    const applied = await appliedResponse.json();
    expect(appliedResponse.ok(), JSON.stringify(applied)).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection?.editingReady)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().revision)).toBe(applied.revision);
    const edited = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    for (const field of ['position', 'target']) edited.camera[field].forEach((value, index) => expect(value).toBeCloseTo(pose[field][index], 9));
    expect(edited.selection.sample.height).toBeCloseTo(before.selection.sample.height + 2, 4);
    expect(edited.selection.sample.soilId).toBe('sand');
    expect(edited.selection.sample.landCoverId).toBe(before.selection.sample.landCoverId);
    const saved = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    expect(saved.chunks.find(chunk => chunk.id === 'l3/c7/r7')).toEqual(original.chunks.find(chunk => chunk.id === 'l3/c7/r7'));
    for (const chunk of saved.chunks) expect(chunk.channels.landCover).toEqual(original.chunks.find(source => source.id === chunk.id).channels.landCover);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(artifacts, '02-raised-sand-patch.png') });

    const savedBytes = await readFile(path.join(directory, 'manifest.json'), 'utf8');
    for (const invalid of [batch, { ...batch, expectedRevision: saved.revision }]) {
        const rejected = await page.request.post(`${origin}/api/landscape/apply`, { data: invalid });
        expect(rejected.ok()).toBe(false);
        expect(await readFile(path.join(directory, 'manifest.json'), 'utf8')).toBe(savedBytes);
    }
    const staleQuery = await page.request.post(`${origin}/api/landscape/query`, { data: { x: before.selection.position.x, z: before.selection.position.z, radius: 80, selectionId: 'stale-query', expectedRevision: original.revision } });
    expect(staleQuery.ok()).toBe(false);

    await page.reload();
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready);
    await page.evaluate(async ({ x, z }) => {
        window.__landscapeTestHooks.setSelectionRadius(80);
        await window.__landscapeTestHooks.select(x, z);
    }, before.selection.position);
    const reopened = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(reopened.revision).toBe(applied.revision);
    expect(reopened.selection.sample.height).toBeCloseTo(edited.selection.sample.height, 5);
    expect(reopened.selection.sample.soilId).toBe('sand');
    const revertResponse = await page.request.post(`${origin}/api/landscape/revert`, { data: { expectedRevision: applied.revision } });
    const reverted = await revertResponse.json();
    expect(revertResponse.ok(), JSON.stringify(reverted)).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection?.editingReady)).toBe(true);
    const restored = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(restored.selection.sample.height).toBeCloseTo(before.selection.sample.height, 5);
    expect(restored.selection.sample.soilId).toBe(before.selection.sample.soilId);
    await page.getByRole('button', { name: 'Focus selection', exact: true }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(artifacts, '03-reverted-patch.png') });
    const replay = await page.request.post(`${origin}/api/landscape/apply`, { data: { ...batch, expectedRevision: restored.revision } });
    expect(replay.ok()).toBe(false);
    await page.evaluate(() => window.__landscapeTestHooks.setSelectionRadius(1000));
    await expect(page.locator('[data-field="notice"]')).toContainText('D2 limit is 4');
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).selection.editingReady).toBe(false);
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).revision).toBe(restored.revision);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect.poll(async () => (await page.request.get(`${origin}/api/landscape/selection`)).status()).toBe(404);
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ directory, before, batch, applied, edited, reopened, reverted, restored, errors }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});
