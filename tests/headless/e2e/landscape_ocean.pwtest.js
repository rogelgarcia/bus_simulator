// Verifies the AI 597 D1 animated ocean in the viewer on coastal terrain v3: the spectral sea loads beside the surround, draws instead of the flat
// reference while the optical water body stays, its cascades carry the preset's wave heights, its clock is deterministic (identical captures at a
// fixed time, different after a step), it never enters picking, the flat inspection surface restores the reference, hiding the water hides it, and
// disposal returns every ocean byte. The suite serves the landscape itself on the verification port (like the surround suite).
// LANDSCAPE_TEST_OCEAN_LANDSCAPE names the landscape directory (default coastal-city-v3).
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';
import { LANDSCAPE_OCEAN, LANDSCAPE_OCEAN_QUALITIES, landscapeOceanResources } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';

const root = path.resolve('.');
const MiB = 1024 * 1024;
const landscapeDirectory = path.resolve(root, process.env.LANDSCAPE_TEST_OCEAN_LANDSCAPE ?? 'assets/public/landscape/coastal-city-v3');
const artifacts = path.resolve(root, 'tests/artifacts/screens/landscape/ai597/d1/suite');
const viewport = { width: 1920, height: 1080 };
const FIXED_TIME = 30;
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

const settleConditions = () => page => page.evaluate(() => {
    const state = window.__landscapeTestHooks?.snapshot();
    return { ready: !!state?.ready, lastError: state?.lastError ?? null, streamingSettled: !!state?.streaming?.settled, pending: state?.streaming?.pending ?? null, degradation: state?.streaming?.degradationReason ?? null,
        appearanceSettled: !!state?.appearance?.settled, appearancePending: state?.appearance?.pending ?? null, planningSettled: !!state?.planning?.settled, surround: state?.surround ? { status: state.surround.status, settled: state.surround.settled, pending: state.surround.pending ?? null } : null,
        ocean: state?.ocean ? { status: state.ocean.status, settled: state.ocean.settled, reason: state.ocean.reason ?? null } : null, frameIndex: state?.frameIndex ?? null, hidden: document.hidden };
});

async function settled(page, timeoutMs = 180000) {
    try {
        await page.waitForFunction(() => {
            const state = window.__landscapeTestHooks?.snapshot();
            if (state?.lastError) throw new Error(state.lastError);
            const surround = !state?.surround || (state.surround.settled && (state.surround.pending ?? 0) === 0);
            const ocean = !state?.ocean || state.ocean.settled;
            return state?.ready && state.streaming.settled && state.streaming.pending === 0 && state.appearance?.settled && state.planning.settled && surround && ocean;
        }, null, { timeout: timeoutMs });
    } catch (error) {
        // name the condition that never cleared, with the frame counter (a paused page never advances)
        const conditions = await settleConditions()(page).catch(() => null);
        throw new Error(`the viewer did not settle within ${timeoutMs} ms: ${JSON.stringify(conditions)}; ${error.message}`);
    }
    await page.waitForTimeout(300);
    return snapshot(page);
}

async function frames(page, count) {
    const start = await page.evaluate(() => window.__landscapeTestHooks.snapshot().frameIndex);
    await page.waitForFunction(({ start, count }) => window.__landscapeTestHooks.snapshot().frameIndex >= start + count, { start, count }, { timeout: 60000 });
}

const direction = (heading, pitch) => { const h = heading * Math.PI / 180, p = pitch * Math.PI / 180; return [Math.sin(h) * Math.cos(p), Math.sin(p), Math.cos(h) * Math.cos(p)]; };
const pose = (x, y, z, heading, pitch) => { const d = direction(heading, pitch); return { position: [x, y, z], target: [x + d[0] * 100, y + d[1] * 100, z + d[2] * 100], projection: 'perspective', fov: 55, zoom: 1 }; };
// the natural-world poses the ocean gate uses: NW-12 shore break at water level, NW-10 low oblique over the coast, NW-11 aerial from the sea, NW-09 from the water
const POSES = { 'NW-12': pose(1152, 1, 1800, 0, -6), 'NW-10': pose(900, 25, 1200, 45, -10), 'NW-11': pose(-400, 800, 2000, 90, -30), 'NW-09': pose(1000, 1.5, 1500, 90, 0) };
const oceanEntries = state => state.budget.entries.filter(entry => entry.kind === LANDSCAPE_OCEAN.kind);

