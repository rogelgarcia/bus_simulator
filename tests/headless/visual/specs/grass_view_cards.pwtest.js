// Compare prepared quarter-metre cards with geometric grass at bus height and through capture boundaries.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { measureGrassCardCoverage } from '../grass_view_cards_metrics.mjs';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/view_cards_fidelity');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Prepared view cards render without repeated baking and preserve the original LOD3 option', async ({ page }) => {
    test.setTimeout(300000); await mkdir(output, { recursive: true }); const errors = [], rows = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?revision=lod3-fidelity-1#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
    expect(await page.locator('#transition-helpers').isChecked()).toBe(false);
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.setAnimating(false); s.setHelpers(false); s.setSettings({ distances: [1, 2, 5, 18, 32] }); });
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility:hidden !important; }' });
    for (const bearing of [0, 45, 90, 180]) for (const distance of [14, 24]) {
        await page.evaluate(async ({ bearing, distance }) => {
            const s = window.__grassTransitionScene, THREE = await import('three'), angle = bearing * Math.PI / 180;
            s.camera.position.set(-16.5 + distance * Math.sin(angle), s.getSnapshot().cameraHeight, -16.5 + distance * Math.cos(angle));
            s.camera.quaternion.setFromEuler(new THREE.Euler(-s.getSnapshot().cameraPitch * Math.PI / 180, angle, 0, 'YXZ'));
            s.camera.updateMatrixWorld(true);
        }, { bearing, distance });
        for (const mode of ['lod2', 'geometry', 'cards']) {
            const row = await page.evaluate(async mode => {
                const s = window.__grassTransitionScene; await s.setLod3Mode(mode === 'lod2' ? 'geometry' : mode);
                s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(mode === 'lod2' ? 2 : 3));
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i = 0; i < 3; i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
                return s.getSnapshot();
            }, mode);
            const png = await page.screenshot({ path: path.join(output, `bus_${distance}_${bearing}_${mode}.png`) });
            rows.push({ bearing, distance, mode, snapshot: row, coverage: await page.evaluate(measureGrassCardCoverage, png.toString('base64')) });
            expect(row.glError).toBe(0); expect(errors).toEqual([]);
            if (mode === 'cards') expect(row.fields.lod3CardsPerSquareMeter).toBe(20);
        }
        // Optional historical evidence stays outside the source tree. It is never
        // substituted for a fresh render or used as a pass/fail visual baseline.
        const previous = await readFile(path.join(output, '..', 'view_cards_coverage', `bus_${distance}_${bearing}_cards.png`)).catch(error => {
            if (error.code === 'ENOENT') return null; throw error;
        });
        if (previous) rows.push({ bearing, distance, mode: 'previous-cards', coverage: await page.evaluate(measureGrassCardCoverage, previous.toString('base64')) });
    }
    // Inspect actual leaf silhouettes and the 3.5-5 m boundary rather than relying
    // only on distant coverage averages. These close views intentionally stress cards.
    const close = [];
    for (const bearing of [0, 90, 180]) {
        await page.evaluate(async bearing => {
            const s = window.__grassTransitionScene, THREE = await import('three'), angle = bearing * Math.PI / 180;
            s.camera.position.set(-16.5 + 10 * Math.sin(angle), 2, -16.5 + 10 * Math.cos(angle));
            s.camera.quaternion.setFromEuler(new THREE.Euler(-30 * Math.PI / 180, angle, 0, 'YXZ')); s.camera.updateMatrixWorld(true);
        }, bearing);
        for (const mode of ['lod2', 'cards', 'transition']) {
            const snapshot = await page.evaluate(async mode => {
                const s = window.__grassTransitionScene; await s.setLod3Mode(mode === 'lod2' ? 'geometry' : 'cards');
                if (mode === 'transition') s.updateSelection(true);
                else s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(mode === 'lod2' ? 2 : 3));
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i = 0; i < 3; i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
                return s.getSnapshot();
            }, mode);
            await page.screenshot({ path: path.join(output, `close_${bearing}_${mode}.png`) });
            close.push({ bearing, mode, snapshot }); expect(snapshot.glError).toBe(0); expect(errors).toEqual([]);
        }
    }
    const drive = [];
    for (let frame = 0; frame <= 20; frame++) {
        const snapshot = await page.evaluate(async frame => {
            const s = window.__grassTransitionScene, THREE = await import('three'); await s.setLod3Mode('cards');
            s.camera.position.set(-16.5, 2, -6.5 - frame * .1);
            s.camera.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 6, 0, 0, 'YXZ'));
            s.camera.updateMatrixWorld(true); s.updateSelection(true); s.lighting.render(0); await new Promise(requestAnimationFrame);
            return s.getSnapshot();
        }, frame);
        if (frame % 2 === 0) await page.screenshot({ path: path.join(output, `drive_${frame}.png`) });
        drive.push({ frame, captures: snapshot.viewCards.captures, glError: snapshot.glError });
        expect(snapshot.glError).toBe(0); expect(snapshot.viewCards.captures).toBe(32);
    }
    const motion = { frames: [], before: await page.evaluate(async () => {
        const s = window.__grassTransitionScene; await s.setLod3Mode('cards');
        s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(3)); return s.getSnapshot().viewCards;
    }) };
    for (let frame = 0; frame <= 60; frame++) {
        await page.evaluate(async frame => {
            const s = window.__grassTransitionScene, THREE = await import('three'), angle = (30 + frame * .5) * Math.PI / 180;
            const state = s.getSnapshot();
            s.camera.position.set(-16.5 + 18 * Math.sin(angle), state.cameraHeight, -16.5 + 18 * Math.cos(angle));
            s.camera.quaternion.setFromEuler(new THREE.Euler(-state.cameraPitch * Math.PI / 180, angle, 0, 'YXZ'));
            s.camera.updateMatrixWorld(true); s.lighting.render(0); await new Promise(requestAnimationFrame);
        }, frame);
        if (frame % 2 === 0) {
            await page.screenshot({ path: path.join(output, `turn_${frame}.jpg`), type: 'jpeg', quality: 90 });
            motion.frames.push({ frame });
        }
    }
    motion.after = await page.evaluate(() => window.__grassTransitionScene.getSnapshot().viewCards);
    expect(motion.before).toEqual(motion.after); expect(errors).toEqual([]);
    const restored = await page.evaluate(async () => {
        const s = window.__grassTransitionScene; await s.setLod3Mode('geometry');
        s.setPose('front'); s.step(); return s.getSnapshot();
    });
    expect(restored.lod3Mode).toBe('geometry'); expect(restored.fields.extraTextureBytes).toBe(restored.bridgeCards.textureBytes);
    expect(restored.fields.lod3CardsPerSquareMeter).toBe(0); expect(restored.glError).toBe(0);
    // Optional preserved source from the preceding experiment supplies matched close
    // evidence. This is an artifact-only comparison, never a required test fixture.
    const previousClose = [], savedSources = {};
    for (const filename of ['GrassDebugV2ViewCards.js', 'GrassDebugV2ViewCardsMaterial.js', 'grass_view_cards.vert.glsl',
        'grass_view_cards.frag.glsl', 'GrassDebugV2TransitionBlend.js', 'grass_transition_blend.frag.glsl']) {
        const body = await readFile(path.join(output, 'previous_source', filename), 'utf8').catch(error => {
            if (error.code === 'ENOENT') return null; throw error;
        });
        if (body !== null) savedSources[filename] = body;
    }
    if (Object.keys(savedSources).length === 6 && !await page.evaluate(() => window.__grassTransitionScene.getSnapshot().bridgeCards)) {
        for (const [filename, body] of Object.entries(savedSources))
            await page.route('**/' + filename + '*', route => route.fulfill({ body, contentType: filename.endsWith('.js') ? 'text/javascript' : 'text/plain' }));
        await page.goto('/debug_tools/grass_transition_scene.html?revision=preserved-coverage&lod3=cards#front');
        await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
        await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility:hidden !important; }' });
        for (const bearing of [0, 90, 180]) for (const mode of ['cards', 'transition']) {
            const snapshot = await page.evaluate(async ({ bearing, mode }) => {
                const s = window.__grassTransitionScene, THREE = await import('three'), angle = bearing * Math.PI / 180;
                s.setAnimating(false); s.setHelpers(false); s.setSettings({ distances: [1, 2, 5, 18, 32] });
                s.camera.position.set(-16.5 + 10 * Math.sin(angle), 2, -16.5 + 10 * Math.cos(angle));
                s.camera.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 6, angle, 0, 'YXZ')); s.camera.updateMatrixWorld(true);
                if (mode === 'transition') s.updateSelection(true);
                else s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(3));
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i = 0; i < 3; i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
                return s.getSnapshot();
            }, { bearing, mode });
            await page.screenshot({ path: path.join(output, `previous_close_${bearing}_${mode}.png`) });
            previousClose.push({ bearing, mode, snapshot }); expect(snapshot.glError).toBe(0);
        }
    }
    expect(errors).toEqual([]);
    await writeFile(path.join(output, 'visual.json'), JSON.stringify({ rows, close, previousClose, drive, motion, errors }, null, 2));
});
