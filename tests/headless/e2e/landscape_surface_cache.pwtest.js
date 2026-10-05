// Verifies the AI577 D6 runtime surface cache in the viewer (landscape-surface-cache-v1, default off): the root page precedes the first detailed
// cached frame, generation keeps to its GPU budget, atlases and indirection stay inside the ledger under their ceiling at the cache's shipped profile,
// the near pass draws the near field, page borders are seamless in a top-down probe, switching it on and off links the program variants and releases
// every cache allocation, a lost and restored WebGL context rebuilds the cache, a reload of the same landscape rebinds it, and profiles without room
// above the streams' reserve keep it off.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LANDSCAPE_SURFACE_CACHE, LANDSCAPE_SURFACE_CACHE_BUDGETS, landscapeSurfaceCacheSlotLayout, landscapeSurfaceCacheScratchLayout, landscapeSurfaceCacheIndirectionBytes } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_SURFACE_CACHE_NEAR } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheNearField.js';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';

const artifacts = path.resolve(process.env.LANDSCAPE_SURFACE_CACHE_EVIDENCE ?? 'tests/artifacts/screens/landscape/ai577/d6/cache-final/e2e');
const MiB = 1024 * 1024;
const anchor = { x: 1071.2890625, z: 914.0625, y: 6.4459381103515625 };
const gamePov = { position: [anchor.x - 10, anchor.y + 4.5, anchor.z - 26], target: [anchor.x + 2, anchor.y, anchor.z + 16], projection: 'perspective', fov: 55, orthoHeight: 50, zoom: 1 };
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
const cacheEntries = state => state.budget.entries.filter(entry => entry.kind.startsWith('appearance-surface-cache-'));
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, trace: 'off', video: 'off' });

function observeErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID|\[Landscape/i.test(message.text())) errors.push(message.text()); });
    return errors;
}

async function settle(page, timeout = 150000) {
    let stable = 0, state;
    const deadline = Date.now() + timeout;
    while (stable < 2) {
        await page.waitForTimeout(150);
        state = await snapshot(page);
        if (state.lastError) throw new Error(state.lastError);
        stable = state.ready && state.streaming?.settled && state.appearance?.settled && state.planning?.settled && !state.terrainProgramVariant?.pending ? stable + 1 : 0;
        if (Date.now() > deadline) throw new Error(`Landscape did not settle: ${JSON.stringify({ streaming: state.streaming?.settled, appearance: state.appearance?.settled, cache: state.appearance?.surfaceCache?.status })}`);
    }
    return state;
}

// mean absolute sRGB byte difference of two screenshots, decoded in the page
function meanByteDifference(page, a, b) {
    return page.evaluate(async ([a, b]) => {
        const decode = async base64 => {
            const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob()), canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
            context.drawImage(bitmap, 0, 0);
            return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        };
        const x = await decode(a), y = await decode(b);
        let sum = 0;
        for (let i = 0; i < x.length; i += 4) sum += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
        return sum / (x.length / 4 * 3);
    }, [a.toString('base64'), b.toString('base64')]);
}

