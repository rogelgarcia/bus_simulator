// Exercises real landscape free-flight input, fixed-position looking, and pose/selection lifecycle.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve('tests/artifacts/screens/landscape/navigation/step1');
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const samePose = (a, b) => {
    for (const key of ['position', 'target']) a[key].forEach((value, index) => expect(value).toBeCloseTo(b[key][index], 8));
    for (const key of ['projection', 'fov', 'orthoHeight', 'zoom']) expect(a[key]).toBe(b[key]);
};

test('Landscape navigation: fixed-eye looking, camera translation, native POV, selection, bookmarks and reload', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await mkdir(artifacts, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/screens/landscape_fabrication.html');
    // the viewer module installs its hooks after its shader sources load, which can finish after the load event
    await page.waitForFunction(() => !!window.__landscapeTestHooks, null, { timeout: 60000 });
    // a cold browser profile compiles the AI577 D5 terrain program in about 20 s before planning is ready
    await expect.poll(async () => (await snapshot(page)).planning?.ready, { timeout: 60000 }).toBe(true);
    expect((await snapshot(page)).camera.fov).toBe(55);
    const canvas = page.locator('#game-canvas'), box = await canvas.boundingBox();
    const at = { x: box.x + box.width * .52, y: box.y + box.height * .56 };
    await page.evaluate(() => { window.__landscapeTestHooks.preset('top'); window.__landscapeTestHooks.setSelectionRadius(0); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.mouse.click(at.x, at.y);
    await expect.poll(async () => (await snapshot(page)).selection?.editingReady).toBe(true);
    const selected = await snapshot(page);
    await page.evaluate(() => window.__landscapeTestHooks.setCamera({ position: [2000, 100, 1700], target: [2000, 100, 2000], projection: 'perspective', fov: 55, zoom: 1 }));
    const beforeLook = (await snapshot(page)).camera;
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    await page.mouse.move(at.x + 100, at.y + 50, { steps: 8 }); await page.mouse.up();
    const looked = await snapshot(page);
    expect(looked.camera.position).toEqual(beforeLook.position);
    expect(distance(looked.camera.target, beforeLook.target)).toBeGreaterThan(20);
    expect(looked.selection.selectionId).toBe(selected.selection.selectionId);
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    await page.mouse.move(at.x + 50, at.y, { steps: 3 }); await page.mouse.move(at.x, at.y, { steps: 3 }); await page.mouse.up();
    expect((await snapshot(page)).selection.selectionId).toBe(selected.selection.selectionId);

    await canvas.focus();
    const beforeMove = (await snapshot(page)).camera;
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(220); await page.keyboard.up('ArrowUp');
    const moved = (await snapshot(page)).camera;
    expect(distance(moved.position, beforeMove.position)).toBeGreaterThan(3);
    expect(moved.position[1]).toBe(beforeMove.position[1]);
    moved.position.forEach((value, index) => expect(moved.target[index] - beforeMove.target[index]).toBeCloseTo(value - beforeMove.position[index], 9));
    await page.keyboard.down('PageUp'); await page.waitForTimeout(180); await page.keyboard.up('PageUp');
    const raised = (await snapshot(page)).camera;
    expect(raised.position[0]).toBe(moved.position[0]); expect(raised.position[2]).toBe(moved.position[2]);
    expect(raised.position[1]).toBeGreaterThan(moved.position[1] + 2);
    await page.keyboard.down('PageDown'); await page.waitForTimeout(120); await page.keyboard.up('PageDown');
    expect((await snapshot(page)).camera.position[1]).toBeLessThan(raised.position[1]);

    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(60);
    await page.locator('[data-field="radius"]').focus();
    const fieldFocus = (await snapshot(page)).camera;
    await page.waitForTimeout(150); samePose((await snapshot(page)).camera, fieldFocus);
    await page.keyboard.up('ArrowUp'); await canvas.focus();
    await page.waitForTimeout(100); samePose((await snapshot(page)).camera, fieldFocus);
    await page.keyboard.down('PageUp'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const windowBlur = (await snapshot(page)).camera;
    await page.waitForTimeout(150); samePose((await snapshot(page)).camera, windowBlur); await page.keyboard.up('PageUp');

    await page.getByRole('button', { name: 'Game POV', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).camera.position[1]).toBeCloseTo(selected.selection.position.y + 4.5, 6);
    const pov = await snapshot(page);
    expect(pov.camera.fov).toBe(55); expect(pov.camera.zoom).toBe(1); expect(pov.camera.projection).toBe('perspective');
    expect(pov.camera.position[0]).toBe(selected.selection.position.x); expect(pov.camera.position[2]).toBe(selected.selection.position.z);
    expect(pov.camera.target[1]).toBeCloseTo(selected.selection.position.y + 1.6, 6);
    expect(Math.hypot(pov.camera.target[0] - pov.camera.position[0], pov.camera.target[2] - pov.camera.position[2])).toBeCloseTo(12, 6);
    expect(pov.selection.selectionId).toBe(selected.selection.selectionId);
    const bookmark = await page.evaluate(() => window.__landscapeTestHooks.saveBookmark('Navigation step1 POV'));
    await page.evaluate(() => window.__landscapeTestHooks.reload());
    samePose((await snapshot(page)).camera, pov.camera);
    await page.evaluate(id => { window.__landscapeTestHooks.preset('home'); window.__landscapeTestHooks.focusBookmark(id); }, bookmark.id);
    samePose((await snapshot(page)).camera, pov.camera);
    await expect(page.locator('[data-group="camera"] button.active')).toHaveCount(0);
    await page.waitForFunction(() => { const state = window.__landscapeTestHooks.snapshot(); return state.streaming.settled && state.appearance.settled && state.planning.settled; }, null, { timeout: 60000 });
    await page.screenshot({ path: path.join(artifacts, '01-game-pov.png') });

    await page.evaluate(() => { window.__landscapeTestHooks.preset('top'); window.__landscapeTestHooks.setCamera({ projection: 'orthographic', orthoHeight: 2000, zoom: 2 }); });
    const ortho = (await snapshot(page)).camera;
    await page.mouse.move(at.x, at.y); await page.mouse.wheel(0, -150);
    await expect.poll(async () => (await snapshot(page)).camera.zoom).toBeGreaterThan(ortho.zoom);
    expect((await snapshot(page)).camera.position).toEqual(ortho.position);
    const beforePan = (await snapshot(page)).camera;
    await page.mouse.down({ button: 'middle' }); await page.mouse.move(at.x + 80, at.y + 30, { steps: 4 }); await page.mouse.up({ button: 'middle' });
    const panned = (await snapshot(page)).camera;
    expect(distance(panned.position, beforePan.position)).toBeGreaterThan(10);
    panned.position.forEach((value, index) => expect(panned.target[index] - beforePan.target[index]).toBeCloseTo(value - beforePan.position[index], 8));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.mouse.click(at.x, at.y);
    await expect.poll(async () => (await snapshot(page)).selection?.selectionId).not.toBe(pov.selection.selectionId);
    await expect.poll(async () => (await snapshot(page)).selection?.editingReady).toBe(true);
    const final = await snapshot(page); expect(final.revision).toBe(selected.revision);
    await page.waitForFunction(() => { const state = window.__landscapeTestHooks.snapshot(); return state.streaming.settled && state.appearance.settled && state.planning.settled; }, null, { timeout: 60000 });
    await page.screenshot({ path: path.join(artifacts, '02-orthographic-selection.png') });
    await page.evaluate(() => { window.__landscapeTestHooks.pause(); window.__landscapeTestHooks.resume(); window.__landscapeTestHooks.dispose(); });
    const disposed = await snapshot(page);
    expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0); expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ selected, looked, moved, raised, pov, final, disposed, errors }, null, 2));
});

