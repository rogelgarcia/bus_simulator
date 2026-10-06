// Compare the wide-card bridge with both neighbours from identical bus views.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { measureGrassCardCoverage } from '../grass_view_cards_metrics.mjs';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/wide_cards');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Wide cards bridge the bus view without recaptures during motion', async ({ page }) => {
    test.setTimeout(360000); await mkdir(output, { recursive: true });
    const errors = [], rows = [], full = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    async function ready() {
        await page.waitForFunction(() => !!window.__grassTransitionReadiness);
        await page.evaluate(() => window.__grassTransitionReadiness);
        await page.evaluate(() => { const s = window.__grassTransitionScene; s.setAnimating(false); s.setHelpers(false); });
        await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility:hidden !important; }' });
    }
    await page.goto('/debug_tools/grass_transition_scene.html?revision=lod4-wide-1&lod3=cards#front');
    await ready();
    expect(await page.evaluate(() => window.__grassTransitionScene.getSnapshot().selection.distances)).toEqual([.6, .8, 1, 16, 32]);
    for (const bearing of [0, 90, 180, 270]) {
        await page.evaluate(async bearing => {
            const s = window.__grassTransitionScene, THREE = await import('three'), a = bearing * Math.PI / 180;
            s.camera.position.set(-16.5 + 20 * Math.sin(a), s.getSnapshot().cameraHeight, -16.5 + 20 * Math.cos(a));
            s.camera.quaternion.setFromEuler(new THREE.Euler(-s.getSnapshot().cameraPitch * Math.PI / 180, a, 0, 'YXZ'));
            s.camera.updateMatrixWorld(true);
        }, bearing);
        for (const mode of ['lod3', 'cards-sparse', 'cards', 'cards-full', 'lod5']) {
            const snapshot = await page.evaluate(async mode => {
                const s = window.__grassTransitionScene;
                if (mode.startsWith('cards')) s.setLod4Mode(mode);
                s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(mode === 'lod3' ? 3 : mode === 'lod5' ? 5 : 4));
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i = 0; i < 3; i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
                return s.getSnapshot();
            }, mode);
            const filename = `bus_${bearing}_${mode}.png`;
            const png = await page.screenshot({ path: path.join(output, filename) });
            rows.push({ bearing, mode, filename, snapshot, coverage: await page.evaluate(measureGrassCardCoverage,
                { png: png.toString('base64'), ranges: [[10, 14], [14, 18], [18, 24], [24, 32], [32, 48]] }) });
            expect(snapshot.glError).toBe(0); expect(errors).toEqual([]);
        }
    }
    await page.evaluate(() => window.__grassTransitionScene.setLod4Mode('cards'));
    for (const pose of ['front', 'rear', 'border']) {
        const snapshot = await page.evaluate(async pose => {
            const s = window.__grassTransitionScene; s.setPose(pose); s.updateSelection(true);
            await s.renderer.compileAsync(s.scene, s.camera);
            for (let i = 0; i < 3; i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
            return s.getSnapshot();
        }, pose);
        await page.screenshot({ path: path.join(output, `new_${pose}.png`) }); full.push({ pose, snapshot });
        expect(snapshot.fields.levels.length).toBe(6); expect(snapshot.fields.lod4CardsPerSquareMeter).toBe(4);
    }
    const captures = await page.evaluate(() => window.__grassTransitionScene.getSnapshot().bridgeCards);
    for (let i = 0; i <= 40; i++) {
        await page.evaluate(async i => {
            const s = window.__grassTransitionScene, THREE = await import('three');
            s.camera.position.set(-16, s.getSnapshot().cameraHeight, 24 - i * .1);
            s.camera.quaternion.setFromEuler(new THREE.Euler(-s.getSnapshot().cameraPitch * Math.PI / 180, i * .005, 0, 'YXZ'));
            s.camera.updateMatrixWorld(true); s.updateSelection(true); s.lighting.render(0); await new Promise(requestAnimationFrame);
        }, i);
        if (i % 5 === 0) await page.screenshot({ path: path.join(output, `move_${i}.png`) });
    }
    expect(await page.evaluate(() => window.__grassTransitionScene.getSnapshot().bridgeCards)).toEqual(captures);
    expect(errors).toEqual([]);
    // The previous implementation is preserved only as local evidence, not a required fixture.
    const before = path.join(output, 'before');
    for (const file of await readdir(before).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
        const body = await readFile(path.join(before, file));
        await page.route('**/' + file + '*', route => route.fulfill({ body,
            contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/plain' }));
    }
    if ((await readdir(before).catch(() => [])).length) {
        await page.goto('/debug_tools/grass_transition_scene.html?revision=before-wide&lod3=cards#front'); await ready();
        for (const pose of ['front', 'rear', 'border']) {
            await page.evaluate(async pose => {
                const s = window.__grassTransitionScene; s.setPose(pose); s.updateSelection(true);
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i = 0; i < 3; i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
            }, pose);
            await page.screenshot({ path: path.join(output, `before_${pose}.png`) });
        }
    }
    expect(errors).toEqual([]);
    await writeFile(path.join(output, 'visual.json'), JSON.stringify({ rows, full, captures, errors }, null, 2));
});
