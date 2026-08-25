// Headless browser tests: you may see *into* a building through a glazed
// opening, and straight *through* it when the openings line up — but never
// through solid wall.
//
// Guards for AI 495. The interior shell is wound to face the room, so a
// single-sided material made it vanish when seen from the other side: a
// sightline entering a window left the building through what should have been
// solid wall, and the room read as empty space. The shell must be opaque from
// both sides, and it must be cut at every opening — a window with no parallax
// panel is a real hole, and if the far wall has one on the same line, seeing the
// world through both is correct.
//
// Runs in the browser rather than node because `three` is CDN-only here (see the
// import map in index.html); there is no local node_modules/three.
import test, { expect } from '@playwright/test';

const SIGHTLINE_BUILDING_IDS = [
    'gov_center_2',
    'beige_1',
    'mainstreet_block',
    'storefront_row_2',
    'stone_lowrise_2',
    'brick_midrise_2'
];
// Ground floor is a shop row behind an interior shell.
const SHELL_BUILDING_ID = 'mainstreet_block';

async function bootHarness(page) {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);
}

/**
 * Shared page-side helpers. Shipped as source because `page.evaluate` cannot
 * close over module scope.
 */
const PAGE_HELPERS = `(() => {
    const layerNameOf = (o) => {
        let cur = o;
        while (cur) { if (cur.name) return cur.name; cur = cur.parent; }
        return '';
    };
    const renderable = (o) => {
        // The shadow-caster merge is drawn only into the shadow map.
        if (o.userData?.isShadowCasterMerge) return false;
        let cur = o;
        while (cur) { if (cur.visible === false) return false; cur = cur.parent; }
        return true;
    };
    const opaque = (o) => {
        // A window shade is not an occluder: its shader discards every fragment
        // when the blind is raised, which is exactly what \`disableShades\`
        // produces, yet the quad still answers a raycast.
        if (layerNameOf(o) === 'shade') return false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        return mats.some((m) => m && !(m.transparent && (m.opacity ?? 1) < 0.95));
    };
    // Windows are instanced, so one group holds every copy: an opening is keyed
    // by group *and* instance, or two different windows read as one.
    const openingKeyOf = (hit) => {
        let cur = hit.object;
        while (cur) {
            if (typeof cur.name === 'string' && cur.name.startsWith('bf2_window_')) {
                return cur.uuid + ':' + (hit.instanceId ?? 0);
            }
            cur = cur.parent;
        }
        return null;
    };
    return { layerNameOf, renderable, opaque, openingKeyOf };
})()`;