function assertLedger(state, cache) {
    const budget = state.budget, layout = landscapeSurfaceCacheSlotLayout({ slots: cache.atlas.slots });
    expect(budget.gpuBytes).toBeLessThanOrEqual(budget.limits.gpuBytes);
    expect(budget.cpuBytes).toBeLessThanOrEqual(budget.limits.cpuBytes);
    expect(budget.peakGpuBytes).toBeLessThanOrEqual(budget.limits.gpuBytes);
    const entries = cacheEntries(state), atlas = entries.find(entry => entry.kind === 'appearance-surface-cache-atlas'), indirection = entries.find(entry => entry.kind === 'appearance-surface-cache-indirection');
    expect(entries).toHaveLength(2);
    expect(atlas.gpuBytes, 'atlases plus the packed generation scratch').toBe(layout.atlasBytes + landscapeSurfaceCacheScratchLayout().bytes);
    expect(indirection.gpuBytes).toBe(landscapeSurfaceCacheIndirectionBytes(cache.geometry));
    expect(indirection.cpuBytes, 'the indirection mirror and the slot table').toBe(indirection.gpuBytes + cache.atlas.slots * 8);
    expect(atlas.gpuBytes + indirection.gpuBytes).toBeLessThanOrEqual(cache.atlas.ceilingBytes);
    // 3/8 of the GPU limit, never the streams' reserve below it
    expect(cache.atlas.ceilingBytes).toBe(Math.max(0, Math.min(Math.floor(budget.limits.gpuBytes * LANDSCAPE_SURFACE_CACHE.gpuCeilingFraction), budget.limits.gpuBytes - LANDSCAPE_SURFACE_CACHE.streamReserveGpuBytes)));
    expect(budget.denied, 'the cache never makes the ledger deny a stream').toBe(0);
    expect(cache.pages.resident).toBeLessThanOrEqual(cache.atlas.slots);
    expect(cache.pages.desired).toBeLessThanOrEqual(cache.atlas.slots - LANDSCAPE_SURFACE_CACHE.reservedSlots);
    expect(cache.pages.residentByMip[cache.geometry.rootMip], 'the root page stays resident').toBe(1);
}

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test('Landscape D6 surface cache: the root page precedes the first detailed cached frame; generation keeps its budget and the cache its ledger share', async ({ page }, testInfo) => {
    test.setTimeout(300000);
    expect(new URL(String(testInfo.project.use.baseURL)).port).not.toBe('8001');
    const errors = observeErrors(page);
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeSurfaceCache=on'));
    await page.waitForFunction(() => !!window.__landscapeTestHooks, null, { timeout: 30000 });
    // every frame from the start: which program draws, whether the cached frame reads the cache, and whether the root page is resident
    await page.evaluate(() => {
        const frames = window.__surfaceCacheFrames = [];
        const record = () => {
            const state = window.__landscapeTestHooks.snapshot(), cache = state.appearance?.surfaceCache;
            if (cache && cache.status !== 'off' && cache.pages) frames.push({ cached: !!state.terrainProgramVariant?.surfaceCache, frameReady: cache.frameReady, root: cache.pages.residentByMip[cache.geometry.rootMip], status: cache.status });
            if (frames.length < 20000 && !state.disposed) requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
    });
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), gamePov);
    const state = await settle(page), cache = state.appearance.surfaceCache;
    const frames = await page.evaluate(() => window.__surfaceCacheFrames);
    expect(state.surfaceCache).toBe('on');
    expect(state.terrainProgramVariant).toMatchObject({ surfaceCache: true, diagnostics: false, pending: false });
    expect(cache).toMatchObject({ recipe: LANDSCAPE_SURFACE_CACHE.id, status: 'active', ready: true, settled: true, frameReady: true });
    // bootstrap: frames drew the vertex-color fallback until the root page was resident and uploaded, never a cache without its root
    const firstReady = frames.findIndex(frame => frame.frameReady);
    expect(firstReady).toBeGreaterThan(0);
    expect(frames.slice(0, firstReady).every(frame => !frame.frameReady)).toBe(true);
    expect(frames.filter(frame => frame.frameReady).every(frame => frame.root === 1), 'every detailed cached frame has the root page').toBe(true);
    expect(cache.generation.rootGeneratedAtMs).not.toBeNull();
    expect(cache.generation.program.ready).toBe(true);
    // with the cache on, the viewer's shipped profile is the cache's own (512/448 MiB): the 11-layer target fits under its ceiling beside the streams
    expect(state.budget.limits).toEqual(LANDSCAPE_SURFACE_CACHE_BUDGETS);
    expect(cache.atlas).toMatchObject({ slots: LANDSCAPE_SURFACE_CACHE.targetSlots, targetSlots: LANDSCAPE_SURFACE_CACHE.targetSlots, layers: 11, slotTexels: 72, fitReason: null, anisotropy: 2 });
    assertLedger(state, cache);
    expect(cache.demand.limited, 'the game view demand fits the atlas').toBe(false);
    // the near pass evaluates the near field per pixel over the tiles in reach
    expect(cache.near).toMatchObject({ recipe: LANDSCAPE_SURFACE_CACHE_NEAR.id, mode: 'on', active: true, program: { ready: true } });
    expect(cache.near.tiles).toBeGreaterThan(0);
    expect(cache.pages.missing).toBe(0);
    expect(cache.pages.staleDesired).toBe(0);
    expect(cache.generation.pagesTotal).toBeGreaterThanOrEqual(cache.pages.resident);
    // generation budget: the timer-driven batches of more than one page keep near the 1 ms budget (a lone page is the indivisible minimum)
    if (cache.generation.gpuSupported && cache.generation.gpuSamples >= 8) {
        const multi = cache.generation.recent.filter(([, pages]) => pages > 1).map(([ms]) => ms);
        if (multi.length >= 5) expect(median(multi), `multi-page batches ${JSON.stringify(cache.generation.recent)}`).toBeLessThanOrEqual(1.5 * cache.generation.budgetMs);
        expect(cache.generation.quota).toBeGreaterThanOrEqual(1);
        expect(cache.generation.quota).toBeLessThanOrEqual(LANDSCAPE_SURFACE_CACHE.generationBatch);
    }
    expect(cache.generation.budgetMs).toBe(1);
    expect(cache.generation.pagesLastFrame).toBeLessThanOrEqual(LANDSCAPE_SURFACE_CACHE.generationBatch);
    // the CPU mirror resolves the camera's near ground to a resident mip-0 or mip-1 page
    const near = await page.evaluate(({ x, z }) => window.__landscapeTestHooks.surfaceCacheLookup(x, z, .02), { x: anchor.x, z: anchor.z });
    expect(near.resident).not.toBeNull();
    expect(near.resident.mip).toBeLessThanOrEqual(2);
    await writeFile(path.join(artifacts, 'bootstrap.json'), JSON.stringify({ firstReady, frames: frames.length, cache, budget: { ...state.budget, entries: cacheEntries(state) } }, null, 2));
    expect(errors).toEqual([]);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

// seam probe: a top-down orthographic view centered on page corners renders the cached and the uncached frame; the luminance step across page
// borders, relative to the steps inside pages, must match the uncached frame's
async function seamStatistics(page, png, { periodPixels }) {
    return page.evaluate(async ({ base64, periodPixels }) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        const luma = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) luma[i] = .2126 * data[4 * i] + .7152 * data[4 * i + 1] + .0722 * data[4 * i + 2];
        const axis = (count, step) => {
            const center = count / 2, steps = new Float64Array(count - 1);
            for (let c = 0; c < count - 1; c++) {
                let sum = 0;
                const lines = step === 'x' ? height : width;
                for (let l = 0; l < lines; l++) sum += step === 'x' ? Math.abs(luma[l * width + c + 1] - luma[l * width + c]) : Math.abs(luma[(c + 1) * width + l] - luma[c * width + l]);
                steps[c] = sum / lines;
            }
            const boundaries = [], interior = [];
            for (let c = 0; c < count - 1; c++) {
                const edge = c + 1, n = Math.round((edge - center) / periodPixels), distance = Math.abs(edge - (center + n * periodPixels));
                if (distance >= 4) interior.push(steps[c]);
            }
            for (let n = -Math.floor(center / periodPixels); n <= Math.floor(center / periodPixels); n++) {
                const edge = center + n * periodPixels;
                let max = 0;
                for (let c = Math.ceil(edge - 2); c <= Math.floor(edge); c++) if (c >= 0 && c < count - 1) max = Math.max(max, steps[c]);
                if (edge > 2 && edge < count - 2) boundaries.push(max);
            }
            const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
            return { boundaries: boundaries.length, ratio: mean(boundaries) / mean(interior), worst: Math.max(...boundaries) / mean(interior) };
        };
        return { x: axis(width, 'x'), z: axis(height, 'z') };
    }, { base64: png.toString('base64'), periodPixels });
}

