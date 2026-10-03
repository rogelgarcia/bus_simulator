// Reproduce litter/soil depth fighting along the grounded contour from moving camera poses.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1, video: 'off' });
test('Grounded litter contour remains stable over soil while the camera moves', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?litter=alpha#06_closeup');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { display:none }' });
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/litter_edge_flicker');
    await mkdir(folder, { recursive: true });
    await page.evaluate(() => {
        const s = window.__grassLitterScene;
        const litter = s.scene.getObjectByName('GrassV2DryLitterSubstrate'), ground = [], original = [];
        let root = s.scene.getObjectByName('Offline_96000_Leaves');
        while (root.parent !== s.scene) root = root.parent;
        root.traverse(mesh => {
            if (!mesh.isMesh) return;
            original.push({ mesh, visible: mesh.visible, receiveShadow: mesh.receiveShadow });
            if (mesh.material.name === 'Brown Earth') ground.push(mesh);
            else if (!mesh.material.name.startsWith('DryLitter')) mesh.visible = false;
            mesh.receiveShadow = false;
        });
        const canvas = document.createElement('canvas');
        canvas.width = s.renderer.domElement.width; canvas.height = s.renderer.domElement.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        window.__edgeReview = { litter, ground, original, settings: litter.children.map(mesh => ({
            factor: mesh.material.polygonOffsetFactor, units: mesh.material.polygonOffsetUnits
        })), png: () => canvas.toDataURL('image/png'), capture() {
            s.lighting.render(0); context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(s.renderer.domElement, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
        } };
    });
    const results = [];
    for (let index = 0; index < 8; index++) {
        const result = await page.evaluate(index => {
            const s = window.__grassLitterScene, review = window.__edgeReview;
            const corner = index < 4, offset = index % 4 * 0.013;
            s.camera.position.set(corner ? 6.25 + offset : 6.4 + offset, 0.13 + offset, corner ? 6.25 - offset : offset);
            s.camera.up.set(0, 1, 0); s.camera.lookAt(5.93, 0, corner ? 5.93 : 0);
            s.camera.fov = 45; s.camera.near = 0.002; s.camera.updateProjectionMatrix(); s.camera.updateMatrixWorld(true);
            review.litter.children.forEach(mesh => { mesh.material.polygonOffsetFactor = 0; mesh.material.polygonOffsetUnits = -1; });
            const before = review.capture(), beforePng = review.png();
            review.litter.children.forEach((mesh, i) => {
                mesh.material.polygonOffsetFactor = review.settings[i].factor;
                mesh.material.polygonOffsetUnits = review.settings[i].units;
            });
            const after = review.capture(), afterPng = review.png();
            review.ground.forEach(mesh => { mesh.material.depthWrite = false; });
            const reference = review.capture();
            review.ground.forEach(mesh => { mesh.material.depthWrite = true; });
            const compare = pixels => {
                let difference = 0, incorrectPixels = 0, maxError = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    const error = Math.max(...[0, 1, 2].map(channel => Math.abs(pixels[i + channel] - reference[i + channel])));
                    difference += error; maxError = Math.max(maxError, error);
                    if (error > 5) incorrectPixels++;
                }
                return { meanError: difference / (pixels.length / 4), incorrectPixels, maxError };
            };
            return { pose: index, before: compare(before), after: compare(after), beforePng, afterPng };
        }, index);
        const { beforePng, afterPng, ...metrics } = result;
        if (index === 0 || index === 4) {
            await writeFile(path.join(folder, 'before_edge_' + index + '.png'), Buffer.from(beforePng.split(',')[1], 'base64'));
            await writeFile(path.join(folder, 'after_edge_' + index + '.png'), Buffer.from(afterPng.split(',')[1], 'base64'));
        }
        results.push(metrics);
    }
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify(results, null, 2));
    expect(Math.max(...results.map(result => result.before.incorrectPixels)), 'Old depth offset reproduces the flicker').toBeGreaterThan(1000);
    for (const result of results) expect(result.after.incorrectPixels, 'Depth errors at pose ' + result.pose).toBeLessThan(10);
    await page.evaluate(() => {
        const s = window.__grassLitterScene;
        for (const { mesh, visible, receiveShadow } of window.__edgeReview.original) {
            mesh.visible = visible; mesh.receiveShadow = receiveShadow;
        }
        s.setView(5); s.lighting.sun.shadow.needsUpdate = true; s.renderer.shadowMap.needsUpdate = true;
        s.lighting.render(0);
    });
    await page.screenshot({ path: path.join(folder, 'fixed_grass_edge.png') });
    expect(errors).toEqual([]);
});
