// Headless browser tests: Gameplay IBL + background toggles should affect scene state.
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

function rowByLabel(page, label) {
    return page.locator('.options-row', {
        has: page.locator('.options-row-label', { hasText: label })
    });
}

async function setToggle(page, label, desired) {
    await page.evaluate(({ label, desired }) => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((el) => el.querySelector('.options-row-label')?.textContent?.trim() === label);
        const toggle = row?.querySelector('input[type="checkbox"]') ?? null;
        if (!toggle) throw new Error(`Missing toggle: ${label}`);
        const next = !!desired;
        if (toggle.checked === next) return;
        toggle.checked = next;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }, { label, desired: !!desired });
}

async function setNumber(page, label, value) {
    const input = rowByLabel(page, label).locator('input[type="number"]');
    await expect(input).toHaveCount(1);
    await input.fill(String(value));
}

test('Gameplay: enabling IBL + background updates IBL status', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 960, height: 540 });

    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Enter');

    await page.waitForSelector('#ui-select:not(.hidden)');
    await page.keyboard.press('G');
    await page.waitForSelector('#hud-game:not(.hidden)');

    await page.keyboard.press('0');
    await page.waitForSelector('#ui-options');

    await setToggle(page, 'IBL enabled', true);
    await setToggle(page, 'HDR background', true);
    await setNumber(page, 'IBL intensity (envMapIntensity)', 1.5);

    const envRow = rowByLabel(page, 'Env map').locator('div').last();
    const envIsTextureRow = rowByLabel(page, 'Env isTexture').locator('div').last();
    const envMappingRow = rowByLabel(page, 'Env mapping').locator('div').last();
    const sceneEnvRow = rowByLabel(page, 'Scene.environment').locator('div').last();
    const sceneBgRow = rowByLabel(page, 'Scene.background').locator('div').last();
    const matchRow = rowByLabel(page, 'Env matches loaded').locator('div').last();

    await expect(envRow).toHaveText(/Loaded/, { timeout: 30_000 });
    await expect(envIsTextureRow).toHaveText('Yes');
    await expect(envMappingRow).toHaveText('CubeUV');
    await expect(sceneEnvRow).toHaveText('Set');
    await expect(sceneBgRow).toHaveText('HDR');
    await expect(matchRow).toHaveText('Yes');

    await setToggle(page, 'IBL enabled', false);

    await expect(envRow).toHaveText('Disabled', { timeout: 15_000 });
    await expect(sceneEnvRow).toHaveText('Null');
    await expect(sceneBgRow).toHaveText('HDR');

    expect(await getErrors()).toEqual([]);
});
