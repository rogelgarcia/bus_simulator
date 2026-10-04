// Compare stable spatial LOD bands against abrupt switches at the same bus camera poses.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/bands');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Spatial bands retain stable opaque coverage and update only after both gates', async ({ page }) => {
    test.setTimeout(240000); await mkdir(output, { recursive: true }); const errors = [], rows = [], motion = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?transitionMode=patches&revision=transition-band-1#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness);
    await page.evaluate(() => window.__grassTransitionReadiness);
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.setAnimating(false); s.setHelpers(false); s.setPanelCollapsed(true); });
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility:hidden !important; }' });
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
        await page.evaluate(async bearing => {
            const s = window.__grassTransitionScene, THREE = await import('three'), angle = bearing * Math.PI / 180;
            s.camera.position.set(-16.5 + 18 * Math.sin(angle), s.getSnapshot().cameraHeight, -16.5 + 18 * Math.cos(angle));
            s.camera.quaternion.setFromEuler(new THREE.Euler(-s.getSnapshot().cameraPitch * Math.PI / 180, angle, 0, 'YXZ'));
            s.camera.updateMatrixWorld(true);
        }, bearing);
        for (const fraction of [0, .5]) {
            const row = await page.evaluate(async fraction => {
                const s = window.__grassTransitionScene;
                s.setSettings({ transitionFraction: fraction });
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i = 0; i < 3; i++) { s.step(); await new Promise(requestAnimationFrame); }
                const cells = s.fields.cells, byPosition = new Map(cells.map(c => [c.centerX + ':' + c.centerZ, c.id]));
                const main = new Uint8Array(cells.length), ground = new Uint8Array(cells.length), matrix = s.camera.matrix.clone();
                s.fields.group.traverse(mesh => {
                    if (!mesh.isInstancedMesh || !mesh.visible) return;
                    const level = mesh.userData.grassTransitionLevel, isGround = mesh.userData.grassTransitionGround;
                    if (level === undefined && !isGround) return;
                    for (let i = 0; i < mesh.count; i++) {
                        mesh.getMatrixAt(i, matrix); const id = byPosition.get(matrix.elements[12] + ':' + matrix.elements[14]);
                        if (id === undefined) throw Error('Unmapped grass instance');
                        if (level !== undefined) main[id]++;
                        if (isGround || level === 4) ground[id]++;
                    }
                });
                return { ...s.getSnapshot(), coverageErrors: cells.filter(c => main[c.id] !== 1 || ground[c.id] !== 1).length };
            }, fraction);
            rows.push({ bearing, fraction, snapshot: row });
            await page.screenshot({ path: path.join(output, `${fraction ? 'band' : 'abrupt'}_${bearing}.png`) });
            expect(row.glError).toBe(0);
            expect(row.coverageErrors).toBe(0);
        }
    }
    for (const pose of ['front', 'rear']) for (const fraction of [0, .5]) {
        const frames = await page.evaluate(async ({ fraction, pose }) => {
            const s = window.__grassTransitionScene;
            s.setPose(pose); s.setSettings({ transitionFraction: fraction });
            const start = s.getSnapshot(), origin = s.camera.position.clone(), frames = [];
            let clock = start.selection.lastScanMs;
            const previous = Uint8Array.from(s.selection.update(s.camera.position, clock).levels);
            for (let frame = 0; frame < 120; frame++) {
                s.camera.position.z = origin.z + (pose === 'front' ? -1 : 1) * (frame + 1) * .05;
                clock += 1000 / 60;
                const assignment = s.selection.update(s.camera.position, clock), changes = [];
                for (let i = 0; i < previous.length; i++) if (previous[i] !== assignment.levels[i]) changes.push(i);
                const connected = new Set(changes), size = s.fields.getSnapshot().fieldSize;
                let largestCluster = 0;
                while (connected.size) {
                    const stack = [connected.values().next().value]; connected.delete(stack[0]); let count = 0;
                    while (stack.length) {
                        const id = stack.pop(), cell = s.fields.cells[id]; count++;
                        for (const next of [cell.x > 0 ? id - 1 : -1, cell.x < size - 1 ? id + 1 : -1,
                            cell.z > 0 ? id - size : -1, cell.z < size - 1 ? id + size : -1]) {
                            if (connected.delete(next)) stack.push(next);
                        }
                    }
                    largestCluster = Math.max(largestCluster, count);
                }
                const row = { frame, scanned: assignment.scanned, changed: changes.length, largestCluster };
                frames.push(row);
                if (assignment.scanned) s.fields.applyLevels(assignment.levels, assignment.sideLeaves);
                previous.set(assignment.levels);
                if (frame % 6 === 0) {
                    s.lighting.render(0);
                    row.image = s.renderer.domElement.toDataURL('image/jpeg', .88).split(',')[1];
                    await new Promise(requestAnimationFrame);
                }
            }
            const end = s.getSnapshot();
            return { pose, fraction, frames, shadowGenerations: end.shadows.generations - start.shadows.generations, glError: end.glError };
        }, { fraction, pose });
        for (const frame of frames.frames) if (frame.image) {
            await writeFile(path.join(output, `motion_${pose}_${fraction ? 'band' : 'abrupt'}_${frame.frame}.jpg`), Buffer.from(frame.image, 'base64'));
            delete frame.image;
        }
        motion.push(frames);
        expect(frames.glError).toBe(0); expect(frames.shadowGenerations).toBe(0);
        expect(frames.frames.filter(f=>f.scanned).length).toBeLessThanOrEqual(30);
    }
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.setPose('overview'); s.setSettings({ transitionFraction: .5 }); s.setHelpers(true); s.step(); });
    await page.screenshot({ path: path.join(output, 'helpers.png') });
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.setPanelCollapsed(false); });
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility:visible !important; }' });
    await page.locator('#transition-band').fill('0'); await page.locator('#transition-band').dispatchEvent('change');
    expect(await page.evaluate(() => window.__grassTransitionScene.getSnapshot().selection.transitionFraction)).toBe(0);
    await page.locator('#transition-band').fill('50'); await page.locator('#transition-band').dispatchEvent('change');
    await expect(page.locator('#transition-band-ranges')).toContainText('11.5–18 m');
    await page.locator('#transition-half').dispatchEvent('click');
    await expect(page.locator('#transition-band-ranges')).toContainText('5.75–9 m');
    await page.locator('#transition-full').dispatchEvent('click');
    expect(errors).toEqual([]);
    await writeFile(path.join(output, 'visual.json'), JSON.stringify({ rows, motion, errors }, null, 2));
});