test('Landscape D6 surface cache: page borders are seamless top-down; switching on and off links the variants and releases every cache allocation', async ({ page }) => {
    test.setTimeout(420000);
    const errors = observeErrors(page);
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeSurfaceCache=off'));
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot()?.ready, null, { timeout: 60000 });
    await page.evaluate(budgets => window.__landscapeTestHooks.setBudgets(budgets), LANDSCAPE_SURFACE_CACHE_BUDGETS);
    await page.evaluate(() => { document.body.classList.add('perf-bar-hidden'); document.querySelectorAll('.landscape-ui, .ui-perf-bar').forEach(element => element.classList.add('hidden')); window.dispatchEvent(new Event('resize')); });
    // mip-1 pages (2 m) at 64 m over 1080 rows: 33.75 pixels per page, the view centered on a page corner
    const orthoHeight = 64, periodPixels = 2 / (orthoHeight / 1080), cx = 1072, cz = 914;
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), { position: [cx, anchor.y + 150, cz - .001], target: [cx, anchor.y, cz], projection: 'orthographic', fov: 55, orthoHeight, zoom: 1 });
    const off = await settle(page);
    expect(off.surfaceCache).toBe('off');
    expect(off.appearance.surfaceCache).toMatchObject({ status: 'off', reason: 'surface-cache-off' });
    expect(cacheEntries(off), 'no cache allocation while off').toEqual([]);
    expect(off.terrainProgramVariant.surfaceCache).toBe(false);
    const offPng = await page.screenshot();
    // on: the runtime generates the root page, then the tiles switch to the cached variant
    const started = Date.now();
    await page.evaluate(() => window.__landscapeTestHooks.setSurfaceCache('on'));
    const on = await settle(page), cache = on.appearance.surfaceCache;
    const switchMs = Date.now() - started;
    expect(on.terrainProgramVariant).toMatchObject({ surfaceCache: true, pending: false });
    expect(cache).toMatchObject({ status: 'active', ready: true, frameReady: true, settled: true });
    expect(cache.atlas.slots, 'the cache profile fits the 2,816-slot target').toBe(LANDSCAPE_SURFACE_CACHE.targetSlots);
    expect(cache.atlas.fitReason).toBeNull();
    assertLedger(on, cache);
    const lookup = await page.evaluate(({ cx, cz }) => window.__landscapeTestHooks.surfaceCacheLookup(cx + .5, cz + .5, 64 / 1080), { cx, cz });
    expect(lookup.requested.mip, 'a top-down 5.9 cm footprint samples mip 1').toBe(1);
    expect(lookup.resident).toMatchObject({ mip: 1, stale: false });
    const onPng = await page.screenshot();
    const seams = { off: await seamStatistics(page, offPng, { periodPixels }), on: await seamStatistics(page, onPng, { periodPixels }) };
    await writeFile(path.join(artifacts, 'seams-off.png'), offPng);
    await writeFile(path.join(artifacts, 'seams-on.png'), onPng);
    await writeFile(path.join(artifacts, 'seams.json'), JSON.stringify({ periodPixels, seams, switchMs }, null, 2));
    for (const axis of ['x', 'z']) {
        expect(seams.on[axis].boundaries).toBeGreaterThan(20);
        expect(seams.on[axis].ratio - seams.off[axis].ratio, `${axis} page borders: ${JSON.stringify(seams)}`).toBeLessThanOrEqual(.1);
        expect(seams.on[axis].worst - seams.off[axis].worst).toBeLessThanOrEqual(.5);
    }
    // off: the tiles switch back first, then the runtime releases its atlases, scratch, indirection and ledger entries
    await page.evaluate(() => window.__landscapeTestHooks.setSurfaceCache('off'));
    const released = await settle(page);
    expect(released.terrainProgramVariant).toMatchObject({ surfaceCache: false, pending: false });
    expect(released.appearance.surfaceCache).toMatchObject({ status: 'off' });
    expect(cacheEntries(released), 'disposal releases every cache allocation').toEqual([]);
    expect(released.budget.gpuBytes).toBeLessThanOrEqual(on.budget.gpuBytes - cacheEntries(on).reduce((sum, entry) => sum + entry.gpuBytes, 0) + 32 * MiB);
    // on again: the program variants relink from the GPU process cache and the cache rebuilds
    await page.evaluate(() => window.__landscapeTestHooks.setSurfaceCache('on'));
    const again = await settle(page);
    expect(again.appearance.surfaceCache).toMatchObject({ status: 'active', frameReady: true });
    expect(cacheEntries(again)).toHaveLength(2);
    await expect(page.evaluate(() => window.__landscapeTestHooks.setSurfaceCache('maybe'))).rejects.toThrow(/surfaceCache must be one of off, on/);
    await page.evaluate(() => window.__landscapeTestHooks.setSurfaceCache('off'));
    expect(cacheEntries(await settle(page))).toEqual([]);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D6 surface cache: a lost WebGL context detaches the cached frame and a restored one rebuilds the cache from the root page', async ({ page }) => {
    test.setTimeout(300000);
    const errors = observeErrors(page);
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeSurfaceCache=on'));
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot()?.ready, null, { timeout: 60000 });
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), gamePov);
    const before = (await settle(page)).appearance.surfaceCache;
    expect(before).toMatchObject({ status: 'active', frameReady: true, context: { losses: 0, restores: 0, lost: false } });
    const pngBefore = await page.screenshot();
    const during = await page.evaluate(async () => {
        const gl = document.getElementById('game-canvas').getContext('webgl2'), extension = gl.getExtension('WEBGL_lose_context');
        window.__loseContext = extension;
        const lost = new Promise(resolve => gl.canvas.addEventListener('webglcontextlost', resolve, { once: true }));
        extension.loseContext();
        await lost;
        return window.__landscapeTestHooks.snapshot().appearance.surfaceCache;
    });
    expect(during).toMatchObject({ status: 'lost', reason: 'surface-cache-context-lost', frameReady: false, context: { losses: 1, lost: true } });
    await page.evaluate(async () => {
        const restored = new Promise(resolve => document.getElementById('game-canvas').addEventListener('webglcontextrestored', resolve, { once: true }));
        window.__loseContext.restoreContext();
        await restored;
    });
    const after = (await settle(page)).appearance.surfaceCache;
    expect(after).toMatchObject({ status: 'active', ready: true, frameReady: true, settled: true, context: { losses: 1, restores: 1, lost: false } });
    expect(after.pages.missing).toBe(0);
    const pngAfter = await page.screenshot();
    await writeFile(path.join(artifacts, 'context-before.png'), pngBefore);
    await writeFile(path.join(artifacts, 'context-after.png'), pngAfter);
    // the rebuilt frame matches the frame before the loss (the same pages regenerated from the same inputs)
    const difference = await meanByteDifference(page, pngBefore, pngAfter);
    expect(difference, 'mean absolute byte difference of the frames before the loss and after the restore').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D6 surface cache: a reload of the same landscape rebinds the cache, which regenerates the same frame without relinking its programs', async ({ page }) => {
    test.setTimeout(300000);
    const errors = observeErrors(page);
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeSurfaceCache=on'));
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot()?.ready, null, { timeout: 60000 });
    await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), gamePov);
    const before = (await settle(page)).appearance.surfaceCache;
    expect(before).toMatchObject({ status: 'active', frameReady: true, near: { active: true } });
    const pngBefore = await page.screenshot();
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    const after = (await settle(page)).appearance.surfaceCache;
    expect(after).toMatchObject({ status: 'active', ready: true, frameReady: true, settled: true, near: { active: true } });
    // the same runtime (its ledger entries) with the same linked programs; every page regenerated from the new load's streams
    expect(after.ledger.atlas.key).toBe(before.ledger.atlas.key);
    expect(after.generation.program.compiles).toBe(before.generation.program.compiles);
    expect(after.near.program.compiles).toBe(before.near.program.compiles);
    expect(after.generation.pagesTotal - before.generation.pagesTotal).toBeGreaterThanOrEqual(after.pages.resident);
    const pngAfter = await page.screenshot();
    await writeFile(path.join(artifacts, 'rebind-before.png'), pngBefore);
    await writeFile(path.join(artifacts, 'rebind-after.png'), pngAfter);
    // the regenerated pages draw the frame of the first load (a generation material that kept the previous load's uniform cells drew black ground)
    const difference = await meanByteDifference(page, pngBefore, pngAfter);
    expect(difference, 'mean absolute byte difference of the frames before and after the reload').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});

