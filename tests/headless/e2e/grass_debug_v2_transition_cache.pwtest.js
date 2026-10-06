// An already-open browser can retain the floor module from before its uniform became public.
import test, { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined } });

test('Transition entry loads the matching material contract despite an older cached module', async ({ page }) => {
    test.setTimeout(90000);
    const source = await readFile('src/graphics/gui/grass_debugger_v2/GrassDebugV2FloorMaterial.js', 'utf8');
    const previous = source.replace('    material.userData.grassFloorLeafColorScale = uniforms.grassFloorLeafColorScale;', '');
    expect(previous).not.toBe(source);
    const errors = [], modules = []; let oldRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/GrassDebugV2FloorMaterial.js')) modules.push(request.url()); });
    await page.route('**/GrassDebugV2FloorMaterial.js', async route => {
        oldRequests++; await route.fulfill({ contentType: 'text/javascript', body: previous });
    });
    await page.goto('/debug_tools/grass_transition_scene.html?revision=transition-lighting-1#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness);
    const result = await page.evaluate(() => window.__grassTransitionReadiness.then(() => {
        const s = window.__grassTransitionScene; s.setAnimating(false);
        const colors = Object.values(s.canopy.materials).map(m => m.userData.grassFloorLeafColorScale.value.toArray());
        return { loaded: true, colors, edgeStrips: s.fields.getSnapshot().edgeStrips };
    }).catch(error => ({ loaded: false, stack: error.stack })));
    expect(result, result.stack).toMatchObject({ loaded: true, edgeStrips: true });
    expect(oldRequests).toBe(0); expect(modules.length).toBeGreaterThan(0);
    expect(result.colors.every(color => color.join(',') === '1.03,1,1.4')).toBe(true);
    await expect(page.locator('#scene-loading')).toBeHidden();
    await expect(page.locator('#transition-panel-toggle')).toBeEnabled();
    expect(errors).toEqual([]);
});

test('Transition blend bypasses the cached registry from before rendered variants existed', async ({ page }) => {
    test.setTimeout(90000);
    const source = await readFile('src/graphics/shaders/core/MaterialShaderHookRegistry.js', 'utf8');
    const previous = source.slice(0, source.indexOf('/** Create a rendered variant'));
    expect(previous.length).toBeGreaterThan(1000); expect(previous).not.toBe(source);
    const errors = [], modules = []; let oldRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/MaterialShaderHookRegistry.js')) modules.push(request.url()); });
    await page.route('**/MaterialShaderHookRegistry.js', async route => {
        oldRequests++; await route.fulfill({ contentType: 'text/javascript', body: previous });
    });
    await page.goto('/debug_tools/grass_transition_scene.html?revision=transition-blend-1#front');
    await expect.poll(() => errors, { timeout: 1000 }).toEqual([]);
    await expect(page.locator('#scene-loading')).toBeHidden({ timeout: 30000 });
    expect(oldRequests).toBe(0);
    expect(new Set(modules).size).toBe(1); // Every shader owner must use the same registry instance.
    const state = await page.evaluate(() => {
        const s = window.__grassTransitionScene; s.setAnimating(false); s.step(); return s.getSnapshot();
    });
    expect(state.fields.blendCandidateCells).toBeGreaterThan(0);
    expect(state.glError).toBe(0); expect(errors).toEqual([]);
});

test('Transition startup displays a module-link failure instead of leaving the loading message forever', async ({ page }) => {
    await page.route('**/GrassDebugV2TransitionScene.js*', route => route.fulfill({
        contentType: 'text/javascript', body: 'import { missingExport } from "./transition_missing_export_fixture.js";'
    }));
    await page.route('**/transition_missing_export_fixture.js', route => route.fulfill({
        contentType: 'text/javascript', body: 'export const differentExport = true;'
    }));
    await page.goto('/debug_tools/grass_transition_scene.html?revision=transition-blend-1#front');
    await expect(page.locator('#scene-loading')).toHaveText(/Unable to load transition lab.*missingExport/);
    await expect(page.locator('#scene-loading')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#transition-panel-toggle')).toBeDisabled();
    const error = await page.evaluate(() => window.__grassTransitionReadiness.then(() => null, error => error.message));
    expect(error).toContain('missingExport');
});
