// Verifies the AI 596 D5 render-only far-field surround in the viewer on coastal terrain v3: the sidecar loads and binds the loaded revision,
// no surround tile inside the landscape extent is built, the straddling tiles carry the exclusion skirt, the surround never enters picking, the
// water reference spans the surround bounds, the surround draws the appearance's soil palette, its residency lives under its own ledger kind inside its share, a stale sidecar is refused,
// and the switch and disposal return every surround byte. The test serves the landscape itself on the verification port (like the resolution
// harness) and the surround from the cache root: LANDSCAPE_TEST_SURROUND names the surround manifest URL (default: the sidecar published beside
// the landscape, skipped when absent); LANDSCAPE_TEST_SURROUND_LANDSCAPE the landscape directory (default coastal-city-v3).
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';
import { LANDSCAPE_SURROUND } from '../../../src/graphics/engine3d/landscape/LandscapeSurroundModel.js';

const root = path.resolve('.');
const MiB = 1024 * 1024;
const SERVED_PREFIX = '/assets/public/landscape/coastal-city/';
const landscapeDirectory = path.resolve(root, process.env.LANDSCAPE_TEST_SURROUND_LANDSCAPE ?? 'assets/public/landscape/coastal-city-v3');
const surroundUrl = process.env.LANDSCAPE_TEST_SURROUND ?? `${SERVED_PREFIX}surround/manifest.json`;
const artifacts = path.resolve(root, 'tests/artifacts/screens/landscape/ai596/d5/browser/surround-suite');
const viewport = { width: 1920, height: 1080 };
test.use({ viewport, deviceScaleFactor: 1, video: 'off', trace: 'off' });

async function exists(file) { try { await access(file); return true; } catch { return false; } }

async function serve(directory, baseURL) {
    const url = new URL(baseURL);
    const server = createLandscapeServer({ root, landscapeDirectory: directory });
    await new Promise((resolve, reject) => {
        server.once('error', error => reject(new Error(`cannot listen on ${baseURL} (${error.code}); stop the other landscape server before this suite`)));
        server.listen(Number(url.port), url.hostname, () => resolve(undefined));
    });
    return server;
}

const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());

async function settled(page, timeoutMs = 120000) {
    await page.waitForFunction(() => {
        const state = window.__landscapeTestHooks?.snapshot();
        if (state?.lastError) throw new Error(state.lastError);
        const surround = !state?.surround || (state.surround.settled && (state.surround.pending ?? 0) === 0);
        return state?.ready && state.streaming.settled && state.streaming.pending === 0 && state.appearance?.settled && state.planning.settled && surround;
    }, null, { timeout: timeoutMs });
    await page.waitForTimeout(300);
    return snapshot(page);
}

const direction = (heading, pitch) => { const h = heading * Math.PI / 180, p = pitch * Math.PI / 180; return [Math.sin(h) * Math.cos(p), Math.sin(p), Math.cos(h) * Math.cos(p)]; };
const pose = (x, y, z, heading, pitch) => { const d = direction(heading, pitch); return { position: [x, y, z], target: [x + d[0] * 100, y + d[1] * 100, z + d[2] * 100], projection: 'perspective', fov: 55, zoom: 1 }; };
const surroundEntries = state => state.budget.entries.filter(entry => entry.kind === LANDSCAPE_SURROUND.kind);
const insideExtent = (tile, extent) => tile.minX >= extent.minX && tile.maxX <= extent.maxX && tile.minZ >= extent.minZ && tile.maxZ <= extent.maxZ;

