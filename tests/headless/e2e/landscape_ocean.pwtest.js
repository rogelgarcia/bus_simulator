// Verifies the AI 597 animated ocean in the viewer on coastal terrain v3. D1: the spectral sea loads beside the surround, draws instead of the flat
// reference while the optical water body stays, its cascades carry the preset's wave heights, its clock is deterministic (identical captures at a
// fixed time, different after a step), it never enters picking, the flat inspection surface restores the reference, hiding the water hides it, and
// disposal returns every ocean byte. The suite serves the landscape itself on the verification port (like the surround suite).
// LANDSCAPE_TEST_OCEAN_LANDSCAPE names the landscape directory (default coastal-city-v3).
import { test, expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeServer } from '../../../tools/landscape_server/Server.mjs';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';
import { LANDSCAPE_OCEAN, LANDSCAPE_OCEAN_QUALITIES, landscapeOceanResources, landscapeOceanShoreInputs } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';

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
        expect(ocean.share.entries).toBe(5);
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

// AI 597 D2: the shore wave of the sea state over the extent's bathymetry and coast (its statistics come from the same pure modules the offline
// tool tabulates: tools/landscape_review/shore_statistics.mjs), the per-sea-state breaking, the rock shore, the shore debug view and determinism
// at the waterline. The evidence goes beside the D1 receipt under d2/suite.
test('Landscape AI 597 D2: the shore wave refracts toward the beach, breaks on the bars and the foreshore with the sea state, surges on rock and repeats at the fixed time', async ({ browser }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    test.skip(!(await exists(path.join(landscapeDirectory, 'manifest.json'))), `${landscapeDirectory} is not installed`);
    const shoreArtifacts = path.resolve(root, 'tests/artifacts/screens/landscape/ai597/d2/suite');
    await mkdir(shoreArtifacts, { recursive: true });
    const landscape = JSON.parse(await readFile(path.join(landscapeDirectory, 'manifest.json'), 'utf8'));
    const server = await serve(landscapeDirectory, baseURL);
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE/i.test(message.text())) errors.push(message.text()); });
    const shoreOf = state => state.ocean.shore;
    try {
        await page.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?landscapeOceanTime=${FIXED_TIME}`));
        const boot = await settled(page);
        expect(boot.revision).toBe(landscape.revision);
        const ocean = boot.ocean;
        expect(ocean.status, `ocean: ${ocean.reason}`).toBe('active');
        expect(ocean.seaState.id).toBe('moderate');
        // the extent field carries the shore channels (RGBA16F) and the travel time (RG32F) with its float depth and zone rasters on the CPU
        const texels = LANDSCAPE_OCEAN.fields.texels;
        expect(ocean.fields.extent).toMatchObject({ gpuBytes: texels * texels * LANDSCAPE_OCEAN.fields.extentGpuBytesPerTexel, cpuBytes: texels * texels * LANDSCAPE_OCEAN.fields.extentCpuBytesPerTexel, linearFiltering: true });
        expect(ocean.share.entries).toBe(boot.surround?.status === 'active' ? 5 : 4);
        expect(ocean.share.cpuBytes).toBeLessThanOrEqual(LANDSCAPE_OCEAN.budgets.cpuBytes);
        // the coast classes come from the geology sidecar: every level-2 page, the rock platform and bluff toe, the exposure of the bar, surf and swash
        const shore = shoreOf(boot);
        expect(shore.status).toBe('active');
        expect(shore.settled).toBe(true);
        expect(shore.coast).toMatchObject({ status: 'active', stale: false, pages: ocean.fields.extent.chunks });
        expect(shore.coast.rockTexels).toBeGreaterThan(0);
        expect(shore.coast.exposureTexels).toBeGreaterThan(0);
        expect(shore.coast.zones.platform + shore.coast.zones['bluff-toe']).toBe(shore.coast.rockTexels);
        // the train: the sea state's swell period, its significant height, McCowan's breaking index, the surface active at the clock's time
        const inputs = landscapeOceanShoreInputs('moderate');
        expect(shore).toMatchObject({ periodSeconds: inputs.periodSeconds, headingDegrees: inputs.headingDegrees, gamma: inputs.gamma });
        expect(shore.heightMeters).toBeCloseTo(ocean.seaState.significantWaveHeightMeters, 9);
        expect(ocean.surface.shore).toMatchObject({ active: true, omega: inputs.omega, groupPeriodSeconds: inputs.groupPeriodSeconds, time: FIXED_TIME });
        expect(ocean.surface.cascadeFades[0]).toEqual(ocean.surface.shore.handover);
        expect(shore.filledLandTexels).toBeGreaterThan(0);
        // the gate: crests run roughly parallel to the beach (the propagation direction against the shore normal over the breaking texels)
        const gate = state => {
            const { statistics, zoneBreaking, heightMeters, gamma } = shoreOf(state);
            expect(statistics.visited).toBeGreaterThan(statistics.water * .9);
            expect(statistics.breakingTexels).toBeGreaterThan(0);
            expect(statistics.crestAngle.meanDegrees, `crest angle ${JSON.stringify(statistics.crestAngle)}`).toBeLessThan(15);
            expect(statistics.crestAngle.p90Degrees).toBeLessThan(30);
            // breaking belongs to the sand: never on the rock platform or the bluff toe, never in the open sea, and more of the foreshore (surf and
            // swash; the swash zone counts its dry texels too) breaks than of the bar and the open sea
            expect(zoneBreaking.platform.breaking + zoneBreaking['bluff-toe'].breaking).toBe(0);
            // a rough sea breaks on the shoals the offshore zone still holds (depths from 2 m), never as much as on the bar
            expect(zoneBreaking.offshore.share).toBeLessThan(.1);
            expect(zoneBreaking.offshore.share).toBeLessThanOrEqual(Math.max(zoneBreaking.bar.share, .01));
            expect(zoneBreaking.swash.breaking).toBeGreaterThan(0);
            expect(zoneBreaking.surf.share + zoneBreaking.swash.share).toBeGreaterThan(zoneBreaking.bar.share + zoneBreaking.offshore.share);
            // the outer edge of the surf zone lies near the depth-limited break of the shoaled height: p90 of the breaking depths within 0.6-1.6 H / gamma
            const outer = heightMeters / gamma;
            expect(statistics.breakingDepth.p90, `breaking depth p90 ${statistics.breakingDepth.p90} vs H / gamma ${outer}`).toBeGreaterThan(.6 * outer);
            expect(statistics.breakingDepth.p90).toBeLessThan(1.6 * outer);
            return { heightMeters, statistics, zoneBreaking: Object.fromEntries(['offshore', 'reef', 'bar', 'surf', 'swash', 'platform', 'bluff-toe'].map(zone => [zone, zoneBreaking[zone]])) };
        };
        evidence.moderate = gate(boot);
        // determinism at the waterline (NW-12 looks north along the break): the same fixed time repeats the surf, a half-second step moves it
        const canvasSize = boot.canvas, surfRegion = { left: Math.floor(canvasSize.width / 2), top: Math.floor(canvasSize.height * .38), width: canvasSize.width - Math.floor(canvasSize.width / 2), height: Math.floor(canvasSize.height * .22) };
        await page.evaluate(camera => window.__landscapeTestHooks.setCamera(camera), POSES['NW-12']);
        await settled(page);
        await page.waitForTimeout(1500);
        await readFrame(page, 'surf-first', surfRegion);
        await frames(page, 3);
        await readFrame(page, 'surf-second', surfRegion);
        const same = await compareFrames(page, 'surf-first', 'surf-second');
        await page.evaluate(() => window.__landscapeTestHooks.setOcean({ clock: { step: .5 } }));
        await frames(page, 2);
        await readFrame(page, 'surf-stepped', surfRegion);
        const stepped = await compareFrames(page, 'surf-first', 'surf-stepped');
        await page.evaluate(time => window.__landscapeTestHooks.setOcean({ clock: { time } }), FIXED_TIME);
        await frames(page, 2);
        await readFrame(page, 'surf-restored', surfRegion);
        const restored = await compareFrames(page, 'surf-first', 'surf-restored');
        evidence.determinism = { same, stepped, restored, region: surfRegion };
        expect(same.mean, `same time: ${JSON.stringify(same)}`).toBeLessThan(1);
        expect(restored.mean, `restored: ${JSON.stringify(restored)}`).toBeLessThan(1);
        expect(stepped.mean, `stepped: ${JSON.stringify(stepped)}`).toBeGreaterThan(5 * Math.max(same.mean, restored.mean, .1));
        await page.screenshot({ path: path.join(shoreArtifacts, 'NW-12-shore-30s.png') });
        // the shore verification view draws (weight, crest sharpening, bore strength), the shaded view returns
        await page.evaluate(() => window.__landscapeTestHooks.setOceanDebug(8));
        await frames(page, 2);
        const debugFrame = await readFrame(page, 'surf-debug', surfRegion);
        expect(debugFrame.nonzero).toBeGreaterThan(0);
        await page.screenshot({ path: path.join(shoreArtifacts, 'NW-12-shore-debug8.png') });
        await page.evaluate(() => window.__landscapeTestHooks.setOceanDebug(0));
        await frames(page, 2);
        await readFrame(page, 'surf-shaded', surfRegion);
        expect((await compareFrames(page, 'surf-first', 'surf-shaded')).mean).toBeLessThan(1);
        // a sea-state switch marches the shore again: rough breaks deeper, on the reef and the bars; calm breaks only on the foreshore (never deeper than moderate)
        const rough = await page.evaluate(() => window.__landscapeTestHooks.setOcean({ seaState: 'rough' }));
        expect(rough.seaState.id).toBe('rough');
        expect(rough.settled).toBe(true);
        const roughState = await settled(page);
        evidence.rough = gate(roughState);
        expect(shoreOf(roughState).periodSeconds).toBe(landscapeOceanShoreInputs('rough').periodSeconds);
        expect(roughState.ocean.surface.shore.omega).toBeCloseTo(landscapeOceanShoreInputs('rough').omega, 9);
        expect(evidence.rough.heightMeters).toBeGreaterThan(evidence.moderate.heightMeters);
        expect(evidence.rough.statistics.breakingDepth.p90).toBeGreaterThan(evidence.moderate.statistics.breakingDepth.p90);
        expect(evidence.rough.zoneBreaking.bar.share).toBeGreaterThan(evidence.moderate.zoneBreaking.bar.share);
        expect(evidence.rough.zoneBreaking.reef.share).toBeGreaterThan(evidence.moderate.zoneBreaking.reef.share);
        await page.screenshot({ path: path.join(shoreArtifacts, 'NW-12-rough-30s.png') });
        await page.evaluate(() => window.__landscapeTestHooks.setOcean({ seaState: 'calm' }));
        const calmState = await settled(page);
        evidence.calm = gate(calmState);
        expect(evidence.calm.heightMeters).toBeLessThan(evidence.moderate.heightMeters);
        expect(evidence.calm.statistics.breakingDepth.p90).toBeLessThan(evidence.moderate.statistics.breakingDepth.p90);
        expect(evidence.calm.zoneBreaking.bar.share).toBeLessThanOrEqual(evidence.moderate.zoneBreaking.bar.share);
        expect(evidence.calm.zoneBreaking.reef.share).toBeLessThanOrEqual(evidence.moderate.zoneBreaking.reef.share);
        expect(calmState.ocean.clock.time).toBe(FIXED_TIME);
        await page.screenshot({ path: path.join(shoreArtifacts, 'NW-12-calm-30s.png') });
        // back to moderate: the same statistics as the boot (the march is deterministic)
        await page.evaluate(() => window.__landscapeTestHooks.setOcean({ seaState: 'moderate' }));
        const again = await settled(page);
        expect(shoreOf(again).statistics).toEqual(shore.statistics);
        expect(shoreOf(again).zoneBreaking).toEqual(shore.zoneBreaking);
        // disposal returns every ocean byte
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await snapshot(page);
        expect(oceanEntries(disposed)).toEqual([]);
        expect(errors).toEqual([]);
    } finally {
        await writeFile(path.join(shoreArtifacts, 'shore-suite.json'), `${JSON.stringify({ landscape: { id: landscape.id, revision: landscape.revision }, fixedTime: FIXED_TIME, errors, ...evidence }, null, 2)}\n`);
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
});

// AI 597 D3: the foam lifecycle state over the extent (pre-rolled to the fixed time), its per-zone statistics across the sea states, its
// determinism and the foam verification view. Evidence beside the D2 receipt under d3/suite.
test('Landscape AI 597 D3: foam gathers on the breaking crests, the bars, the reef edges and the shoreline with the sea state, repeats at the fixed time and draws', async ({ browser }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'Landscape verification uses port 8002').toBe('8002');
    test.skip(!(await exists(path.join(landscapeDirectory, 'manifest.json'))), `${landscapeDirectory} is not installed`);
    const foamArtifacts = path.resolve(root, 'tests/artifacts/screens/landscape/ai597/d3/suite');
    await mkdir(foamArtifacts, { recursive: true });
    const landscape = JSON.parse(await readFile(path.join(landscapeDirectory, 'manifest.json'), 'utf8'));
    const server = await serve(landscapeDirectory, baseURL);
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE/i.test(message.text())) errors.push(message.text()); });
    const foamReadback = () => page.evaluate(() => { const r = window.__landscapeTestHooks.oceanFoamReadback(); return r.statistics; });
    const foamSignature = () => page.evaluate(() => { const r = window.__landscapeTestHooks.oceanFoamReadback(); return { mean: r.statistics.mean, max: r.statistics.max, covered: r.statistics.coveredFraction, depositMean: r.statistics.depositMean, surf: r.statistics.zones.surf?.mean ?? null }; });
    try {
        await page.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?landscapeOceanTime=${FIXED_TIME}`));
        const boot = await settled(page);
        const ocean = boot.ocean;
        expect(ocean.status, `ocean: ${ocean.reason}`).toBe('active');
        // the state raster at the extent resolution, pre-rolled from zero to the fixed time in fixed steps, reserved in the share
        const { foam } = LANDSCAPE_OCEAN;
        expect(ocean.foam).toMatchObject({ recipe: 'landscape-ocean-foam-v1', texels: foam.texels, stepSeconds: foam.stepSeconds, preRollSeconds: foam.preRollSeconds, lastTime: FIXED_TIME, resets: 1 });
        expect(ocean.foam.lastPreRollSteps).toBe(Math.round(foam.preRollSeconds / foam.stepSeconds));
        expect(ocean.foam.steps).toBeGreaterThanOrEqual(ocean.foam.lastPreRollSteps);
        expect(ocean.foam.gpuBytes).toBe(foam.texels * foam.texels * foam.bytesPerTexel);
        expect(ocean.surface.foam).toMatchObject({ active: true, coverageThreshold: foam.coverage.threshold, albedo: foam.albedo });
        expect(ocean.share.entries).toBe(boot.surround?.status === 'active' ? 5 : 4);
        // moderate: foam on the surf, the bar and the reef edges, the shoreline, none on the open sea; the sand keeps a deposit along the swash
        const moderate = await foamReadback();
        evidence.moderate = moderate;
        expect(moderate.zones.surf.coveredFraction, `surf ${JSON.stringify(moderate.zones.surf)}`).toBeGreaterThan(.3);
        expect(moderate.zones.bar.coveredFraction).toBeGreaterThan(.05);
        expect(moderate.zones.swash.coveredFraction).toBeGreaterThan(.1);
        expect(moderate.zones.offshore.coveredFraction).toBeLessThan(.01);
        expect(moderate.zones.surf.coveredFraction).toBeGreaterThan(moderate.zones.reef.coveredFraction);
        expect(moderate.zones.swash.depositMean).toBeGreaterThan(0);
        expect(moderate.max).toBeLessThanOrEqual(1);
        // determinism: the same fixed time restores the same state (a half-second step changes it, the time restored repeats it)
        const first = await foamSignature();
        await page.evaluate(() => window.__landscapeTestHooks.setOcean({ clock: { step: .5 } }));
        await frames(page, 2);
        const stepped = await foamSignature();
        await page.evaluate(time => window.__landscapeTestHooks.setOcean({ clock: { time } }), FIXED_TIME);
        await frames(page, 2);
        const restored = await foamSignature();
        evidence.determinism = { first, stepped, restored, snapshot: (await snapshot(page)).ocean.foam };
        expect(restored).toEqual(first);
        expect(stepped.mean === first.mean && stepped.surf === first.surf).toBe(false);
        expect((await snapshot(page)).ocean.foam.resets).toBeGreaterThanOrEqual(2);
        // the foam verification view draws at the surf and returns to the shading
        await page.evaluate(camera => window.__landscapeTestHooks.setCamera(camera), POSES['NW-12']);
        await settled(page);
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(foamArtifacts, 'NW-12-foam-30s.png') });
        const canvasSize = (await snapshot(page)).canvas, surfRegion = { left: Math.floor(canvasSize.width / 2), top: Math.floor(canvasSize.height * .38), width: canvasSize.width - Math.floor(canvasSize.width / 2), height: Math.floor(canvasSize.height * .22) };
        await readFrame(page, 'foam-shaded', surfRegion);
        await page.evaluate(() => window.__landscapeTestHooks.setOceanDebug(9));
        await frames(page, 2);
        const debugFrame = await readFrame(page, 'foam-debug', surfRegion);
        expect(debugFrame.nonzero).toBeGreaterThan(0);
        await page.screenshot({ path: path.join(foamArtifacts, 'NW-12-foam-debug9.png') });
        await page.evaluate(() => window.__landscapeTestHooks.setOceanDebug(0));
        await frames(page, 2);
        await readFrame(page, 'foam-shaded-again', surfRegion);
        expect((await compareFrames(page, 'foam-shaded', 'foam-shaded-again')).mean).toBeLessThan(1);
        // rough: whitecaps on the open sea and more foam everywhere; calm: next to none beyond the shoreline
        await page.evaluate(() => window.__landscapeTestHooks.setOcean({ seaState: 'rough' }));
        await settled(page);
        const rough = await foamReadback();
        evidence.rough = rough;
        expect(rough.zones.offshore.coveredFraction).toBeGreaterThan(.02);
        expect(rough.zones.offshore.coveredFraction).toBeGreaterThan(moderate.zones.offshore.coveredFraction);
        expect(rough.zones.reef.coveredFraction).toBeGreaterThan(moderate.zones.reef.coveredFraction);
        expect(rough.coveredFraction).toBeGreaterThan(moderate.coveredFraction);
        await page.screenshot({ path: path.join(foamArtifacts, 'NW-12-foam-rough.png') });
        await page.evaluate(() => window.__landscapeTestHooks.setOcean({ seaState: 'calm' }));
        await settled(page);
        const calm = await foamReadback();
        evidence.calm = calm;
        expect(calm.zones.offshore.coveredFraction).toBeLessThan(.001);
        expect(calm.zones.surf.coveredFraction).toBeLessThan(.05);
        expect(calm.zones.swash.coveredFraction).toBeLessThan(moderate.zones.swash.coveredFraction);
        expect(calm.coveredFraction).toBeLessThan(moderate.coveredFraction);
        await page.screenshot({ path: path.join(foamArtifacts, 'NW-12-foam-calm.png') });
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await snapshot(page);
        expect(oceanEntries(disposed)).toEqual([]);
        expect(errors).toEqual([]);
    } finally {
        await writeFile(path.join(foamArtifacts, 'foam-suite.json'), `${JSON.stringify({ landscape: { id: landscape.id, revision: landscape.revision }, fixedTime: FIXED_TIME, errors, ...evidence }, null, 2)}\n`);
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve(undefined)));
    }
});