test('First-person camera: default callers retain immediate looking and canceled captures never pick', async ({ page }) => {
    const html = await readFile(path.resolve('screens/landscape_fabrication.html'), 'utf8');
    const importMap = html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
    await page.route('**/__landscape_camera_controls.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><canvas width="800" height="600"></canvas>${importMap}</body></html>` }));
    await page.goto('/__landscape_camera_controls.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { FirstPersonCameraController } = await import('/src/graphics/engine3d/camera/FirstPersonCameraController.js');
        const { LandscapeCameraController } = await import('/src/graphics/gui/landscape_fabrication/LandscapeCameraController.js');
        const canvas = document.querySelector('canvas'), camera = new THREE.PerspectiveCamera(55, 1, .1, 25000);
        camera.position.set(10, 20, 30);
        const event = (type, x, extra = {}) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: 100, bubbles: true, ...extra }));
        const original = new FirstPersonCameraController(camera, canvas), before = camera.quaternion.toArray();
        event('pointerdown', 100); event('pointermove', 101); event('pointerup', 101);
        const after = camera.quaternion.toArray(); original.dispose();
        let picked = 0;
        const optIn = new FirstPersonCameraController(camera, canvas, { dragThreshold: 5, onClick: () => picked++ });
        const still = camera.quaternion.toArray();
        event('pointerdown', 100); event('pointermove', 103); event('pointerup', 103);
        const jitter = camera.quaternion.toArray();
        event('pointerdown', 100); event('pointercancel', 100); event('pointerup', 100);
        event('pointerdown', 100); event('lostpointercapture', 100); event('pointerup', 100);
        optIn.dispose(); const disposed = camera.quaternion.toArray(); event('pointerdown', 100); event('pointermove', 130); event('pointerup', 130);
        const afterDispose = camera.quaternion.toArray();
        const landscape = new LandscapeCameraController(camera, canvas, { uiRoot: document.body, onClick() {}, onZoom() {}, onNavigate() {} });
        landscape.navigation.setKey('ArrowUp', true);
        landscape.update(-.001);
        const initialRafPosition = camera.position.toArray(); landscape.dispose();
        return { before, after, position: camera.position.toArray(), still, jitter, picked, disposed, afterDispose, initialRafPosition };
    });
    expect(result.after).not.toEqual(result.before); expect(result.position).toEqual([10, 20, 30]);
    expect(result.jitter).toEqual(result.still); expect(result.picked).toBe(1); expect(result.afterDispose).toEqual(result.disposed);
    expect(result.initialRafPosition).toEqual([10, 20, 30]);
});