test('Landscape AI 596 D5: the render-only surround streams beside v3, stays out of picking and queries, widens the water, and releases to zero', async ({ browser }, testInfo) => {
    test.setTimeout(10 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    test.skip(!(await exists(path.join(landscapeDirectory, 'manifest.json'))), `${landscapeDirectory} is not installed`);
    await mkdir(artifacts, { recursive: true });
    const landscape = JSON.parse(await readFile(path.join(landscapeDirectory, 'manifest.json'), 'utf8'));
    const server = await serve(landscapeDirectory, baseURL);
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE/i.test(message.text())) errors.push(message.text()); });
    try {
        const probe = await fetch(`${baseURL}${surroundUrl}`);
        test.skip(probe.status === 404, `no surround at ${surroundUrl}`);
        expect(probe.ok).toBe(true);
        const surroundManifest = await probe.json();
        await page.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?landscapeSurround=${encodeURIComponent(surroundUrl)}`));
        const boot = await settled(page);
        expect(boot.revision).toBe(landscape.revision);
        const surround = boot.surround;
        expect(surround.mode).toBe('url');
        expect(surround.status, `surround ${surroundUrl}: ${surround.reason}`).toBe('active');
        expect(surround.present).toBe(true);
        expect(surround.binding.landscapeId).toBe(landscape.id);
        expect(surround.binding.revision).toBe(landscape.revision);
        expect(surround.binding.extent).toEqual(landscape.bounds);
        expect(surround.revision).toBe(surroundManifest.revision);
        expect(surround.targetErrorPixels).toBe(LANDSCAPE_SURROUND.targetErrorPixels);
        expect(surround.skirtDepth).toBe(LANDSCAPE_SURROUND.skirtDepthMeters);
        expect(surround.programVariant.terrainAppearance).toBe(false);
        expect(surround.programVariant.surfaceCache).toBe(false);
        expect(surround.programVariant.diagnostics).toBe(false);
        // the far colours: the surround draws the loaded appearance's palette (one mean corrected albedo per soil of the landscape's soil catalog)
        expect(surround.palette.source, 'the surround follows the appearance palette once the coarse pages are in').toBe('appearance');
        expect(Object.keys(surround.palette.soils).sort()).toEqual(landscape.soil.catalog.map(entry => entry.id).sort());
        for (const colour of Object.values(surround.palette.soils)) { expect(colour).toHaveLength(3); for (const component of colour) { expect(component).toBeGreaterThan(0); expect(component).toBeLessThan(1); } }
        for (const soil of Object.keys(surround.palette.soils)) { expect(surround.palette.response[soil]).toHaveLength(3); expect(surround.palette.surface[soil]).toHaveLength(2); expect(surround.palette.surface[soil][1]).toBeGreaterThan(0.5); }
        // the exclusion: every surround tile inside the extent is listed as excluded, never resident; the rendered straddling tiles carry the skirt
        const excluded = surroundManifest.chunks.filter(chunk => insideExtent(chunk.bounds, landscape.bounds)).map(chunk => chunk.id).sort();
        expect([...surround.excludedIds].sort()).toEqual(excluded);
        expect(surround.residentLeafIds.some(id => excluded.includes(id))).toBe(false);
        // the water reference spans the surround bounds; the surround's bytes carry its kind inside the shared ledger and within its share
        expect(boot.water.extent).toBe('surround');
        expect(boot.water.bounds).toEqual(surroundManifest.bounds);
        expect(surroundEntries(boot).length).toBeGreaterThan(0);
        const kinds = new Set(surroundEntries(boot).map(entry => entry.kind));
        expect([...kinds]).toEqual([LANDSCAPE_SURROUND.kind]);
        expect(surround.share.cpuBytes).toBe(surroundEntries(boot).reduce((sum, entry) => sum + entry.cpuBytes, 0));
        expect(surround.share.gpuBytes).toBe(surroundEntries(boot).reduce((sum, entry) => sum + entry.gpuBytes, 0));
        expect(surround.share.gpuBytes).toBeLessThanOrEqual(LANDSCAPE_SURROUND.budgets.gpuBytes);
        expect(surround.share.cpuBytes).toBeLessThanOrEqual(LANDSCAPE_SURROUND.budgets.cpuBytes);
        expect(boot.budget.cpuBytes).toBeLessThanOrEqual(boot.budget.limits.cpuBytes);
        expect(boot.budget.gpuBytes).toBeLessThanOrEqual(boot.budget.limits.gpuBytes);
        evidence.boot = { surround, water: boot.water, budget: { cpuBytes: boot.budget.cpuBytes, gpuBytes: boot.budget.gpuBytes, limits: boot.budget.limits } };
        // an aerial pose over the sea (NW-11) refines the surround; the straddling natives, when resident, report their exclusion
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), pose(-400, 800, 2000, 90, -30));
        const aerial = await settled(page);
        expect(aerial.surround.tiles).toBeGreaterThan(1);
        expect(aerial.surround.residentLeafIds.some(id => excluded.includes(id))).toBe(false);
        expect(aerial.budget.peakGpuBytes).toBeLessThanOrEqual(aerial.budget.limits.gpuBytes);
        expect(aerial.peakUploadedBytesPerFrame).toBeLessThanOrEqual(8 * MiB);
        await page.screenshot({ path: path.join(artifacts, 'NW-11-surround.png') });
        evidence.aerial = { surround: aerial.surround, budget: { cpuBytes: aerial.budget.cpuBytes, gpuBytes: aerial.budget.gpuBytes, peakCpuBytes: aerial.budget.peakCpuBytes, peakGpuBytes: aerial.budget.peakGpuBytes } };
        // picking: from 250 m above (3700, 2000) looking east at -15 degrees the centre ray clears the landscape (it passes x = 4000 at 170 m) and meets
        // surround land only, so it hits nothing (the surround is never in the pick set); the bottom of the frame meets the landscape inside the extent
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), pose(3700, 250, 2000, 90, -15));
        const east = await settled(page);
        expect(east.surround.straddlingIds.length, 'the tiles straddling the extent are rendered with the exclusion skirt').toBeGreaterThan(0);
        const picks = await page.evaluate(() => {
            const rect = document.getElementById('game-canvas').getBoundingClientRect(), hooks = window.__landscapeTestHooks;
            return { beyond: hooks.pickPoint(rect.left + rect.width / 2, rect.top + rect.height / 2), inside: hooks.pickPoint(rect.left + rect.width / 2, rect.top + rect.height * .97),
                surroundMeshes: window.__landscapeSurroundMeshes?.() ?? null };
        });
        expect(picks.beyond, 'a pick over the surround reports no terrain').toBeNull();
        expect(picks.inside).not.toBeNull();
        expect(picks.inside.x).toBeLessThanOrEqual(landscape.bounds.maxX);
        // a selection beyond the bounds is refused by the authoritative query, never answered by the surround
        const beyond = await page.evaluate(() => window.__landscapeTestHooks.select(6000, 2000));
        expect(beyond).toBeNull();
        await page.screenshot({ path: path.join(artifacts, 'east-edge-surround.png') });
        evidence.picks = picks;
        // off: every surround byte leaves the ledger and the water returns to the landscape bounds; on again: it reloads and binds
        const off = await page.evaluate(() => window.__landscapeTestHooks.setSurround('off'));
        expect(off.status).toBe('off');
        const without = await settled(page);
        expect(surroundEntries(without)).toHaveLength(0);
        expect(without.water.extent).toBe('landscape');
        expect(without.water.bounds).toEqual(landscape.bounds);
        expect(without.surround.present).toBe(false);
        await page.screenshot({ path: path.join(artifacts, 'east-edge-without.png') });
        const on = await page.evaluate(url => window.__landscapeTestHooks.setSurround(url), surroundUrl);
        expect(on.status).toBe('active');
        const again = await settled(page);
        expect(again.water.extent).toBe('surround');
        expect(surroundEntries(again).length).toBeGreaterThan(0);
        expect(again.surround.palette.source).toBe('appearance');
        // a stale sidecar (another revision) is reported and holds nothing
        await page.route(`**${surroundUrl}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...surroundManifest, provenance: { ...surroundManifest.provenance, preparation: { ...surroundManifest.provenance.preparation, surround: { ...surroundManifest.provenance.preparation.surround, revision: 'synthesis-ffffffffffffffffffffffff' } } } }) }));
        const stale = await page.evaluate(url => window.__landscapeTestHooks.setSurround(url), surroundUrl);
        expect(stale.status).toBe('stale');
        expect(stale.reason).toMatch(/synthesis-ffffffffffffffffffffffff/);
        expect(stale.present).toBe(false);
        const staleState = await snapshot(page);
        expect(surroundEntries(staleState)).toHaveLength(0);
        expect(staleState.water.extent).toBe('landscape');
        await page.unroute(`**${surroundUrl}`);
        // a landscape without a sidecar: auto reports absent and draws nothing
        await page.route(`**${surroundUrl}`, route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'no surround' }));
        const absent = await page.evaluate(url => window.__landscapeTestHooks.setSurround(url), surroundUrl);
        expect(absent.status).toBe('absent');
        await page.unroute(`**${surroundUrl}`);
        const restored = await page.evaluate(url => window.__landscapeTestHooks.setSurround(url), surroundUrl);
        expect(restored.status).toBe('active');
        await settled(page);
        evidence.stale = { status: stale.status, reason: stale.reason };
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await snapshot(page);
        expect(disposed.budget.cpuBytes).toBe(0);
        expect(disposed.budget.gpuBytes).toBe(0);
        expect(surroundEntries(disposed)).toHaveLength(0);
        expect(errors).toEqual([]);
        evidence.disposed = { cpuBytes: disposed.budget.cpuBytes, gpuBytes: disposed.budget.gpuBytes, peakCpuBytes: disposed.budget.peakCpuBytes, peakGpuBytes: disposed.budget.peakGpuBytes };
    } finally {
        await writeFile(path.join(artifacts, 'surround-suite.json'), JSON.stringify({ landscape: { id: landscape.id, revision: landscape.revision }, surroundUrl, evidence, errors }, null, 2));
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
});