test.describe('interior shell', () => {
    for (const buildingId of SIGHTLINE_BUILDING_IDS) {
        test(`${buildingId}: no sightline passes through solid wall`, async ({ page }) => {
            await bootHarness(page);
            const result = await page.evaluate(async (args) => {
                const THREE = await import('three');
                await window.__testHooks.loadScenario('building_showcase', {
                    seed: 'showcase',
                    buildingId: args.buildingId,
                    mergeBuildingGeometry: false
                });
                window.__testHooks.setFixedDt(1 / 60);
                window.__testHooks.step(2, { render: true });
                const building = window.__testHooks.getEngine().scene.getObjectByName(`showcase_${args.buildingId}`);
                if (!building) throw new Error('building group not found');
                building.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(building);

                const { renderable, opaque, openingKeyOf } = eval(args.helpers);
                const meshes = [];
                building.traverse((o) => { if (o.isMesh && renderable(o)) meshes.push(o); });

                const raycaster = new THREE.Raycaster();
                raycaster.far = 400;
                const axes = [
                    { face: 'A', dir: new THREE.Vector3(0, 0, -1), origin: (t, y) => new THREE.Vector3(box.min.x + (box.max.x - box.min.x) * t, y, box.max.z + 6) },
                    { face: 'C', dir: new THREE.Vector3(0, 0, 1), origin: (t, y) => new THREE.Vector3(box.min.x + (box.max.x - box.min.x) * t, y, box.min.z - 6) },
                    { face: 'B', dir: new THREE.Vector3(-1, 0, 0), origin: (t, y) => new THREE.Vector3(box.max.x + 6, y, box.min.z + (box.max.z - box.min.z) * t) },
                    { face: 'D', dir: new THREE.Vector3(1, 0, 0), origin: (t, y) => new THREE.Vector3(box.min.x - 6, y, box.min.z + (box.max.z - box.min.z) * t) }
                ];
                const up = new THREE.Vector3(0, 1, 0);
                const throughWall = [];
                let cast = 0;
                let throughOpenings = 0;
                for (const axis of axes) {
                    for (let i = 1; i <= 10; i += 1) {
                        const t = i / 11;
                        for (const y of [1.0, 1.6, 2.4, 6.5]) {
                            if (y > box.max.y) continue;
                            // Oblique as well as head-on: the report was a diagonal
                            // view across a corner.
                            for (const yawDeg of [-60, -35, 0, 35, 60]) {
                                cast += 1;
                                const dir = axis.dir.clone().applyAxisAngle(up, yawDeg * Math.PI / 180);
                                raycaster.set(axis.origin(t, y), dir);
                                const hits = raycaster.intersectObjects(meshes, false);
                                // No hit at all means the ray missed the building:
                                // the bounding box is padded by decorations and fire
                                // escapes that overhang the walls.
                                if (!hits.length) continue;
                                if (hits.some((h) => opaque(h.object))) continue;
                                // Nothing stopped it, so it left the building. That is
                                // only legitimate if it went in one opening and out
                                // another.
                                const openings = new Set(hits.map((h) => openingKeyOf(h)).filter(Boolean));
                                if (openings.size >= 2) {
                                    throughOpenings += 1;
                                    continue;
                                }
                                if (throughWall.length < 8) {
                                    throughWall.push(`face ${axis.face} t=${t.toFixed(2)} y=${y} yaw=${yawDeg}deg crossed ${openings.size} opening(s)`);
                                }
                            }
                        }
                    }
                }
                return { cast, throughOpenings, throughWall };
            }, { buildingId, helpers: PAGE_HELPERS });

            expect(result.cast, 'sightlines should actually be cast').toBeGreaterThan(100);
            expect(result.throughWall, 'sightlines that left the building without passing through two openings').toEqual([]);
        });
    }

    test('a sightline through aligned openings is allowed', async ({ page }) => {
        await bootHarness(page);
        // The rule is about walls, not about seeing in: a shop row with glazing
        // on opposite faces must let some sightline through both.
        const result = await page.evaluate(async (args) => {
            const THREE = await import('three');
            await window.__testHooks.loadScenario('building_showcase', {
                seed: 'showcase',
                buildingId: args.buildingId,
                mergeBuildingGeometry: false
            });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(2, { render: true });
            const building = window.__testHooks.getEngine().scene.getObjectByName(`showcase_${args.buildingId}`);
            building.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(building);

            const { renderable, opaque, openingKeyOf } = eval(args.helpers);
            const meshes = [];
            building.traverse((o) => { if (o.isMesh && renderable(o)) meshes.push(o); });

            const raycaster = new THREE.Raycaster();
            raycaster.far = 400;
            let throughOpenings = 0;
            for (let i = 1; i <= 40; i += 1) {
                const x = box.min.x + (box.max.x - box.min.x) * (i / 41);
                raycaster.set(new THREE.Vector3(x, 1.6, box.max.z + 6), new THREE.Vector3(0, 0, -1));
                const hits = raycaster.intersectObjects(meshes, false);
                if (!hits.length || hits.some((h) => opaque(h.object))) continue;
                if (new Set(hits.map((h) => openingKeyOf(h)).filter(Boolean)).size >= 2) throughOpenings += 1;
            }
            return { throughOpenings };
        }, { buildingId: SHELL_BUILDING_ID, helpers: PAGE_HELPERS });

        expect(result.throughOpenings, 'aligned unbacked openings should see through').toBeGreaterThan(0);
    });

    test('interior shell surfaces are opaque from both sides', async ({ page }) => {
        await bootHarness(page);
        const result = await page.evaluate(async (args) => {
            const THREE = await import('three');
            await window.__testHooks.loadScenario('building_showcase', {
                seed: 'showcase',
                buildingId: args.buildingId,
                mergeBuildingGeometry: false
            });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(2, { render: true });
            const building = window.__testHooks.getEngine().scene.getObjectByName(`showcase_${args.buildingId}`);

            const singleSided = [];
            let shellMeshes = 0;
            building.traverse((o) => {
                if (!o.isMesh || o.userData?.buildingFab2Role !== 'interior') return;
                shellMeshes += 1;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                for (const m of mats) {
                    if (m && m.side !== THREE.DoubleSide) {
                        singleSided.push(`${o.userData.buildingFab2InteriorKind ?? '?'} side=${m.side}`);
                    }
                }
            });
            return { shellMeshes, singleSided };
        }, { buildingId: SHELL_BUILDING_ID });

        expect(result.shellMeshes, 'the shell floor should emit interior meshes').toBeGreaterThan(0);
        expect(result.singleSided, 'single-sided shell surfaces vanish when seen from the other side').toEqual([]);
    });

    test(`${SHELL_BUILDING_ID}: every opening is cut out of the shell`, async ({ page }) => {
        await bootHarness(page);
        const result = await page.evaluate(async (args) => {
            const THREE = await import('three');
            await window.__testHooks.loadScenario('building_showcase', {
                seed: 'showcase',
                buildingId: args.buildingId,
                mergeBuildingGeometry: false
            });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(2, { render: true });
            const building = window.__testHooks.getEngine().scene.getObjectByName(`showcase_${args.buildingId}`);
            building.updateMatrixWorld(true);

            const { layerNameOf, renderable, opaque } = eval(args.helpers);
            const meshes = [];
            const shellWalls = [];
            const panes = [];
            building.traverse((o) => {
                if (!o.isMesh || !renderable(o)) return;
                meshes.push(o);
                if (o.userData?.buildingFab2Role === 'interior' && o.userData?.buildingFab2InteriorKind === 'wall') shellWalls.push(o);
                if (layerNameOf(o) === 'glass' && o.isInstancedMesh) panes.push(o);
            });

            // The ground-floor room is the one the report was taken from.
            let shellBounds = null;
            for (const wall of shellWalls) {
                const bounds = new THREE.Box3().setFromObject(wall);
                if (!shellBounds || bounds.min.y < shellBounds.min.y) shellBounds = bounds;
            }
            if (!shellBounds) throw new Error('no interior shell wall found');
            const centre = shellBounds.getCenter(new THREE.Vector3());

            const raycaster = new THREE.Raycaster();
            raycaster.far = 200;
            const matrix = new THREE.Matrix4();
            const panePos = new THREE.Vector3();
            const blocked = [];
            let checked = 0;
            for (const pane of panes) {
                const count = pane.isInstancedMesh ? pane.count : 1;
                for (let i = 0; i < count; i += 1) {
                    pane.getMatrixAt(i, matrix);
                    matrix.premultiply(pane.matrixWorld);
                    panePos.setFromMatrixPosition(matrix);
                    if (panePos.y < shellBounds.min.y || panePos.y > shellBounds.max.y) continue;
                    checked += 1;
                    const origin = new THREE.Vector3(centre.x, panePos.y, centre.z);
                    const dir = panePos.clone().sub(origin);
                    if (dir.lengthSq() < 1e-6) continue;
                    raycaster.set(origin, dir.normalize());
                    const first = raycaster.intersectObjects(meshes, false).find((h) => opaque(h.object)) ?? null;
                    // Standing in the room and looking at an opening, the shell must
                    // not be what you see: it has a hole there.
                    if (first && first.object.userData?.buildingFab2Role === 'interior' && blocked.length < 8) {
                        blocked.push(`pane at (${panePos.x.toFixed(1)}, ${panePos.y.toFixed(1)}, ${panePos.z.toFixed(1)}) is walled off by the shell`);
                    }
                }
            }
            return { checked, blocked };
        }, { buildingId: SHELL_BUILDING_ID, helpers: PAGE_HELPERS });

        expect(result.checked, 'the shell floor should host glazed openings').toBeGreaterThan(4);
        expect(result.blocked, 'openings with solid shell behind them').toEqual([]);
    });
});
