// Verify final curved sidewalk contours drive the production grass mask and every rendered detail level.
import test, { expect } from '@playwright/test';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const output = path.resolve('tests/artifacts/screens/grass/gameplay_curved_boundaries');
const phase = process.env.GRASS_CURVE_PHASE === 'before' ? 'before' : 'after';

async function rendered(page) {
    await page.evaluate(() => new Promise(resolve => {
        let count = 0;
        const unsubscribe = window.__busSim.engine.addFrameListener(({ rendered }) => {
            if (rendered && ++count === 5) { unsubscribe(); resolve(); }
        });
    }));
}

test('gameplay mask follows curved hardscape holes and preserves overlapping slab exclusions', async ({ page }) => {
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const cases = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassCoverageMask } = await import('/src/graphics/engine3d/grass/runtime/GrassCoverageMask.js');
        const circle = radius => Array.from({ length: 512 }, (_, i) => ({ x: Math.cos(i / 512 * Math.PI * 2) * radius + .37,
            z: Math.sin(i / 512 * Math.PI * 2) * radius - .23 }));
        const rect = (x, z, width, depth) => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]].map(([x, z]) => ({ x, z }));
        return [18, 30].map(radius => {
            const mask = createGrassCoverageMask({ size: 600, roadPolygons: [], roadMargin: 3,
                roadBoundaryLoops: [circle(radius + 7), circle(radius - 7)],
                buildingFootprints: [[rect(-2, -2, 4, 4)]], slabFootprints: [rect(-4, -4, 8, 8), rect(2, -3, 5, 6)] });
            const texel = mask.size / mask.resolution, samples = [];
            for (const edge of [radius - 7, radius + 7]) for (let i = 0; i < 128; i++) {
                const angle = (i + .35) / 128 * Math.PI * 2;
                for (const offset of [-2 * texel, 2 * texel]) {
                    const r = edge + offset, x = Math.cos(angle) * r + .37, z = Math.sin(angle) * r - .23;
                    samples.push({ actual: mask.sample(x, z), expected: r < radius - 7 || r > radius + 7 });
                }
            }
            const partial = mask.texture.image.data.reduce((sum, value) => sum + Number(value > 0 && value < 255), 0);
            const result = { radius, samples, partial, linear: mask.texture.minFilter === THREE.LinearFilter && mask.texture.magFilter === THREE.LinearFilter,
                slab: mask.sample(3, 0), building: mask.sample(0, 0), island: mask.sample(0, 8) };
            mask.dispose(); return result;
        });
    });
    for (const entry of cases) {
        expect(entry.samples.filter(sample => sample.actual !== sample.expected), `${entry.radius} m contour`).toEqual([]);
        expect(entry.partial).toBeGreaterThan(100);
        expect(entry.linear).toBe(true);
        expect(entry.slab).toBe(false); expect(entry.building).toBe(false); expect(entry.island).toBe(true);
    }
});

