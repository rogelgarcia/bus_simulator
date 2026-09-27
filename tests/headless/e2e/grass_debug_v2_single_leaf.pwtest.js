// Verify the reset study contains one upright blade with a continuous, gently bending centerline.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, video: 'off' });
test('Leaf study replaces existing tuft links with one upright LOD0 blade', async ({ page }) => {
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/single_upright_leaf');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=tuft&revision=single-original-tuft');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.getByRole('heading', { name: 'Leaf Study' })).toBeVisible();
    await expect(page.locator('#plant-counts')).toHaveText('1 leaf · 7,856 tris');
    await expect(page.getByRole('group', { name: 'Representation', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'LOD3 corrections', exact: true })).toBeVisible();
    await expect(page.locator('#grass-authoring-tab')).toBeVisible();
    await expect(page.locator('#grass-authoring-panel')).toBeHidden();
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), study = window.__plantCardsStudy;
        const { plant, scene } = study, geometry = plant.leaves[0].geometry;
        const p = geometry.attributes.position, n = geometry.attributes.normal, index = geometry.index;
        const source = plant.getSnapshot(), stride = source.definition.acrossSegments + 1, centers = [], visibleLeaves = [];
        for (let start = 0; start < p.count; start += stride)
            centers.push(new THREE.Vector3().fromBufferAttribute(p, start + Math.floor(Math.min(stride, p.count - start) / 2)));
        let minimumArea = Infinity, minimumRise = Infinity;
        for (let i = 0; i < index.count; i += 3) {
            const [a, b, c] = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index.getX(i + j)));
            minimumArea = Math.min(minimumArea, b.sub(a).cross(c.sub(a)).length() * 0.5);
        }
        for (let i = 1; i < centers.length; i++) minimumRise = Math.min(minimumRise, centers[i].y - centers[i - 1].y);
        const curve = new THREE.CubicBezierCurve3(...source.definition.curve.map(point => new THREE.Vector3(...point)));
        const angles = Array.from({ length: 101 }, (_, i) => {
            const tangent = curve.getTangent(i / 100);
            return Math.atan2(tangent.y, tangent.z) * 180 / Math.PI;
        });
        scene.traverseVisible(object => { if (object.geometry?.name?.includes('Leaf')) visibleLeaves.push(object.name); });
        const widths = [];
        for (let row = 0; row * stride < p.count; row++) {
            const start = row * stride, count = Math.min(stride, p.count - start);
            const xs = Array.from({ length: count }, (_, i) => p.getX(start + i));
            widths.push({ t: geometry.attributes.uv.getY(start), width: Math.max(...xs) - Math.min(...xs) });
        }
        const peakWidth = Math.max(...widths.map(row => row.width));
        const tipWidthRatios = [0.75, 0.9, 0.98].map(t => widths.reduce((best, row) => Math.abs(row.t - t) < Math.abs(best.t - t) ? row : best).width / peakWidth);
        const taperRows = widths.filter(row => row.t >= 0.35);
        const taperNarrows = taperRows.slice(1).every((row, i) => row.width < taperRows[i].width);
        return { snapshot: study.getSnapshot(), minimumArea, minimumRise, angles, visibleLeaves, tipWidthRatios, taperNarrows,
            finite: Array.from(p.array).every(Number.isFinite),
            maximumNormalError: Math.max(...Array.from({ length: n.count }, (_, i) => Math.abs(new THREE.Vector3().fromBufferAttribute(n, i).length() - 1))),
            noTufts: study.cards !== null && study.patch === null && !study.authoring.hasStarted() && plant.crowns.length === 1 };
    });
    expect(result.snapshot.layout).toBe('leaf');
    expect(result.snapshot.profile.rootHeightMeters).toBeLessThan(0);
    expect(result.snapshot.source).toMatchObject({ model: 'single-upright-leaf', leaves: 1, crownTriangles: 720, leafTriangles: 7136 });
    expect(result.visibleLeaves).toEqual(['GrassV2UprightAuthoringLeaf']);
    expect(result.noTufts).toBe(true);
    expect(result.finite).toBe(true);
    expect(result.minimumArea).toBeGreaterThan(1e-14);
    expect(result.taperNarrows).toBe(true);
    result.tipWidthRatios.forEach((width, i) => {
        expect(width).toBeGreaterThan(0);
        expect(width).toBeLessThan([0.65, 0.32, 0.12][i]);
    });
    expect(result.minimumRise).toBeGreaterThan(0);
    expect(result.maximumNormalError).toBeLessThan(1e-6);
    expect(result.angles[0]).toBeGreaterThan(65);
    expect(result.angles.at(-1)).toBeGreaterThan(45);
    expect(result.angles[0] - result.angles.at(-1)).toBeLessThan(25);
    expect(result.angles.slice(1).every((angle, i) => angle <= result.angles[i] + 1e-8)).toBe(true);
    expect(result.snapshot.source.bounds.min[1]).toBeLessThan(0);
    expect(result.snapshot.source.bounds.max[1]).toBeCloseTo(0.195, 3);
    for (const [mode, cards] of [['refined', 10], ['detailed', 5], ['curved', 3], ['split', 2]]) {
        await page.locator('[data-mode="' + mode + '"]').click();
        await expect(page.locator('#plant-counts')).toHaveText('1 leaf · ' + cards + ' cards · ' + cards * 2 + ' tris');
        const lod = await page.evaluate(mode => {
            const study = window.__plantCardsStudy, variant = study.cards[mode];
            return { sourceVisible: study.plant.group.visible, cardsVisible: variant.group.visible,
                counts: study.cards.getSnapshot().variants[mode],
                finite: Array.from(variant.mesh.geometry.attributes.position.array).every(Number.isFinite) };
        }, mode);
        expect(lod).toMatchObject({ sourceVisible: false, cardsVisible: true, finite: true,
            counts: { cards, triangles: cards * 2 } });
        for (const pose of ['three_quarter', 'side']) {
            await page.evaluate(pose => window.__plantCardsStudy.setPose(pose), pose);
            await page.screenshot({ path: path.join(folder, 'lod3-' + cards + '-' + pose + '.png') });
            if (cards <= 3) {
                await page.locator('#card-bounds').check();
                await page.screenshot({ path: path.join(folder, 'lod3-' + cards + '-' + pose + '-bounds.png') });
                await page.locator('#card-bounds').uncheck();
            }
        }
    }
    await page.locator('#normal-facing').uncheck();
    await page.locator('#alpha-coverage').uncheck();
    expect(await page.evaluate(() => window.__plantCardsStudy.cards.getSnapshot().corrections))
        .toEqual({ normalFacing: false, alphaCoverage: false });
    await page.locator('#normal-facing').check();
    await page.locator('#alpha-coverage').check();
    await page.locator('#card-bounds').check();
    expect(await page.evaluate(() => window.__plantCardsStudy.cards.split.boundaries.visible)).toBe(true);
    await page.locator('#card-bounds').uncheck();
    await page.locator('[data-mode="LOD0"]').click();
    await page.addStyleTag({ content: '.plant-study-panel { visibility: hidden; }' });
    for (const pose of ['three_quarter', 'side', 'elevated']) {
        await page.evaluate(pose => window.__plantCardsStudy.setPose(pose), pose);
        await page.screenshot({ path: path.join(folder, pose + '.png') });
    }
    const tipFolder = path.resolve('tests/artifacts/screens/grass_debug_v2/natural_tip');
    await mkdir(tipFolder, { recursive: true });
    for (const mode of ['LOD0', 'refined', 'curved']) {
        await page.evaluate(mode => {
            const study = window.__plantCardsStudy;
            study.camera.position.set(0.018, 0.235, 0.005); study.camera.up.set(0, 1, 0);
            study.camera.fov = 32; study.camera.updateProjectionMatrix();
            study.controls.target.set(0, 0.177, -0.09); study.controls.update(); study.setMode(mode);
        }, mode);
        await page.screenshot({ path: path.join(tipFolder, mode + '-tip.png') });
    }
    await page.evaluate(() => window.__plantCardsStudy.setSquareBounds(true));
    expect(await page.evaluate(() => window.__plantCardsStudy.squareBounds.visible)).toBe(true);
    await page.evaluate(() => window.__plantCardsStudy.setSquareBounds(false));
    for (const suffix of ['', '?layout=leaf']) {
        await page.goto('/debug_tools/grass_plant_study.html' + suffix);
        await page.waitForFunction(() => !!window.__plantCardsReadiness);
        await page.evaluate(() => window.__plantCardsReadiness);
        await expect(page.locator('#plant-counts')).toHaveText('1 leaf · 7,856 tris');
    }
    for (const name of ['3/4', 'Side', 'Top', 'Base', 'Far', '2m', '4m'])
        await page.getByRole('button', { name, exact: true }).click();
    expect(errors).toEqual([]);
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ ...result, errors }, null, 2));
});
