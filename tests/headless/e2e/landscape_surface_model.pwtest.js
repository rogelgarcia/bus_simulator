// Verifies the AI 598 D1 surface model in the viewer on coastal terrain v3: the geology streams into the terrain-field array (17 slots x 7 layers under the fields
// ceiling, uploads under the cap), surfaceSample reproduces the catena at the review and catena points, the five inspection views agree with the JavaScript
// mirror at centre-pixel readbacks, an overrides document pins classes through the root-grid layer exactly, landscapeSurfaceModel=off streams no geology and
// keeps every output neutral, and a landscape without the sidecar reports the geology absent without an error. The suite serves v3 itself on the
// verification port; LANDSCAPE_TEST_SURFACE_CACHE pins the cache mode of the run.
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';
import { LANDSCAPE_SURFACE_COVERS, LANDSCAPE_SURFACE_SUBSTRATES, landscapeTerrainFieldsLayout } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_SURFACE_COVER_COLORS, LANDSCAPE_SURFACE_SUBSTRATE_COLORS, landscapeColorBytes } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainDiagnostics.js';
import { LANDSCAPE_SURFACE_MODEL_RUNTIME } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceModel.js';

const root = path.resolve('.');
const MiB = 1024 * 1024;
const landscapeDirectory = path.resolve(root, process.env.LANDSCAPE_TEST_SURFACE_LANDSCAPE ?? 'assets/public/landscape/coastal-city-v3');
const artifacts = path.resolve(root, 'tests/artifacts/screens/landscape/ai598/d1/browser');
const viewport = { width: 1920, height: 1080 };
const OVERRIDES_URL = '/tests/headless/e2e/fixtures/ai598-surface-overrides.json';
test.use({ viewport, deviceScaleFactor: 1, video: 'off', trace: 'off' });

// the catena points: the review poses NW-03 (its bluff toe transect), NW-05 and NW-07, and three catena samples read off the geology (a berm, a foredune, a talus toe)
const POINTS = Object.freeze([
    // the berm crest (1.8 m) lies inside the wrack band of the root layer's reach (1.5-1.9 m here): dry sand under the wrack line, or bare sand beyond it
    { id: 'berm', x: 1224, z: 2596, expect: { substrate: 'sand', covers: ['none', 'wrack'], coverFraction: [0, .4] } },
    { id: 'foredune', x: 1241, z: 2636, expect: { substrate: 'dune-sand', cover: 'dry-grass', coverFraction: [.35, .55] } },
    { id: 'talus-toe', x: 1300, z: 2600, expect: { scree: .3, cover: 'lichen' } },
    { id: 'platform', x: 1283, z: 2735, expect: { algae: .3 } },
    { id: 'NW-05', x: 2600, z: 450, expect: { substrate: 'dirt', cover: 'broadleaf-litter', coverFraction: [.85, .95] } },
    { id: 'NW-07', x: 3300, z: 2740, expect: { substrate: 'dirt', cover: 'broadleaf-litter' } }
]);
const PARITY_POINTS = Object.freeze(['berm', 'foredune', 'NW-05', 'NW-07']);

async function exists(file) { try { await access(file); return true; } catch { return false; } }

async function serve(directory, baseURL) {
    const url = new URL(baseURL), server = createLandscapeServer({ root, landscapeDirectory: directory });
    await new Promise((resolve, reject) => {
        server.once('error', error => reject(new Error(`cannot listen on ${baseURL} (${error.code}); stop the other landscape server before this suite`)));
        server.listen(Number(url.port), url.hostname, () => resolve(undefined));
    });
    return server;
}

const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());

function observeErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID|\[LandscapeSurface\]/i.test(message.text())) errors.push(message.text()); });
    return errors;
}

