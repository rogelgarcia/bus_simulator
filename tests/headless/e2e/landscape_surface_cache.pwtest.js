// Verifies the AI577 D6 runtime surface cache in the viewer (landscape-surface-cache-v1, default off): the root page precedes the first detailed
// cached frame, generation keeps to its GPU budget, atlases and indirection stay inside the ledger under their ceiling, page borders are seamless
// in a top-down probe, and switching it on and off links the program variants and releases every cache allocation.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LANDSCAPE_SURFACE_CACHE, landscapeSurfaceCacheSlotLayout, landscapeSurfaceCacheScratchLayout, landscapeSurfaceCacheIndirectionBytes } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';

const artifacts = path.resolve('tests/artifacts/screens/landscape/ai577/d6/cache-core/e2e');
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
    expect(cache.atlas.ceilingBytes).toBe(Math.floor(budget.limits.gpuBytes * LANDSCAPE_SURFACE_CACHE.gpuCeilingFraction));
    expect(cache.pages.resident).toBeLessThanOrEqual(cache.atlas.slots);
    expect(cache.pages.desired).toBeLessThanOrEqual(cache.atlas.slots - LANDSCAPE_SURFACE_CACHE.reservedSlots);
    expect(cache.pages.residentByMip[cache.geometry.rootMip], 'the root page stays resident').toBe(1);
}

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test('Landscape D6 surface cache: the root page precedes the first detailed cached frame; generation keeps its budget and the cache its ledger share', async ({ page }, testInfo) => {
    test.setTimeout(300000);
    expect(new URL(String(testInfo.project.use.baseURL)).port).not.toBe('8001');
    const errors = observeErrors(page);
    await page.goto('/screens/landscape_fabrication.html?landscapeCpuMiB=512&landscapeGpuMiB=256&landscapeSurfaceCache=on');
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
    // the shipped 512/256 MiB profile fits six of the eight target layers under the 3/8 ceiling and says so
    expect(cache.atlas).toMatchObject({ slots: 1536, targetSlots: LANDSCAPE_SURFACE_CACHE.targetSlots, layers: 6, slotTexels: 72, fitReason: 'surface-cache-gpu-ceiling', anisotropy: 2 });
    assertLedger(state, cache);
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
    await page.goto('/screens/landscape_fabrication.html');
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot()?.ready, null, { timeout: 60000 });
    await page.evaluate(budgets => window.__landscapeTestHooks.setBudgets(budgets), { cpuBytes: 768 * MiB, gpuBytes: 384 * MiB });
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
    expect(cache.atlas.slots, '768/384 MiB fits the 2,048-slot target').toBe(2048);
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

test('Landscape D6 surface cache: viewer options select the mode, slot target and anisotropy; a profile without room reports it; invalid values fail explicitly', async ({ browser }, testInfo) => {
    test.setTimeout(240000);
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 960, height: 540 } });
    try {
        const page = await context.newPage(), errors = observeErrors(page);
        await page.goto('/screens/landscape_fabrication.html?landscapeSurfaceCache=on&landscapeSurfaceCacheSlots=512&landscapeSurfaceCacheAnisotropy=4');
        await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot()?.appearance?.surfaceCache?.status === 'active', null, { timeout: 150000 });
        const cache = (await snapshot(page)).appearance.surfaceCache;
        expect(cache.atlas).toMatchObject({ slots: 512, targetSlots: 512, layers: 2, anisotropy: 4, fitReason: null });
        expect(cache.demand.anisotropy).toBe(4);
        expect(errors).toEqual([]);
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        await page.close();
        // a profile whose 3/8 ceiling holds no 256-slot layer reports why and keeps the uncached program
        const small = await context.newPage(), smallErrors = observeErrors(small);
        await small.goto('/screens/landscape_fabrication.html?landscapeCpuMiB=16&landscapeGpuMiB=8&landscapeSurfaceCache=on');
        await small.waitForFunction(() => window.__landscapeTestHooks?.snapshot()?.appearance?.surfaceCache?.status === 'unavailable', null, { timeout: 120000 });
        await expect.poll(async () => (await snapshot(small)).terrainProgramVariant, { timeout: 120000 }).toMatchObject({ surfaceCache: false, pending: false });
        const unavailable = await snapshot(small);
        expect(unavailable.appearance.surfaceCache).toMatchObject({ status: 'unavailable', reason: 'surface-cache-gpu-budget', ready: false, settled: true });
        expect(cacheEntries(unavailable)).toEqual([]);
        expect(smallErrors).toEqual([]);
        await small.evaluate(() => window.__landscapeTestHooks.dispose());
        await small.close();
        for (const [query, message] of [['landscapeSurfaceCache=maybe', /landscapeSurfaceCache must be one of off, on; received maybe/],
            ['landscapeSurfaceCacheSlots=300', /landscapeSurfaceCacheSlots must be a multiple of 256 from 256 to 8192; received 300/],
            ['landscapeSurfaceCacheAnisotropy=3', /landscapeSurfaceCacheAnisotropy must be 1, 2, 4, 8 or 16; received 3/]]) {
            const invalid = await context.newPage(), failures = [];
            invalid.on('pageerror', error => failures.push(error.message));
            await invalid.goto(`/screens/landscape_fabrication.html?${query}`);
            await expect.poll(() => failures.join('\n'), { timeout: 20000 }).toMatch(message);
            expect(await invalid.evaluate(() => typeof window.__landscapeTestHooks)).toBe('undefined');
            await invalid.close();
        }
    } finally { await context.close(); }
});
