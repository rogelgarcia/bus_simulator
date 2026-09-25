// The 4/6/12/24-card variants must follow the source curves, switch independently and retain the full projection.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/shadow_fit/layouts');

test('Twenty-leaf row compares 24/12/6/4 cards while keeping the three-card reference off-scene', async ({ page }) => {
    test.setTimeout(90000);
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 1800, height: 1200 });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('#plant-loading')).toBeHidden();
    const fourCardInclinations = await page.evaluate(() => Object.values(window.__plantCardsStudy.cards.layout.splitCards).map(geometry => {
        const p = geometry.attributes.position;
        return Math.atan2(Math.abs(p.getY(2) - p.getY(0)), Math.abs(p.getZ(2) - p.getZ(0))) * 180 / Math.PI;
    }));
    for (const angle of fourCardInclinations) expect(angle, 'All four cards must be inclined, including both upper cards').toBeGreaterThan(2);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'LOD3 Study' })).toBeVisible();
    await expect(page.locator('[data-mode]')).toHaveText(['LOD0', 'LOD3 · 24', 'LOD3 · 12', 'LOD3 · 6', 'LOD3 · 4']);
    await expect(page.getByRole('button', { name: 'LOD3 · 3 cards', exact: true })).toHaveCount(0);
    await expect(page.locator('#plant-counts')).toHaveText('20 leaves · 106,240 tris');
    await expect(page.getByRole('button', { name: 'Side', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Top', exact: true })).toBeVisible();
    await expect(page.getByLabel('Square bounds')).not.toBeChecked();
    await page.getByLabel('Square bounds').check();
    const square = await page.evaluate(async () => {
        const THREE = await import('three');
        const { squareBounds, plant, camera } = window.__plantCardsStudy;
        const bounds = new THREE.Box3().setFromObject(squareBounds), tuft = new THREE.Box3().setFromObject(plant.group);
        const offset = bounds.getCenter(new THREE.Vector3()).sub(tuft.getCenter(new THREE.Vector3()));
        const corners = Array.from({ length: 4 }, (_, i) => squareBounds.localToWorld(
            new THREE.Vector3().fromBufferAttribute(squareBounds.geometry.attributes.position, i)).project(camera).toArray());
        return { size: bounds.getSize(new THREE.Vector3()).toArray(), offset: offset.toArray(), corners,
            visible: squareBounds.visible, color: squareBounds.material.color.toArray() };
    });
    expect(square.visible).toBe(true);
    expect(square.size[0]).toBeCloseTo(1, 8); expect(square.size[2]).toBeCloseTo(1, 8);
    expect(square.offset[0]).toBeCloseTo(0, 8); expect(square.offset[2]).toBeCloseTo(0, 8);
    expect(square.color[2]).toBeGreaterThan(square.color[0]); expect(square.color[2]).toBeGreaterThan(square.color[1]);
    for (const corner of square.corners) for (const value of corner) expect(Math.abs(value)).toBeLessThan(1);
    await expect(page.locator('#plant-counts')).toHaveText('20 leaves · 106,240 tris');
    await page.screenshot({ path: path.join(folder, 'square_LOD0.jpg'), quality: 90 });
    await page.getByRole('button', { name: 'LOD3 · 6', exact: true }).click();
    await expect(page.locator('#plant-counts')).toContainText('6 cards · 12 tris');
    await page.getByLabel('Card bounds').check();
    expect(await page.evaluate(() => window.__plantCardsStudy.squareBounds.visible)).toBe(true);
    await page.screenshot({ path: path.join(folder, 'square_LOD3.jpg'), quality: 90 });
    await page.getByRole('button', { name: 'LOD3 · 4', exact: true }).click();
    await expect(page.locator('#plant-counts')).toHaveText('20 leaves · 4 cards · 8 tris');
    await expect(page.getByRole('button', { name: 'LOD3 · 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => {
        const { cards, plant, squareBounds } = window.__plantCardsStudy;
        return { source: plant.group.visible, split: cards.split.group.visible, curved: cards.curved.group.visible,
            bounds: cards.split.boundaries.visible, square: squareBounds.visible };
    })).toEqual({ source: false, split: true, curved: false, bounds: true, square: true });
    await page.screenshot({ path: path.join(folder, 'square_LOD3_split.jpg'), quality: 90 });
    await page.getByRole('button', { name: 'LOD3 · 12', exact: true }).click();
    await expect(page.locator('#plant-counts')).toHaveText('20 leaves · 12 cards · 24 tris');
    await expect(page.getByRole('button', { name: 'LOD3 · 12', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => {
        const { cards, plant, squareBounds } = window.__plantCardsStudy;
        return { source: plant.group.visible, split: cards.split.group.visible, curved: cards.curved.group.visible,
            detailed: cards.detailed.group.visible, bounds: cards.detailed.boundaries.visible, square: squareBounds.visible };
    })).toEqual({ source: false, split: false, curved: false, detailed: true, bounds: true, square: true });
    await page.screenshot({ path: path.join(folder, 'square_LOD3_detailed.jpg'), quality: 90 });
    await page.getByRole('button', { name: 'LOD3 · 24', exact: true }).click();
    await expect(page.locator('#plant-counts')).toHaveText('20 leaves · 24 cards · 48 tris');
    await expect(page.getByRole('button', { name: 'LOD3 · 24', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => {
        const { cards, plant, squareBounds } = window.__plantCardsStudy;
        return { source: plant.group.visible, variants: ['refined', 'detailed', 'curved', 'split'].map(key => cards[key].group.visible),
            bounds: cards.refined.boundaries.visible, square: squareBounds.visible };
    })).toEqual({ source: false, variants: [true, false, false, false], bounds: true, square: true });
    await page.screenshot({ path: path.join(folder, 'square_LOD3_refined.jpg'), quality: 90 });
    await page.getByRole('button', { name: 'LOD3 · 6', exact: true }).click();
    expect(await page.evaluate(() => window.__plantCardsStudy.cards.refined.group.visible)).toBe(false);
    expect(await page.evaluate(() => window.__plantCardsStudy.cards.detailed.group.visible)).toBe(false);
    await page.getByLabel('Square bounds').uncheck();
    expect(await page.evaluate(() => window.__plantCardsStudy.squareBounds.visible)).toBe(false);
    await expect(page.getByLabel('Card bounds')).toBeChecked();
    const snapshot = await page.evaluate(() => window.__plantCardsStudy.getSnapshot());
    const validation = await page.evaluate(async () => {
        const THREE = await import('three');
        const { cards, plant, soil, renderer, camera, setPose, setMode } = window.__plantCardsStudy;
        const tips = plant.leaves.slice(0, 2).map(leaf => {
            const p = leaf.geometry.attributes.position, uv = leaf.geometry.attributes.uv;
            const points = Array.from({ length: p.count }, (_, i) => i)
                .filter(i => Math.abs(uv.getX(i) - 0.5) < 1e-5 && uv.getY(i) >= 0.15)
                .map(i => new THREE.Vector3().fromBufferAttribute(p, i));
            const slopes = points.slice(1).map((point, i) => {
                const delta = point.clone().sub(points[i]);
                return THREE.MathUtils.radToDeg(Math.atan2(delta.y, Math.hypot(delta.x, delta.z)));
            });
            const start = points[0], end = points.at(-1);
            const reach = Math.hypot(end.x - start.x, end.z - start.z);
            const bow = Math.max(...points.map(point => point.y - THREE.MathUtils.lerp(start.y, end.y,
                Math.hypot(point.x - start.x, point.z - start.z) / reach)));
            return { height: end.y, slopes, bow };
        });
        setMode('LOD0');
        const shadowDraws = { split: 0, curved: 0, detailed: 0, refined: 0, source: 0 };
        cards.split.mesh.onBeforeShadow = () => shadowDraws.split++;
        cards.curved.mesh.onBeforeShadow = () => shadowDraws.curved++;
        cards.detailed.mesh.onBeforeShadow = () => shadowDraws.detailed++;
        cards.refined.mesh.onBeforeShadow = () => shadowDraws.refined++;
        plant.leaves.forEach(leaf => { leaf.onBeforeShadow = () => shadowDraws.source++; });
        setMode('split');
        const splitShadowDraws = { ...shadowDraws };
        shadowDraws.split = 0;
        setMode('curved');
        const curvedShadowDraws = { ...shadowDraws };
        shadowDraws.curved = 0;
        setMode('detailed');
        const detailedShadowDraws = { ...shadowDraws };
        shadowDraws.detailed = 0;
        setMode('refined');
        const refinedShadowDraws = { ...shadowDraws };
        cards.split.mesh.onBeforeShadow = () => {};
        cards.curved.mesh.onBeforeShadow = () => {};
        cards.detailed.mesh.onBeforeShadow = () => {};
        cards.refined.mesh.onBeforeShadow = () => {};
        plant.leaves.forEach(leaf => { leaf.onBeforeShadow = () => {}; });
        const normal = cards.atlas.normal.image.data, rough = cards.atlas.roughness.image.data, alpha = cards.atlas.albedo.image.data;
        const w = cards.atlas.albedo.image.width, h = cards.atlas.albedo.image.height;
        let upperHolePixels = 0, normalError = 0, roughMin = 1, roughMax = 0, occupied = 0, allLeafTexels = 0, upperLeafTexels = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const z = cards.layout.frame.maxZ - (y + 0.5) / h * (cards.layout.frame.maxZ - cards.layout.frame.minZ);
            if (x >= w / 2 && z > cards.layout.negative && z < cards.layout.positive && alpha[i + 3]) upperHolePixels++;
            if (alpha[i + 3] < 250) continue;
            occupied++;
            if (x < w / 2) allLeafTexels++; else upperLeafTexels++;
            normalError = Math.max(normalError, Math.abs(Math.hypot(normal[i] * 2 / 255 - 1, normal[i + 1] * 2 / 255 - 1, normal[i + 2] * 2 / 255 - 1) - 1));
            roughMin = Math.min(roughMin, rough[i + 1] / 255); roughMax = Math.max(roughMax, rough[i + 1] / 255);
        }
        const leavesPerSide = [0.12, -0.12].map(z => {
            const y = Math.floor((cards.layout.frame.maxZ - z) / (cards.layout.frame.maxZ - cards.layout.frame.minZ) * h);
            let count = 0, previous = false;
            for (let x = w / 2; x < w; x++) {
                const covered = alpha[(y * w + x) * 4 + 3] >= 128;
                if (covered && !previous) count++;
                previous = covered;
            }
            return count;
        });
        const savedTarget = renderer.getRenderTarget(), savedAspect = camera.aspect;
        const { createLegacySplitPlantGeometry } = await import('/tests/headless/perf/helpers/grass_legacy_split_geometry.js');
        const legacySplit = createLegacySplitPlantGeometry(cards.layout);
        const splitGeometry = cards.split.mesh.geometry;
        const target = new THREE.WebGLRenderTarget(900, 600);
        const material = new THREE.MeshBasicMaterial({ map: cards.atlas.albedo, alphaTest: 0.15, side: THREE.DoubleSide, toneMapped: false });
        const scene = new THREE.Scene(), mesh = new THREE.Mesh(cards.joined.mesh.geometry, material); scene.add(mesh);
        const pixels = new Uint8Array(900 * 600 * 4), masks = [];
        const coverage = [];
        for (const pose of ['three_quarter', 'side', 'elevated', 'crown_close']) {
            setPose(pose); camera.aspect = 1.5; camera.updateProjectionMatrix();
            for (const geometry of [cards.joined.mesh.geometry, legacySplit]) {
                mesh.geometry = geometry;
                renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
                renderer.readRenderTargetPixels(target, 0, 0, 900, 600, pixels); masks.push(new Uint8Array(pixels));
            }
            const [a, b] = masks.splice(0); let union = 0, mismatch = 0, rgbDifference = 0;
            for (let i = 0; i < a.length; i += 4) {
                const aa = a[i + 3] > 0, bb = b[i + 3] > 0;
                if (aa || bb) union++;
                if (aa !== bb) mismatch++;
                if (aa && bb) rgbDifference += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
            }
            coverage.push({ pose, union, mismatchFraction: mismatch / union, rgbDifferencePerPixel: rgbDifference / union / 3 });
        }
        renderer.setRenderTarget(savedTarget); camera.aspect = savedAspect; camera.updateProjectionMatrix(); target.dispose(); material.dispose(); legacySplit.dispose();
        const measureSides = (geometries, count) => ['negative', 'positive'].map(side => {
            const segments = Array.from({ length: count }, (_, i) => {
                const geometry = geometries[`${side}${i}`], p = geometry.attributes.position, uv = geometry.attributes.uv;
                const first = side === 'positive' ? 0 : 2, last = 2 - first;
                return { from: [p.getY(first), p.getZ(first), uv.getY(first)], to: [p.getY(last), p.getZ(last), uv.getY(last)],
                    u: Array.from({ length: uv.count }, (_, i) => uv.getX(i)),
                    angle: THREE.MathUtils.radToDeg(Math.atan2(p.getY(last) - p.getY(first), Math.abs(p.getZ(last) - p.getZ(first)))) };
            });
            const leaf = plant.leaves.find(leaf => {
                const p = leaf.geometry.attributes.position;
                return Math.sign(p.getZ(p.count - 1)) === (side === 'positive' ? 1 : -1);
            });
            const p = leaf.geometry.attributes.position, uv = leaf.geometry.attributes.uv;
            let maximumError = 0;
            for (let i = 0; i < p.count; i++) {
                if (Math.abs(uv.getX(i) - 0.5) > 1e-5 || uv.getY(i) <= 0.07) continue;
                const z = p.getZ(i), segment = segments.find(({ from, to }) => z >= Math.min(from[1], to[1]) && z <= Math.max(from[1], to[1]));
                if (!segment) throw new Error('Source centerline lies outside the fitted cards.');
                const y = THREE.MathUtils.lerp(segment.from[0], segment.to[0], (z - segment.from[1]) / (segment.to[1] - segment.from[1]));
                maximumError = Math.max(maximumError, Math.abs(y - p.getY(i)));
            }
            return { segments, maximumError };
        });
        const sideGeometry = measureSides(cards.layout.curvedCards, 3), splitSideGeometry = measureSides(cards.layout.splitCards, 2);
        const detailedSideGeometry = measureSides(cards.layout.detailedCards, 6);
        const refinedSideGeometry = measureSides(cards.layout.refinedCards, 12);
        return { tips, upperHolePixels, normalError, roughMin, roughMax, occupied, coverage, splitShadowDraws, curvedShadowDraws, detailedShadowDraws, leavesPerSide, sideGeometry,
            detailedSideGeometry, refinedSideGeometry, refinedShadowDraws,
            refined: { triangles: cards.refined.mesh.geometry.index.count / 3, boundaries: cards.refined.boundaries.children.length,
                cards: Object.keys(cards.layout.refinedCards).length, groups: cards.refined.mesh.geometry.groups.length,
                sameMaterial: cards.refined.mesh.material === cards.curved.mesh.material },
            detailed: { triangles: cards.detailed.mesh.geometry.index.count / 3, boundaries: cards.detailed.boundaries.children.length,
                cards: Object.keys(cards.layout.detailedCards).length, groups: cards.detailed.mesh.geometry.groups.length,
                sameMaterial: cards.detailed.mesh.material === cards.curved.mesh.material },
            splitSideGeometry,
            upperLeafFraction: upperLeafTexels / allLeafTexels, rootSoilHeights: plant.roots.map(x => soil.getHeightAt(x, 0)),
            split: { triangles: splitGeometry.index.count / 3, boundaries: cards.split.boundaries.children.length,
                groups: splitGeometry.groups.length },
            cardNames: Object.keys(cards.layout.curvedCards), boundaries: cards.curved.boundaries.children.length,
            activeTriangles: cards.curved.mesh.geometry.index.count / 3, baselineDetached: cards.joined.mesh.parent === null,
            triangles: [cards.joined.mesh.geometry.index.count / 3, legacySplit.index.count / 3],
            groups: [cards.joined.mesh.geometry.groups.length, legacySplit.groups.length] };
    });
    for (let side = 0; side < 2; side++) {
        const coarse = validation.splitSideGeometry[side].segments;
        const reference = validation.sideGeometry[side].segments;
        expect(coarse[1], 'LOD3 · 4 must preserve the complete outer card from LOD3 · 6').toEqual(reference[2]);
        expect(coarse[0].from, 'The merged lower card must retain the shared root').toEqual(reference[0].from);
        expect(coarse[0].to, 'The merged lower card must reach the preserved tip card').toEqual(reference[1].to);
        expect(coarse[0].angle, 'The longer lower cards must retain a substantial incline').toBeGreaterThan(30);
    }
    const captures = {};
    for (const pose of ['three_quarter', 'far', 'side', 'elevated', 'crown_close']) {
        for (const mode of ['LOD0', 'refined', 'detailed', 'curved', 'split']) {
            const data = await page.evaluate(({ mode, pose }) => window.__plantCardsStudy.capture(mode, pose), { mode, pose });
            captures[`${pose}_${mode}`] = data;
            await writeFile(path.join(folder, `${pose}_${mode}.png`), Buffer.from(data.split(',')[1], 'base64'));
        }
    }
    for (const mode of ['split', 'curved', 'detailed', 'refined']) {
        const data = await page.evaluate(mode => window.__plantCardsStudy.capture(mode, 'three_quarter', true), mode);
        captures[`bounds_${mode}`] = data;
        await writeFile(path.join(folder, `bounds_${mode}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    for (const [name, keys, labels] of [
        ['comparison', ['three_quarter_LOD0', 'three_quarter_curved'], ['LOD0 · 20 leaves', 'LOD3 · 6 / 12 tris']],
        ['top_comparison', ['elevated_LOD0', 'elevated_curved'], ['LOD0 · 44 mm root spacing', 'LOD3 · 6 / 12 tris']],
        ['twelve_comparison', ['three_quarter_LOD0', 'three_quarter_detailed'], ['LOD0 · 20 leaves', 'LOD3 · 12 / 24 tris']],
        ['twenty_four_comparison', ['three_quarter_LOD0', 'three_quarter_refined'], ['LOD0 · 20 leaves', 'LOD3 · 24 / 48 tris']],
        ['twenty_four_side_comparison', ['side_detailed', 'side_refined'], ['LOD3 · 12', 'LOD3 · 24']],
        ['twenty_four_boundaries', ['bounds_detailed', 'bounds_refined'], ['12 cards · 6 per side', '24 cards · 12 per side']],
        ['twelve_top_comparison', ['elevated_LOD0', 'elevated_detailed'], ['LOD0 · reference', 'LOD3 · 12 / 24 tris']],
        ['twelve_side_comparison', ['side_curved', 'side_detailed'], ['LOD3 · 6', 'LOD3 · 12']],
        ['twelve_boundaries', ['bounds_curved', 'bounds_detailed'], ['6 cards · 3 per side', '12 cards · 6 per side']],
        ['side_comparison', ['side_LOD0', 'side_curved'], ['LOD0 · reference', 'LOD3 · 3 inclined cards per side']],
        ['four_side_comparison', ['side_LOD0', 'side_split'], ['LOD0 · reference', 'LOD3 · 2 inclined cards per side']],
        ['lod3_comparison', ['three_quarter_split', 'three_quarter_curved'], ['LOD3 · 4 / 8 tris', 'LOD3 · 6 / 12 tris']],
        ['boundaries', ['bounds_split', 'bounds_curved'], ['4 cards · 2 inclined cards per side', '6 cards · 3 inclined cards per side']]
    ]) {
        const data = await page.evaluate(async ({ images, labels }) => {
            const canvas = document.createElement('canvas'); canvas.width = images.length * 900; canvas.height = 654;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#17211b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = '25px system-ui'; ctx.fillStyle = '#eef3ea';
            for (let i = 0; i < images.length; i++) { const image = new Image(); image.src = images[i]; await image.decode();
                ctx.drawImage(image, i * 900, 54, 900, 600); ctx.fillText(labels[i], i * 900 + 24, 36); }
            return canvas.toDataURL('image/png');
        }, { images: keys.map(key => captures[key]), labels });
        await writeFile(path.join(folder, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    await page.screenshot({ path: path.join(folder, 'study_ui.png') });
    await writeFile(path.join(folder, 'capture.json'), JSON.stringify({ snapshot, square, validation, errors }, null, 2));
    console.log(JSON.stringify({ snapshot, square, validation, errors }));
    expect(errors).toEqual([]);
    expect(snapshot.specimens).toBe(10); expect(snapshot.sourceLeaves).toBe(20);
    expect(snapshot.variants).toEqual({ split: { cards: 4, cardsPerSide: 2, triangles: 8 }, curved: { cards: 6, cardsPerSide: 3, triangles: 12 },
        detailed: { cards: 12, cardsPerSide: 6, triangles: 24 }, refined: { cards: 24, cardsPerSide: 12, triangles: 48 } });
    expect(validation.refined).toEqual({ triangles: 48, boundaries: 24, cards: 24, groups: 0, sameMaterial: true });
    expect(snapshot.refinedMaximumHeight).toBeCloseTo(snapshot.maximumHeight, 7);
    expect(snapshot.refinedMaximumProfileDeviation).toBeLessThan(snapshot.detailedMaximumProfileDeviation / 2);
    expect(validation.detailed).toEqual({ triangles: 24, boundaries: 12, cards: 12, groups: 0, sameMaterial: true });
    expect(snapshot.detailedMaximumHeight).toBeCloseTo(snapshot.maximumHeight, 7);
    expect(snapshot.detailedMaximumProfileDeviation).toBeLessThan(snapshot.maximumProfileDeviation / 2);
    expect(snapshot.splitArea).toBeGreaterThan(0); expect(snapshot.splitArea).toBeLessThan(snapshot.joinedArea);
    expect(validation.split).toEqual({ triangles: 8, boundaries: 4, groups: 0 });
    expect(validation.cardNames).toEqual(['negative0', 'negative1', 'negative2', 'positive0', 'positive1', 'positive2']);
    expect(validation.boundaries).toBe(6); expect(validation.activeTriangles).toBe(12);
    expect(validation.baselineDetached).toBe(true);
    expect(snapshot.source.roots).toHaveLength(10);
    expect(new Set(snapshot.source.roots).size).toBe(10);
    expect(snapshot.source.roots[0]).toBeCloseTo(-0.198, 8);
    expect(snapshot.source.roots.at(-1)).toBeCloseTo(0.198, 8);
    for (let i = 1; i < snapshot.source.roots.length; i++) {
        expect(snapshot.source.roots[i] - snapshot.source.roots[i - 1]).toBeCloseTo(0.044, 8);
    }
    expect(validation.leavesPerSide).toEqual([10, 10]);
    expect(validation.upperLeafFraction).toBeGreaterThan(0.5);
    expect(snapshot.maximumHeight).toBeGreaterThan(0.10);
    expect(snapshot.maximumHeight).toBeLessThan(0.11);
    expect(snapshot.splitMaximumHeight).toBeCloseTo(snapshot.maximumHeight, 7);
    expect(snapshot.fitTarget).toBe('upper_blade_margins');
    for (const [sides, count, maxError, profileError] of [
        [validation.splitSideGeometry, 2, 0.013, snapshot.splitMaximumProfileDeviation],
        [validation.sideGeometry, 3, 0.005, snapshot.maximumProfileDeviation],
        [validation.detailedSideGeometry, 6, 0.002, snapshot.detailedMaximumProfileDeviation],
        [validation.refinedSideGeometry, 12, 0.0005, snapshot.refinedMaximumProfileDeviation]]) {
        expect(profileError, `${count} cards per side must follow the outer profile within ${maxError * 1000} mm`).toBeLessThan(maxError);
        for (const { segments, maximumError } of sides) {
            expect(segments).toHaveLength(count);
            for (const segment of segments) {
                expect(segment.angle).toBeGreaterThan(2);
                expect(segment.u, 'Every live card must use the full first atlas page').toEqual([0, 0.5, 0, 0.5]);
            }
            for (let i = 1; i < segments.length; i++) {
                expect(segments[i].from).toEqual(segments[i - 1].to);
                expect(segments[i - 1].angle - segments[i].angle).toBeGreaterThan(count >= 6 ? 0 : 5);
            }
            expect(maximumError, 'The outer fit must stay within 9 mm of the source centerline').toBeLessThan(0.009);
            expect(maximumError).toBeLessThan(snapshot.baseline.maximumCenterlineDeviation / 2);
        }
    }
    for (const tip of validation.tips) {
        expect(tip.height).toBeGreaterThan(0.095); expect(tip.height).toBeLessThan(0.11);
        expect(tip.bow, 'The blade must have a visible arch above its root-to-tip chord').toBeGreaterThan(0.012);
        expect(tip.bow).toBeLessThan(0.03);
        expect(Math.min(...tip.slopes)).toBeGreaterThan(3);
        expect(Math.max(...tip.slopes)).toBeLessThan(55);
        expect(tip.slopes[0] - tip.slopes.at(-1)).toBeGreaterThan(20);
        for (let i = 1; i < tip.slopes.length; i++) expect(Math.abs(tip.slopes[i] - tip.slopes[i - 1])).toBeLessThan(2);
    }
    for (const height of validation.rootSoilHeights) expect(height).toBeGreaterThan(0.001);
    expect(validation.triangles).toEqual([6, 8]); expect(validation.groups).toEqual([0, 0]);
    expect(validation.upperHolePixels).toBe(0);
    expect(validation.splitShadowDraws).toEqual({ split: 1, curved: 0, detailed: 0, refined: 0, source: 0 });
    expect(validation.curvedShadowDraws).toEqual({ split: 0, curved: 1, detailed: 0, refined: 0, source: 0 });
    expect(validation.detailedShadowDraws).toEqual({ split: 0, curved: 0, detailed: 1, refined: 0, source: 0 });
    expect(validation.refinedShadowDraws).toEqual({ split: 0, curved: 0, detailed: 0, refined: 1, source: 0 });
    expect(validation.occupied).toBeGreaterThan(10000); expect(validation.normalError).toBeLessThan(0.012);
    expect(validation.roughMin).toBeGreaterThan(0.60); expect(validation.roughMax).toBeLessThan(0.75);
    for (const view of validation.coverage) { expect(view.union).toBeGreaterThan(100);
        expect(view.mismatchFraction, `${view.pose}: removing empty space must preserve the silhouette`).toBeLessThan(0.015);
        expect(view.rgbDifferencePerPixel).toBeLessThan(1); }
});