async function settled(page, timeoutMs = 180000) {
    await page.waitForFunction(() => {
        const state = window.__landscapeTestHooks?.snapshot();
        if (state?.lastError) throw new Error(state.lastError);
        const surround = !state?.surround || state.surround.status !== 'loading' && (state.surround.settled && (state.surround.pending ?? 0) === 0);
        const ocean = !state?.ocean || state.ocean.status !== 'loading' && state.ocean.settled !== false, ecosystem = !state?.ecosystem || state.ecosystem.status !== 'loading' && state.ecosystem.settled !== false;
        const fields = state?.appearance?.terrainFields;
        return state?.ready && state.streaming.settled && state.streaming.pending === 0 && state.appearance?.settled && state.planning.settled && !state.terrainProgramVariant?.pending && surround && ocean && ecosystem
            && (fields?.status !== 'active' || fields.appearanceLayerState?.status === 'resident');
    }, null, { timeout: timeoutMs });
    await page.waitForTimeout(300);
    return snapshot(page);
}

// a steep look at a point from 40 m above it (the ground under the centre pixel is the point); returns the picked world point and its screen centre
async function lookAt(page, x, z) {
    const centre = await page.evaluate(() => { const rect = document.getElementById('game-canvas').getBoundingClientRect(); return { left: rect.left, top: rect.top, x: Math.round(rect.width / 2), y: Math.round(rect.height / 2) }; });
    await page.evaluate(([px, pz]) => window.__landscapeTestHooks.setCamera({ position: [px, 220, pz - 1], target: [px, 0, pz], projection: 'perspective', fov: 55, zoom: 1 }), [x, z]);
    await settled(page);
    const coarse = await page.evaluate(([cx, cy]) => window.__landscapeTestHooks.pickPoint(cx, cy), [centre.left + centre.x, centre.top + centre.y]);
    expect(coarse, `a terrain point under (${x}, ${z})`).not.toBeNull();
    await page.evaluate(([px, py, pz]) => window.__landscapeTestHooks.setCamera({ position: [px, py + 40, pz - .5], target: [px, py, pz], projection: 'perspective', fov: 55, zoom: 1 }), [x, coarse.y, z]);
    await settled(page);
    const picked = await page.evaluate(([cx, cy]) => window.__landscapeTestHooks.pickPoint(cx, cy), [centre.left + centre.x, centre.top + centre.y]);
    expect(picked).not.toBeNull();
    return { picked, centre };
}

async function selectDiagnostic(page, diagnostic) {
    await page.evaluate(name => window.__landscapeTestHooks.setPlanning({ diagnostic: name }), diagnostic);
    await page.waitForFunction(name => { const view = window.__landscapeTestHooks.snapshot(); return view.planning.diagnostic === name && view.terrainProgramVariant.diagnostics === (name !== 'none') && !view.terrainProgramVariant.pending && view.streaming.settled; }, diagnostic, { timeout: 120000 });
    await page.evaluate(() => new Promise(resolve => { let left = 3; const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step); }));
}

const readCentre = (page, centre) => page.evaluate(async ([cx, cy]) => { const frame = await window.__landscapeTestHooks.readFrame({ left: cx, top: cy, width: 1, height: 1 }); return [...frame.data.subarray(0, 3)]; }, [centre.x, centre.y]);
const mixColour = (weights, catalog, colors) => [0, 1, 2].map(channel => catalog.reduce((sum, entry) => sum + weights[entry.id] * landscapeColorBytes(colors[entry.id].hex)[channel], 0));
const sample = (page, x, z) => page.evaluate(([px, pz]) => window.__landscapeTestHooks.surfaceSample(px, pz), [x, z]);

