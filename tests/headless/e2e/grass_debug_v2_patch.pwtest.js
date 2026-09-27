// Verify the real transformed blade bodies, including pitch and scale, across eighty randomly placed single-sided tufts.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1, video: 'off' });
const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/overlapping_400');
const gap = 0.0002;

function overlap(a, b) {
    if (a.maxY <= b.minY || b.maxY <= a.minY) return false;
    const dx = b.x - a.x, dz = b.z - a.z;
    const cc = Math.abs(a.c * b.c + a.s * b.s), ss = Math.abs(a.c * b.s - a.s * b.c);
    return Math.abs(dx * a.c - dz * a.s) < a.hx + b.hx * cc + b.hz * ss
        && Math.abs(dx * a.s + dz * a.c) < a.hz + b.hx * ss + b.hz * cc
        && Math.abs(dx * b.c - dz * b.s) < b.hx + a.hx * cc + a.hz * ss
        && Math.abs(dx * b.s + dz * b.c) < b.hz + a.hx * ss + a.hz * cc;
}
function boxCells(b) {
    const ex = Math.abs(b.c) * b.hx + Math.abs(b.s) * b.hz, ez = Math.abs(b.s) * b.hx + Math.abs(b.c) * b.hz, keys = [];
    for (let x = Math.floor((b.x - ex) * 50); x <= Math.floor((b.x + ex) * 50); x++)
        for (let z = Math.floor((b.z - ez) * 50); z <= Math.floor((b.z + ez) * 50); z++) keys.push(x * 1000 + z);
    return keys;
}
function intersects(boxes, grid) {
    for (const b of boxes) for (const key of boxCells(b)) for (const a of grid.get(key) ?? []) if (overlap(a, b)) return true;
    return false;
}
function addBoxes(boxes, grid) {
    for (const b of boxes) for (const key of boxCells(b)) {
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(b);
    }
}

