// Exercises normal local startup, including the automatic browser core tests.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Normal development startup reaches welcome and bus selection', async ({ page }) => {
    test.setTimeout(180_000);
    const root = path.resolve('tests/artifacts/screens/startup_core_tests');
    await mkdir(root, { recursive: true });
    const errors = [], messages = [], pending = new Set();
    page.on('pageerror', error => errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text()); });
    page.on('request', request => pending.add(request.url()));
    page.on('requestfinished', request => pending.delete(request.url()));
    page.on('requestfailed', request => { pending.delete(request.url()); messages.push(`${request.url()}: ${request.failure()?.errorText}`); });
    try {
        await page.goto('/', { waitUntil: 'commit' });
        await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 90_000 });
        await page.getByRole('button', { name: 'Press Start', exact: true }).click();
        await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'bus_select', null, { timeout: 30_000 });
        await page.waitForFunction(() => window.__coreTestsDone === true, null, { timeout: 30_000 });
        expect(await page.evaluate(() => window.__testErrors.filter(error => error.name.startsWith('PerfBar:')))).toEqual([]);
        // Core assertions are reported independently; this test checks that they
        // cannot prevent startup or stop the live renderer.
        expect(await page.evaluate(() => window.__busSim.engine.renderer.info.render.calls)).toBeGreaterThan(0);
        expect(errors.filter(error => error.includes('/src/main.js:'))).toEqual([]);
    } finally {
        const state = await page.evaluate(() => ({ state: window.__busSim?.sm?.currentName, coreDone: window.__coreTestsDone, coreErrors: window.__testErrors, perfBar: document.getElementById('ui-perf-bar')?.textContent }));
        await writeFile(path.join(root, 'startup.json'), JSON.stringify({ state, errors, messages, pending: [...pending] }, null, 2));
        await page.screenshot({ path: path.join(root, 'startup.png') });
        console.log('STARTUP_STATE', JSON.stringify({ scene: state.state, coreFailures: state.coreErrors?.length, uncaughtErrors: errors.length, pendingRequests: pending.size }));
    }
});

test('A stalled ornament cannot freeze welcome; the queued start waits for complete assets', async ({ page }) => {
    test.setTimeout(180_000);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/assets/ornaments/foliate_capital.glb', async route => {
        await held;
        await route.continue();
    });
    try {
        await page.goto('/?coreTests=0', { waitUntil: 'commit' });
        await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome');
        await expect(page.getByRole('status', { name: 'Startup status' })).toHaveText('Loading city assets…');
        await page.getByRole('button', { name: 'Press Start', exact: true }).click();
        expect(await page.evaluate(() => window.__busSim.sm.currentName)).toBe('welcome');
        const frames = await page.evaluate(async () => {
            let count = 0;
            const remove = window.__busSim.engine.addFrameListener(() => count++);
            for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame);
            remove();
            return count;
        });
        expect(frames).toBeGreaterThan(0);
        release();
        await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, { timeout: 30_000 });
        expect(await page.evaluate(async () => {
            const { getPortalOrnamentTemplate } = await import('/src/graphics/assets3d/generators/building_fabrication/PortalOrnamentParts.js');
            return !!getPortalOrnamentTemplate('foliate_capital');
        })).toBe(true);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__busSim.sm.currentName === 'game_mode', null, { timeout: 90_000 });
        await page.waitForFunction(() => window.__busSim.engine.renderer.info.render.calls > 100);
        await page.screenshot({ path: 'tests/artifacts/screens/startup_core_tests/gameplay.png' });
        expect(errors).toEqual([]);
    } finally {
        release();
    }
});

for (const failure of ['http', 'timeout']) test(`An ornament ${failure} failure gives an actionable retry without dropping geometry`, async ({ page }) => {
    test.setTimeout(180_000);
    let requests = 0;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/assets/ornaments/foliate_capital.glb', async route => {
        requests++;
        if (requests === 1 && failure === 'timeout') {
            await held;
            await route.abort();
            return;
        }
        return requests === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue();
    });
    try {
        await page.goto('/?coreTests=0', { waitUntil: 'commit' });
        // Time the asset failure separately from loading the application's modules.
        await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 90_000 });
        const status = page.getByRole('status', { name: 'Startup status' });
        await expect(status).toHaveText('City assets could not load. Press Start to retry.', { timeout: 40_000 });
        if (failure === 'timeout') await expect(status).toHaveAttribute('title', /timed out after 30000 ms/);
        expect(await page.evaluate(() => window.__busSim.sm.currentName)).toBe('welcome');
        release();
        await page.getByRole('button', { name: 'Retry Start', exact: true }).click();
        await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, { timeout: 30_000 });
        expect(requests).toBe(2);
    } finally {
        release();
    }
});
