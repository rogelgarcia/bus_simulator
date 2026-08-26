// BF2 GUI regression (AI 492): boots the editor, creates a building and drives
// the roof layer's Rooftop props section — enable toggle, prop-type thumbnails,
// density/margin fields — then confirms the toggle actually puts prop geometry
// into the scene.
import { test, expect } from '@playwright/test';

test('BF2: rooftop props section toggles prop geometry on the roof layer', async ({ page }) => {
    test.setTimeout(180_000);
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
        if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__busSim?.sm?.current, null, { timeout: 60_000 });
    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)', { timeout: 30_000 });
    await page.keyboard.press('4');
    await page.waitForSelector('#building-fab2-hud', { timeout: 30_000 });
    await page.locator('.building-fab2-create-btn').click();

    // A fresh building starts with one floor layer; the roof layer is added here.
    await page.locator('button', { hasText: '+ Roof' }).first().click();

    const roofLayer = page.locator('.building-fab2-layer-group.is-roof').first();
    await expect(roofLayer).toBeVisible();
    await roofLayer.scrollIntoViewIfNeeded();
    const roofBody = roofLayer.locator('.building-fab2-layer-body').first();
    if (await roofBody.evaluate((el) => el.classList.contains('hidden'))) {
        await roofLayer.locator('.building-fab2-layer-summary').first().click();
    }

    const propsToggle = roofLayer.locator('.building-fab-toggle', { hasText: 'Rooftop props' }).first();
    await expect(propsToggle).toBeVisible();
    await expect(propsToggle.locator('input[type="checkbox"]')).not.toBeChecked();

    const countPropMeshes = () => page.evaluate(() => {
        const scene = window.__busSim?.engine?.scene ?? null;
        let count = 0;
        scene?.traverse?.((obj) => {
            if (obj?.userData?.buildingFab2Role === 'rooftop_prop') count += 1;
        });
        return count;
    });

    expect(await countPropMeshes()).toBe(0);

    await propsToggle.locator('input[type="checkbox"]').check();

    // Enabling seeds the whole prop set, so every material role shows up.
    await expect.poll(countPropMeshes, { timeout: 30_000 }).toBeGreaterThan(0);

    for (const label of ['Water tower', 'Bulkhead', 'Mech box', 'Vent pipe']) {
        await expect(roofLayer.locator('button', { hasText: label }).first()).toBeVisible();
    }
    for (const label of ['Density', 'Edge margin', 'Min spacing', 'Seed offset']) {
        await expect(roofLayer.locator('.building-fab-row-label', { hasText: label }).first()).toBeVisible();
    }

    // Thumbnails are rendered lazily by the View; one per prop type.
    await expect
        .poll(async () => roofLayer.locator('button img').count(), { timeout: 60_000 })
        .toBe(4);

    // Turning every prop type but the water tower off drops the other roles.
    for (const label of ['Bulkhead', 'Mech box', 'Vent pipe']) {
        await roofLayer.locator('button', { hasText: label }).first().click();
    }
    await expect
        .poll(() => page.evaluate(() => {
            const scene = window.__busSim?.engine?.scene ?? null;
            const roles = new Set();
            scene?.traverse?.((obj) => {
                if (obj?.userData?.buildingFab2Role === 'rooftop_prop') roles.add(obj.userData.rooftopPropMaterialRole);
            });
            return Array.from(roles).sort().join(',');
        }), { timeout: 30_000 })
        .toBe('frame,tank');

    await propsToggle.locator('input[type="checkbox"]').uncheck();
    await expect.poll(countPropMeshes, { timeout: 30_000 }).toBe(0);

    const relevantErrors = consoleErrors.filter((e) => !e.includes('favicon'));
    expect(relevantErrors, `console errors: ${relevantErrors.join(' || ')} :: failed requests: ${failedRequests.join(' || ')}`).toEqual([]);
});