test('Random pose packing allows overlapping 400 blades within the square', async ({ page }) => {
    test.setTimeout(120000); await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=patch');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('#plant-loading')).toBeHidden();
    await expect(page.locator('#plant-counts')).toHaveText('400 leaves · 2,316,800 tris');
    await expect(page.locator('[data-mode]')).toHaveText(['LOD0', 'LOD3 · 12', 'LOD3 · 6', 'LOD3 · 3', 'LOD3 · 2']);
    await expect(page.getByLabel('Square bounds')).toBeChecked();
    const validation = await page.evaluate(async gap => {
        const THREE = await import('three');
        const { GRASS_V2_PLANT } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Plant.js');
        const study = window.__plantCardsStudy, snapshot = study.getSnapshot();
        const { createGrassDebugV2PlantPatchLayout } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2PlantPatchLayout.js');
        const { createGrassDebugV2PlantShapeSources } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2PlantShapeSources.js');
        const shapeSources = createGrassDebugV2PlantShapeSources(study.plant);
        const shapeMetrics = shapeSources.map(shape => {
            const source = study.plant.leaves[shape.side].geometry.attributes.position;
            const uv = study.plant.leaves[shape.side].geometry.attributes.uv, rootY = -GRASS_V2_PLANT.rootDepthMeters;
            const tip = new THREE.Vector3().fromBufferAttribute(source, source.count - 1);
            const changedTip = new THREE.Vector3().fromArray(shape.positions, shape.positions.length - 3);
            const sourceReach = tip.clone().sub(new THREE.Vector3(0, rootY, 0));
            const changedReach = changedTip.clone().sub(new THREE.Vector3(0, rootY, 0));
            let sourceArch = 0, changedArch = 0, rootError = 0, widthError = 0;
            for (let i = 0; i < source.count; i++) if (Math.abs(uv.getX(i) - 0.5) < 1e-5 && uv.getY(i) > 0.07) {
                sourceArch = Math.max(sourceArch, source.getY(i) - rootY - source.getZ(i) * sourceReach.y / sourceReach.z);
                changedArch = Math.max(changedArch, shape.positions[i * 3 + 1] - rootY
                    - shape.positions[i * 3 + 2] * changedReach.y / changedReach.z);
            }
            for (const x of study.plant.roots) {
                const root = new THREE.Vector3(x, rootY, 0);
                rootError = Math.max(rootError, root.clone().applyMatrix4(shape.matrix).distanceTo(root));
                const across = root.clone().add(new THREE.Vector3(0.01, 0, 0)).applyMatrix4(shape.matrix);
                widthError = Math.max(widthError, Math.abs(across.distanceTo(root) - 0.01));
            }
            return { id: shape.id, lengthScale: shape.lengthScale, archScale: shape.archScale,
                lengthRatio: changedReach.length() / sourceReach.length(),
                archRatio: changedArch / (sourceArch * shape.lengthScale), rootError, widthError,
                determinant: shape.matrix.determinant() };
        });
        const repeated = createGrassDebugV2PlantPatchLayout({
            sources: shapeSources,
            rootDepthMeters: GRASS_V2_PLANT.rootDepthMeters, acrossSegments: GRASS_V2_PLANT.acrossSegments
        });
        const deterministic = JSON.stringify(repeated.placements) === JSON.stringify(snapshot.patch.placements);
        const boxesByTuft = [], vertex = new THREE.Vector3(), bounds = new THREE.Box3();
        let vertexCount = 0, allSourceGeometryShared = true, maximumRootDepthError = 0;
        study.scene.updateMatrixWorld(true);
        for (const [tuftIndex, tuft] of study.patch.lod0.children.entries()) {
            const p = snapshot.patch.placements[tuftIndex], c = Math.cos(p.yaw), s = Math.sin(p.yaw), boxes = [];
            const source = study.plant.leaves[p.side];
            for (const mesh of tuft.children.filter(child => child.geometry.name === 'GrassV2PlantLeaf')) {
                allSourceGeometryShared &&= mesh.geometry === source.geometry;
                const position = mesh.geometry.attributes.position, points = [];
                for (let i = 0; i < position.count; i++) {
                    vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
                    bounds.expandByPoint(vertex); vertexCount++;
                    // Undo only yaw, keeping actual pitch, scale and burial in the bounds.
                    points.push([c * vertex.x - s * vertex.z, vertex.y, s * vertex.x + c * vertex.z]);
                }
                const stride = GRASS_V2_PLANT.acrossSegments + 1;
                for (let start = 0; start + stride < position.count; start += stride) {
                    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
                    for (let i = start; i < Math.min(position.count, start + 2 * stride); i++) for (let k = 0; k < 3; k++) {
                        min[k] = Math.min(min[k], points[i][k]); max[k] = Math.max(max[k], points[i][k]);
                    }
                    const x = (min[0] + max[0]) / 2, z = (min[2] + max[2]) / 2;
                    boxes.push({ x: c * x + s * z, z: -s * x + c * z, c, s,
                        hx: (max[0] - min[0]) / 2 + gap, hz: (max[2] - min[2]) / 2 + gap,
                        minY: min[1] - gap, maxY: max[1] + gap });
                }
            }
            for (const x of study.plant.roots) {
                vertex.set(x, -GRASS_V2_PLANT.rootDepthMeters, 0).applyMatrix4(tuft.matrixWorld);
                maximumRootDepthError = Math.max(maximumRootDepthError, Math.abs(vertex.y + GRASS_V2_PLANT.rootDepthMeters * p.depth));
            }
            boxesByTuft.push(boxes);
        }
        const variants = Object.fromEntries(Object.entries(study.patch.representations).map(([name, variant]) => [name, {
            tufts: variant.group.children.length,
            triangles: variant.group.children.reduce((sum, tuft) => sum + tuft.children[0].geometry.index.count / 3, 0),
            cardsPerTuft: variant.boundaries.map(outline => outline.children.length),
            maximumMatrixError: Math.max(...variant.group.children.flatMap((tuft, i) => tuft.matrixWorld.elements
                .map((value, j) => Math.abs(value - study.patch.lod0.children[i].matrixWorld.elements[j]))))
        }]));
        return { snapshot, deterministic, shapeMetrics,
            sharedCardMaterial: Object.values(study.patch.representations).every(variant => variant.group.children.every(tuft => tuft.children[0].material === study.cards.material)),
            cardGeometryCounts: Object.values(study.patch.representations).map(variant => new Set(variant.group.children.map(tuft => tuft.children[0].geometry)).size),
            boxesByTuft, maximumRootDepthError, allSourceGeometryShared, vertexCount, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, variants,
            meshCounts: study.patch.lod0.children.map(tuft => tuft.children.filter(mesh => mesh.geometry.name === 'GrassV2PlantLeaf').length),
            soil: study.soil.getSnapshot(), soilVisible: study.soil.group.visible,
            flatGround: { visible: study.scene.getObjectByName('GrassV2DirtTerrain').visible, triangles: study.scene.getObjectByName('GrassV2DirtTerrain').geometry.index.count / 3 },
            rootSoilHeights: study.patch.roots.map(root => study.soil.getHeightAt(root.x, root.z)) };
    }, gap);
    expect(validation.snapshot.patch).toMatchObject({ tufts: 80, leavesPerTuft: 5, leaves: 400, squareMeters: 1 });
    expect(validation.snapshot.source.leaves).toBe(10);
    expect(validation.snapshot.patch.curvatures).toEqual([
        { id: 'gentle', label: 'Gentle', archScale: 0.65, tufts: 40, leaves: 200 },
        { id: 'straighter', label: 'Straighter', archScale: 0.30, tufts: 40, leaves: 200 }
    ]);
    expect(validation.snapshot.patch.lengths).toEqual([
        { id: 'full', label: 'Full length', lengthScale: 1, share: 0.6, tufts: 48, leaves: 240 },
        { id: 'short', label: 'Short', lengthScale: 0.6, share: 0.4, tufts: 32, leaves: 160 }
    ]);
    for (const curvature of ['gentle', 'straighter']) for (const length of ['full', 'short']) {
        expect(validation.snapshot.patch.placements.filter(p => p.curvatureId === curvature && p.lengthId === length))
            .toHaveLength(length === 'full' ? 24 : 16);
    }
    expect(validation.meshCounts).toEqual(Array(80).fill(5));
    expect(validation.shapeMetrics).toHaveLength(8);
    for (const shape of validation.shapeMetrics) {
        expect(shape.lengthRatio).toBeCloseTo(shape.lengthScale, 10);
        expect(shape.archRatio).toBeCloseTo(shape.archScale, 10);
        expect(shape.rootError).toBeLessThan(1e-12);
        expect(shape.widthError).toBeLessThan(1e-12);
        expect(shape.determinant).toBeGreaterThan(0);
    }
    expect(validation.sharedCardMaterial).toBe(true);
    expect(validation.cardGeometryCounts).toEqual([2, 2, 2, 2]);
    expect(validation.allSourceGeometryShared).toBe(true);
    expect(validation.deterministic).toBe(true);
    expect(validation.maximumRootDepthError).toBeLessThan(1e-12);
    for (const axis of [0, 2]) {
        expect(validation.bounds.min[axis]).toBeGreaterThan(-0.5);
        expect(validation.bounds.max[axis]).toBeLessThan(0.5);
    }
    expect(validation.soil.rootCenters).toHaveLength(400);
    expect(validation.snapshot.rootSoilEnabled).toBe(false);
    expect(validation.soilVisible).toBe(false);
    expect(validation.flatGround).toEqual({ visible: true, triangles: 2 });
    expect(validation.rootSoilHeights.every(height => height > 0.001)).toBe(true);
    const grid = new Map(), placements = validation.snapshot.patch.placements;
    expect(placements.filter(p => p.side === 0)).toHaveLength(40);
    expect(placements.filter(p => p.side === 1)).toHaveLength(40);
    expect(new Set(placements.map(p => p.yaw)).size).toBe(80);
    expect(validation.snapshot.patch.packing.allowIntersections).toBe(true);
    expect(validation.snapshot.patch.packing.collisionAttempts).toBe(0);
    expect(validation.snapshot.patch.packing.recoveredCollidingPoses).toBe(0);
    expect(validation.snapshot.patch.packing.acceptedAfterAdjustment).toBeGreaterThan(0);
    expect(validation.snapshot.patch.packing.shapeAttempts).toBeGreaterThan(validation.snapshot.patch.packing.poseAttempts);
    for (const p of placements) {
        expect(p.scale).toBeGreaterThanOrEqual(0.8); expect(p.scale).toBeLessThanOrEqual(1.05);
        expect(p.inclination).toBeGreaterThanOrEqual(0.95); expect(p.inclination).toBeLessThanOrEqual(1.2);
        expect(p.depth).toBeGreaterThanOrEqual(1); expect(p.depth).toBeLessThanOrEqual(1.05);
        expect(p.burialMeters).toBeGreaterThanOrEqual(0); expect(p.burialMeters).toBeLessThanOrEqual(0.0003);
    }
    let leavesWithOverlappingBounds = 0;
    for (const boxes of validation.boxesByTuft) {
        expect(boxes).toHaveLength(5 * 76);
        expect(boxes.every(b => Object.values(b).every(Number.isFinite))).toBe(true);
        for (let leaf = 0; leaf < 5; leaf++) {
            const body = boxes.slice(leaf * 76, (leaf + 1) * 76);
            if (intersects(body, grid)) leavesWithOverlappingBounds++;
            addBoxes(body, grid);
            expect(intersects(body, grid), 'A duplicated leaf must fail the clearance check').toBe(true);
        }
    }
    expect(leavesWithOverlappingBounds).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(folder, 'lod0-three-quarter.png') });
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await page.screenshot({ path: path.join(folder, 'lod0-top.png') });
    for (const [mode, perTuft] of [['refined',12],['detailed',6],['curved',3],['split',2]]) {
        await page.locator(`[data-mode="${mode}"]`).click();
        await expect(page.locator('#plant-counts')).toHaveText(`400 leaves · ${perTuft * 80} cards · ${perTuft * 160} tris`);
        expect(validation.variants[mode]).toEqual({ tufts: 80, triangles: perTuft * 160,
            cardsPerTuft: Array(80).fill(perTuft), maximumMatrixError: 0 });
        expect(await page.evaluate(mode => {
            const patch = window.__plantCardsStudy.patch;
            return !patch.lod0.visible && Object.entries(patch.representations).every(([name, variant]) => variant.group.visible === (name === mode));
        }, mode)).toBe(true);
        await page.getByLabel('Card bounds').check();
        expect(await page.evaluate(mode => window.__plantCardsStudy.patch.representations[mode].boundaries.every(b => b.visible), mode)).toBe(true);
        await page.getByLabel('Card bounds').uncheck();
        if (mode === 'refined' || mode === 'curved') {
            await page.getByRole('button', { name: '3/4', exact: true }).click();
            await page.screenshot({ path: path.join(folder, `lod3-${perTuft}-three-quarter.png`) });
        }
    }
    for (const label of ['Normal facing', 'Alpha coverage']) {
        await page.getByLabel(label, { exact: true }).uncheck();
        await page.getByLabel(label, { exact: true }).check();
    }
    await page.locator('[data-mode="LOD0"]').click();
    const cameraPoses = {};
    for (const [key, label] of [['far', 'Far'], ['two', '2m'], ['four', '4m'], ['twoAgain', '2m']]) {
        await page.getByRole('button', { name: label, exact: true }).click();
        cameraPoses[key] = await page.evaluate(async () => {
            const THREE = await import('three');
            const { camera, controls, scene } = window.__plantCardsStudy;
            const offset = camera.position.clone().sub(controls.target);
            return { position: camera.position.toArray(), target: controls.target.toArray(),
                height: camera.position.y - scene.getObjectByName('GrassV2DirtTerrain').position.y,
                radius: Math.hypot(offset.x, offset.z), yaw: Math.atan2(offset.x, offset.z),
                aimError: camera.getWorldDirection(new THREE.Vector3()).distanceTo(offset.negate().normalize()),
                maxDistance: controls.maxDistance, distance: camera.position.distanceTo(controls.target) };
        });
        if (key === 'two' || key === 'four') await page.screenshot({ path: path.join(folder, `camera-${label}.png`) });
    }
    expect(cameraPoses.two.height).toBeCloseTo(2, 10);
    expect(cameraPoses.four.height).toBeCloseTo(4, 10);
    expect(cameraPoses.two.radius - cameraPoses.far.radius).toBeCloseTo(1, 10);
    expect(cameraPoses.four.radius - cameraPoses.two.radius).toBeCloseTo(1, 10);
    for (const key of ['two', 'four']) {
        expect(cameraPoses[key].target).toEqual(cameraPoses.far.target);
        expect(cameraPoses[key].yaw).toBeCloseTo(cameraPoses.far.yaw, 10);
        expect(cameraPoses[key].aimError).toBeLessThan(1e-10);
        expect(cameraPoses[key].maxDistance).toBeGreaterThanOrEqual(cameraPoses[key].distance - 1e-10);
    }
    for (let i = 0; i < 3; i++) expect(cameraPoses.twoAgain.position[i]).toBeCloseTo(cameraPoses.two.position[i], 10);
    await expect(page.locator('[data-pose]')).toHaveText(['3/4', 'Side', 'Top', 'Base', 'Far', '2m', '4m']);
    await page.getByRole('button', { name: '3/4', exact: true }).click();
    expect(errors).toEqual([]);
    delete validation.boxesByTuft;
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ ...validation, cameraPoses, leavesWithOverlappingBounds, prismInflationMeters: gap, errors }, null, 2));
});