test('Landscape D6 surface cache: viewer options select the mode, slot target and anisotropy; a profile without room reports it; invalid values fail explicitly', async ({ browser }, testInfo) => {
    test.setTimeout(240000);
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 960, height: 540 } });
    try {
        const page = await context.newPage(), errors = observeErrors(page);
        await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeSurfaceCache=on&landscapeSurfaceCacheSlots=512&landscapeSurfaceCacheAnisotropy=4'));
        await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot()?.appearance?.surfaceCache?.status === 'active', null, { timeout: 150000 });
        const cache = (await snapshot(page)).appearance.surfaceCache;
        expect(cache.atlas).toMatchObject({ slots: 512, targetSlots: 512, layers: 2, anisotropy: 4, fitReason: null });
        expect(cache.demand.anisotropy).toBe(4);
        expect(errors).toEqual([]);
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        await page.close();
        // profiles without room for the minimum atlas above the streams' reserve (the uncached shipped 512/256, the reduced 128/64 and 48/24 MiB) report
        // why, and the tiles compile the uncached program from the start (no variant switch, so no bootstrap frame while it links)
        for (const [cpu, gpu] of [[512, 256], [128, 64], [48, 24]]) {
            const small = await context.newPage(), smallErrors = observeErrors(small);
            await small.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?landscapeCpuMiB=${cpu}&landscapeGpuMiB=${gpu}&landscapeSurfaceCache=on`));
            await small.waitForFunction(() => window.__landscapeTestHooks?.snapshot()?.appearance?.surfaceCache?.status === 'unavailable', null, { timeout: 120000 });
            await expect.poll(async () => (await snapshot(small)).terrainProgramVariant, { timeout: 120000 }).toMatchObject({ surfaceCache: false, pending: false, switches: 0 });
            const unavailable = await snapshot(small);
            expect(unavailable.budget.limits).toEqual({ cpuBytes: cpu * MiB, gpuBytes: gpu * MiB });
            expect(unavailable.appearance.surfaceCache).toMatchObject({ status: 'unavailable', reason: 'surface-cache-gpu-budget', ready: false, settled: true });
            expect(cacheEntries(unavailable)).toEqual([]);
            expect(smallErrors).toEqual([]);
            await small.evaluate(() => window.__landscapeTestHooks.dispose());
            await small.close();
        }
        // with the cache on, the viewer refuses a budget above the cache's shipped profile
        const above = await context.newPage(), aboveFailures = [];
        above.on('pageerror', error => aboveFailures.push(error.message));
        await above.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeGpuMiB=449&landscapeSurfaceCache=on'));
        await expect.poll(() => aboveFailures.join('\n'), { timeout: 20000 }).toMatch(/landscapeGpuMiB must be a positive byte-exact MiB value no greater than the shipped budget/);
        await above.close();
        for (const [query, message] of [['landscapeSurfaceCache=maybe', /landscapeSurfaceCache must be one of off, on; received maybe/],
            ['landscapeSurfaceCacheSlots=300', /landscapeSurfaceCacheSlots must be a multiple of 256 from 256 to 8192; received 300/],
            ['landscapeSurfaceCacheAnisotropy=3', /landscapeSurfaceCacheAnisotropy must be 1, 2, 4, 8 or 16; received 3/]]) {
            const invalid = await context.newPage(), failures = [];
            invalid.on('pageerror', error => failures.push(error.message));
            await invalid.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?${query}`));
            await expect.poll(() => failures.join('\n'), { timeout: 20000 }).toMatch(message);
            expect(await invalid.evaluate(() => typeof window.__landscapeTestHooks)).toBe('undefined');
            await invalid.close();
        }
    } finally { await context.close(); }
});
