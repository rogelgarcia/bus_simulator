// Gameplay startup can draw live lighting while optional baked resources are pending.
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('Startup prepares a live frame before delayed bakes; later lighting changes still hold the view', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const { BakedLightingRuntime } = await import('/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js');
        let release, compiled = 0;
        const shadows = { suspend() {}, commitCurrent() {}, getSnapshot: () => ({ effectiveMode: 'baked' }),
            setSettings: () => new Promise(resolve => { release = resolve; }), getDiagnostics: () => ({ status: {} }) };
        const receivers = { settings: {}, suspend() {}, frameBegin() {}, getDiagnostics: () => ({}) };
        const bus = { suspend() {}, configure() {}, cancelStaging() {}, frameBegin() {}, getDiagnostics: () => ({}) };
        const runtime = new BakedLightingRuntime({ context: { city: {} }, prepareLightingView: async () => { compiled++; } },
            { shadows, receivers, bus });
        runtime.settings = { mode: 'auto', shadows: { enabled: true }, receivers: { indirect: false }, bus: {} };
        const settle = () => new Promise(resolve => setTimeout(resolve, 0));
        const initial = runtime.refresh({ background: true });
        runtime.prepareView(); await settle();
        const live = { held: runtime.shouldHoldView(), loading: runtime.loading, compiled };
        release(); await initial; runtime.frameBegin();
        const heldForBakeCompilation = runtime.shouldHoldView();
        runtime.prepareView(); await settle();
        const baked = { held: runtime.shouldHoldView(), mode: runtime.effectiveMode, compiled };
        const later = runtime.refresh(); runtime.prepareView(); await settle();
        const laterHeld = runtime.shouldHoldView();
        release(); await later;
        window.removeEventListener('pagehide', runtime.onPageHide);
        return { live, heldForBakeCompilation, baked, laterHeld };
    });
    expect(result.live).toEqual({ held: false, loading: true, compiled: 1 });
    expect(result.heldForBakeCompilation).toBe(true);
    expect(result.baked).toEqual({ held: false, mode: 'baked', compiled: 2 });
    expect(result.laterHeld).toBe(true);
});

test('Loading cover waits for assets and a rendered frame, cancels cleanly, and exposes startup failures', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    await page.addStyleTag({ url: '/src/graphics/gui/gameplay/loading.css' });
    const result = await page.evaluate(async () => {
        const { GameplayLoadingScreen } = await import('/src/graphics/gui/gameplay/GameplayLoadingScreen.js');
        let release, frame = null, started = false;
        const engine = { waitForLightingReady: () => new Promise(resolve => { release = resolve; }),
            getBakedLightingDebugInfo: () => ({}), addFrameListener(fn) { frame = fn; return () => { frame = null; }; } };
        const screen = new GameplayLoadingScreen(engine);
        const nextFrame = () => new Promise(requestAnimationFrame);
        const loading = screen.show(() => { started = true; return {}; }, () => {});
        await nextFrame();
        const firstPaint = { black: getComputedStyle(screen.root).backgroundColor, started };
        await nextFrame();
        const waitingForAssets = screen.active && frame === null;
        release(); await loading;
        frame({ rendered: false }); const heldFrameCovered = screen.active;
        frame({ rendered: true }); const released = !screen.active && frame === null;
        const cancelled = screen.show(() => { throw new Error('Cancelled entry ran'); }, () => {});
        screen.cancel(); await cancelled;
        await screen.show(() => { throw new Error('Test asset load failure'); }, () => {});
        const errorShown = screen.root.textContent.includes('Unable to load the game.') && !screen.root.querySelector('button').hidden;
        screen.cancel();
        return { firstPaint, waitingForAssets, heldFrameCovered, released, errorShown, remaining: document.querySelectorAll('.gameplay-loading').length };
    });
    expect(result).toEqual({ firstPaint: { black: 'rgb(0, 0, 0)', started: false },
        waitingForAssets: true, heldFrameCovered: true, released: true, errorShown: true, remaining: 0 });
});