test('Landscape AI 598 D1: the geology streams into the field array on v3, surfaceSample reproduces the catena and the inspection views agree with the mirror', async ({ browser }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    test.skip(!(await exists(path.join(landscapeDirectory, 'geology/manifest.json'))), `${landscapeDirectory} has no geology sidecar`);
    await mkdir(artifacts, { recursive: true });
    const landscape = JSON.parse(await readFile(path.join(landscapeDirectory, 'manifest.json'), 'utf8')), geology = JSON.parse(await readFile(path.join(landscapeDirectory, 'geology/manifest.json'), 'utf8'));
    const layout = landscapeTerrainFieldsLayout(landscape.grid.chunkIntervals + 1), server = await serve(landscapeDirectory, baseURL);
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 }), page = await context.newPage(), errors = observeErrors(page), evidence = { points: {}, parity: {} };
    try {
        // the ecosystem is off: its instances would cover the centre pixel the readbacks compare with the terrain mirror
        await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeEcosystem=off'));
        const boot = await settled(page), fields = boot.appearance.terrainFields, surface = boot.surface;
        expect(boot.revision).toBe(landscape.revision);
        expect(surface.mode).toBe('on');
        expect(surface.recipe.id).toBe('coastal-surface-v1');
        expect(surface.recipe.identity).toMatch(/^surface-recipe-[a-f0-9]{24}$/);
        expect(surface.geology.status).toBe('active');
        expect(surface.geology.revision).toBe(geology.revision);
        expect(surface.overrides).toBeNull();
        expect([surface.layersPerPage, fields.layersPerPage, fields.capacity]).toEqual([LANDSCAPE_SURFACE_MODEL_RUNTIME.layers.perPageWithGeology, 7, 17]);
        expect(fields.geology.layers).toEqual([4, 5, 6]);
        expect(fields.geology.pageBytes).toBe(3 * layout.layerBytes);
        // the array: 17 slots x 7 layers plus the appearance layer (no override layer without a document), inside the fields ceiling; uploads inside the frame cap
        expect(fields.bytes.arrayGpu).toBe((17 * 7 + 1) * layout.layerBytes);
        expect(fields.bytes.arrayCpu).toBe(fields.bytes.arrayGpu + fields.geology.pageBytes);
        expect(fields.bytes.gpuBytes).toBeLessThanOrEqual(fields.bytes.ceiling.gpuBytes);
        expect(fields.bytes.cpuBytes).toBeLessThanOrEqual(fields.bytes.ceiling.cpuBytes);
        expect(fields.uploads.peakBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
        expect(fields.uploads.peakBytesPerFrame).toBeGreaterThanOrEqual(layout.pageBytes + fields.geology.pageBytes);
        expect(fields.appearanceLayer.layer).toBe(17 * 7);
        expect(fields.geology.pagesLoaded).toBeGreaterThan(0);
        expect(boot.budget.cpuBytes).toBeLessThanOrEqual(boot.budget.limits.cpuBytes);
        expect(boot.budget.gpuBytes).toBeLessThanOrEqual(boot.budget.limits.gpuBytes);
        evidence.boot = { surface, fields: { bytes: fields.bytes, uploads: fields.uploads, geology: fields.geology, layersPerPage: fields.layersPerPage, timing: fields.timing }, budget: { cpuBytes: boot.budget.cpuBytes, gpuBytes: boot.budget.gpuBytes, limits: boot.budget.limits }, surfaceCache: boot.surfaceCache };
        // the catena at the points, from the resident data (each point looked at so its native pages and geology are resident)
        for (const point of POINTS) {
            const { picked } = await lookAt(page, point.x, point.z), result = await sample(page, picked.x, picked.z);
            expect(result, point.id).not.toBeNull();
            expect(result.geologyAvailability, `${point.id} geology bound`).toBe(1);
            expect(result.fieldsAvailability).toBe(1);
            expect(result.availability).toBe(1);
            evidence.points[point.id] = { picked, substrate: result.substrate, cover: result.cover, coverFraction: result.coverFraction, wetness: result.wetness, substrates: result.substrates, covers: result.covers, slot: result.slot, geology: result.geology, inputs: result.inputs };
            const label = `${point.id} (${picked.x.toFixed(1)}, ${picked.z.toFixed(1)}) ${JSON.stringify({ substrate: result.substrate, cover: result.cover, f: result.coverFraction })}`;
            if (point.expect.substrate) expect(result.substrate.id, label).toBe(point.expect.substrate);
            if (point.expect.cover) expect(result.cover.id, label).toBe(point.expect.cover);
            if (point.expect.covers) expect(point.expect.covers, label).toContain(result.cover.id);
            if (point.expect.scree) expect(result.substrates.scree, label).toBeGreaterThanOrEqual(point.expect.scree);
            if (point.expect.algae) expect(result.covers.algae, label).toBeGreaterThanOrEqual(point.expect.algae);
            if (point.expect.coverFraction) { expect(result.coverFraction, label).toBeGreaterThanOrEqual(point.expect.coverFraction[0]); expect(result.coverFraction, label).toBeLessThanOrEqual(point.expect.coverFraction[1]); }
            const sums = [Object.values(result.substrates).reduce((a, b) => a + b, 0), Object.values(result.covers).reduce((a, b) => a + b, 0)];
            expect(Math.abs(sums[0] - 1) + Math.abs(sums[1] - 1), `${point.id} weights sum to 1`).toBeLessThan(1e-9);
        }
        // GPU parity: the four views at the centre pixel against the mirror's mixed palette colour and gray values (the vertex normal of the rendered mesh
        // may differ from the native triangle slope by a few degrees, hence the byte tolerances)
        for (const id of PARITY_POINTS) {
            const point = POINTS.find(entry => entry.id === id), { picked, centre } = await lookAt(page, point.x, point.z), mirror = await sample(page, picked.x, picked.z), readings = {};
            await selectDiagnostic(page, 'surface-substrate'); readings.substrate = await readCentre(page, centre);
            await selectDiagnostic(page, 'surface-cover'); readings.cover = await readCentre(page, centre);
            await selectDiagnostic(page, 'surface-fraction'); readings.fraction = await readCentre(page, centre);
            await selectDiagnostic(page, 'surface-wetness'); readings.wetness = await readCentre(page, centre);
            await selectDiagnostic(page, 'surface-disturbance'); readings.disturbance = await readCentre(page, centre);
            await selectDiagnostic(page, 'none');
            const expected = { substrate: mixColour(mirror.substrates, LANDSCAPE_SURFACE_SUBSTRATES, LANDSCAPE_SURFACE_SUBSTRATE_COLORS), cover: mixColour(mirror.covers, LANDSCAPE_SURFACE_COVERS, LANDSCAPE_SURFACE_COVER_COLORS),
                fraction: [mirror.coverFraction * 255], wetness: [mirror.wetness * 255], disturbance: [0] };
            const differences = Object.fromEntries(Object.entries(expected).map(([view, value]) => [view, Math.max(...value.map((component, channel) => Math.abs(component - readings[view][channel])))]));
            evidence.parity[id] = { picked, readings, expected, differences, mirror: { substrate: mirror.substrate, cover: mirror.cover, coverFraction: mirror.coverFraction, wetness: mirror.wetness } };
            for (const [view, difference] of Object.entries(differences)) expect(difference, `${id} ${view}: GPU ${readings[view]} vs mirror ${expected[view].map(value => value.toFixed(1))}`).toBeLessThanOrEqual(view === 'substrate' || view === 'cover' ? 16 : 12);
        }
        await page.screenshot({ path: path.join(artifacts, 'NW-05-shaded.png') });
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await snapshot(page);
        expect(disposed.budget.cpuBytes).toBe(0);
        expect(disposed.budget.gpuBytes).toBe(0);
        expect(errors).toEqual([]);
    } finally {
        await writeFile(path.join(artifacts, 'surface-model-on.json'), JSON.stringify({ landscape: { id: landscape.id, revision: landscape.revision }, geology: geology.revision, surfaceCache: process.env.LANDSCAPE_TEST_SURFACE_CACHE ?? 'default', evidence, errors }, null, 2));
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
});