/** Reads a region of the next rendered frame into the page's frame store under a key (readFrame runs inside the frame's own task). */
async function readFrame(page, key, region) {
    return page.evaluate(async ({ key, region }) => {
        const frame = await window.__landscapeTestHooks.readFrame(region);
        (window.__oceanFrames ??= {})[key] = frame;
        let nonzero = 0;
        for (let i = 0; i < frame.data.length; i += 4) if (frame.data[i] | frame.data[i + 1] | frame.data[i + 2]) nonzero++;
        return { frameIndex: frame.frameIndex, nonzero, pixels: frame.width * frame.height };
    }, { key, region });
}

/** Mean and maximum absolute luminance difference between two stored frames. */
async function compareFrames(page, a, b) {
    return page.evaluate(({ a, b }) => {
        const x = window.__oceanFrames[a].data, y = window.__oceanFrames[b].data;
        let sum = 0, max = 0;
        for (let i = 0; i < x.length; i += 4) {
            const d = Math.abs((.2126 * x[i] + .7152 * x[i + 1] + .0722 * x[i + 2]) - (.2126 * y[i] + .7152 * y[i + 1] + .0722 * y[i + 2]));
            sum += d; if (d > max) max = d;
        }
        return { mean: sum / (x.length / 4), max };
    }, { a, b });
}

