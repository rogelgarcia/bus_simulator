// Headless browser tests: changing asphalt/markings noise options should not break shader compilation.
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

async function clickTab(page, text) {
    const btn = page.locator('.options-tab', { hasText: text });
    await expect(btn).toHaveCount(1);
    await btn.click();
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
    const input = page.locator('.options-row', {
        has: page.locator('.options-row-label', { hasText: label })
    }).locator('input[type="number"]');
    await expect(input).toHaveCount(1);
    await input.fill(String(value));
}

test('Gameplay: changing markings noise does not produce shader errors', async ({ page }) => {
    test.setTimeout(120_000);
    const getErrors = await attachFailFastConsole({ page });
    await page.setViewportSize({ width: 960, height: 540 });

    await page.goto('/index.html?coreTests=0');
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Enter');

    await page.waitForSelector('#ui-select:not(.hidden)');
    await page.keyboard.press('G');
    await page.waitForSelector('#hud-game:not(.hidden)');

    await page.keyboard.press('0');
    await page.waitForSelector('#ui-options');

    await clickTab(page, 'Asphalt');

    await setToggle(page, 'Apply asphalt noise to markings', true);
    await setNumber(page, 'Markings noise color strength', 0.12);
    await setNumber(page, 'Markings noise color strength', 0.18);
    await setNumber(page, 'Markings noise roughness strength', 0.10);
    await setNumber(page, 'Markings noise roughness strength', 0.16);
    await setToggle(page, 'Debug: show markings noise', true);
    await setToggle(page, 'Debug: show markings noise', false);

    await page.waitForTimeout(500);
    expect(await getErrors()).toEqual([]);
});