test('Reference paired editor shows four leaves pointing to the same side in two shared-root V pairs', async ({ page }) => {
    test.setTimeout(60000);
    const singleFolder = path.resolve('tests/artifacts/screens/grass_debug_v2/four_leaf_same_side_tuft');
    await mkdir(singleFolder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=paired');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('#plant-counts')).toHaveText('4 leaves · 37,632 tris');
    await expect(page.getByLabel('Square bounds')).not.toBeChecked();
    await expect(page.locator('[data-mode]')).toHaveText(['LOD0', 'LOD3 · 10', 'LOD3 · 5', 'LOD3 · 3', 'LOD3 · 2']);
    const hierarchy = await page.evaluate(() => {
        const { cards } = window.__plantCardsStudy, snapshot = cards.getSnapshot();
        const names = ['refined', 'detailed', 'curved', 'split'];
        const stages = names.map(name => ({
            name, cards: cards[name].mesh.geometry.index.count / 6,
            stations: snapshot[name === 'curved' ? 'sides' : name + 'Sides'].positive.stations,
            angles: snapshot[name === 'curved' ? 'sides' : name + 'Sides'].positive.anglesDegrees,
            error: snapshot[name === 'curved' ? 'sides' : name + 'Sides'].positive.maximumProfileDeviation,
            tip: Array.from(cards.layout[name + 'Cards'][
                'positive' + (cards[name].mesh.geometry.index.count / 6 - 1)].attributes.position.array)
        }));
        return { ...snapshot.hierarchy, stages };
    });
    expect(hierarchy.masterSides.positive.stations).toHaveLength(13);
    const master = hierarchy.masterSides.positive.stations;
    expect(hierarchy.stages[0].stations).toEqual([0, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => master[i]));
    const referenceFive = hierarchy.referenceFiveSides.positive;
    const [refined, detailed, curved, split] = hierarchy.stages;
    const mergedUpperSpan = [referenceFive.stations[3], referenceFive.stations[5]];
    for (const stage of [detailed, curved, split]) {
        expect(stage.stations.slice(-2)).toEqual(mergedUpperSpan);
        expect(stage.stations[0]).toEqual(referenceFive.stations[0]);
        expect(stage.angles.every(angle => angle > 2)).toBe(true);
        expect(stage.tip).toEqual(detailed.tip);
    }
    expect(detailed.tip).not.toEqual(refined.tip);
    expect(detailed.stations[3].z).toBeGreaterThan(referenceFive.stations[2].z);
    expect(detailed.stations[3].z).toBeLessThan(referenceFive.stations[3].z);
    expect(detailed.error).toBeLessThanOrEqual(referenceFive.maximumProfileDeviation + 1e-8);
    expect(curved.error).toBeLessThan(0.007);
    expect(split.error).toBeLessThan(0.018);
    expect(hierarchy.stages.map(stage => stage.cards)).toEqual([10, 5, 3, 2]);
    const validation = await page.evaluate(async () => {
        const THREE = await import('three'), study = window.__plantCardsStudy, visibleLeaves = [];
        const { GRASS_V2_PLANT } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Plant.js');
        study.scene.updateMatrixWorld(true);
        study.scene.traverseVisible(object => {
            if (object.geometry?.name === 'GrassV2PlantLeaf') visibleLeaves.push(object);
        });
        const pairs = study.plant.roots.map((x, index) => {
            const [a, b] = study.plant.leaves.slice(index * 2, index * 2 + 2);
            const rootA = new THREE.Vector3(0, -GRASS_V2_PLANT.rootDepthMeters, 0).applyMatrix4(a.matrixWorld);
            const rootB = new THREE.Vector3(0, -GRASS_V2_PLANT.rootDepthMeters, 0).applyMatrix4(b.matrixWorld);
            const tips = [a, b].map(leaf => {
                const p = leaf.geometry.attributes.position;
                return new THREE.Vector3().fromBufferAttribute(p, p.count - 1).applyMatrix4(leaf.matrixWorld);
            });
            const ring = geometry => {
                const p = geometry.attributes.position, start = 6 * (GRASS_V2_PLANT.acrossSegments + 1);
                const points = Array.from({ length: GRASS_V2_PLANT.acrossSegments + 1 }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, start + i));
                const bounds = new THREE.Box3().setFromPoints(points), center = bounds.getCenter(new THREE.Vector3());
                const radii = points.map(point => Math.hypot(point.x, point.z));
                return { center: [center.x, center.z], minRadius: Math.min(...radii), maxRadius: Math.max(...radii), height: points[0].y };
            };
            const directions = tips.map(tip => tip.clone().sub(rootA).setY(0).normalize());
            return { x, innerRing: ring(a.geometry), outerRing: ring(b.geometry), rootDistance: rootA.distanceTo(rootB), root: rootA.toArray(), tips: tips.map(tip => tip.toArray()),
                profileHeightDifference: Math.max(...Array.from({ length: a.geometry.attributes.position.count }, (_, i) =>
                    Math.abs(a.geometry.attributes.position.getY(i) - b.geometry.attributes.position.getY(i)))),
                sameDepthProfile: Array.from({ length: a.geometry.attributes.position.count }, (_, i) =>
                    a.geometry.attributes.uv.getY(i) <= 0.07 ? 0 : Math.abs(a.geometry.attributes.position.getZ(i) - b.geometry.attributes.position.getZ(i))).every(error => error < 1e-10),
                horizontalDirectionDot: directions[0].dot(directions[1]),
                crownX: study.plant.crowns[index].getWorldPosition(new THREE.Vector3()).x };
        });
        const strips = visibleLeaves.map(leaf => {
            const p = leaf.geometry.attributes.position, stride = GRASS_V2_PLANT.acrossSegments + 1, result = [];
            for (let row = 0; row + stride < p.count; row += stride) {
                const box = new THREE.Box3();
                for (let i = row; i < Math.min(row + 2 * stride, p.count); i++)
                    box.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(leaf.matrixWorld));
                if (box.max.y > 0) result.push(box);
            }
            return result;
        });
        let overlappingBodyBounds = 0;
        for (let a = 0; a < strips.length; a++) for (let b = a + 1; b < strips.length; b++)
            for (const first of strips[a]) for (const second of strips[b])
                if (first.intersectsBox(second)) overlappingBodyBounds++;
        const upperGeometry = study.plant.leaves[0].geometry, lowerGeometry = study.plant.leaves[1].geometry;
        const grid = new Map(), up = upperGeometry.attributes.position, ui = upperGeometry.index;
        for (let i = 0; i < ui.count; i += 3) {
            const triangle = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(up, ui.getX(i + j)));
            const box = new THREE.Box3().setFromPoints(triangle);
            if (box.max.y < 0) continue;
            for (let x = Math.floor(box.min.x * 200); x <= Math.floor(box.max.x * 200); x++)
                for (let z = Math.floor(box.min.z * 200); z <= Math.floor(box.max.z * 200); z++) {
                    const key = x + ':' + z;
                    if (!grid.has(key)) grid.set(key, []);
                    grid.get(key).push(triangle);
                }
        }
        const edgeRay = new THREE.Ray(), edgeHit = new THREE.Vector3(), crossings = [];
        const lowerP = lowerGeometry.attributes.position, lowerI = lowerGeometry.index;
        const edgeHits = (edges, triangle) => {
            for (let edge = 0; edge < 3; edge++) {
                const start = edges[edge], end = edges[(edge + 1) % 3], length = start.distanceTo(end);
                if (length < 1e-10) continue;
                edgeRay.set(start, end.clone().sub(start).divideScalar(length));
                if (edgeRay.intersectTriangle(...triangle, false, edgeHit) && edgeHit.y >= 0
                    && edgeHit.distanceTo(start) > 1e-8 && edgeHit.distanceTo(start) < length - 1e-8) return edgeHit.toArray();
            }
            return null;
        };
        for (let i = 0; i < lowerI.count; i += 3) {
            const triangle = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(lowerP, lowerI.getX(i + j)));
            const box = new THREE.Box3().setFromPoints(triangle);
            if (box.max.y < 0) continue;
            const candidates = new Set();
            for (let x = Math.floor(box.min.x * 200); x <= Math.floor(box.max.x * 200); x++)
                for (let z = Math.floor(box.min.z * 200); z <= Math.floor(box.max.z * 200); z++)
                    for (const top of grid.get(x + ':' + z) ?? []) candidates.add(top);
            for (const top of candidates) {
                if (!box.intersectsBox(new THREE.Box3().setFromPoints(top))) continue;
                const point = edgeHits(triangle, top) ?? edgeHits(top, triangle);
                if (point) crossings.push(point);
            }
        }
        const lp = lowerGeometry.attributes.position, li = lowerGeometry.index;
        const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)), hit = new THREE.Vector3();
        let sampledMinimumGap = Infinity, contactSamples = 0;
        for (let i = 0; i < li.count; i += 3) {
            const corners = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(lp, li.getX(i + j)));
            for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3 - a; b++) {
                const point = corners[0].clone().multiplyScalar(a / 3).addScaledVector(corners[1], b / 3)
                    .addScaledVector(corners[2], 1 - (a + b) / 3);
                if (point.y < study.plant.getSnapshot().contact.minimumHeightMeters) continue;
                ray.origin.set(point.x, 1, point.z);
                for (const triangle of grid.get(Math.floor(point.x * 200) + ':' + Math.floor(point.z * 200)) ?? []) {
                    if (!ray.intersectTriangle(...triangle, false, hit) || hit.y < study.plant.getSnapshot().contact.minimumHeightMeters) continue;
                    contactSamples++;
                    sampledMinimumGap = Math.min(sampledMinimumGap, hit.y - point.y);
                }
            }
        }
        const upperPositions = study.plant.leaves[0].geometry.attributes.position;
        const { createGrassDebugV2Plant } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Plant.js');
        const originalPlant = createGrassDebugV2Plant({ material: study.plant.leaves[0].material, bodySegments: study.plant.getSnapshot().definition.bodySegments });
        const originalPositions = originalPlant.leaves[0].geometry.attributes.position, stride = GRASS_V2_PLANT.acrossSegments + 1;
        const bodyWidthRatios = [];
        for (let start = 0; start + stride <= upperPositions.count; start += stride) {
            const t = upperGeometry.attributes.uv.getY(start);
            if (t < 0.07 || t > 0.35) continue;
            const width = positions => Math.abs(positions.getX(start + stride - 1) - positions.getX(start));
            bodyWidthRatios.push(width(upperPositions) / width(originalPositions));
        }
        const minimumBodyWidthRatio = Math.min(...bodyWidthRatios);
        const openingSlopes = [];
        for (let start = stride; start + stride < upperPositions.count; start += stride) {
            const current = start + Math.floor(stride / 2), previous = current - stride;
            if (originalPositions.getY(previous) < -0.001 || originalPositions.getZ(current) > 0.06) continue;
            const distance = Math.hypot(originalPositions.getY(current) - originalPositions.getY(previous),
                originalPositions.getZ(current) - originalPositions.getZ(previous));
            const offset = i => originalPositions.getX(i) - upperPositions.getX(i);
            if (distance > 1e-8) openingSlopes.push(Math.atan2(offset(current) - offset(previous), distance));
        }
        const maximumOpeningTurnDegrees = Math.max(...openingSlopes.slice(1).map((angle, i) =>
            Math.abs(angle - openingSlopes[i]) * 180 / Math.PI));
        originalPlant.dispose();
        return { snapshot: study.getSnapshot(), pairs, crossings, minimumBodyWidthRatio, maximumOpeningTurnDegrees, overlappingBodyBounds, sampledMinimumGap, contactSamples, visibleLeafCount: visibleLeaves.length,
            crownCount: study.plant.crowns.length,
            identityTransforms: [study.plant.group, ...['refined', 'detailed', 'curved', 'split'].map(name => study.cards[name].group)]
                .every(group => group.matrix.equals(new THREE.Matrix4())),
            cameraDistance: study.camera.position.distanceTo(study.controls.target) };
    });
    await writeFile(path.join(singleFolder, 'validation.json'), JSON.stringify({ ...validation, errors }, null, 2));
    await page.evaluate(() => {
        const { camera, controls, lighting } = window.__plantCardsStudy;
        camera.position.set(0.075, 0.092, -0.10);
        controls.target.set(0, 0.023, 0.027); controls.update(); lighting.render(0);
    });
    await page.screenshot({ path: path.join(singleFolder, 'lod0-root-close.png') });
    await page.evaluate(() => {
        const { camera, controls, lighting } = window.__plantCardsStudy;
        camera.position.set(-0.075, 0.092, -0.10);
        controls.update(); lighting.render(0);
    });
    await page.screenshot({ path: path.join(singleFolder, 'lod0-root-close-reverse.png') });
    await page.getByRole('button', { name: '3/4', exact: true }).click();
    expect(validation.crossings.length, JSON.stringify(validation.crossings.slice(0, 5))).toBe(0);
    expect(validation.maximumOpeningTurnDegrees).toBeLessThan(3);
    expect(validation.minimumBodyWidthRatio).toBeGreaterThan(0.99);
    expect(validation.snapshot.layout).toBe('paired');
    expect(validation.snapshot.patch).toBeNull();
    expect(validation.snapshot.source).toMatchObject({ definition: { pairs: 2 }, specimens: 2, leaves: 4 });
    expect(validation.visibleLeafCount).toBe(4);
    expect(validation.contactSamples).toBeGreaterThan(0);
    expect(validation.sampledMinimumGap).toBeGreaterThan(0.000029);
    expect(validation.snapshot.source.contact.constraints).toBeGreaterThan(0);
    expect(validation.snapshot.source.contact.contactVertices).toBeGreaterThan(0);
    expect(validation.snapshot.source.contact.maximumPenetrationAfter).toBeLessThan(1e-7);
    expect(validation.snapshot.source.contact.minimumGapMeters).toBeGreaterThan(0);
    expect(validation.snapshot.source.contact.minimumGapMeters).toBeLessThan(0.00015);
    expect(validation.crownCount).toBe(2);
    expect(validation.pairs).toHaveLength(2);
    for (const pair of validation.pairs) {
        expect(pair.rootDistance).toBeLessThan(1e-12);
        expect(Math.hypot(...pair.innerRing.center)).toBeLessThan(0.0001);
        expect(Math.hypot(...pair.outerRing.center)).toBeLessThan(0.0001);
        expect(pair.innerRing.minRadius).toBeGreaterThan(0.0019);
        expect(pair.outerRing.minRadius - pair.innerRing.maxRadius).toBeGreaterThan(0.00003);
        expect(pair.outerRing.height).toBeCloseTo(pair.innerRing.height, 8);
        expect(pair.sameDepthProfile).toBe(true);
        expect(pair.profileHeightDifference).toBeGreaterThan(0.0002);
        expect(pair.profileHeightDifference).toBeLessThan(0.004);
        expect(pair.root[0]).toBeCloseTo(pair.x, 12);
        expect(pair.root[1]).toBeCloseTo(-0.006, 12);
        expect(pair.crownX).toBeCloseTo(pair.x, 12);
        expect(pair.horizontalDirectionDot).toBeGreaterThan(0.95);
        expect(pair.horizontalDirectionDot).toBeLessThan(0.999);
        expect(pair.tips[0][1]).toBeGreaterThan(0.09);
        expect(pair.tips[1][1]).toBeGreaterThan(0.09);
        expect(pair.tips[0][2]).toBeGreaterThan(0);
        expect(pair.tips[1][2]).toBeGreaterThan(0);
    }
    expect(validation.pairs[1].x - validation.pairs[0].x).toBeCloseTo(0.052, 12);
    expect(validation.identityTransforms).toBe(true);
    expect(validation.cameraDistance).toBeLessThan(0.6);
    await page.screenshot({ path: path.join(singleFolder, 'lod0-three-quarter.png') });
    await page.getByRole('button', { name: 'Side', exact: true }).click();
    await page.screenshot({ path: path.join(singleFolder, 'lod0-side.png') });
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await page.screenshot({ path: path.join(singleFolder, 'lod0-top.png') });
    await page.getByRole('button', { name: '3/4', exact: true }).click();
    for (const [mode, count] of [['refined', 10], ['detailed', 5], ['curved', 3], ['split', 2]]) {
        await page.locator('[data-mode="' + mode + '"]').click();
        await expect(page.locator('#plant-counts')).toHaveText('4 leaves · ' + count + ' cards · ' + count * 2 + ' tris');
        expect(await page.evaluate(mode => {
            const study = window.__plantCardsStudy, variant = study.cards[mode];
            const zs = [];
            variant.group.updateMatrixWorld(true);
            variant.group.traverse(object => {
                if (!object.isMesh) return;
                const p = object.geometry.attributes.position;
                for (let i = 0; i < p.count; i++) {
                    const e = object.matrixWorld.elements;
                    zs.push(e[2] * p.getX(i) + e[6] * p.getY(i) + e[10] * p.getZ(i) + e[14]);
                }
            });
            return !study.plant.group.visible && variant.group.visible && Math.min(...zs) >= -1e-6 && Math.max(...zs) > 0.20
                && variant.group.children.filter(object => object.isMesh).length === 1
                && variant.boundaries.children.length === study.getSnapshot().variants[mode].cards;
        }, mode)).toBe(true);
        await page.getByLabel('Card bounds').check();
        expect(await page.evaluate(mode => window.__plantCardsStudy.cards[mode].boundaries.visible, mode)).toBe(true);
        await page.screenshot({ path: path.join(singleFolder, 'shape-cards-' + count + '.png') });
        await page.getByLabel('Card bounds').uncheck();
        await page.getByRole('button', { name: 'Side', exact: true }).click();
        await page.getByLabel('Card bounds').check();
        await page.screenshot({ path: path.join(singleFolder, 'shape-cards-side-' + count + '.png') });
        await page.getByLabel('Card bounds').uncheck();
        await page.getByRole('button', { name: '3/4', exact: true }).click();
        if (mode === 'refined') await page.screenshot({ path: path.join(singleFolder, 'lod3-three-quarter.png') });
    }
    for (const label of ['Normal facing', 'Alpha coverage']) {
        await page.getByLabel(label, { exact: true }).uncheck();
        await page.getByLabel(label, { exact: true }).check();
    }
    await page.locator('[data-mode="LOD0"]').click();
    for (const name of ['Side', 'Top', 'Base', 'Far', '2m', '4m', '3/4'])
        await page.getByRole('button', { name, exact: true }).click();
    await page.getByLabel('Square bounds').check();
    await page.getByLabel('Square bounds').uncheck();
    await page.getByRole('button', { name: '3/4', exact: true }).click();
    expect(errors).toEqual([]);
    await writeFile(path.join(singleFolder, 'validation.json'), JSON.stringify({ ...validation, errors }, null, 2));
});

