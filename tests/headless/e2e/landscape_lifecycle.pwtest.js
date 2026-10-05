// Verifies real menu navigation, viewport picking, and teardown while changing landscapes.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeModelFixture } from '../../node/unit/landscape_model_fixture.js';

const artifacts = path.resolve('tests/artifacts/screens/landscape', process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'ai576/d7', 'lifecycle');
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks?.snapshot() ?? {});

test('Landscape D7: actual Fabrication menu entry keeps one HUD and correct picking after resize/hide', async ({ page }) => {
    await mkdir(artifacts, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Keep the canonical menu document/controller; omit unrelated game initialization.
    const menu = (await readFile(path.resolve('index.html'), 'utf8')).replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, '');
    await page.route('**/__landscape_menu_gate.html', route => route.fulfill({ contentType: 'text/html', body: menu }));
    await page.goto('/__landscape_menu_gate.html');
    await page.evaluate(async () => {
        const { SetupState } = await import('/src/states/SetupState.js');
        const state = new SetupState({ clearScene() {} }, { go() {} });
        state.enter({ initialMenu: 'fabrication' });
    });
    await page.getByText('Landscape Fabrication', { exact: true }).click();
    await page.waitForURL('**/screens/landscape_fabrication.html');
    await expect.poll(async () => (await snapshot(page)).planning?.ready, { timeout: 20000 }).toBe(true);
    await expect(page.locator('#ui-perf-bar')).toHaveCount(1);
    await page.evaluate(() => { window.__landscapeTestHooks.preset('top'); window.__landscapeTestHooks.setSelectionRadius(0); });
    const picks = [];
    for (const hidden of [false, true, false]) {
        await page.setViewportSize({ width: hidden ? 1536 : 1920, height: hidden ? 864 : 1080 });
        if (picks.length) await page.keyboard.press('Control+Shift+P');
        await page.waitForTimeout(150);
        const box = await page.locator('#game-canvas').boundingBox();
        expect(hidden ? box.y === 0 : box.y > 0).toBe(true);
        const previous = (await snapshot(page)).selection?.selectionId;
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await expect.poll(async () => (await snapshot(page)).selection?.selectionId).not.toBe(previous);
        await expect.poll(async () => (await snapshot(page)).selection?.editingReady).toBe(true);
        picks.push((await snapshot(page)).selection.position);
    }
    for (const pick of picks) for (const axis of ['x', 'y', 'z']) expect(pick[axis]).toBeCloseTo(picks[0][axis], 3);
    await page.screenshot({ path: path.join(artifacts, '01-menu-entry-resized-picking.png') });
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0);
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'menu-entry.json'), JSON.stringify({ picks, disposed, errors }, null, 2));
});

test('Landscape D7: switching landscapes cancels in-flight detail and releases the previous viewer', async ({ page }) => {
    await mkdir(artifacts, { recursive: true });
    const fixture = createLandscapeModelFixture();
    await page.route(url => url.pathname.startsWith('/__landscape_fixture/'), route => {
        const key = new URL(route.request().url()).pathname.replace('/__landscape_fixture/', '');
        const bytes = fixture.resources.get(key);
        return route.fulfill({ status: bytes ? 200 : 404, contentType: key.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: Buffer.from(bytes ?? []) });
    });
    await page.goto('/screens/landscape_fabrication.html');
    await expect.poll(async () => (await snapshot(page)).planning?.ready, { timeout: 20000 }).toBe(true);
    await page.evaluate(() => window.addEventListener('pagehide', () => {
        sessionStorage.setItem('landscape-d7-disposed', JSON.stringify(window.__landscapeTestHooks.snapshot()));
    }, { once: true }));
    let release, intercepted = false;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/payloads/*.f32le', async route => {
        intercepted = true;
        await held;
        try { await route.continue(); } catch { /* Navigation already canceled the old request. */ }
    });
    try {
        await page.evaluate(() => window.__landscapeTestHooks.setCamera({ position: [2000, 180, 1750], target: [2000, 18, 2000], projection: 'perspective', fov: 50 }));
        await expect.poll(() => intercepted).toBe(true);
        await page.goto('/screens/landscape_fabrication.html?landscape=/__landscape_fixture/manifest.json');
        release();
        await expect.poll(async () => (await snapshot(page)).revision, { timeout: 20000 }).toBe(fixture.manifest.revision);
        await expect.poll(async () => (await snapshot(page)).planning?.ready, { timeout: 20000 }).toBe(true);
        const previous = await page.evaluate(() => JSON.parse(sessionStorage.getItem('landscape-d7-disposed')));
        expect(previous.disposed).toBe(true);
        expect(previous.sourceBytes).toBe(0);
        expect(previous.budget.cpuBytes).toBe(0); expect(previous.budget.gpuBytes).toBe(0);
        const current = await snapshot(page);
        expect(current.lastError).toBeNull();
        expect(current.source).toContain('/__landscape_fixture/manifest.json');
        await expect(page.locator('#ui-perf-bar')).toHaveCount(1);
        await page.evaluate(() => { window.__landscapeTestHooks.dispose(); window.__landscapeTestHooks.dispose(); });
        const final = await snapshot(page);
        expect(final.budget.cpuBytes).toBe(0); expect(final.budget.gpuBytes).toBe(0);
        await writeFile(path.join(artifacts, 'landscape-switch.json'), JSON.stringify({ previous, current, final }, null, 2));
    } finally { release(); }
});

