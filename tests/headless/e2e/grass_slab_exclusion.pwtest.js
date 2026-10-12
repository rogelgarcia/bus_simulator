// Check grass against the actual rendered slab feet, including the bus-start reservation.
import test, { expect } from '@playwright/test';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const output = path.resolve('tests/artifacts/screens/grass/ai612_sloped_base_exclusion');
const phase = process.env.AI612_CAPTURE_PHASE === 'before' ? 'before' : 'after';

async function rendered(page) {
    await page.evaluate(() => new Promise(resolve => {
        let count = 0;
        const unsubscribe = window.__busSim.engine.addFrameListener(({ rendered }) => {
            if (rendered && ++count === 4) { unsubscribe(); resolve(); }
        });
    }));
}

test('gameplay grass starts outside building and bus slab slopes at every detail distance', async ({ page }) => {
    test.setTimeout(180_000);
    await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1600, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (phase === 'before') await page.route('**/GrassCoverageMask.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('slabFootprints.forEach(loop => draw([loop], 0));', '') });
    });
    await page.goto('/?pose=civic_center_curve_front&coreTests=0');
    await page.waitForFunction(() => !!window.__busSim?.engine.context.city?.grass, null, { timeout: 90_000 });
    await page.evaluate(async () => {
        const { engine, sm } = window.__busSim;
        await Promise.all([engine.context.city.grass.ready, engine.context.city.world.readyPromise,
            sm.current.busModel.userData.readyPromise, engine.waitForLightingReady()]);
    });
    await rendered(page);
    const boundary = await page.evaluate(() => {
        const city = window.__busSim.engine.context.city, grass = city.grass;
        const slabs = city.group.getObjectByName('BuildingSlabs').children;
        const reservation = city.map.reservations.find(entry => entry.type === 'bus_start');
        const center = reservation.loops[0].reduce((sum, p, _, points) => ({ x: sum.x + p.x / points.length, z: sum.z + p.z / points.length }), { x: 0, z: 0 });
        const inside = (loop, p) => {
            let hit = false;
            for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
                const a = loop[i], b = loop[j];
                if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) hit = !hit;
            }
            return hit;
        };
        const busIndex = slabs.findIndex(mesh => inside(mesh.userData.buildingSlabPlan.top, center));
        const summaries = [], candidates = [];
        slabs.forEach((mesh, slabIndex) => {
            const { top, foot, edgeModes } = mesh.userData.buildingSlabPlan;
            let checked = 0, leaks = 0, slopeSamples = 0, triangleLeaks = 0;
            const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
            for (let i = 0; i < indices.count; i += 3) {
                const vertices = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
                const x = vertices.reduce((sum, vertex) => sum + positions.getX(vertex) / 3, 0);
                const z = vertices.reduce((sum, vertex) => sum + positions.getZ(vertex) / 3, 0);
                if (grass.coverage.sample(x, z)) triangleLeaks++;
            }
            top.forEach((a, i) => {
                const b = top[(i + 1) % top.length], fa = foot[i], fb = foot[(i + 1) % foot.length];
                for (const t of [0, .25, .5, .75]) {
                    const tx = a.x + (b.x - a.x) * t, tz = a.z + (b.z - a.z) * t;
                    const fx = fa.x + (fb.x - fa.x) * t, fz = fa.z + (fb.z - fa.z) * t;
                    for (const u of [0, .5, 1]) {
                        checked++;
                        if (grass.coverage.sample(tx + (fx - tx) * u, tz + (fz - tz) * u)) leaks++;
                        if (Math.hypot(fx - tx, fz - tz) > .05) slopeSamples++;
                    }
                }
                const x = (fa.x + fb.x) / 2, z = (fa.z + fb.z) / 2;
                const dx = x - (a.x + b.x) / 2, dz = z - (a.z + b.z) / 2, length = Math.hypot(dx, dz);
                if (length < .05 || Math.hypot(a.x - b.x, a.z - b.z) < 2) return;
                const normal = [dx / length, dz / length];
                if (!grass.coverage.sample(x + normal[0], z + normal[1])) return;
                candidates.push({ slabIndex, x, z, normal, length: Math.hypot(a.x - b.x, a.z - b.z),
                    distance: Math.hypot(x - center.x, z - center.z) });
            });
            summaries.push({ slabIndex, checked, leaks, slopeSamples, trianglesChecked: indices.count / 3, triangleLeaks,
                connectedEdges: edgeModes.filter(mode => mode === 'connect').length });
        });
        const bus = candidates.filter(c => c.slabIndex === busIndex).sort((a, b) => a.distance - b.distance)[0];
        const building = candidates.filter(c => c.slabIndex !== busIndex).sort((a, b) => a.distance - b.distance)[0];
        return { busIndex, summaries, bus, building, texelMeters: grass.coverage.size / grass.coverage.resolution };
    });
    expect(boundary.busIndex).toBeGreaterThanOrEqual(0);
    expect(boundary.bus).toBeTruthy();
    expect(boundary.building).toBeTruthy();
    const views = [];
    for (const kind of ['bus', 'building']) {
        const edge = boundary[kind];
        for (const [view, distance, height] of [['close', 2, .5], ['low', 6, .65], ['overhead', 1, 14], ['transition', 34, 7], ['far', 76, 24]]) {
            const camera = await page.evaluate(async ({ edge, distance, height }) => {
                const THREE = await import('three');
                const { engine, sm } = window.__busSim;
                const target = new THREE.Vector3(edge.x, .3, edge.z), obstacles = [], ray = new THREE.Raycaster();
                engine.context.city.buildings.group.updateWorldMatrix(true, true);
                engine.context.city.buildings.group.traverseVisible(mesh => { if (mesh.isMesh) obstacles.push(mesh); });
                let position = null;
                for (const y of [height, 30, 60, 120, 220]) {
                    for (const angle of [0, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2]) {
                        const x = edge.normal[0] * Math.cos(angle) - edge.normal[1] * Math.sin(angle);
                        const z = edge.normal[0] * Math.sin(angle) + edge.normal[1] * Math.cos(angle);
                        const candidate = new THREE.Vector3(edge.x + x * distance, y, edge.z + z * distance);
                        const direction = candidate.clone().sub(target);
                        ray.far = direction.length() - .5; ray.set(target, direction.normalize());
                        if (!ray.intersectObjects(obstacles, false).length) { position = candidate; break; }
                    }
                    if (position) break;
                }
                if (!position) throw new Error('No unobstructed view of the slab edge.');
                sm.current._poseCamera.position.copy(position); sm.current._poseCamera.target.copy(target);
                sm.current._poseCamera.quaternion = null;
                sm.current._applyGameplayPoseCamera(); engine.context.city.grass.update(true);
                return { position: position.toArray(), target: target.toArray() };
            }, { edge, distance, height });
            await rendered(page);
            await page.screenshot({ path: path.join(output, `${phase}-${kind}-${view}.png`) });
            views.push(await page.evaluate(({ edge, kind, view, camera }) => {
                const grass = window.__busSim.engine.context.city.grass;
                return { kind, view, camera, anchor: grass.anchor.toArray(), edgeExcluded: !grass.coverage.sample(edge.x, edge.z),
                    outsideGrass: grass.coverage.sample(edge.x + edge.normal[0] * .5, edge.z + edge.normal[1] * .5),
                    selection: grass.selection.getSnapshot() };
            }, { edge, kind, view, camera }));
        }
    }
    await writeFile(path.join(output, `${phase}-coverage.json`), JSON.stringify({ boundary, views, errors }, null, 2));
    expect(boundary.summaries.reduce((sum, entry) => sum + entry.slopeSamples, 0)).toBeGreaterThan(100);
    expect(boundary.summaries.filter(entry => entry.connectedEdges > 0).length).toBeGreaterThan(0);
    expect(boundary.summaries.filter(entry => entry.leaks > 0), 'Grass must exclude every slab top, slope and foot sample').toEqual([]);
    expect(boundary.summaries.filter(entry => entry.triangleLeaks > 0), 'Grass must exclude rendered slab triangle interiors').toEqual([]);
    expect(views.every(view => view.edgeExcluded && view.outsideGrass)).toBe(true);
    expect(new Set(views.map(view => view.anchor.join(','))).size).toBeGreaterThan(2);
    expect(errors).toEqual([]);
});

