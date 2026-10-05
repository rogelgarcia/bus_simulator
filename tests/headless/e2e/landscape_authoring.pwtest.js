// Verifies the real coastal edit/save/reopen/revert loop through the viewer and local authoring API.
import { test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { createLandscapeModelFixture } from '../../node/unit/landscape_model_fixture.js';
import { copyLandscapePlanningSources } from '../../shared/landscape_fixture_files.js';
import { createLandscapeNaturalPresentation } from '../../../src/graphics/engine3d/landscape/LandscapeNaturalPresentation.js';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';

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
    await page.goto(landscapeViewerUrl(`${origin}/screens/landscape_fabrication.html`));
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
    await page.goto(landscapeViewerUrl(`${origin}/screens/landscape_fabrication.html`));
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready);
    const original = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    await page.getByLabel('Selection radius in meters').fill('80');
    await page.getByLabel('Selection radius in meters').press('Tab');
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    const canvas = await page.locator('#game-canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width * .5, canvas.y + canvas.height * .5);
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection?.editingReady), { timeout: 30000 }).toBe(true);
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

test.describe('Landscape D5 natural inference authoring', () => {
    // a height edit inside a planning area makes exactly its native stale: that native falls back to the overview infill, the rest keep
    // the published terrain-driven natural soil, and a revert restores the terrain policy everywhere
    let naturalServer, naturalOrigin, naturalDirectory;
    const source = path.join(root, 'assets/public/landscape/coastal-city');
    test.beforeAll(async () => {
        naturalDirectory = await mkdtemp(path.join(artifacts, 'natural-run-'));
        for (const entry of ['manifest.json', 'payloads', 'appearance', 'fields']) await cp(path.join(source, entry), path.join(naturalDirectory, entry), { recursive: true });
        await copyLandscapePlanningSources(JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8')), source, naturalDirectory);
        naturalServer = createLandscapeServer({ root, landscapeDirectory: naturalDirectory });
        await new Promise(resolve => naturalServer.listen(0, '127.0.0.1', resolve));
        naturalOrigin = `http://127.0.0.1:${naturalServer.address().port}`;
    });
    test.afterAll(async () => {
        if (!naturalServer) return;
        naturalServer.closeAllConnections();
        await new Promise(resolve => naturalServer.close(resolve));
    });

    // a root-aligned planning sample (present at every level) whose terrain label differs from the overview infill, inside a uniform 9 x 9 label block
    async function contrastPoint(manifest, inference, nativeId) {
        const sidecar = JSON.parse(await readFile(path.join(source, 'fields/manifest.json'), 'utf8')), chunk = manifest.chunks.find(entry => entry.id === nativeId);
        const labels = await readFile(path.join(source, 'fields', sidecar.pages.find(page => page.id === nativeId).naturalSoil.url)), cover = await readFile(path.join(source, chunk.channels.landCover.url));
        const soils = manifest.soil.catalog.map(soil => soil.id);
        for (let row = 16; row < 241; row += 8) for (let column = 16; column < 241; column += 8) {
            const i = row * 257 + column, x = chunk.bounds.minX + column * manifest.grid.spacingX, z = chunk.bounds.maxZ - row * manifest.grid.spacingZ;
            if (!manifest.landCover.catalog.find(entry => entry.id === cover[i]).planningOnly) continue;
            let uniform = true;
            for (let dr = -4; dr <= 4 && uniform; dr++) for (let dc = -4; dc <= 4; dc++) if (labels[i + dr * 257 + dc] !== labels[i]) { uniform = false; break; }
            const overview = soils[inference.sample(x, z, cover[i]) >> 4], terrain = soils[labels[i]];
            if (uniform && overview !== terrain) return { x, z, coverId: cover[i], terrain, overview };
        }
        throw new Error(`No contrasting planning sample in ${nativeId}`);
    }

    test('Landscape D5: editing a planning area stales only its native, which falls back explicitly, and a revert restores the terrain policy', async ({ page }) => {
        test.setTimeout(240000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const manifest = JSON.parse(await readFile(path.join(naturalDirectory, 'manifest.json'), 'utf8')), overview = manifest.chunks.find(chunk => chunk.id === manifest.overviewId);
        const inference = createLandscapeNaturalPresentation(manifest, { descriptor: overview, landCover: await readFile(path.join(source, overview.channels.landCover.url)) });
        const edited = await contrastPoint(manifest, inference, 'l3/c3/r3'), neighbor = await contrastPoint(manifest, inference, 'l3/c4/r3');
        const snapshot = () => page.evaluate(() => window.__landscapeTestHooks.snapshot());
        const display = point => page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), point);
        const settle = async () => {
            await page.waitForTimeout(200);
            await expect.poll(async () => { const state = await snapshot(); return state.ready && state.streaming?.settled && state.appearance?.settled; }, { timeout: 90000 }).toBe(true);
            return snapshot();
        };
        const view = { position: [1820, 260, 2040], target: [1900, 0, 2400], projection: 'perspective', fov: 55, zoom: 1 };
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto(landscapeViewerUrl(`${naturalOrigin}/screens/landscape_fabrication.html`));
        await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready, null, { timeout: 90000 });
        await page.evaluate(value => window.__landscapeTestHooks.setCamera(value), view);
        const before = await settle();
        expect([before.appearance.presentation.status, before.appearance.presentation.policy, before.appearance.presentation.natives.terrain]).toEqual(['active', 'natural-terrain-inference-v1', 64]);
        for (const point of [edited, neighbor]) {
            const sample = await display(point);
            expect([sample.coverId, sample.soilId, sample.displaySoilId], `${point.x},${point.z}`).toEqual([point.coverId, 'unknown', point.terrain]);
        }
        const batch = { format: 'landscape-edit-batch', schemaVersion: 1, id: 'd5-natural-planning-raise', landscapeId: manifest.id, expectedRevision: manifest.revision,
            operations: [{ id: 'raise-urban-block', type: 'raise', region: { type: 'circle', center: { x: 1750, z: 2250 }, radius: 20 }, falloff: { type: 'linear', distance: 10 }, deltaMeters: 1 }] };
        const response = await page.request.post(`${naturalOrigin}/api/landscape/apply`, { data: batch }), applied = await response.json();
        expect(response.ok(), JSON.stringify(applied)).toBe(true);
        expect(applied.summary.changedNativeIds).toEqual(['l3/c3/r3']);
        await page.evaluate(() => window.__landscapeTestHooks.reload());
        await expect.poll(async () => (await snapshot()).revision, { timeout: 90000 }).toBe(applied.revision);
        await page.evaluate(value => window.__landscapeTestHooks.setCamera(value), view);
        const stale = await settle(), presentation = stale.appearance.presentation;
        expect([presentation.status, presentation.reason, presentation.policy, presentation.fallbackScope]).toEqual(['active-partial', 'terrain-fields-stale-chunks', 'natural-terrain-inference-v1', 'stale-natives']);
        expect(presentation.overviewNatives).toEqual([{ id: 'l3/c3/r3', reason: 'stale' }]);
        expect(presentation.natives).toEqual({ total: 64, terrain: 63, overview: 1 });
        expect(presentation.policyByNative['l3/c3/r3']).toBe('natural-overview-infill-v1');
        expect(presentation.policyByNative['l3/c4/r3']).toBe('natural-terrain-inference-v1');
        expect(presentation.samples.overviewByReason.stale, 'resident pages report the planning samples on the fallback').toBeGreaterThan(0);
        expect(presentation.samples.overviewByReason.unpublished + presentation.samples.overviewByReason.inactive).toBe(0);
        expect(stale.streaming.naturalSoil.status).toBe('active-partial');
        expect(stale.appearance.terrainFields.staleChunks).toEqual(['l3/c3/r3']);
        expect((await display(edited)).displaySoilId, 'the stale native shows the overview infill').toBe(edited.overview);
        expect((await display(neighbor)).displaySoilId, 'its fresh neighbor keeps the published label').toBe(neighbor.terrain);
        const fine = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.coverageSample(x, z), edited);
        if (fine?.generated) expect(fine.inputs.natural.find(entry => entry.id === 'l3/c3/r3')).toEqual({ id: 'l3/c3/r3', policy: 'natural-overview-infill-v1' });
        // AI577 D5 terrain appearance: the layer is derived with the stale cell excluded; its terms are neutral inside the stale native and fade in
        // continuously over the freshness distance on the fresh side (no seam), while the coastal reach falls back to the local runup
        expect(stale.appearance.terrainFields.appearanceLayerState.status).toBe('resident');
        expect(stale.appearance.terrainFields.appearanceLayer.statistics.stale).toBeGreaterThan(0);
        const across = await page.evaluate(() => Array.from({ length: 31 }, (_, k) => window.__landscapeTestHooks.terrainAppearanceSample(1990 + 2 * k, 2250)));
        expect(across[0].availability, 'inside the stale native').toBe(0);
        expect([across[0].tone, across[0].chroma, across[0].exposure].every(value => value === 0), 'neutral terms').toBe(true);
        expect(across.at(-1).availability, 'past the fade on the fresh side').toBe(1);
        for (let k = 1; k < across.length; k++) {
            expect(across[k].availability).toBeGreaterThanOrEqual(across[k - 1].availability);
            expect(across[k].availability - across[k - 1].availability, 'no seam at the stale border').toBeLessThan(.15);
        }
        await page.screenshot({ path: path.join(artifacts, '04-natural-stale-native.png') });
        const revertResponse = await page.request.post(`${naturalOrigin}/api/landscape/revert`, { data: { expectedRevision: applied.revision } }), reverted = await revertResponse.json();
        expect(revertResponse.ok(), JSON.stringify(reverted)).toBe(true);
        await page.evaluate(() => window.__landscapeTestHooks.reload());
        await expect.poll(async () => (await snapshot()).revision, { timeout: 90000 }).toBe(reverted.revision);
        await page.evaluate(value => window.__landscapeTestHooks.setCamera(value), view);
        const restored = await settle();
        // the revert restores the bound channel hashes, so every native is fresh again (the revision itself is new)
        expect([restored.appearance.presentation.status, restored.appearance.presentation.natives.terrain, restored.appearance.presentation.bound]).toEqual(['active', 64, false]);
        expect((await display(edited)).displaySoilId).toBe(edited.terrain);
        expect(errors).toEqual([]);
        await writeFile(path.join(artifacts, 'natural-inference-verification.json'), JSON.stringify({ naturalDirectory, edited, neighbor, applied: applied.summary,
            before: before.appearance.presentation, stale: presentation, restored: restored.appearance.presentation, fine: fine ? { generated: fine.generated, natural: fine.inputs?.natural ?? null } : null }, null, 2));
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await snapshot();
        expect([disposed.budget.cpuBytes, disposed.budget.gpuBytes]).toEqual([0, 0]);
    });
});