test('Landscape AI577 D4: disposing while the terrain program compiles stops waiting and releases the shared budget', async ({ page }) => {
    await mkdir(artifacts, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // the GPU process caches linked programs across pages; a unique source line forces the cold compile this test interrupts
    await page.route('**/src/graphics/shaders/materials/landscape/terrain.frag.glsl', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\n// lifecycle cold-compile probe ${Date.now()}\n` });
    });
    await page.goto('/screens/landscape_fabrication.html');
    await expect.poll(async () => (await snapshot(page)).terrainProgram, { timeout: 20000 }).toMatchObject({ parallel: true, pending: true });
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    await page.waitForTimeout(250);
    const disposed = await snapshot(page);
    expect(disposed.disposed).toBe(true);
    expect(disposed.ready).toBe(false);
    expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0);
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'dispose-during-compile.json'), JSON.stringify({ disposed: { ready: disposed.ready, budget: disposed.budget, lastError: disposed.lastError }, errors }, null, 2));
});

test('Landscape AI577 D6: diagnostics and the terrain-appearance switch link their program variant in parallel without stalling frames', async ({ page }) => {
    test.setTimeout(240000);
    await mkdir(artifacts, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID/i.test(message.text())) errors.push(message.text()); });
    // a unique source line keeps every variant cold in the GPU process program cache, so each switch really compiles
    await page.route('**/src/graphics/shaders/materials/landscape/terrain.frag.glsl', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\n// D6 program-variant probe ${Date.now()}\n` });
    });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/screens/landscape_fabrication.html');
    await expect.poll(async () => { const state = await snapshot(page); return !!(state.ready && state.planning?.ready && state.streaming?.settled); }, { timeout: 120000 }).toBe(true);
    const initial = await snapshot(page);
    expect(initial.terrainProgramVariant).toMatchObject({ diagnostics: false, terrainAppearance: true, pending: false, switches: 0 });
    // longest interval between animation frames while a variant links: a synchronous link of the cold program would freeze the page for seconds
    const switchVariant = async (call, expected) => page.evaluate(async ({ call, expected }) => {
        const hooks = window.__landscapeTestHooks, frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        await frame();
        let last = performance.now(), longest = 0, pendingSeen = false;
        const started = performance.now();
        new Function('hooks', call)(hooks);
        for (;;) {
            await frame();
            const now = performance.now();
            longest = Math.max(longest, now - last); last = now;
            const variant = hooks.snapshot().terrainProgramVariant;
            pendingSeen ||= variant.pending;
            if (!variant.pending && Object.entries(expected).every(([key, value]) => variant[key] === value)) return { longestFrameGapMs: longest, ms: now - started, pendingSeen, variant };
            if (now - started > 120000) throw new Error(`variant switch did not complete: ${JSON.stringify(variant)}`);
        }
    }, { call, expected });
    const diagnostics = await switchVariant("hooks.setPlanning({ diagnostic: 'elevation' })", { diagnostics: true });
    const shaded = await switchVariant("hooks.setPlanning({ diagnostic: 'none' })", { diagnostics: false });
    const appearanceOff = await switchVariant('hooks.setTerrainAppearance(false)', { terrainAppearance: false });
    const appearanceOn = await switchVariant('hooks.setTerrainAppearance(true)', { terrainAppearance: true });
    // a request superseded while it links settles silently: the newer request applies at once, no switch happens and no stale linking notice remains
    const superseded = await page.evaluate(async () => {
        const hooks = window.__landscapeTestHooks, frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        hooks.setPlanning({ diagnostic: 'elevation' });
        const linking = hooks.snapshot().terrainProgramVariant.pending;
        hooks.setPlanning({ diagnostic: 'none' });
        for (let index = 0; index < 30; index++) await frame();
        const notices = [...document.querySelectorAll('[data-field="notice"]')].map(element => (element.hidden ? '' : element.textContent));
        return { linking, variant: hooks.snapshot().terrainProgramVariant, notices };
    });
    expect(superseded.linking, 'the superseded diagnostics request had started linking').toBe(true);
    expect(superseded.variant).toMatchObject({ diagnostics: false, terrainAppearance: true, pending: false, switches: 4 });
    expect(superseded.notices.filter(text => /Linking the terrain program variant/.test(text))).toEqual([]);
    const results = { diagnostics, shaded, appearanceOff, appearanceOn };
    await writeFile(path.join(artifacts, 'program-variant-switches.json'), JSON.stringify({ ...results, superseded }, null, 2));
    expect(diagnostics.pendingSeen, 'the cold diagnostics variant links asynchronously').toBe(true);
    for (const [name, result] of Object.entries(results)) expect(result.longestFrameGapMs, `${name}: frames keep flowing while the variant links`).toBeLessThan(1500);
    expect(appearanceOn.variant.switches).toBe(4);
    const final = await snapshot(page);
    expect([final.terrainAppearance, final.planning.diagnostic]).toEqual(['on', 'none']);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect([disposed.budget.cpuBytes, disposed.budget.gpuBytes]).toEqual([0, 0]);
    expect(errors).toEqual([]);
});
