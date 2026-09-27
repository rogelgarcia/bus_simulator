// Verify authoring through the drawer, native drag data, picking, transform handles and clipboard export.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1, video: 'off' });
const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/authoring');
const snapshot = page => page.evaluate(() => window.__plantCardsStudy.authoring.getSnapshot());

async function projectGround(page, x, z) {
    return page.evaluate(async ({ x, z }) => {
        const THREE = await import('three'), study = window.__plantCardsStudy;
        const rect = document.querySelector('#plant-canvas').getBoundingClientRect();
        const point = new THREE.Vector3(x, 0, z).project(study.camera);
        return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
    }, { x, z });
}

async function beginDrag(page, id, point) {
    await page.evaluate(({ id, point }) => {
        const data = new DataTransfer(), button = document.querySelector('[data-catalog-id="' + id + '"]');
        button.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
        window.__authoringDragData = data;
        document.querySelector('#plant-canvas').dispatchEvent(new DragEvent('dragover', {
            bubbles: true, cancelable: true, dataTransfer: data, clientX: point.x, clientY: point.y
        }));
    }, { id, point });
}

async function drop(page, point) {
    await page.evaluate(point => {
        const event = { bubbles: true, cancelable: true, dataTransfer: window.__authoringDragData, clientX: point.x, clientY: point.y };
        document.querySelector('#plant-canvas').dispatchEvent(new DragEvent('drop', event));
        document.dispatchEvent(new DragEvent('dragend', event));
    }, point);
}

async function clickLeaf(page, id) {
    const point = await page.evaluate(async id => {
        const THREE = await import('three'), study = window.__plantCardsStudy;
        study.scene.updateMatrixWorld(true);
        const instance = study.scene.getObjectByName(id), group = study.scene.getObjectByName('GrassAuthoringInstances');
        const rect = document.querySelector('#plant-canvas').getBoundingClientRect();
        const ray = new THREE.Raycaster(), candidates = [];
        const leaves = [];
        group.traverse(mesh => { if (mesh.isMesh && ['GrassV2PlantLeaf', 'GrassV2SingleLeaf'].includes(mesh.geometry.name)) leaves.push(mesh); });
        instance.traverse(mesh => {
            if (!mesh.isMesh || !['GrassV2PlantLeaf', 'GrassV2SingleLeaf'].includes(mesh.geometry.name)) return;
            const { position, uv } = mesh.geometry.attributes;
            for (let i = 0; i < position.count; i++) {
                if (Math.abs(uv.getX(i) - 0.5) > 1e-5 || uv.getY(i) < 0.25 || uv.getY(i) > 0.65) continue;
                const projected = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(study.camera);
                ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), study.camera);
                const hit = ray.intersectObjects(leaves, false).find(hit => hit.point.y >= 0);
                let object = hit?.object;
                while (object && !object.userData.tuftId) object = object.parent;
                if (object?.userData.tuftId === id) candidates.push({
                    x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2
                });
            }
        });
        const point = candidates.find(p => p.x > 340 && p.y > 30 && p.y < rect.bottom - 35);
        if (!point) throw new Error('No unobscured leaf picking point for ' + id);
        return point;
    }, id);
    await page.mouse.click(point.x, point.y);
    await expect.poll(async () => (await snapshot(page)).selectedId).toBe(id);
}

