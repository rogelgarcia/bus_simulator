// Guard against shadow-map stripes on clear leaves while retaining cast shade.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });
test('Wide-field leaf shadows remain smooth and still receive the shade screen', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html#06_closeup');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { display:none }' });
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/leaf_banding');
    await mkdir(folder, { recursive: true });
    const configuredBias = await page.evaluate(() => {
        const s = window.__grassLitterScene;
        s.camera.fov = 15; s.camera.updateProjectionMatrix();
        const mesh = s.scene.getObjectByName('Offline_96000_Leaves').children[0];
        const canvas = document.createElement('canvas');
        canvas.width = s.renderer.domElement.width; canvas.height = s.renderer.domElement.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        window.__banding = { mesh, configuredBias: s.lighting.sun.shadow.bias, samples: {}, capture() {
            s.lighting.render(0); context.drawImage(s.renderer.domElement, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
        } };
        return s.lighting.sun.shadow.bias;
    });
    expect(configuredBias).toBe(-0.0002);
    for (const variant of ['before', 'after', 'unshadowed_reference']) {
        await page.evaluate(variant => {
            const s = window.__grassLitterScene, b = window.__banding;
            b.mesh.receiveShadow = variant !== 'unshadowed_reference';
            s.lighting.sun.shadow.bias = variant === 'before' ? -0.00008 : b.configuredBias;
            b.samples[variant] = b.capture();
        }, variant);
        await page.screenshot({ path: path.join(folder, variant + '.png') });
    }
    const stripes = await page.evaluate(() => {
        const { samples } = window.__banding;
        let before = 0, after = 0, count = 0;
        for (let y = 300; y < 800; y += 2) for (let x = 1320; x < 1430; x += 2) {
            const index = (y * 1600 + x) * 4 + 1;
            before += Math.abs(samples.before[index] - samples.unshadowed_reference[index]);
            after += Math.abs(samples.after[index] - samples.unshadowed_reference[index]); count++;
        }
        return { beforeMeanError: before / count, afterMeanError: after / count, samples: count };
    });
    expect(stripes.beforeMeanError).toBeGreaterThan(2);
    expect(stripes.afterMeanError).toBeLessThan(0.5);
    expect(stripes.afterMeanError).toBeLessThan(stripes.beforeMeanError * 0.15);
    await page.evaluate(() => window.__grassLitterScene.setView(7));
    for (const variant of ['shade_on', 'shade_off_reference']) {
        await page.evaluate(variant => {
            const b = window.__banding; b.mesh.receiveShadow = variant === 'shade_on';
            b.samples[variant] = b.capture();
        }, variant);
        await page.screenshot({ path: path.join(folder, variant + '.png') });
    }
    const shade = await page.evaluate(() => {
        const { samples, mesh } = window.__banding;
        let difference = 0, maximum = 0, count = 0;
        for (let y = 300; y < 750; y += 2) for (let x = 350; x < 1250; x += 2) {
            const index = (y * 1600 + x) * 4, clear = samples.shade_off_reference;
            if (clear[index + 1] < clear[index] * 1.05) continue;
            const delta = clear[index + 1] - samples.shade_on[index + 1];
            difference += delta; maximum = Math.max(maximum, delta); count++;
        }
        mesh.receiveShadow = true;
        return { meanGreenDifference: difference / count, maximum, samples: count, castsShadow: mesh.castShadow };
    });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ configuredBias, stripes, shade }, null, 2));
    expect(shade.samples).toBeGreaterThan(1000);
    expect(shade.meanGreenDifference).toBeGreaterThan(5);
    expect(shade.maximum).toBeGreaterThan(25);
    expect(shade.castsShadow).toBe(true);
    expect(errors).toEqual([]);
});
