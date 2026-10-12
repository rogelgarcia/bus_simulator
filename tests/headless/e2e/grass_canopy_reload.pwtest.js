// A fresh entrypoint must not reuse the pre-canopy blend module from browser cache.
import test, { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    ...(process.platform === 'win32' ? { launchOptions: { args: ['--use-angle=d3d11'] } } : {}) });

test('grass entrypoints load matching canopy dependencies after an update', async ({ page }) => {
    test.setTimeout(240000);
    const errors = [], staleRequests = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(new URL(request.url()).pathname + new URL(request.url()).search));
    const oldBlend = execFileSync('git', ['show', '28578dd92049fd4c651cb56513349a97079b7cbf:src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionBlend.js'], { encoding: 'utf8' });
    await page.route('**/GrassDebugV2TransitionBlend.js*', async route => {
        if (new URL(route.request().url()).searchParams.get('v') === 'canopy-palette-17') return route.continue();
        staleRequests.push(route.request().url());
        await route.fulfill({ contentType: 'application/javascript', body: oldBlend });
    });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=baked&revision=canopy-palette-17');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await expect(page.locator('#grass-fade')).toBeEnabled();
    await expect(page.locator('#grass-fade')).toHaveValue('canopy');
    await expect(page.locator('#scene-status')).toBeHidden();
    expect(await page.evaluate(() => window.__grassDebugV2.getSnapshot().grass.field.fadeStyle)).toBe('canopy');
    await page.selectOption('#grass-fade', 'dissolve');
    await page.selectOption('#grass-fade', 'canopy');
    const output = 'tests/artifacts/screens/grass_debug_v2/canopy_reload';
    await mkdir(output, { recursive: true });
    await page.locator('#game-canvas').screenshot({ path: `${output}/bus.png` });
    await page.locator('[data-grass-strategy="current"]').click();
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await expect(page.locator('#grass-fade')).toHaveValue('dissolve');
    await expect(page.locator('#grass-fade option[value="canopy"]')).toHaveJSProperty('disabled', true);
    await page.goto('/debug_tools/grass_baked_lighting_scene.html?appearance=detailed&shelter=0&strategy=baked');
    await page.waitForFunction(() => !!window.__grassBakedReadiness);
    await page.evaluate(() => window.__grassBakedReadiness);
    await expect(page.locator('#scene-loading')).toBeHidden();
    for (const name of ['GrassDebugV2TransitionFields.js', 'GrassDebugV2TransitionSelection.js', 'GrassDebugV2BakedLightingAssets.js',
        'GrassDebugV2FarTexture.js', 'GrassBakedAppearanceShaderLoader.js', 'GrassTransitionBlendShaderLoader.js',
        'grass_baked_appearance.vert.glsl', 'grass_transition_blend.frag.glsl', 'baked_canopy.glsl']) {
        expect(requests.filter(url => url.includes('/' + name))).toEqual(expect.arrayContaining([expect.stringContaining(name + '?v=canopy-palette-17')]));
    }
    expect(staleRequests).toEqual([]);
    expect(errors).toEqual([]);
});
