// Guard the general canopy path: the transition fast path must not remove external occluders here.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined } });

test('Field canopy still receives its cached external shadow', async ({ page }) => {
    test.setTimeout(180000); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?lod=LOD4&fields=1&revision=lod4-shadow-fast-1#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const result = await page.evaluate(async () => {
        const s = window.__grassLitterScene, THREE = await import('three');
        s.setFieldCount(1); s.setLod('LOD4'); s.setMode('all');
        s.camera.position.set(8, 9, 10); s.camera.lookAt(0, 0, 0); s.camera.updateMatrixWorld(true);
        const uniforms = s.canopy.shadowUniforms, original = uniforms.grassCanopyShadowVisibility.value;
        const target = new THREE.WebGLRenderTarget(512, 512), oldTarget = s.renderer.getRenderTarget();
        const white = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat); white.needsUpdate = true;
        const render = texture => {
            uniforms.grassCanopyShadowVisibility.value = texture; s.renderer.setRenderTarget(target); s.renderer.render(s.scene, s.camera);
            const pixels = new Uint8Array(512 * 512 * 4); s.renderer.readRenderTargetPixels(target, 0, 0, 512, 512, pixels); return pixels;
        };
        try {
            const normal = render(original), withoutExternal = render(white); let changed = 0, totalLightGain = 0;
            for (let i = 0; i < normal.length; i += 4) {
                const difference = withoutExternal[i] + withoutExternal[i + 1] + withoutExternal[i + 2] - normal[i] - normal[i + 1] - normal[i + 2];
                changed += Number(difference > 2); totalLightGain += difference;
            }
            return { changed, totalLightGain, pixels: 512 * 512,
                bakedOnly: Object.values(s.canopy.materials).some(material => !!material.defines.GRASS_CANOPY_BAKED_SHADOW_ONLY),
                pass: uniforms.grassCanopyShadowPass.value, externalSize: [original.image.width, original.image.height],
                glError: s.renderer.getContext().getError() };
        } finally { uniforms.grassCanopyShadowVisibility.value = original; s.renderer.setRenderTarget(oldTarget); target.dispose(); white.dispose(); }
    });
    const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/lod4_factors');
    await mkdir(output, { recursive: true }); await writeFile(path.join(output, 'external_shadow_validation.json'), JSON.stringify({ result, errors }, null, 2));
    expect(result.bakedOnly).toBe(false); expect(result.pass).toBe(2); expect(result.glError).toBe(0);
    expect(result.externalSize[0]).toBeGreaterThan(1); expect(result.changed).toBeGreaterThan(100);
    expect(result.totalLightGain).toBeGreaterThan(1000); expect(errors).toEqual([]);
});
