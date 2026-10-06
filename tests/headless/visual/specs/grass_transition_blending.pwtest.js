// Verify complementary coverage and that rebuilding cached batches cannot pop visible patches.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/fade_styles/blending');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Blended patches preserve coverage and avoid cached-selection popping', async ({ page }) => {
    test.setTimeout(240000); await mkdir(output, { recursive: true }); const errors = [], rows = [], motion = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?revision=card-continuity&lod3=cards#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.setAnimating(false); s.setHelpers(false); s.setPanelCollapsed(true); });
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility:hidden !important; }' });
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
        await page.evaluate(async bearing => {
            const s = window.__grassTransitionScene, THREE = await import('three'), angle = bearing * Math.PI / 180;
            s.camera.position.set(-16.5 + 18 * Math.sin(angle), s.getSnapshot().cameraHeight, -16.5 + 18 * Math.cos(angle));
            s.camera.quaternion.setFromEuler(new THREE.Euler(-s.getSnapshot().cameraPitch * Math.PI / 180, angle, 0, 'YXZ'));
            s.camera.updateMatrixWorld(true);
        }, bearing);
        for (const mode of ['patches', 'blend']) {
            const row = await page.evaluate(async mode => {
                const s = window.__grassTransitionScene; s.setSettings({ transitionMode: mode });
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i = 0; i < 3; i++) { s.step(); await new Promise(requestAnimationFrame); }
                const assignment = s.updateSelection(), cells = s.fields.cells, matrix = s.camera.matrix.clone();
                const byPosition = new Map(cells.map(c => [c.centerX + ':' + c.centerZ, c.id]));
                const masks = new Uint8Array(cells.length), ground = new Uint8Array(cells.length); let duplicates = 0;
                s.fields.group.traverse(mesh => {
                    if (!mesh.isInstancedMesh || !mesh.visible) return;
                    const level = mesh.userData.grassTransitionLevel, isGround = mesh.userData.grassTransitionGround;
                    if (level === undefined && !isGround) return;
                    for (let i = 0; i < mesh.count; i++) {
                        mesh.getMatrixAt(i, matrix); const id = byPosition.get(matrix.elements[12] + ':' + matrix.elements[14]);
                        if (id === undefined) throw Error('Unmapped instance');
                        if (level !== undefined) { duplicates += Number(!!(masks[id] & (1 << level))); masks[id] |= 1 << level; }
                        if (isGround) ground[id]++;
                    }
                });
                return { ...s.getSnapshot(), duplicates,
                    coverageErrors: cells.filter(c => masks[c.id] !== assignment.renderMasks[c.id] || ground[c.id] !== Number(!!(masks[c.id] & 31))).length };
            }, mode);
            rows.push({ bearing, mode, snapshot: row });
            await page.screenshot({ path: path.join(output, `${mode}_${bearing}.png`) });
            expect(row.glError).toBe(0); expect(row.coverageErrors).toBe(0); expect(row.duplicates).toBe(0);
        }
    }
    for (const pose of ['front', 'rear']) for (const mode of ['patches', 'blend']) {
        const result = await page.evaluate(async ({ mode, pose }) => {
            const s = window.__grassTransitionScene; s.setPose(pose); s.setSettings({ transitionMode: mode });
            const start = s.getSnapshot(), origin = s.camera.position.clone(), frames = [], gl = s.renderer.getContext();
            let clock = start.selection.lastScanMs;
            const beforePixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4), afterPixels = new Uint8Array(beforePixels.length);
            for (let frame = 0; frame < 120; frame++) {
                s.camera.position.z = origin.z + (pose === 'front' ? -1 : 1) * (frame + 1) * .05; clock += 1000 / 60;
                const row = { frame };
                if (frame % 5 === 4) {
                    s.lighting.render(0); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, beforePixels);
                    s.updateSelection(true, clock); s.lighting.render(0);
                    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, afterPixels);
                    let changed = 0, sum = 0;
                    for (let i = 0; i < beforePixels.length; i += 4) {
                        const difference = Math.max(...[0, 1, 2].map(c => Math.abs(beforePixels[i + c] - afterPixels[i + c])));
                        changed += Number(difference > 3); sum += difference;
                    }
                    row.rebuildChangedPixels = changed; row.rebuildMeanError = sum / (beforePixels.length / 4);
                }
                if (frame % 3 === 0) {
                    s.lighting.render(0); row.image = s.renderer.domElement.toDataURL('image/jpeg', .88).split(',')[1];
                    await new Promise(requestAnimationFrame);
                }
                frames.push(row);
            }
            const end = s.getSnapshot();
            return { pose, mode, frames, shadowGenerations: end.shadows.generations - start.shadows.generations, glError: end.glError };
        }, { mode, pose });
        for (const frame of result.frames) if (frame.image) {
            await writeFile(path.join(output, `motion_${pose}_${mode}_${frame.frame}.jpg`), Buffer.from(frame.image, 'base64')); delete frame.image;
        }
        motion.push(result); expect(result.glError).toBe(0); expect(result.shadowGenerations).toBe(0);
    }
    const coverage = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassTransitionBlendMaterials } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionBlend.js');
        const s = window.__grassTransitionScene, materials = createGrassTransitionBlendMaterials(), bands = s.getSnapshot().selection.transitionBands;
        materials.configure(bands);
        // Keep the probe small because real geometry now evaluates its own distance,
        // not a constant at the instance origin. It must still cover the full target.
        const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-.00001, .00001, .00001, -.00001, .01, 100);
        const geometry = new THREE.PlaneGeometry(.001, .001); geometry.rotateX(-Math.PI / 2);
        const red = new THREE.MeshBasicMaterial({color:0xff0000, toneMapped:false}), blue = new THREE.MeshBasicMaterial({color:0x0000ff, toneMapped:false});
        const target = new THREE.WebGLRenderTarget(64, 64), oldTarget = s.renderer.getRenderTarget(), rows = [];
        const clear = s.renderer.getClearColor(new THREE.Color()), alpha = s.renderer.getClearAlpha();
        try {
            s.renderer.setRenderTarget(target); s.renderer.setClearColor(0xff00ff, 1);
            for (let level = 0; level < 5; level++) for (const fraction of [0, .25, .5, .75, 1]) {
                const near = new THREE.InstancedMesh(geometry, materials.material(red, level, 0, 'dissolve'), 1);
                const far = new THREE.InstancedMesh(geometry, materials.material(blue, level + 1, 0, 'dissolve'), 1);
                for (const mesh of [near, far]) { mesh.setMatrixAt(0, new THREE.Matrix4()); mesh.frustumCulled = false; scene.add(mesh); }
                const distance = bands[level].start + (bands[level].end - bands[level].start) * fraction;
                camera.position.set(0, 5, distance); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
                let previous;
                for (const reverse of [false, true]) {
                    near.renderOrder = reverse ? 1 : 0; far.renderOrder = reverse ? 0 : 1;
                    s.renderer.render(scene, camera); const pixels = new Uint8Array(64 * 64 * 4);
                    s.renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
                    let nearPixels = 0, farPixels = 0, holes = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        if (pixels[i] > 250 && pixels[i+2] < 5) nearPixels++;
                        else if (pixels[i+2] > 250 && pixels[i] < 5) farPixels++;
                        else holes++;
                    }
                    rows.push({ level, fraction, reverse, nearPixels, farPixels, holes, orderChanges: previous ? pixels.filter((v,i)=>v!==previous[i]).length : 0 });
                    previous = pixels;
                }
                scene.remove(near, far); near.dispose(); far.dispose();
            }
        } finally { s.renderer.setRenderTarget(oldTarget); s.renderer.setClearColor(clear, alpha); target.dispose(); geometry.dispose(); materials.dispose(); red.dispose(); blue.dispose(); }
        return rows;
    });
    await writeFile(path.join(output, 'visual.json'), JSON.stringify({ rows, motion, coverage, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of coverage) { expect(row.holes).toBe(0); expect(row.orderChanges).toBe(0);
        expect(Math.abs(row.farPixels / 4096 - row.fraction ** 2 * (3 - 2 * row.fraction))).toBeLessThan(.016); }
    for (const pose of ['front', 'rear']) {
        const errorsFor = mode => motion.find(r=>r.pose===pose&&r.mode===mode).frames.reduce((sum,f)=>sum+(f.rebuildChangedPixels||0),0);
        expect(errorsFor('blend')).toBeLessThan(errorsFor('patches') * .1);
    }
    await page.evaluate(() => {
        document.querySelector('#scene-panel').style.setProperty('visibility', 'visible', 'important');
        window.__grassTransitionScene.setPanelCollapsed(false);
    });
    for (let repeat = 0; repeat < 2; repeat++) {
        await page.locator('#transition-mode').selectOption('patches');
        await page.locator('#transition-band').fill('0'); await page.locator('#transition-band').press('Tab');
        await page.locator('#transition-half').click();
        await page.locator('#transition-soil').check(); await page.locator('#transition-soil').uncheck();
        await page.locator('#transition-shadows').uncheck(); await page.locator('#transition-shadows').check();
        await page.locator('#transition-mode').selectOption('blend');
        await page.locator('#transition-band').fill('50'); await page.locator('#transition-band').press('Tab');
        await page.locator('#transition-full').click();
        const state = await page.evaluate(async () => {
            const s = window.__grassTransitionScene;
            await s.renderer.compileAsync(s.scene, s.camera); s.step(); return s.getSnapshot();
        });
        expect(state.selection.transitionMethod).toBe('complementary-screen-door');
        expect(state.fields.blendCandidateCells).toBeGreaterThan(0);
        expect(state.glError).toBe(0);
        await expect(page.locator('#transition-error')).toBeHidden();
    }
    expect(errors).toEqual([]);
});
