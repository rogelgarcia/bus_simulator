// Headless browser tests: BF2 ruler tool.
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

test('BF2: ruler tool toggles + measures distance', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');

    const rulerBtn = page.locator('button[aria-label="Ruler"]');
    await expect(rulerBtn).toBeVisible();

    const rulerLabel = page.locator('.building-fab2-ruler-label');
    await expect(rulerLabel).toBeHidden();

    await rulerBtn.click();
    await expect(rulerBtn).toHaveClass(/is-active/);

    const canvas = page.locator('#game-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const leftOverlayBox = await page.locator('.building-fab2-left-stack').boundingBox();
    const rightOverlayBox = await page.locator('.building-fab2-right-dock').boundingBox();
    const viewportX0 = box?.x ?? 0;
    const viewportX1 = viewportX0 + (box?.width ?? 0);
    const safeX0 = Math.max(viewportX0, leftOverlayBox ? leftOverlayBox.x + leftOverlayBox.width + 20 : viewportX0);
    const safeX1 = Math.min(viewportX1, rightOverlayBox ? rightOverlayBox.x - 20 : viewportX1);
    expect(safeX1).toBeGreaterThan(safeX0);

    const ax = safeX0 + (safeX1 - safeX0) * 0.45;
    const bx = safeX0 + (safeX1 - safeX0) * 0.65;
    const ay = (box?.y ?? 0) + (box?.height ?? 0) * 0.5;
    const by = ay;

    await page.mouse.click(ax, ay);
    await page.mouse.move(bx, by);

    await expect(rulerLabel).toBeVisible();
    const previewText = await rulerLabel.innerText();
    expect(previewText).toMatch(/m$/);

    await page.mouse.click(bx, by);
    const fixedText = await rulerLabel.innerText();
    expect(fixedText).toMatch(/m$/);

    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) * 0.8, (box?.y ?? 0) + (box?.height ?? 0) * 0.6);
    await expect.poll(async () => await rulerLabel.innerText(), { timeout: 1_000 }).toBe(fixedText);

    await rulerBtn.click();
    await expect(rulerBtn).not.toHaveClass(/is-active/);
    await expect(rulerLabel).toBeHidden();

    expect(await getErrors()).toEqual([]);
});
