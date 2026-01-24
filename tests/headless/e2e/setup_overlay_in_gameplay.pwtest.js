// Headless browser tests: setup overlay in gameplay should not hide the canvas.
import test, { expect } from '@playwright/test';

async function attachFailFastConsole({ page }) {
    const errors = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
            const msg = e?.reason?.message ?? String(e?.reason ?? 'unhandledrejection');
            window.__e2eErrors.push({ kind: 'unhandledrejection', message: msg });
        });
    });
    page.on('pageerror', (err) => {
        errors.push({ kind: 'pageerror', message: err?.message ?? String(err) });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;
        errors.push({ kind: 'console.error', message: text });
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        errors.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        const status = res.status();
        if (status < 400) return;
        errors.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...errors, ...fromPage];
    };
}

test('UI: Setup overlay opens during gameplay without hiding canvas', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Enter');

    await page.waitForSelector('#ui-select:not(.hidden)');
    await page.keyboard.press('G');

    await page.waitForSelector('#hud-game:not(.hidden)');

    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup.is-overlay:not(.hidden)');

    const canvasState = await page.evaluate(() => {
        const canvas = document.getElementById('game-canvas');
        const opacity = canvas ? Number.parseFloat(getComputedStyle(canvas).opacity) : null;
        return {
            hasSetupBg: document.body.classList.contains('setup-bg'),
            opacity
        };
    });
    expect(canvasState.hasSetupBg).toBe(false);
    expect(canvasState.opacity).not.toBeNull();
    expect(canvasState.opacity).toBeGreaterThan(0.5);

    await page.click('#setup-collapse');
    await page.waitForSelector('#ui-setup.is-collapsed');
    await page.click('#setup-collapse');
    await page.waitForSelector('#ui-setup.is-overlay:not(.is-collapsed)');

    await page.keyboard.press('Escape');
    await page.waitForSelector('#ui-setup.hidden');
    await page.waitForSelector('#hud-game:not(.hidden)');

    expect(await getErrors()).toEqual([]);
});