async function dragHandle(page, tool, axis, dx, dy) {
    await page.locator('[data-authoring-tool="' + tool + '"]').click();
    const before = await snapshot(page);
    let sample = null;
    for (const candidate of before.gizmo.handleSamples.filter(point => point.axis === axis && point.x > 340 && point.y > 35)) {
        for (const [dx, dy] of [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
            const point = { x: candidate.x + dx, y: candidate.y + dy };
            await page.mouse.move(point.x, point.y);
            if ((await snapshot(page)).gizmo.axis === axis) { sample = point; break; }
        }
        if (sample) break;
    }
    expect(sample, tool + ' has a visible, pickable handle').toBeTruthy();
    const cameraBefore = await page.evaluate(() => window.__plantCardsStudy.camera.matrixWorld.toArray());
    await page.mouse.down();
    await expect.poll(async () => (await snapshot(page)).gizmo.dragging).toBe(true);
    await page.mouse.move(sample.x + dx, sample.y + dy, { steps: 10 });
    await page.mouse.up();
    const after = await snapshot(page);
    expect(after.gizmo.dragging).toBe(false);
    expect(await page.evaluate(() => window.__plantCardsStudy.camera.matrixWorld.toArray())).toEqual(cameraBefore);
    return { before: before.tufts.find(tuft => tuft.id === before.selectedId), after: after.tufts.find(tuft => tuft.id === after.selectedId) };
}

test('Edit drawer places and transforms catalog tufts while preserving a clipboard-ready layout', async ({ page }) => {
    test.setTimeout(150000);
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
        window.__copiedTuftConfiguration = null;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText: async text => { window.__copiedTuftConfiguration = text; }
        } });
    });
    await page.goto('/debug_tools/grass_plant_study.html?layout=paired');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('#plant-loading')).toBeHidden();
    const tab = page.locator('#grass-authoring-tab'), drawer = page.locator('#grass-authoring-panel');
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer).toBeHidden();
    expect((await snapshot(page)).started).toBe(false);
    const fullHeight = await page.locator('#plant-canvas').evaluate(canvas => canvas.getBoundingClientRect().height);

    await tab.click();
    await expect(tab).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate(panel => panel.inert)).toBe(false);
    await expect.poll(async () => (await page.locator('#plant-canvas').boundingBox()).height).toBeLessThan(fullHeight - 80);
    const opened = await snapshot(page);
    expect(opened).toMatchObject({ open: true, started: true, selectedId: 'tuft-1' });
    expect(opened.tufts).toHaveLength(1);
    expect(opened.tufts[0]).toMatchObject({ catalogId: 'original', rotationDegrees: 0, inclinationDegrees: 0, burialMeters: 0, scale: 1 });
    await expect(drawer.locator('input, h2, .grass-authoring-count, .grass-authoring-tool-hint, .grass-authoring-catalog-hint')).toHaveCount(0);
    await expect(drawer.locator('[data-authoring-tool]')).toHaveCount(0);
    await expect(page.locator('#grass-authoring-status')).toHaveText('');
    await expect(page.locator('#grass-authoring-tools')).toBeVisible();
    await expect(page.locator('[data-authoring-tool]')).toHaveCount(3);
    expect((await tab.boundingBox()).x).toBe(16);
    expect((await snapshot(page)).gizmo.handles).toEqual(['X', 'Y', 'Z', 'XZ']);
    await page.screenshot({ path: path.join(folder, 'authoring-open.png') });
    const shadowCoverage = await page.evaluate(() => {
        const camera = window.__plantCardsStudy.lighting.sun.shadow.camera;
        return [camera.right - camera.left, camera.top - camera.bottom];
    });
    for (const extent of shadowCoverage) expect(extent).toBeGreaterThanOrEqual(1);
    const original = opened.catalog.find(entry => entry.id === 'original').metrics;
    const upright = opened.catalog.find(entry => entry.id === 'upright').metrics;
    expect(upright.heightMeters / original.heightMeters).toBeGreaterThanOrEqual(0.9);
    expect(upright.heightMeters / original.heightMeters).toBeLessThanOrEqual(1.1);
    expect(upright.leafLengthMeters).toBeLessThan(original.leafLengthMeters * 0.9);
    expect(upright.curvatureDegrees).toBeLessThan(original.curvatureDegrees);
    expect(upright.inclinationDegrees).toBeGreaterThan(original.inclinationDegrees);
    const thumbnails = await page.locator('.grass-authoring-thumbnail').evaluateAll(images =>
        images.map(image => ({ src: image.src, loaded: image.complete && image.naturalWidth > 0 })));
    expect(thumbnails).toHaveLength(2);
    for (const thumbnail of thumbnails) { expect(thumbnail.src).toMatch(/^data:image\//); expect(thumbnail.loaded).toBe(true); }
    expect(thumbnails[0].src).not.toBe(thumbnails[1].src);

    const centerZ = (opened.bounds.minZ + opened.bounds.maxZ) / 2;
    const positions = [{ id: 'original', x: -0.24, z: centerZ - 0.22 }, { id: 'upright', x: 0.24, z: centerZ + 0.08 }];
    for (const [index, placement] of positions.entries()) {
        const point = await projectGround(page, placement.x, placement.z);
        await beginDrag(page, placement.id, point);
        expect((await snapshot(page)).placement).toMatchObject({ catalogId: placement.id, visible: true, valid: true });
        expect((await snapshot(page)).gizmo.enabled).toBe(false);
        if (index === 1) await page.screenshot({ path: path.join(folder, 'upright-placement-preview.png') });
        await drop(page, point);
        const placed = await snapshot(page), tuft = placed.tufts.at(-1);
        expect(placed.tufts).toHaveLength(index + 2);
        expect(tuft.catalogId).toBe(placement.id);
        expect(tuft.position.x).toBeCloseTo(placement.x, 2);
        expect(tuft.position.z).toBeCloseTo(placement.z, 2);
        expect(placed.placement.visible).toBe(false);
        expect(placed.selectedId).toBe(tuft.id);
    }

    const outside = await projectGround(page, opened.bounds.maxX + 0.25, centerZ);
    await beginDrag(page, 'original', outside);
    expect((await snapshot(page)).placement.valid).toBe(false);
    await drop(page, outside);
    expect((await snapshot(page)).tufts).toHaveLength(3);
    const sky = { x: 1600, y: 4 };
    await beginDrag(page, 'upright', sky);
    expect((await snapshot(page)).placement.valid).toBe(false);
    await drop(page, sky);
    expect((await snapshot(page)).tufts).toHaveLength(3);

    await clickLeaf(page, 'tuft-2');
    for (const [mode, cards] of [['refined', 10], ['detailed', 5], ['curved', 3], ['split', 2]]) {
        await page.locator('[data-mode="' + mode + '"]').click();
        await expect(page.locator('#plant-counts')).toHaveText('12 leaves · ' + (cards * 3) + ' cards · ' + (cards * 6) + ' tris');
    }
    await clickLeaf(page, 'tuft-3');
    await clickLeaf(page, 'tuft-2');
    await page.locator('[data-mode="LOD0"]').click();
    await expect(page.locator('#plant-counts')).toContainText('12 leaves');

    const moved = await dragHandle(page, 'move', 'X', 36, 12);
    expect(Math.hypot(moved.after.position.x - moved.before.position.x, moved.after.position.z - moved.before.position.z)).toBeGreaterThan(0.001);
    const rotated = await dragHandle(page, 'rotate', 'Y', 35, -25);
    expect(Math.abs(rotated.after.rotationDegrees - rotated.before.rotationDegrees)).toBeGreaterThan(1);
    const inclined = await dragHandle(page, 'rotate', 'X', 20, -30);
    expect(Math.abs(inclined.after.inclinationDegrees - inclined.before.inclinationDegrees)).toBeGreaterThan(1);
    expect(inclined.after.inclinationDegrees).toBeGreaterThanOrEqual(-45);
    expect(inclined.after.inclinationDegrees).toBeLessThanOrEqual(75);
    expect(inclined.after.rotationDegrees).toBeCloseTo(inclined.before.rotationDegrees, 6);
    expect((await snapshot(page)).gizmo.handles).toEqual(['X', 'Y']);
    const turnedAfterTilt = await dragHandle(page, 'rotate', 'Y', -25, 15);
    expect(turnedAfterTilt.after.inclinationDegrees).toBeCloseTo(turnedAfterTilt.before.inclinationDegrees, 6);
    expect(Math.abs(turnedAfterTilt.after.rotationDegrees - turnedAfterTilt.before.rotationDegrees)).toBeGreaterThan(1);
    const buried = await dragHandle(page, 'move', 'Y', 0, 14);
    expect(buried.after.burialMeters - buried.before.burialMeters).toBeGreaterThan(0.001);
    expect(buried.after.burialMeters).toBeLessThanOrEqual(0.06);
    expect(buried.after.position).toEqual(buried.before.position);
    const sized = await dragHandle(page, 'size', 'XYZ', 24, -18);
    expect(sized.after.scale).toBeGreaterThan(sized.before.scale + 0.05);
    expect(sized.after.scale).toBeLessThanOrEqual(2);

    await page.locator('[data-catalog-id="original"]').click();
    expect((await snapshot(page)).placement.catalogId).toBe('original');
    expect((await snapshot(page)).gizmo.enabled).toBe(false);
    await expect(page.locator('#grass-authoring-tools')).toBeHidden();
    await page.keyboard.press('Escape');
    const cancelled = await snapshot(page);
    expect(cancelled.placement).toMatchObject({ catalogId: null, visible: false });
    expect(cancelled.gizmo.enabled).toBe(true);
    expect(cancelled.tufts).toHaveLength(3);
    expect(cancelled.tufts.find(tuft => tuft.id === 'tuft-2')).toEqual(sized.after);

    await page.locator('[data-catalog-id="upright"]').click();
    const clickPoint = await projectGround(page, 0.18, centerZ - 0.23);
    await page.mouse.move(clickPoint.x, clickPoint.y);
    expect((await snapshot(page)).placement).toMatchObject({ catalogId: 'upright', visible: true, valid: true });
    await page.mouse.click(clickPoint.x, clickPoint.y);
    expect((await snapshot(page)).tufts).toHaveLength(4);
    await page.locator('#grass-authoring-delete').click();
    expect((await snapshot(page)).tufts).toHaveLength(3);
    expect((await snapshot(page)).selectedId).toBeNull();
    await clickLeaf(page, 'tuft-3');
    await page.screenshot({ path: path.join(folder, 'authored-three-tufts.png') });

    await page.locator('#grass-authoring-export').click();
    await expect(page.locator('#grass-authoring-status')).toHaveText('Configuration copied to clipboard.');
    const copied = JSON.parse(await page.evaluate(() => window.__copiedTuftConfiguration));
    expect(copied).toMatchObject({ version: 1, type: 'grass-tuft-layout', units: 'meters', angleUnits: 'degrees', area: { width: 1, depth: 1 } });
    expect(copied.tufts).toHaveLength(3);
    const exported = copied.tufts.find(tuft => tuft.id === 'tuft-2');
    for (const field of ['rotationDegrees', 'inclinationDegrees', 'burialMeters', 'scale'])
        expect(exported[field]).toBeCloseTo(sized.after[field], 6);
    expect(copied).toEqual(await page.evaluate(() => window.__plantCardsStudy.authoring.exportConfiguration()));
    const beforeClose = await snapshot(page);
    await tab.click();
    await expect(drawer).toBeHidden();
    expect(await drawer.evaluate(panel => panel.inert)).toBe(true);
    expect((await snapshot(page)).gizmo.enabled).toBe(false);
    await expect(page.locator('#grass-authoring-tools')).toBeHidden();
    expect((await snapshot(page)).tufts).toEqual(beforeClose.tufts);
    await expect.poll(async () => (await page.locator('#plant-canvas').boundingBox()).height).toBe(fullHeight);
    await tab.click();
    await expect(drawer).toBeVisible();
    expect((await snapshot(page)).tufts).toEqual(beforeClose.tufts);
    expect((await snapshot(page)).gizmo.enabled).toBe(true);
    expect((await snapshot(page)).selectedId).toBe('tuft-3');
    await writeFile(path.join(folder, 'authoring-validation.json'), JSON.stringify({ snapshot: await snapshot(page), export: copied, gestures: { moved, rotated, inclined, turnedAfterTilt, buried, sized }, errors }, null, 2));
    expect(errors).toEqual([]);
});