test('Landscape AI 597 D1: the animated ocean streams beside v3, carries the preset wave heights, repeats exactly at a fixed time, stays out of picking and releases to zero', async ({ browser }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);
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
        await page.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?landscapeOceanTime=${FIXED_TIME}`));
        const boot = await settled(page);
        expect(boot.revision).toBe(landscape.revision);
        const ocean = boot.ocean;
        expect(ocean.status, `ocean: ${ocean.reason}`).toBe('active');
        expect(ocean.recipe).toBe(LANDSCAPE_OCEAN.id);
        expect(ocean.mode).toBe('animated');
        expect(ocean.seaState.id).toBe(LANDSCAPE_OCEAN.defaultSeaState);
        expect(ocean.quality.id).toBe(LANDSCAPE_OCEAN.defaultQuality);
        expect(ocean.clock).toMatchObject({ mode: 'fixed', time: FIXED_TIME });
        expect(ocean.landscape).toEqual({ id: landscape.id, revision: landscape.revision });
        // the bathymetry fields: the extent at the level-2 spacing, the surround's at its level-1 spacing while a surround is active
        expect(ocean.fields.extent).toMatchObject({ texels: LANDSCAPE_OCEAN.fields.texels, level: LANDSCAPE_OCEAN.fields.extentLevel, chunks: 16 });
        expect(ocean.fields.extent.texelMeters).toBeCloseTo((landscape.bounds.maxX - landscape.bounds.minX) / LANDSCAPE_OCEAN.fields.texels, 6);
        expect(ocean.fields.extent.statistics.seaFraction).toBeGreaterThan(.2);
        expect(ocean.fields.extent.statistics.maxDepth).toBeGreaterThan(20);
        if (boot.surround?.status === 'active') {
            expect(ocean.fields.surround.status).toBe('active');
            expect(ocean.fields.surround.texels).toBe(LANDSCAPE_OCEAN.fields.surroundTexels);
            expect(ocean.fields.surround.id).toBe(boot.surround.id);
            expect(ocean.fields.surround.statistics.seaFraction).toBeGreaterThan(.3);
        }
        // the simulation: one time pass, 2 log2 N - 1 butterfly stages over the atlas, the last stage and the derivatives per cascade
        const quality = LANDSCAPE_OCEAN_QUALITIES[ocean.quality.id], stages = Math.log2(quality.texels), cascades = quality.cascadeLengths.length;
        expect(ocean.simulation.stages).toBe(stages);
        expect(ocean.simulation.cascades.length).toBe(cascades);
        expect(ocean.simulation.drawsPerFrame).toBe(2 * stages + 2 * cascades);
        expect(ocean.simulation.initialized).toBe(true);
        expect(ocean.simulation.gpu.supported).toBe(true);
        expect(ocean.simulation.lastTime).toBe(FIXED_TIME);
        // the surface: the clipmap reaches the far plane, its program linked, it is drawn and the flat reference is not
        expect(ocean.surface.material).toBe('landscape-ocean-surface-v1');
        expect(ocean.surface.farMeters).toBeGreaterThanOrEqual(LANDSCAPE_OCEAN.farMeters);
        expect(ocean.surface.programCompile).toMatchObject({ pending: false, timedOut: false });
        expect(ocean.surface.ready).toBe(true);
        expect(ocean.surface.drawCalls).toBe(ocean.surface.rings);
        expect(ocean.drawnLastFrame).toBe(true);
        expect(boot.water).toMatchObject({ visible: true, surfaceDrawn: false, drawnLastFrame: false, opticalBody: true, seaLevel: 0 });
        expect(boot.lighting.water).toMatchObject({ opticalLevel: 0, animatedSurface: true, terrainGlint: false });
        expect(boot.lighting.uniforms.ocean).toEqual([1, 0, 0, 0]);
        // residency: the share is one standing reservation of the ocean kind in the shared ledger; the ocean's own entries live inside it and match the model's estimate
        const entries = oceanEntries(boot);
        expect(entries.length).toBe(1);
        expect([entries[0].cpuBytes, entries[0].gpuBytes]).toEqual([LANDSCAPE_OCEAN.budgets.cpuBytes, LANDSCAPE_OCEAN.budgets.gpuBytes]);
        expect(ocean.share.entries).toBe(4);
        const estimate = landscapeOceanResources(ocean.quality.id);
        expect(ocean.share.kind).toBe(LANDSCAPE_OCEAN.kind);
        expect(ocean.share.gpuBytes).toBeGreaterThan(0);
        expect(ocean.share.gpuBytes).toBeLessThanOrEqual(LANDSCAPE_OCEAN.budgets.gpuBytes);
        expect(ocean.share.cpuBytes).toBeLessThanOrEqual(LANDSCAPE_OCEAN.budgets.cpuBytes);
        expect(Math.abs(ocean.share.gpuBytes - estimate.gpuBytes)).toBeLessThan(8 * MiB);
        expect(ocean.share.denied).toBe(0);
        evidence.boot = { ocean, water: boot.water, surround: boot.surround ? { status: boot.surround.status, revision: boot.surround.revision } : null, budget: { cpuBytes: boot.budget.cpuBytes, gpuBytes: boot.budget.gpuBytes, limits: boot.budget.limits, oceanEntries: entries } };
        // the GPU cascades carry the model's wave heights: 4 x the rms of the height channel per cascade within 5%, finite everywhere, Jacobian around 1
        const readbacks = [];
        for (let index = 0; index < cascades; index++) {
            const readback = await page.evaluate(index => window.__landscapeTestHooks.oceanReadback(index), index);
            const height = readback.statistics.displacement[1], jacobian = readback.statistics.derivatives[2];
            const expected = ocean.seaState.perCascadeWaveHeightMeters[index];
            expect(readback.statistics.displacement.every(channel => channel.nonfinite === 0) && readback.statistics.derivatives.every(channel => channel.nonfinite === 0)).toBe(true);
            expect(Math.abs(4 * height.rms - expected), `cascade ${index} Hs ${4 * height.rms} vs ${expected}`).toBeLessThan(.05 * expected + .01);
            expect(Math.abs(jacobian.mean - 1)).toBeLessThan(.02);
            readbacks.push({ index, significantWaveHeightMeters: 4 * height.rms, expected, heightMax: height.max, jacobian: { min: jacobian.min, mean: jacobian.mean, max: jacobian.max } });
        }
        evidence.readbacks = readbacks;
        // determinism: the same pose at the same fixed time renders the same sea (the streams may still refine terrain pixels, so the sea region is
        // compared by mean luminance difference), a half-second step changes it, the time restored repeats it; NW-09 looks east over open water
        const canvasSize = (await snapshot(page)).canvas, seaRegion = { left: 0, top: Math.floor(canvasSize.height / 2), width: canvasSize.width, height: canvasSize.height - Math.floor(canvasSize.height / 2) };
        await page.evaluate(camera => window.__landscapeTestHooks.setCamera(camera), POSES['NW-09']);
        await settled(page);
        await page.waitForTimeout(2000);
        const first = await readFrame(page, 'first', seaRegion);
        expect(first.nonzero).toBeGreaterThan(first.pixels * .9);
        await frames(page, 3);
        await readFrame(page, 'second', seaRegion);
        const same = await compareFrames(page, 'first', 'second');
        await page.evaluate(() => window.__landscapeTestHooks.setOcean({ clock: { step: .5 } }));
        await frames(page, 2);
        await readFrame(page, 'stepped', seaRegion);
        const stepped = await compareFrames(page, 'first', 'stepped');
        await page.evaluate(time => window.__landscapeTestHooks.setOcean({ clock: { time } }), FIXED_TIME);
        await frames(page, 2);
        await readFrame(page, 'restored', seaRegion);
        const restored = await compareFrames(page, 'first', 'restored');
        evidence.determinism = { same, stepped, restored, region: seaRegion };
        // the terrain under the sea keeps refining between captures seconds apart (0.05-0.3 bytes under a loaded GPU), so the sea's own
        // determinism is judged against the step: a half-second step moves the sea by more than ten times that drift, the restored time undoes it
        expect(same.mean, `same time: ${JSON.stringify(same)}`).toBeLessThan(1);
        expect(restored.mean, `restored: ${JSON.stringify(restored)}`).toBeLessThan(1);
        expect(stepped.mean, `stepped: ${JSON.stringify(stepped)} against ${JSON.stringify({ same, restored })}`).toBeGreaterThan(10 * Math.max(same.mean, restored.mean, .1));
        await page.screenshot({ path: path.join(artifacts, 'NW-09-fixed-30s.png') });
        // picking goes through the sea to the seabed (NW-09 floats 100 m off the waterline over water): the ocean is never part of the pick set
        const picked = await page.evaluate(() => window.__landscapeTestHooks.pickPoint(innerWidth / 2, innerHeight * .85));
        expect(picked).not.toBeNull();
        expect(picked.y).toBeLessThan(0);
        evidence.pick = picked;
        await page.evaluate(camera => window.__landscapeTestHooks.setCamera(camera), POSES['NW-12']);
        await settled(page);
        await frames(page, 3);
        await page.screenshot({ path: path.join(artifacts, 'NW-12-fixed-30s.png') });
        for (const id of ['NW-10', 'NW-11']) {
            await page.evaluate(camera => window.__landscapeTestHooks.setCamera(camera), POSES[id]);
            await settled(page);
            await frames(page, 3);
            await page.screenshot({ path: path.join(artifacts, `${id}-fixed-30s.png`) });
        }
        const timed = await snapshot(page);
        evidence.simulation = timed.ocean.simulation;
        expect(timed.ocean.simulation.gpu.samples).toBeGreaterThan(0);
        // hiding the water hides the ocean surface too (and the optical body), showing it restores both
        await page.evaluate(() => window.__landscapeTestHooks.setWater(false));
        await frames(page, 2);
        const hidden = await snapshot(page);
        expect(hidden.ocean.surface.visible).toBe(false);
        expect(hidden.ocean.drawnLastFrame).toBe(false);
        expect(hidden.lighting.water.opticalLevel).toBeNull();
        await page.evaluate(() => window.__landscapeTestHooks.setWater(true));
        await frames(page, 2);
        expect((await snapshot(page)).ocean.drawnLastFrame).toBe(true);
        // the flat inspection surface: the ocean releases, the reference plane draws again and the terrain keeps its own glint
        const flat = await page.evaluate(() => window.__landscapeTestHooks.setOcean({ surface: 'flat' }));
        expect(flat.status, `ocean after the flat switch: ${flat.reason}`).toBe('off');
        await frames(page, 2);
        const flatState = await snapshot(page);
        expect(flatState.ocean.status).toBe('off');
        expect(flatState.water).toMatchObject({ surfaceDrawn: true, drawnLastFrame: true });
        expect(flatState.lighting.uniforms.ocean).toEqual([0, 0, 0, 0]);
        // the share stays held in flat mode (the view's lifetime), the ocean's own entries inside it are gone
        expect(oceanEntries(flatState)).toHaveLength(1);
        expect(flatState.ocean.share.entries).toBe(0);
        await page.screenshot({ path: path.join(artifacts, 'NW-11-flat.png') });
        const again = await page.evaluate(() => window.__landscapeTestHooks.setOcean({ surface: 'animated' }));
        expect(again.status, `ocean after the switch back: ${again.reason}`).toBe('active');
        await frames(page, 2);
        const back = await snapshot(page);
        expect(back.ocean.drawnLastFrame).toBe(true);
        expect(back.water.surfaceDrawn).toBe(false);
        // a sea-state switch re-initializes the spectrum and keeps the clock
        await page.evaluate(() => window.__landscapeTestHooks.setOcean({ seaState: 'calm' }));
        await frames(page, 2);
        const calm = await snapshot(page);
        expect(calm.ocean.seaState.id).toBe('calm');
        expect(calm.ocean.simulation.seaState).toBe('calm');
        expect(calm.ocean.clock.time).toBe(FIXED_TIME);
        const calmReadback = await page.evaluate(() => window.__landscapeTestHooks.oceanReadback(0));
        expect(4 * calmReadback.statistics.displacement[1].rms).toBeLessThan(readbacks[0].significantWaveHeightMeters);
        // disposal returns every ocean byte
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await snapshot(page);
        expect(oceanEntries(disposed)).toEqual([]);
        expect(disposed.budget.entries.length).toBe(0);
        expect(errors).toEqual([]);
    } finally {
        await writeFile(path.join(artifacts, 'ocean-suite.json'), `${JSON.stringify({ landscape: { id: landscape.id, revision: landscape.revision }, fixedTime: FIXED_TIME, errors, ...evidence }, null, 2)}\n`);
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
});
