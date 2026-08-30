// Headless browser workflow: AI 520 per-floor silhouette Draw transaction.
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

const configJson = (page) => page.evaluate(() => JSON.stringify(
    window.__busSim?.sm?.current?.view?._currentConfig ?? null
));

const popupDocument = (page) => page.evaluate(() => (
    window.__busSim?.sm?.current?.view?._silhouettePopup?.getWorkingDocument?.() ?? null
));

async function selectPopupRun(page, runId) {
    const point = await page.evaluate((id) => {
        const popup = window.__busSim?.sm?.current?.view?._silhouettePopup;
        const documentValue = popup?.getWorkingDocument?.();
        const loop = documentValue?.loop ?? [];
        const index = loop.findIndex((entry) => entry?.runId === id);
        if (!popup || index < 0) return null;
        const a = loop[index];
        const b = loop[(index + 1) % loop.length];
        const screen = popup._worldToCanvas({ x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 });
        const rect = popup.canvas.getBoundingClientRect();
        return { x: rect.left + screen.x, y: rect.top + screen.y };
    }, runId);
    expect(point).not.toBeNull();
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('[data-role="silhouette:selection-summary"]')).toContainText(`Face ${runId}`);
}

async function detachAndSplitFace(page, { exerciseHistory = false, curveRun = false } = {}) {
    await page.locator('[data-action="silhouette:detach"]').click();
    await selectPopupRun(page, 'A');
    await page.locator('[data-action="silhouette:split"]').click();
    await expect.poll(async () => (await popupDocument(page))?.loop?.length).toBe(5);
    const firstSplit = await popupDocument(page);
    const insertedRunId = firstSplit.loop.map((entry) => entry.runId).find((id) => !['A', 'B', 'C', 'D'].includes(id));
    expect(insertedRunId).toBe('E');

    if (exerciseHistory) {
        await page.locator('[data-action="silhouette:undo"]').click();
        await expect.poll(async () => (await popupDocument(page))?.loop?.length).toBe(4);
        await page.locator('[data-action="silhouette:redo"]').click();
        await expect.poll(async () => (await popupDocument(page))?.loop?.length).toBe(5);
        expect((await popupDocument(page)).loop.some((entry) => entry.runId === insertedRunId)).toBe(true);
    }

    if (curveRun) {
        await selectPopupRun(page, 'B');
        await page.locator('[data-role="silhouette:run-shape"]').selectOption('curved');
        await expect.poll(async () => Number(
            (await popupDocument(page))?.loop?.find((entry) => entry.runId === 'B')?.arc?.bulge ?? 0
        )).toBeLessThan(0);
    }
    await expect(page.locator('[data-role="silhouette:validation-summary"]')).toHaveText('Silhouette is valid');
    await expect(page.locator('[data-action="silhouette:apply"]')).toBeEnabled();
    return firstSplit;
}

test('BF2: Draw authors one atomic, cancel-safe per-floor silhouette with stable history', async ({ page }) => {
    test.setTimeout(300_000);
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?screen=building_fabrication2&ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#building-fab2-hud');
    await page.getByRole('button', { name: 'Create Building' }).click();
    await page.getByRole('button', { name: '+ Floor' }).click();

    const floors = page.locator('.building-fab2-layer-group.is-floor');
    await expect(floors).toHaveCount(2);
    const lower = floors.nth(0);
    const upper = floors.nth(1);
    const baseline = await configJson(page);

    await lower.locator('[data-action="silhouette:draw"]').click();
    await expect(page.locator('[data-role="silhouette-popup"]')).toBeVisible();
    await expect(page.locator('[data-role="silhouette:source-status"]')).toContainText('Building default');
    await expect(page.locator('[data-role="silhouette:source"] option[value="inherit_previous"]')).toBeDisabled();
    await detachAndSplitFace(page);
    expect(await configJson(page)).toBe(baseline);

    const cancelledDocument = await popupDocument(page);
    await page.locator('[data-action="silhouette:cancel"]').click();
    await expect(page.locator('[data-role="silhouette-popup"]')).toBeHidden();
    expect(await configJson(page)).toBe(baseline);

    await lower.locator('[data-action="silhouette:draw"]').click();
    await detachAndSplitFace(page, { exerciseHistory: true, curveRun: true });
    const reappliedDocument = await popupDocument(page);
    expect(reappliedDocument.loop.map((entry) => entry.runId)).toEqual(
        cancelledDocument.loop.map((entry) => entry.runId)
    );
    expect(reappliedDocument.loop.map((entry) => entry.cornerId)).toEqual(
        cancelledDocument.loop.map((entry) => entry.cornerId)
    );
    await page.locator('[data-action="silhouette:apply"]').click();
    await expect(page.locator('[data-role="silhouette-popup"]')).toBeHidden();

    const applied = await configJson(page);
    expect(applied).not.toBe(baseline);
    await expect(lower.locator('[data-role="silhouette:source"]')).toHaveText('Detached');
    await expect(upper.locator('[data-role="silhouette:source"]')).toHaveText('Default');
    await expect(lower.locator('.building-fab2-face-btn')).toHaveCount(5);
    await expect(upper.locator('.building-fab2-face-btn')).toHaveCount(4);
    await expect(lower.locator('canvas.building-fab2-face-plan')).toHaveAttribute('data-curved-face-ids', 'B');
    const runtimeWallKinds = await page.evaluate(() => {
        const meshes = window.__busSim?.sm?.current?.view?.scene?._building?.solidGroup?.children ?? [];
        return meshes
            .filter((mesh) => mesh?.userData?.buildingFab2Role === 'wall')
            .map((mesh) => mesh.userData.buildingFab2WallKind ?? 'legacy');
    });
    expect(runtimeWallKinds).toContain('facade');

    await page.keyboard.press('Control+z');
    await expect.poll(() => configJson(page)).toBe(baseline);
    await page.keyboard.press('Control+y');
    await expect.poll(() => configJson(page)).toBe(applied);
    expect(await getErrors()).toEqual([]);
});
