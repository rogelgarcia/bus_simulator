// Verifies the bounded coastal viewer, real pointer inspection, and shared HUD lifecycle.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve(`tests/artifacts/screens/landscape/ai576/${process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'regression'}/viewer`);

test('Landscape D1: real overview, wireframe, pointing, reload, and teardown', async ({ page }) => {
    const errors = [];
    const payloads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/assets/public/landscape/')) payloads.push(request.url()); });
    await mkdir(artifacts, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/screens/landscape_fabrication.html');
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready, null, { timeout: 60000 });
    await expect(page.locator('#ui-perf-bar')).toHaveCount(1);
    await expect(page.locator('.ui-perf-bar-fps')).not.toHaveText('FPS: -- (-- ms)');
    const initial = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(initial.memory.vertices).toBeLessThanOrEqual(257 * 257 + 4 * 256);
    expect(initial.memory.estimatedPeakBytes).toBeLessThanOrEqual(initial.memory.memoryCapBytes);
    expect(initial.sourceBytes).toBeLessThan(1024 * 1024);
    expect(payloads.length).toBe(3);
    expect(payloads.some(url => url.includes('/source/') || url.includes('/l3/'))).toBe(false);
    await page.screenshot({ path: path.join(artifacts, '01-overview.png') });

    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await page.getByRole('button', { name: 'Axes', exact: true }).click();
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).helpers).toEqual({ grid: true, axes: true });
    await page.mouse.move(780, 600);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(870, 640, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(250);
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).camera).not.toEqual(initial.camera);
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await page.getByRole('button', { name: 'Axes', exact: true }).click();

    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await page.waitForTimeout(200);
    const canvas = await page.locator('#game-canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width * .49, canvas.y + canvas.height * .54);
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection)).not.toBeNull();
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection.editingReady)).toBe(true);
    await expect(page.locator('[data-field="handoff"]')).toContainText('saved for AI');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const selected = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(selected.selection.position.x).toBeGreaterThan(0);
    expect(selected.selection.position.z).toBeLessThan(4000);
    const handoff = await (await page.request.get('/api/landscape/selection')).json();
    expect(handoff.selectionId).toBe(selected.selection.selectionId);
    expect(handoff.sourceRevision).toBe(selected.revision);

    await page.getByRole('button', { name: 'Wireframe', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().mode)).toBe('wireframe');
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).memory.overlayBytes).toBeGreaterThan(0);
    await page.mouse.click(canvas.x + canvas.width * .49, canvas.y + canvas.height * .54);
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection.selectionId)).not.toBe(selected.selection.selectionId);
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection.editingReady)).toBe(true);
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).selection.position).toEqual(selected.selection.position);
    await page.screenshot({ path: path.join(artifacts, '02-wireframe.png') });
    await page.getByRole('button', { name: 'Shaded + wire', exact: true }).click();
    const combined = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(combined.memory.overlayBytes).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Shaded', exact: true }).click();
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).memory.overlayBytes).toBe(0);
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).renderer.memory.geometries).toBe(selected.renderer.memory.geometries);
    await page.getByRole('button', { name: 'Reload source', exact: true }).click();
    await expect.poll(() => page.locator('[data-field="status"]').textContent()).toContain('Worker streaming ready');
    await expect.poll(() => page.evaluate(() => window.__landscapeTestHooks.snapshot().selection.editingReady)).toBe(true);
    const reloaded = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(reloaded.camera.position).toEqual(selected.camera.position);
    expect(reloaded.selection.position).toEqual(selected.selection.position);

    await page.getByRole('button', { name: 'Beach approach', exact: true }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(artifacts, '03-beach-approach.png') });
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(100);
    expect(await page.locator('#game-canvas').evaluate(element => element.getBoundingClientRect().top)).toBe(0);
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(100);
    expect(await page.locator('#game-canvas').evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThan(0);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(disposed.disposed).toBe(true);
    expect(disposed.memory).toBeNull();
    expect(disposed.sourceBytes).toBe(0);
    await page.waitForTimeout(150);
    expect((await page.evaluate(() => window.__landscapeTestHooks.snapshot())).frameIndex).toBe(disposed.frameIndex);
    expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ initial, selected, combined, disposed, payloads, errors }, null, 2));
});

test('Landscape D1: bad update retains last valid terrain and camera', async ({ page }) => {
    await page.goto('/screens/landscape_fabrication.html');
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready);
    const before = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    await page.route('**/assets/public/landscape/coastal-city/manifest.json', route => route.fulfill({ contentType: 'application/json', body: '{"format":"wrong"}' }));
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    await expect(page.locator('[data-field="notice"]')).toContainText('last valid');
    const after = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
    expect(after.revision).toBe(before.revision);
    expect(after.camera).toEqual(before.camera);
    expect(after.ready).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
});