test('Leaf contact resolves triangle interiors and preserves disjoint leaves and upper geometry', async ({ page }) => {
    await page.goto('/debug_tools/grass_plant_study.html?layout=paired');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { resolveGrassDebugV2LeafContact: solve } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2LeafContact.js');
        const upper = new THREE.PlaneGeometry(0.006, 0.006).rotateX(-Math.PI / 2).translate(0, 0.01, 0.03);
        const lower = new THREE.BufferGeometry();
        lower.setAttribute('position', new THREE.Float32BufferAttribute([-0.02, 0.02, 0.01, 0.02, 0.02, 0.01, 0, 0.02, 0.06], 3));
        lower.setIndex([0, 1, 2]);
        const before = Array.from(lower.attributes.position.array), topBefore = Array.from(upper.attributes.position.array);
        const crossing = solve({ upper, lower });
        const after = Array.from(lower.attributes.position.array), secondPass = solve({ upper, lower });
        const separated = lower.clone().translate(0.1, 0, 0), separatedBefore = Array.from(separated.attributes.position.array);
        const disjoint = solve({ upper, lower: separated });
        const output = { crossing, secondPass, disjoint,
            upperUnchanged: topBefore.every((value, index) => upper.attributes.position.array[index] === value),
            xzUnchanged: before.every((value, index) => index % 3 === 1 || value === after[index]),
            allVerticesOutsideTop: [0, 1, 2].every(i => Math.abs(before[i * 3]) > 0.003 || Math.abs(before[i * 3 + 2] - 0.03) > 0.003),
            disjointUnchanged: separatedBefore.every((value, index) => separated.attributes.position.array[index] === value),
            maximumLowerY: Math.max(...[0, 1, 2].map(i => lower.attributes.position.getY(i))) };
        upper.dispose(); lower.dispose(); separated.dispose();
        return output;
    });
    expect(result.allVerticesOutsideTop).toBe(true);
    expect(result.crossing.constraints).toBeGreaterThan(0);
    expect(result.crossing.maximumPenetrationBefore).toBeGreaterThan(0.01);
    expect(result.crossing.maximumPenetrationAfter).toBeLessThan(1e-7);
    expect(result.crossing.minimumGapMeters).toBeGreaterThan(0.000029);
    expect(result.secondPass.maximumDisplacementMeters).toBeLessThan(1e-7);
    expect(result.upperUnchanged).toBe(true);
    expect(result.xzUnchanged).toBe(true);
    expect(result.disjointUnchanged).toBe(true);
    expect(result.disjoint.deformedVertices).toBe(0);
});