test('slab coverage preserves rotated outlines, merged aprons, sidewalk joins and grass gaps', async ({ page }) => {
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const cases = await page.evaluate(async () => {
        const { planBuildingSlabs } = await import('/src/app/city/BuildingSlabPlan.js');
        const { createGrassCoverageMask } = await import('/src/graphics/engine3d/grass/runtime/GrassCoverageMask.js');
        const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => ({ x, z }));
        const rotate = (loop, angle, x, z) => loop.map(p => ({ x: x + p.x * Math.cos(angle) - p.z * Math.sin(angle),
            z: z + p.x * Math.sin(angle) + p.z * Math.cos(angle) }));
        const definitions = [
            { name: 'rotated building', footprints: [rotate(rect(-5, -4, 5, 4), .61, 22, -17)], sidewalks: [], count: 1 },
            { name: 'rotated bus base', footprints: [rotate(rect(-2.6, -7, 2.6, 7), -1.1, -22, 11)], sidewalks: [], count: 1 },
            { name: 'merged bridge', footprints: [rect(-12, -4, -2, 4), rect(.8, 0, 10.8, 12)], sidewalks: [], count: 1,
                samples: [[-.6, 2, false], [-1, 11, true]] },
            { name: 'separate bases', footprints: [rect(-12, -4, -2, 4), rect(4, -4, 14, 4)], sidewalks: [], count: 2,
                samples: [[1, 0, true]] },
            { name: 'slanted sidewalk', footprints: [rect(-5, -5, 5, 5)],
                sidewalks: [[{ x: 7.5, z: -12 }, { x: 10.5, z: 12 }, { x: 30, z: 12 }, { x: 30, z: -12 }]], count: 1,
                samples: [[7, 0, false], [-8, 0, true]] }
        ];
        return definitions.map(entry => {
            const plans = planBuildingSlabs({ footprintLoops: entry.footprints, sidewalkBoundaries: entry.sidewalks });
            const mask = createGrassCoverageMask({ size: 600, roadPolygons: entry.sidewalks, roadMargin: 0,
                buildingFootprints: entry.footprints.map(loop => [loop]), slabFootprints: plans.map(plan => plan.foot) });
            let leaks = 0, checked = 0;
            for (const plan of plans) for (let i = 0; i < plan.top.length; i++) {
                const j = (i + 1) % plan.top.length;
                for (let step = 0; step <= 8; step++) {
                    const t = step / 8;
                    const tx = plan.top[i].x * (1 - t) + plan.top[j].x * t, tz = plan.top[i].z * (1 - t) + plan.top[j].z * t;
                    const fx = plan.foot[i].x * (1 - t) + plan.foot[j].x * t, fz = plan.foot[i].z * (1 - t) + plan.foot[j].z * t;
                    for (const u of [0, .5, 1]) {
                        checked++;
                        if (mask.sample(tx * (1 - u) + fx * u, tz * (1 - u) + fz * u)) leaks++;
                    }
                }
            }
            const samples = (entry.samples ?? []).map(([x, z, expected]) => ({ x, z, expected, actual: mask.sample(x, z) }));
            mask.dispose();
            return { name: entry.name, count: plans.length, expectedCount: entry.count, checked, leaks, samples };
        });
    });
    for (const entry of cases) {
        expect(entry.count, entry.name).toBe(entry.expectedCount);
        expect(entry.checked, entry.name).toBeGreaterThan(0);
        expect(entry.leaks, entry.name).toBe(0);
        for (const sample of entry.samples) expect(sample.actual, `${entry.name}: ${sample.x},${sample.z}`).toBe(sample.expected);
    }
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'boundary-cases.json'), JSON.stringify(cases, null, 2));
});
