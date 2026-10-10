// Require cached-shadow specialization to preserve the live canopy's displayed image.
import { readFile } from 'node:fs/promises';
export async function captureGrassCachedShadowComparison(page, output, pose) {
    await page.evaluate(() => { const view = window.__grassCoverageView; view.grass.setMode('LOD5'); view.lighting.render(0); });
    const current = await page.locator('[data-study-canvas]').screenshot({ path: `${output}/${pose}-LOD5.png` });
    // A pre-change reference also catches errors in the separate external-shadow capture.
    const before = process.env.GRASS_SHADOW_REFERENCE
        ? await readFile(`${process.env.GRASS_SHADOW_REFERENCE}/${pose}-LOD5.png`) : current;
    await page.evaluate(async () => {
        const { createGrassDebugV2CanopyDiagnostic } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyDiagnostics.js');
        const cache = new Map(); window.__grassShadowComparisonCache = cache;
        window.__grassCoverageFields.setMaterialTransform(source => {
            if (!cache.has(source)) cache.set(source, createGrassDebugV2CanopyDiagnostic(source, 'cached_visibility'));
            return cache.get(source).material;
        });
        const view = window.__grassCoverageView; await view.renderer.compileAsync(view.scene, view.camera); view.lighting.render(0);
    });
    const after = await page.locator('[data-study-canvas]').screenshot({ path: `${output}/${pose}-LOD5-cached.png` });
    const comparison = await page.evaluate(async ({ before, after }) => {
        const read = async data => {
            const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const a = await read(before), b = await read(after); let sum = 0, max = 0;
        for (let i = 0; i < a.length; i++) if (i % 4 !== 3) { const delta = Math.abs(a[i] - b[i]); sum += delta; max = Math.max(max, delta); }
        window.__grassCoverageFields.setMaterialTransform(source => source);
        for (const value of window.__grassShadowComparisonCache.values()) value.dispose();
        return { meanRgbError: sum / (a.length * .75), maxChannelError: max };
    }, { before: before.toString('base64'), after: after.toString('base64') });
    return { pose, ...comparison };
}
