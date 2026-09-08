// Verifies fixed bake-status slots, activation timing and compact runtime reporting.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome } });
const artifacts = 'tests/artifacts/screens/baked_status_bar';

test('PerfBar: bake states keep their slots and each Applied expires independently', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.route('**/__bake_status_fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200">
        <link rel="stylesheet" href="/src/graphics/gui/shared/styles.css">
        <link rel="stylesheet" href="/src/graphics/gui/perf_bar/styles.css">
        <body><canvas id="game-canvas"></canvas></body>` }));
    await page.goto('/__bake_status_fixture');
    await page.evaluate(async () => {
        const { PerfBar } = await import('/src/graphics/gui/perf_bar/PerfBar.js');
        window.bakeSnapshot = {
            shadows: { state: 'loading', phase: 'fetching' },
            indirect: { state: 'loading', phase: 'source_validation' },
            visibility: { state: 'fallback', reason: 'camera_pitch_unsupported' }
        };
        window.statusBar = new PerfBar();
        window.statusBar.setBakedStatusProvider(() => window.bakeSnapshot);
        window.statusBar.mount();
        window.statusBar.onFrame({ dt: 1 / 60, nowMs: 1000 });
    });
    await page.evaluate(() => document.fonts.ready);
    const states = () => page.locator('.ui-perf-bake-value').allTextContents();
    const slots = () => page.locator('.ui-perf-bake').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { x: r.x, width: r.width };
    }));
    expect(await states()).toEqual(['Loading', 'Validating', 'Off', 'Disabled']);
    const positions = await slots();
    await expect(page.locator('[data-bake="visibility"]')).toHaveAttribute('title', /camera pitch unsupported/);
    await expect(page.locator('[data-bake="shadows"] .ui-perf-bake-label')).toHaveCSS('color', 'rgb(203, 208, 213)');
    await expect(page.locator('[data-bake="shadows"] .ui-perf-bake-value')).toHaveCSS('color', 'rgb(155, 184, 201)');
    await mkdir(artifacts, { recursive: true });
    await page.locator('#ui-perf-bar').screenshot({ path: `${artifacts}/loading-validating-disabled.png` });

    await page.evaluate(() => {
        window.bakeSnapshot = {
            shadows: { state: 'off' }, indirect: { state: 'loading', phase: 'preparing_shaders' },
            visibility: { state: 'loading', phase: 'ready_to_commit' }
        };
        window.statusBar.onFrame({ dt: 1 / 60, nowMs: 2000 });
    });
    expect(await states()).toEqual(['Off', 'Preparing', 'Off', 'Ready']);
    expect(await slots()).toEqual(positions);
    await page.locator('#ui-perf-bar').screenshot({ path: `${artifacts}/off-preparing-ready.png` });
    await page.evaluate(() => {
        window.bakeSnapshot = Object.fromEntries(['shadows', 'indirect', 'busIndirect', 'visibility'].map(id => [id, { state: 'active', revision: 1 }]));
        window.statusBar.onFrame({ dt: 1 / 60, nowMs: 10000 });
    });
    expect(await states()).toEqual(['Applied', 'Applied', 'Applied', 'Applied']);
    await page.locator('#ui-perf-bar').screenshot({ path: `${artifacts}/applied.png` });
    await page.evaluate(() => {
        window.statusBar.onFrame({ dt: 1 / 60, nowMs: 12999 });
        window.bakeSnapshot.indirect.revision = 2;
        window.statusBar.requestUpdate();
        window.statusBar.onFrame({ dt: 1 / 60, nowMs: 13000 });
        window.statusBar.requestUpdate();
        window.statusBar.onFrame({ dt: 1 / 60, nowMs: 13999 });
    });
    await expect(page.locator('.ui-perf-bake.is-settled')).toHaveCount(0);
    await page.evaluate(() => { window.statusBar.requestUpdate(); window.statusBar.onFrame({ dt: 1 / 60, nowMs: 14000 }); });
    await expect(page.locator('[data-bake="shadows"]')).toHaveClass(/is-settled/);
    await expect(page.locator('[data-bake="indirect"]')).not.toHaveClass(/is-settled/);
    expect(await slots()).toEqual(positions);
    await expect(page.locator('[data-bake="shadows"]')).toHaveCSS('opacity', '0');
    await page.locator('[data-bake="shadows"]').focus();
    await expect(page.locator('[data-bake="shadows"]')).toHaveCSS('opacity', '1');
    await page.evaluate(() => {
        window.bakeSnapshot.shadows = { state: 'fallback', causeState: 'stale', reason: 'source_or_profile_changed' };
        window.statusBar.onFrame({ dt: 1 / 60, nowMs: 17000 });
    });
    await expect(page.locator('[data-bake="shadows"]')).not.toHaveClass(/is-settled/);
    await expect(page.locator('[data-bake="shadows"]')).toHaveAttribute('aria-label', /Disabled.*stale.*source or profile changed/);
    await expect(page.locator('[data-bake="indirect"]')).toHaveClass(/is-settled/);

    await page.setViewportSize({ width: 390, height: 844 });
    const button = await page.locator('.ui-perf-bar-toggle').boundingBox();
    expect(button.x + button.width).toBeLessThanOrEqual(390);
    expect(await page.locator('#ui-perf-bar').evaluate(el => el.getBoundingClientRect().height)).toBe(24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('#ui-perf-bar').screenshot({ path: `${artifacts}/narrow.png` });
    await page.locator('.ui-perf-bar-toggle').click();
    await expect(page.locator('#ui-perf-bar')).toBeHidden();
    await page.locator('#ui-perf-bar-dock-toggle').click();
    await expect(page.locator('#ui-perf-bar')).toBeVisible();
    await page.evaluate(() => window.statusBar.destroy());
    await expect(page.locator('.ui-perf-bakes')).toHaveCount(0);
});

test('Bake status: selected channels stay unapplied until atomic commit and retain fallback causes', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const { BakedLightingRuntime } = await import('/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js');
        const snapshot = { pendingTransition: 'baked', effectiveMode: 'current', phase: 'ready_to_commit' };
        const shadows = { getSnapshot: () => snapshot, getDiagnostics() { throw new Error('Full diagnostics must not be polled'); } };
        const receivers = { status: { state: 'loading', reason: 'source_validation' }, pending: false, active: false };
        const runtime = new BakedLightingRuntime({ context: { city: {} } }, { shadows, receivers });
        runtime.settings = { bus: { enabled: false }, mode: 'auto', shadows: { enabled: true }, receivers: { indirect: true } };
        runtime.loading = true;
        const preparing = runtime.getStatus();
        runtime.effectiveMode = 'baked'; runtime.loading = false;
        const active = runtime.getStatus();
        runtime.effectiveMode = 'current'; runtime.failure = 'stale'; runtime.reason = 'source_or_profile_changed';
        const failed = runtime.getStatus();
        runtime.settings.receivers.indirect = false;
        const unselected = runtime.getStatus();
        runtime.settings.mode = 'current';
        const current = runtime.getStatus();
        runtime.settings.mode = 'auto'; runtime.engine.context.city = null;
        const waiting = runtime.getStatus();
        return { preparing, active, failed, unselected, current, waiting };
    });
    expect(result.preparing.shadows).toMatchObject({ state: 'loading', phase: 'ready_to_commit' });
    expect(result.preparing.indirect).toMatchObject({ state: 'loading', phase: 'source_validation' });
    expect(result.active.shadows.state).toBe('active');
    expect(result.failed.indirect).toMatchObject({ state: 'fallback', causeState: 'stale', reason: 'source_or_profile_changed' });
    expect(result.unselected.indirect.state).toBe('off');
    expect(result.current.shadows.state).toBe('off');
    expect(result.waiting.shadows.state).toBe('waiting');
});

test('PerfBar: the game connects live bake status without enabling debug diagnostics', async ({ page }) => {
    await page.goto('/index.html?coreTests=0');
    await expect(page.locator('.ui-perf-bake')).toHaveCount(4);
    await page.evaluate(async () => {
        await window.__busSim.engine.setBakedLightingSettings({ mode: 'current' });
    });
    await expect(page.locator('[data-bake="shadows"] .ui-perf-bake-value')).toHaveText('Off');
    await expect(page.locator('[data-bake="indirect"] .ui-perf-bake-value')).toHaveText('Off');
    await expect(page.locator('[data-bake="visibility"] .ui-perf-bake-value')).toHaveText('Off');
});