test('actual game grass follows final sidewalk curves across detail levels and camera anchors', async ({ page }) => {
    test.setTimeout(180_000);
    await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1600, height: 900 });
    const errors = [], labRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/grass_debugger_v2|debug_tools\/grass/.test(request.url())) labRequests.push(request.url()); });
    await page.goto('/?pose=civic_center_curve_front&coreTests=0');
    await page.waitForFunction(() => !!window.__busSim?.engine.context.city?.grass, null, { timeout: 90_000 });
    await page.evaluate(async () => {
        const { engine, sm } = window.__busSim;
        await Promise.all([engine.context.city.grass.ready, engine.context.city.world.readyPromise,
            sm.current.busModel.userData.readyPromise, engine.waitForLightingReady()]);
    });
    await rendered(page);
    const boundary = await page.evaluate(() => {
        const city = window.__busSim.engine.context.city, grass = city.grass, loops = city.roads.sidewalkOuterBoundaryLoops;
        const inside = (loop, x, z) => {
            let hit = false;
            for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
                const a = loop[i], b = loop[j];
                if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) hit = !hit;
            }
            return hit;
        };
        const inRoad = (x, z) => loops.reduce((hit, loop) => hit !== inside(loop, x, z), false);
        const obstacles = [...grass.coverageInput.buildingFootprints.flat(), ...grass.coverageInput.slabFootprints];
        const nearObstacle = (x, z) => obstacles.some(loop => [-1, 0, 1].some(dx => [-1, 0, 1].some(dz => inside(loop, x + dx, z + dz))));
        const texel = grass.coverage.size / grass.coverage.resolution, points = [];
        for (const loop of loops) loop.forEach((a, i) => {
            const b = loop[(i + 1) % loop.length], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
            if (length < .2 || Math.min(Math.abs(dx), Math.abs(dz)) / length < .1) return;
            const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
            if (nearObstacle(x, z) || Math.max(Math.abs(x), Math.abs(z)) > grass.coverage.size / 2 - 2) return;
            let nx = dz / length, nz = -dx / length;
            if (inRoad(x + nx * .4, z + nz * .4)) { nx = -nx; nz = -nz; }
            if (inRoad(x + nx * .4, z + nz * .4) || !inRoad(x - nx * .4, z - nz * .4)) return;
            points.push({ x, z, nx, nz, inside: grass.coverage.sample(x - nx * 2 * texel, z - nz * 2 * texel),
                outside: grass.coverage.sample(x + nx * 2 * texel, z + nz * 2 * texel) });
        });
        points.sort((a, b) => Math.hypot(a.x + 144, a.z - 48) - Math.hypot(b.x + 144, b.z - 48));
        return { loops: loops.length, points, texel, contourInput: grass.coverageInput.roadBoundaryLoops === loops };
    });
    expect(boundary.points.length).toBeGreaterThan(20);
    const edge = boundary.points[0], views = [];
    for (const [name, distance, height] of [['close', 3, .8], ['overhead', 6, 35], ['transition', 34, 7], ['far', 78, 24]]) {
        await page.evaluate(async ({ edge, distance, height }) => {
            const THREE = await import('three');
            const { engine, sm } = window.__busSim, grass = engine.context.city.grass;
            const target = new THREE.Vector3(edge.x, grass.groundY + .1, edge.z), obstacles = [], ray = new THREE.Raycaster();
            engine.context.city.buildings.group.updateWorldMatrix(true, true);
            engine.context.city.buildings.group.traverseVisible(mesh => { if (mesh.isMesh) obstacles.push(mesh); });
            let position = null;
            for (const y of [height, 35, 70]) {
                for (const angle of [0, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2, Math.PI]) {
                    const nx = edge.nx * Math.cos(angle) - edge.nz * Math.sin(angle), nz = edge.nx * Math.sin(angle) + edge.nz * Math.cos(angle);
                    const candidate = new THREE.Vector3(edge.x + nx * distance, grass.groundY + y, edge.z + nz * distance);
                    const direction = candidate.clone().sub(target); ray.far = direction.length() - .1; ray.set(target, direction.normalize());
                    if (!ray.intersectObjects(obstacles, false).length) { position = candidate; break; }
                }
                if (position) break;
            }
            if (!position) throw new Error('No unobstructed view of the curved sidewalk.');
            sm.current._poseCamera.position.copy(position); sm.current._poseCamera.target.copy(target);
            sm.current._poseCamera.quaternion = null; sm.current._applyGameplayPoseCamera(); grass.update(true);
        }, { edge, distance, height });
        await rendered(page);
        await page.screenshot({ path: path.join(output, `${phase}-${name}.png`) });
        views.push(await page.evaluate(() => window.__busSim.engine.context.city.grass.getSnapshot()));
    }
    await writeFile(path.join(output, `${phase}-boundary.json`), JSON.stringify({ boundary, views, errors, labRequests }, null, 2));
    expect(boundary.contourInput).toBe(true);
    expect(boundary.points.filter(point => point.inside || !point.outside)).toEqual([]);
    expect(new Set(views.map(view => view.anchor.join(','))).size).toBeGreaterThan(2);
    expect(errors).toEqual([]); expect(labRequests).toEqual([]);
});
