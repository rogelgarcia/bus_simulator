// Headless browser tests: BF2 curved footprint-face picker and authoring controls.
import test, { expect } from '@playwright/test';

async function attachFailFastConsole({ page }) {
    const errors = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (event) => {
            window.__e2eErrors.push(event?.reason?.message ?? String(event?.reason ?? 'unhandledrejection'));
        });
    });
    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('ResizeObserver loop limit exceeded')) errors.push(message.text());
    });
    return async () => [
        ...errors,
        ...(await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []))
    ];
}

const readFaceBArc = (page) => page.evaluate(() => {
    const loop = window.__busSim?.sm?.current?.view?._currentConfig?.footprintLoops?.[0] ?? [];
    return loop.find((point) => point?.runId === 'B')?.arc ?? null;
});

test('BF2: curved faces draw curved in the picker and expose face-shape controls', async ({ page }) => {
    test.setTimeout(300_000);
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?config=burban&ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.waitForFunction(() => !!window.__busSim?.sm?.current, null, { timeout: 60_000 });
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');
    await page.waitForSelector('#building-fab2-hud');

    const floor = page.locator('.building-fab2-layer-group.is-floor').first();
    const plan = floor.locator('canvas.building-fab2-face-plan');
    await expect(plan).toHaveAttribute('data-curved-face-ids', 'F,B');
    await expect(plan).toHaveAttribute('aria-label', /Curved faces: F, B/);

    await floor.locator('.building-fab2-face-btn[data-face-id="B"]').click();
    const section = floor.locator('.building-fab2-face-curve-section[data-face-id="B"]');
    await expect(section).toBeVisible();
    await expect(section.locator('[data-role="faceCurve:shape"][data-value="curved"]')).toHaveClass(/is-active/);
    await expect(section.locator('[data-role="faceCurve:direction"][data-value="outward"]')).toHaveClass(/is-active/);
    await expect(section.locator('input[data-role="faceCurve:sweep"][type="number"]')).toHaveValue('90');

    await section.locator('[data-role="faceCurve:shape"][data-value="straight"]').click();
    await expect.poll(() => readFaceBArc(page)).toBeNull();
    await expect(plan).toHaveAttribute('data-curved-face-ids', 'F');

    await floor.locator('.building-fab2-face-curve-section[data-face-id="B"] [data-role="faceCurve:shape"][data-value="curved"]').click();
    await expect.poll(async () => Number((await readFaceBArc(page))?.bulge ?? 0)).toBeGreaterThan(0);
    await expect(plan).toHaveAttribute('data-curved-face-ids', 'F,B');

    const sweep = floor.locator('.building-fab2-face-curve-section[data-face-id="B"] input[data-role="faceCurve:sweep"][type="number"]');
    await sweep.fill('60');
    await sweep.dispatchEvent('change');
    await expect.poll(async () => Number((await readFaceBArc(page))?.bulge ?? 0)).toBeCloseTo(Math.tan(Math.PI / 12), 5);

    await floor.locator('.building-fab2-face-curve-section[data-face-id="B"] [data-role="faceCurve:direction"][data-value="inward"]').click();
    await expect.poll(async () => Number((await readFaceBArc(page))?.bulge ?? 0)).toBeLessThan(0);
    expect(await getErrors()).toEqual([]);
});
