// Checks debug window layout/lifecycle and a real copied gameplay-pose round trip.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome } });
const artifacts = 'tests/artifacts/screens/gameplay_debug_panel';

async function panelFixture(page) {
    await page.route('**/__debug_panel_fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200">
        <link rel="stylesheet" href="/src/graphics/gui/shared/styles.css">
        <link rel="stylesheet" href="/src/graphics/gui/gameplay/debug_panel.css">
        <body></body>` }));
    await page.goto('/__debug_panel_fixture');
    await page.evaluate(async () => {
        const { GameplayDebugPanel } = await import('/src/graphics/gui/gameplay/GameplayDebugPanel.js');
        window.panel = new GameplayDebugPanel({ getGameplayPose: () => ({ version: 1, bus: { position: { x: 5, z: 8 } } }) });
        window.panel.attach();
        window.panel.setContext({ physics: { getVehicleDebug: () => ({ ready: true, input: { steering: 0 }, wheels: [1, 2, 3, 4] }) }, vehicleId: 'player' });
        window.panel._refreshTree({ force: true });
    });
    await page.evaluate(() => document.fonts.ready);
}

test('debug window keeps panels separate and docks/restores without losing state', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await panelFixture(page);
    const panel = page.locator('#hud-gameplay-debug');
    const rect = await panel.boundingBox();
    const left = await page.locator('.gpd-left').boundingBox();
    const right = await page.locator('.gpd-right').boundingBox();
    expect(left.x + left.width).toBeLessThanOrEqual(right.x);
    expect(await page.locator('.gpd-left').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await page.locator('.gpd-left').evaluate(el => { el.scrollTop = 180; });
    await mkdir(artifacts, { recursive: true });
    await panel.screenshot({ path: `${artifacts}/expanded.png` });
    await page.getByRole('button', { name: 'Minimize debug panel', exact: true }).click();
    const dock = await panel.boundingBox();
    expect(dock.x).toBe(16);
    expect(dock.y + dock.height).toBe(984);
    await expect(page.locator('.gpd-body')).toBeHidden();
    await panel.screenshot({ path: `${artifacts}/minimized.png` });
    await page.getByRole('button', { name: 'Restore debug panel', exact: true }).click();
    expect(await panel.boundingBox()).toEqual(rect);
    expect(await page.locator('.gpd-left').evaluate(el => el.scrollTop)).toBe(180);
    await page.getByRole('button', { name: 'Logs: On', exact: true }).click();
    await expect(page.locator('.gpd-right')).toBeHidden();
    await page.getByRole('button', { name: 'Logs: Off', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 760 });
    await expect.poll(async () => (await panel.boundingBox()).x).toBeGreaterThanOrEqual(8);
    const narrow = await panel.boundingBox();
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(390);
    expect(narrow.y + narrow.height).toBeLessThanOrEqual(760);
    expect(await page.locator('.gpd-body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const narrowLeft = await page.locator('.gpd-left').boundingBox();
    const narrowRight = await page.locator('.gpd-right').boundingBox();
    expect(narrowLeft.y + narrowLeft.height).toBeLessThanOrEqual(narrowRight.y);
    await panel.screenshot({ path: `${artifacts}/narrow.png` });
    await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
    await expect(panel).toHaveCount(0);
});

test('clipboard failures have a working fallback and honest retry feedback', async ({ page }) => {
    await panelFixture(page);
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } });
        document.execCommand = (command) => {
            if (command !== 'copy') return false;
            window.copied = document.activeElement.value;
            return true;
        };
    });
    const copy = page.getByRole('button', { name: 'Copy camera position', exact: true });
    await copy.click();
    await expect(copy).toHaveText('Copied');
    expect(JSON.parse(await page.evaluate(() => window.copied)).bus.position.x).toBe(5);
    await expect(page.locator('.gpd-clipboard-buffer')).toHaveCount(0);
    await page.evaluate(() => { document.execCommand = () => false; });
    await copy.click();
    await expect(copy).toHaveText('Copy failed — retry');
    await expect(copy).toBeEnabled();
    await expect(page.locator('.gpd-clipboard-buffer')).toHaveCount(0);
});

test('Copy camera position replays the bus anchor and rolled camera after model loading', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } });
    });
    const ready = async () => {
        await page.waitForFunction(() => window.__busSim?.sm?.current?.busAnchor && window.__busSim.sm.current?._poseCamera, null, { timeout: 60_000 });
        await page.evaluate(async () => { await window.__busSim.sm.current.busModel?.userData?.readyPromise; });
    };
    await page.goto('/?pose=civic_center_curve_front&debug=true&coreTests=0');
    await ready();
    const expected = await page.evaluate(() => {
        const state = window.__busSim.sm.current;
        state.busAnchor.position.y += 0.43;
        state.busAnchor.rotation.set(0.08, -0.8, 0.035);
        state._poseCamera.quaternion = state.engine.camera.quaternion.clone();
        state.engine.camera.rotateZ(0.15);
        state._poseCamera.quaternion.copy(state.engine.camera.quaternion);
        return state._captureGameplayPose();
    });
    await page.getByRole('button', { name: 'Copy camera position', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Copy camera position', exact: true })).toHaveText('Copied');
    const copied = JSON.parse(await page.evaluate(() => window.copied));
    expect(copied).toEqual(expected);
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: `${artifacts}/gameplay.png` });
    await page.goto(`/?debug=true&coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(copied))}`);
    await ready();
    const actual = await page.evaluate(() => window.__busSim.sm.current._captureGameplayPose());
    expect(actual.city).toBe(copied.city);
    expect(actual.bus.modelId).toBe(copied.bus.modelId);
    for (const key of ['x', 'y', 'z']) {
        expect(actual.bus.transform.position[key]).toBeCloseTo(copied.bus.transform.position[key], 7);
        expect(actual.camera.position[key]).toBeCloseTo(copied.camera.position[key], 7);
    }
    for (const key of ['x', 'y', 'z', 'w']) {
        expect(actual.bus.transform.quaternion[key]).toBeCloseTo(copied.bus.transform.quaternion[key], 7);
        expect(actual.camera.quaternion[key]).toBeCloseTo(copied.camera.quaternion[key], 7);
    }
    expect(actual.camera.fovDeg).toBe(copied.camera.fovDeg);
    expect(errors).toEqual([]);
});