test('Single leaf uses the compact editor and keeps its transform switch beside the selection', async ({ page }) => {
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/debug_tools/grass_plant_study.html?layout=tuft');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await page.locator('#grass-authoring-tab').click();
    await expect(page.locator('[data-catalog-id]')).toHaveCount(1);
    expect((await snapshot(page)).tufts).toHaveLength(1);
    expect((await snapshot(page)).tufts[0].catalogId).toBe('leaf');
    await expect(page.locator('#plant-counts')).toHaveText('1 leaf · 7,856 tris');
    for (const [mode, cards] of [['refined', 10], ['detailed', 5], ['curved', 3], ['split', 2]]) {
        await page.locator('[data-mode="' + mode + '"]').click();
        await expect(page.locator('#plant-counts')).toHaveText('1 leaf · ' + cards + ' cards · ' + cards * 2 + ' tris');
        expect(await page.evaluate(() => window.__plantCardsStudy.authoring.getCounts()))
            .toEqual({ leaves: 1, cards, triangles: cards * 2 });
        expect(await page.evaluate(() => {
            const study = window.__plantCardsStudy;
            return [study.soil.group.visible, study.scene.getObjectByName('GrassV2DirtTerrain').visible];
        })).toEqual([false, true]);
    }
    await page.locator('[data-mode="LOD0"]').click();
    const toolbar = page.locator('#grass-authoring-tools');
    await expect(toolbar).toBeVisible();
    const before = await toolbar.boundingBox();
    await page.locator('[data-pose="three_quarter"]').click();
    const after = await toolbar.boundingBox();
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(5);
    const canvas = await page.locator('#plant-canvas').boundingBox();
    expect(after.y + after.height).toBeLessThan(canvas.y + canvas.height);
    await page.mouse.click(1600, 20);
    expect((await snapshot(page)).selectedId).toBeNull();
    await expect(toolbar).toBeHidden();
    await clickLeaf(page, 'tuft-1');
    await page.locator('[data-authoring-tool="rotate"]').click();
    expect((await snapshot(page)).gizmo.handles).toEqual(['X', 'Y']);
    await page.screenshot({ path: path.join(folder, 'compact-leaf-editor.png') });
    const moved = await dragHandle(page, 'move', 'X', 28, 8);
    let soil = await page.evaluate(() => window.__plantCardsStudy.soil.getSnapshot());
    expect(soil.roots[0].x).toBeCloseTo(moved.after.position.x, 6);
    expect(soil.roots[0].z).toBeCloseTo(moved.after.position.z, 6);
    expect(await page.evaluate(() => window.__plantCardsStudy.soil.group.visible)).toBe(true);
    const heightBeforeBurial = soil.maxHeight;
    const buried = await dragHandle(page, 'move', 'Y', 0, 12);
    soil = await page.evaluate(() => window.__plantCardsStudy.soil.getSnapshot());
    expect(soil.roots[0].burialMeters).toBeCloseTo(buried.after.burialMeters, 6);
    expect(soil.maxHeight).toBeLessThan(heightBeforeBurial);
    await page.setViewportSize({ width: 620, height: 820 });
    await page.locator('[data-pose="far"]').click();
    const narrow = await toolbar.boundingBox();
    expect(narrow.x).toBeGreaterThanOrEqual(12);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(608);
    expect(narrow.y + narrow.height).toBeLessThan(708);
    await page.screenshot({ path: path.join(folder, 'compact-leaf-editor-narrow.png') });
    await page.locator('#grass-authoring-tab').click();
    await expect(toolbar).toBeHidden();
    expect(errors).toEqual([]);
});
