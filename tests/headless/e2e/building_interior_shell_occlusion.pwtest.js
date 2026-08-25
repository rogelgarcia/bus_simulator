// Headless browser tests: a fabricated building must never read as a hollow
// glass tube, and a glazed opening must never be backed by blank interior wall.
//
// Guards for AI 495:
//   - no street-level sightline may cross a building and leave through the far
//     glazing (`gov_center_2` and `beige_1` did: their layers have
//     `interior.enabled` false and their openings had `interior: "none"`, so the
//     glass had nothing behind it at all);
//   - on a floor that does have an interior shell, an opening whose glass is
//     backed by a parallax interior must have a matching hole in that shell,
//     otherwise the room's wall renders as an opaque pane.
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
// Ground floor is a shop row with an interior shell behind it.
const SHELL_BUILDING_ID = 'mainstreet_block';

async function bootHarness(page) {
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);
}

/**
 * Shared page-side helpers: what counts as visible, and what counts as opaque.
 * Shipped as source because `page.evaluate` cannot close over module scope.
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
    return { layerNameOf, renderable, opaque };
})()`;

test.describe('interior shell', () => {
    for (const buildingId of SIGHTLINE_BUILDING_IDS) {
        test(`${buildingId}: no sightline crosses the building`, async ({ page }) => {
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

                const { renderable, opaque } = eval(args.helpers);
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
                const through = [];
                let cast = 0;
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
                                if (through.length < 8) {
                                    through.push(`face ${axis.face} t=${t.toFixed(2)} y=${y} yaw=${yawDeg}° (${hits.length} transparent hits)`);
                                }
                            }
                        }
                    }
                }
                return { cast, through };
            }, { buildingId, helpers: PAGE_HELPERS });

            expect(result.cast, 'sightlines should actually be cast').toBeGreaterThan(100);
            expect(result.through, 'sightlines that cross the building and leave through the far glazing').toEqual([]);
        });
    }

    test(`${SHELL_BUILDING_ID}: openings on interior-backed walls are open in the shell`, async ({ page }) => {
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
            const panels = [];
            building.traverse((o) => {
                if (!o.isMesh || !renderable(o)) return;
                meshes.push(o);
                if (o.userData?.buildingFab2Role === 'interior' && o.userData?.buildingFab2InteriorKind === 'wall') shellWalls.push(o);
                if (layerNameOf(o) === 'interior' && o.isInstancedMesh) panels.push(o);
            });

            // The ground-floor room is the one the report was taken from, and the
            // one whose openings are shop glazing rather than sash windows.
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
            const panelPos = new THREE.Vector3();
            const blocked = [];
            let checked = 0;
            for (const panel of panels) {
                const count = panel.isInstancedMesh ? panel.count : 1;
                for (let i = 0; i < count; i += 1) {
                    panel.getMatrixAt(i, matrix);
                    matrix.premultiply(panel.matrixWorld);
                    panelPos.setFromMatrixPosition(matrix);
                    // Only openings sitting on a wall this shell actually backs.
                    if (panelPos.y < shellBounds.min.y || panelPos.y > shellBounds.max.y) continue;
                    checked += 1;
                    const origin = new THREE.Vector3(centre.x, panelPos.y, centre.z);
                    const dir = panelPos.clone().sub(origin);
                    if (dir.lengthSq() < 1e-6) continue;
                    raycaster.set(origin, dir.normalize());
                    const first = raycaster.intersectObjects(meshes, false).find((h) => opaque(h.object)) ?? null;
                    const isShell = !!first && first.object.userData?.buildingFab2Role === 'interior';
                    if (isShell && blocked.length < 8) {
                        blocked.push(`panel at (${panelPos.x.toFixed(1)}, ${panelPos.y.toFixed(1)}, ${panelPos.z.toFixed(1)}) is behind solid shell wall`);
                    }
                }
            }
            return { panels: panels.length, checked, blocked };
        }, { buildingId: SHELL_BUILDING_ID, helpers: PAGE_HELPERS });

        expect(result.checked, 'the shell floor should host parallax-backed openings').toBeGreaterThan(4);
        expect(result.blocked, 'openings whose parallax interior is hidden behind the interior shell').toEqual([]);
    });
});