test('Landscape AI 598 D1: an overrides document pins classes through the root-grid layer exactly, off streams no geology and keeps every output neutral, and an absent sidecar is explicit', async ({ browser }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    test.skip(!(await exists(path.join(landscapeDirectory, 'geology/manifest.json'))), `${landscapeDirectory} has no geology sidecar`);
    await mkdir(artifacts, { recursive: true });
    const landscape = JSON.parse(await readFile(path.join(landscapeDirectory, 'manifest.json'), 'utf8')), layout = landscapeTerrainFieldsLayout(landscape.grid.chunkIntervals + 1);
    const server = await serve(landscapeDirectory, baseURL), evidence = {}, errors = [];
    const overrides = { format: 'landscape-surface-overrides', schemaVersion: 1, id: 'ai598-d1-suite', recipe: 'coastal-surface-v1', regions: [
        { id: 'forest-quarry', region: { type: 'circle', center: { x: 2600, z: 450 }, radius: 60 }, substrate: 'cobble', cover: 'moss', coverFractionScale: .5, wetnessOffset: .25 }] };
    const expected = { substrate: landscapeColorBytes(LANDSCAPE_SURFACE_SUBSTRATE_COLORS.cobble.hex), cover: landscapeColorBytes(LANDSCAPE_SURFACE_COVER_COLORS.moss.hex) };
    try {
        // overrides: the layer joins the array before the appearance layer, the mirror and the views read the pinned classes inside the region and nothing outside
        const pinned = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 }), pinnedPage = await pinned.newPage(), pinnedErrors = observeErrors(pinnedPage);
        await pinnedPage.route(`**${OVERRIDES_URL}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overrides) }));
        await pinnedPage.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?landscapeEcosystem=off&landscapeSurfaceOverrides=${encodeURIComponent(OVERRIDES_URL)}`));
        const boot = await settled(pinnedPage), fields = boot.appearance.terrainFields;
        expect(boot.surface.overrides).toMatchObject({ id: 'ai598-d1-suite', regions: 1 });
        expect(boot.surface.overrides.identity).toMatch(/^surface-overrides-[a-f0-9]{24}$/);
        expect(boot.surface.overrides.layerState.status).toBe('resident');
        expect(boot.surface.overrides.layer.layer).toBe(17 * 7);
        expect(fields.appearanceLayer.layer).toBe(17 * 7 + 1);
        expect(fields.bytes.arrayGpu).toBe((17 * 7 + 2) * layout.layerBytes);
        const { picked, centre } = await lookAt(pinnedPage, 2600, 450), inside = await sample(pinnedPage, picked.x, picked.z), outside = await sample(pinnedPage, 2600, 600);
        expect(inside.override).toMatchObject({ substrate: 9, cover: 3 });
        expect(inside.substrates.cobble).toBe(1); expect(inside.covers.moss).toBe(1);
        expect(Math.abs(inside.coverFraction - .92 * .5)).toBeLessThan(.02); expect(Math.abs(inside.wetness - .25)).toBeLessThan(.02);
        expect(outside.override).toMatchObject({ substrate: -1, cover: -1, coverFractionScale: 1, wetnessOffset: 0 });
        expect(outside.substrate.id).toBe('dirt');
        await selectDiagnostic(pinnedPage, 'surface-substrate'); const substrateView = await readCentre(pinnedPage, centre);
        await selectDiagnostic(pinnedPage, 'surface-cover'); const coverView = await readCentre(pinnedPage, centre);
        await selectDiagnostic(pinnedPage, 'surface-fraction'); const fractionView = await readCentre(pinnedPage, centre);
        await selectDiagnostic(pinnedPage, 'surface-wetness'); const wetnessView = await readCentre(pinnedPage, centre);
        evidence.overrides = { picked, inside: { override: inside.override, substrate: inside.substrate, cover: inside.cover, coverFraction: inside.coverFraction, wetness: inside.wetness }, outside: { substrate: outside.substrate, cover: outside.cover }, views: { substrateView, coverView, fractionView, wetnessView }, expected, layer: boot.surface.overrides };
        for (let channel = 0; channel < 3; channel++) { expect(Math.abs(substrateView[channel] - expected.substrate[channel]), `pinned substrate colour ${substrateView}`).toBeLessThanOrEqual(2); expect(Math.abs(coverView[channel] - expected.cover[channel]), `pinned cover colour ${coverView}`).toBeLessThanOrEqual(2); }
        expect(Math.abs(fractionView[0] - inside.coverFraction * 255)).toBeLessThanOrEqual(4);
        expect(Math.abs(wetnessView[0] - inside.wetness * 255)).toBeLessThanOrEqual(4);
        await pinnedPage.screenshot({ path: path.join(artifacts, 'overrides-wetness.png') });
        errors.push(...pinnedErrors);
        await pinned.close();
        // off: no geology, four layers per page, neutral outputs
        const off = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 }), offPage = await off.newPage(), offErrors = observeErrors(offPage);
        await offPage.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeEcosystem=off&landscapeSurfaceModel=off'));
        const offBoot = await settled(offPage);
        expect(offBoot.surface.mode).toBe('off');
        expect([offBoot.surface.geology.status, offBoot.surface.geology.reason]).toEqual(['disabled', 'surface-model-off']);
        expect([offBoot.surface.layersPerPage, offBoot.appearance.terrainFields.layersPerPage]).toEqual([4, 4]);
        expect(offBoot.appearance.terrainFields.bytes.arrayGpu).toBe((17 * 4 + 1) * layout.layerBytes);
        expect(offBoot.appearance.terrainFields.status).toBe('active');
        // the ocean's shore model reads the geology sidecar and pages on its own; the field pages hold no geology layer and loaded no geology page
        expect([offBoot.appearance.terrainFields.geology.pagesLoaded, offBoot.appearance.terrainFields.geology.pageBytes, offBoot.appearance.terrainFields.geology.layers]).toEqual([0, 0, []]);
        const offLook = await lookAt(offPage, 2600, 450), neutral = await sample(offPage, offLook.picked.x, offLook.picked.z);
        expect([neutral.modelOn, neutral.availability, neutral.fieldsAvailability, neutral.geologyAvailability]).toEqual([false, 0, 0, 0]);
        expect([neutral.substrate.id, neutral.substrate.weight, neutral.cover.id, neutral.cover.weight, neutral.coverFraction, neutral.wetness]).toEqual(['dirt', 1, 'broadleaf-litter', 1, .9, 0]);
        await selectDiagnostic(offPage, 'surface-substrate'); const offSubstrate = await readCentre(offPage, offLook.centre);
        await selectDiagnostic(offPage, 'surface-fraction'); const offFraction = await readCentre(offPage, offLook.centre);
        const dirt = landscapeColorBytes(LANDSCAPE_SURFACE_SUBSTRATE_COLORS.dirt.hex);
        for (let channel = 0; channel < 3; channel++) expect(Math.abs(offSubstrate[channel] - dirt[channel]), `off: the default class colour ${offSubstrate}`).toBeLessThanOrEqual(2);
        expect(Math.abs(offFraction[0] - .9 * 255)).toBeLessThanOrEqual(4);
        evidence.off = { surface: offBoot.surface, fields: offBoot.appearance.terrainFields.bytes, neutral: { substrate: neutral.substrate, cover: neutral.cover, coverFraction: neutral.coverFraction, wetness: neutral.wetness }, views: { offSubstrate, offFraction } };
        errors.push(...offErrors);
        await off.close();
        // absent: a landscape without the sidecar (the request answered 404) keeps the fields, reports the geology absent and samples from the fields alone
        const absent = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 }), absentPage = await absent.newPage(), absentErrors = observeErrors(absentPage);
        await absentPage.route('**/geology/manifest.json', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'no geology' }));
        await absentPage.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeEcosystem=off'));
        const absentBoot = await settled(absentPage);
        expect([absentBoot.surface.geology.status, absentBoot.surface.geology.reason]).toEqual(['absent', 'surface-geology-404']);
        expect(absentBoot.surface.mode).toBe('on');
        expect(absentBoot.appearance.terrainFields.layersPerPage).toBe(4);
        expect(absentBoot.appearance.terrainFields.status).toBe('active');
        expect(absentBoot.appearance.terrainFields.errors).toEqual([]);
        const absentLook = await lookAt(absentPage, 2600, 450), fieldsOnly = await sample(absentPage, absentLook.picked.x, absentLook.picked.z);
        expect([fieldsOnly.geologyAvailability, fieldsOnly.fieldsAvailability, fieldsOnly.availability]).toEqual([0, 1, .5]);
        expect(fieldsOnly.inputs['deposit.none']).toBe(1);
        expect(fieldsOnly.substrate.id).toBe('dirt');
        evidence.absent = { surface: absentBoot.surface, sample: { substrate: fieldsOnly.substrate, cover: fieldsOnly.cover, availability: fieldsOnly.availability } };
        errors.push(...absentErrors);
        await absent.close();
        expect(errors).toEqual([]);
    } finally {
        await writeFile(path.join(artifacts, 'surface-model-switches.json'), JSON.stringify({ landscape: { id: landscape.id, revision: landscape.revision }, surfaceCache: process.env.LANDSCAPE_TEST_SURFACE_CACHE ?? 'default', overrides, evidence, errors }, null, 2));
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
});
