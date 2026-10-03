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
    await expect.poll(async () => (await snapshot(page)).planning?.ready).toBe(true);
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
    await expect.poll(async () => (await snapshot(page)).planning?.ready).toBe(true);
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
        await expect.poll(async () => (await snapshot(page)).revision).toBe(fixture.manifest.revision);
        await expect.poll(async () => (await snapshot(page)).planning?.ready).toBe(true);
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