test('Garage Enter finishes the animation and fade before loading; gameplay does not wait for bakes', async ({ page }) => {
    test.setTimeout(240_000);
    const output = 'tests/artifacts/screens/gameplay_loading';
    await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let releaseBake;
    const bakeGate = new Promise(resolve => { releaseBake = resolve; });
    await page.route('**/baked_lighting/shadows/package_index.json', async route => {
        await bakeGate;
        if (!page.isClosed()) await route.abort();
    });
    try {
        await page.goto('/?coreTests=0');
        await page.waitForFunction(() => !!window.__busSim, null, { timeout: 60_000 });
        await page.evaluate(() => window.__busSim.sm.go('bus_select'));
        await page.waitForFunction(() => !!window.__busSim.sm.current.showcase, null, { timeout: 60_000 });
        await page.evaluate(async () => {
            const { engine, sm } = window.__busSim;
            await sm.current.showcase.bus.userData.readyPromise;
            await engine.waitForLightingReady();
            const startCamera = engine.camera.position.clone();
            window.selectionCameraMoved = false;
            window.addEventListener('keydown', () => {
                window.afterSelection = { state: sm.currentName, loading: !!document.querySelector('.gameplay-loading') };
            }, { once: true });
            const observer = new MutationObserver(() => {
                if (!document.querySelector('.gameplay-loading')) return;
                window.fadeAtLoading = Number(getComputedStyle(document.querySelector('#ui-fade')).opacity);
                observer.disconnect();
            });
            observer.observe(document.body, { childList: true });
            const game = sm.states.get('game_mode'), enter = game.enter.bind(game);
            game.enter = (...args) => {
                window.coveredAtBuild = getComputedStyle(document.querySelector('.gameplay-loading')).backgroundColor === 'rgb(0, 0, 0)';
                return enter(...args);
            };
            window.liveFrames = 0;
            engine.addFrameListener(({ rendered }) => {
                if (sm.currentName === 'bus_select' && engine.camera.position.distanceTo(startCamera) > 0.1)
                    window.selectionCameraMoved = true;
                if (sm.currentName === 'game_mode' && rendered) window.liveFrames++;
            });
            window.enterStartedAt = performance.now();
        });
        await page.keyboard.press('Enter');
        expect(await page.evaluate(() => window.afterSelection)).toEqual({ state: 'bus_select', loading: false });
        const cover = page.locator('.gameplay-loading');
        await expect(cover).toBeVisible({ timeout: 15_000 });
        expect(await page.evaluate(() => window.selectionCameraMoved)).toBe(true);
        expect(await page.evaluate(() => window.fadeAtLoading)).toBe(1);
        await expect(cover.getByRole('status')).toHaveText('Loading…');
        const statusBox = await cover.getByRole('status').boundingBox();
        expect(statusBox.x).toBeGreaterThan(1100);
        expect(statusBox.y).toBeGreaterThan(650);
        await page.screenshot({ path: `${output}/00-loading.png` });
        await expect(cover).toHaveCount(0, { timeout: 120_000 });
        await page.waitForFunction(() => window.liveFrames >= 3);
        const live = await page.evaluate(() => ({ covered: window.coveredAtBuild,
            elapsedMs: performance.now() - window.enterStartedAt,
            state: window.__busSim.sm.currentName, diagnostics: window.__busSim.engine.getBakedLightingDebugInfo() }));
        expect(live.covered).toBe(true);
        expect(live.state).toBe('game_mode');
        expect(live.diagnostics.status.state).toBe('loading');
        expect(live.diagnostics.status.effectiveMode).toBe('current');
        console.log(`Gameplay displayed with bakes still pending after ${(live.elapsedMs / 1000).toFixed(1)}s`);
        await page.screenshot({ path: `${output}/01-live-before-bakes.png` });
        expect(errors).toEqual([]);
    } finally { await page.close(); releaseBake(); }
});
