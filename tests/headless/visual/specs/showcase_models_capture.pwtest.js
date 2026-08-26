// Capture: showcase model review set — three engine-2 showcase buildings
// (authored in _showcase_model_configs.js, NOT in the game catalog) plus one
// catalog building, 8 numbered views each: aerial, front, corner, grazing,
// street level, two feature close-ups, rear.
// Output: tests/artifacts/screens/showcase/showcase_NN_<building>_<view>.png
// Filter to one building with SHOWCASE_ONLY=<key>.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';
import { SHOWCASE_MODELS } from './_showcase_model_configs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/showcase');

const BASE_BUILDING_ID = 'pier_grid_tower_2';

// Camera spec forms:
//  - framed: { dir, padding, targetYFrac? } — the scenario's own framing math.
//  - manual: { eye, target } with { fx, fz, ym | yTop } — fx/fz are fractions
//    of the building box extent (0 = min, 1 = max, out of range = outside),
//    ym is meters above the box floor, yTop is meters relative to the box top.
const COMMON_VIEWS = [
    { view: 'aerial', framed: { dir: { x: -0.55, y: 1.25, z: 0.9 }, padding: 1.12 } },
    { view: 'front', framed: { dir: { x: 0.03, y: 0.22, z: 1 }, padding: 1.06 } },
    { view: 'corner', framed: { dir: { x: 0.85, y: 0.32, z: 0.95 }, padding: 1.04 } },
    {
        view: 'grazing',
        manual: {
            eye: { fx: 1.04, ym: 6.5, fz: 1.0, zPad: 2.2 },
            target: { fx: -0.2, ym: 5.5, fz: 1.0, zPad: -0.8 }
        }
    },
    {
        view: 'street',
        manual: {
            eye: { fx: 0.72, ym: 1.7, fz: 1.0, zPad: 12.0 },
            target: { fx: 0.38, ym: 3.4, fz: 1.0, zPad: 0 }
        }
    }
];

const REAR_VIEW = { view: 'rear', framed: { dir: { x: -0.8, y: 0.42, z: -0.9 }, padding: 1.08 } };

const BUILDINGS = [
    {
        key: 'arcade_hall',
        overridesKey: 'arcade_hall',
        views: [
            ...COMMON_VIEWS,
            {
                view: 'closeup_arcade',
                manual: {
                    eye: { fx: 0.66, ym: 2.2, fz: 1.0, zPad: 7.0 },
                    target: { fx: 0.42, ym: 3.4, fz: 1.0, zPad: 0 }
                }
            },
            {
                view: 'closeup_quoins',
                manual: {
                    eye: { fx: 1.3, ym: 7.5, fz: 1.0, zPad: 4.5 },
                    target: { fx: 0.98, ym: 9.0, fz: 1.0, zPad: -1.5 }
                }
            },
            REAR_VIEW
        ]
    },
    {
        key: 'setback_tower',
        overridesKey: 'setback_tower',
        views: [
            ...COMMON_VIEWS,
            {
                view: 'closeup_bevel',
                manual: {
                    eye: { fx: 1.03, ym: 8.2, fz: 1.0, zPad: 1.6 },
                    target: { fx: 0.15, ym: 7.4, fz: 1.0, zPad: -0.2 }
                }
            },
            {
                view: 'closeup_crown',
                manual: {
                    eye: { fx: 1.15, yTop: 1.5, fz: 1.0, zPad: 12.0 },
                    target: { fx: 0.5, yTop: -3.5, fz: 0.5, zPad: 0 }
                }
            },
            REAR_VIEW
        ]
    },
    {
        key: 'garden_court',
        overridesKey: 'garden_court',
        views: [
            ...COMMON_VIEWS,
            {
                view: 'closeup_balconies',
                manual: {
                    eye: { fx: 0.68, ym: 6.5, fz: 1.0, zPad: 6.0 },
                    target: { fx: 0.42, ym: 7.5, fz: 1.0, zPad: 0 }
                }
            },
            {
                view: 'closeup_side_b',
                manual: {
                    eye: { fx: 1.0, xPad: 11.0, ym: 4.0, fz: 0.85 },
                    target: { fx: 1.0, xPad: 0, ym: 5.0, fz: 0.35 }
                }
            },
            REAR_VIEW
        ]
    },
    {
        key: 'storefront_row_2',
        buildingId: 'storefront_row_2',
        views: [
            ...COMMON_VIEWS,
            {
                view: 'closeup_storefront',
                manual: {
                    eye: { fx: 0.7, ym: 2.0, fz: 1.0, zPad: 5.5 },
                    target: { fx: 0.5, ym: 2.8, fz: 1.0, zPad: 0 }
                }
            },
            {
                view: 'closeup_portal',
                manual: {
                    eye: { fx: 0.05, ym: 2.0, fz: 1.0, zPad: 6.5 },
                    target: { fx: 0.16, ym: 2.6, fz: 1.0, zPad: 0 }
                }
            },
            REAR_VIEW
        ]
    }
];

async function waitForShowcaseReady(page) {
    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        if (!textures || textures.total <= 0) return false;
        if (textures.ready < textures.total) return false;
        if (scenario.environment?.expected && !scenario.environment.present) return false;
        return true;
    }, null, { timeout: 60_000, polling: 250 });
}

test('Capture: showcase model review set', async ({ page }) => {
    test.setTimeout(600_000);
    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1.5');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1.5;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    const only = String(process.env.SHOWCASE_ONLY ?? '').trim();
    const manifest = [];
    let shotNumber = 0;

    for (const building of BUILDINGS) {
        const skip = only && building.key !== only;
        const overrides = building.overridesKey
            ? SHOWCASE_MODELS.find((m) => m.key === building.overridesKey)?.overrides ?? null
            : null;
        if (skip) {
            shotNumber += building.views.length;
            continue;
        }

        await page.evaluate(async (args) => {
            window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
            await window.__testHooks.loadScenario('building_showcase', {
                seed: 'showcase',
                buildingId: args.buildingId,
                ...(args.overrides ? { configOverrides: args.overrides } : {})
            });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(5, { render: true });
        }, {
            buildingId: building.buildingId ?? BASE_BUILDING_ID,
            overrides,
            viewport
        });
        await waitForShowcaseReady(page);

        // The generator's own authoring warnings, straight from a parts build.
        const warnings = await page.evaluate(async (args) => {
            const catalog = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
            const gen = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js');
            const cfg = catalog.getBuildingConfigById(args.buildingId);
            const pick = (key) => args.overrides?.[key] ?? cfg[key] ?? null;
            const tileSize = 24;
            const map = {
                tileSize,
                kind: new Uint8Array([0]),
                inBounds: (x, y) => x === 0 && y === 0,
                index: () => 0,
                tileToWorldCenter: () => ({ x: 0, z: 0 })
            };
            const parts = gen.buildBuildingFabricationVisualParts({
                map,
                tiles: [[0, 0]],
                footprintLoops: JSON.parse(JSON.stringify(pick('footprintLoops'))),
                generatorConfig: {
                    road: { surfaceY: 0, curb: { height: 0, extraHeight: 0, thickness: 0 }, sidewalk: { extraWidth: 0, lift: 0 } },
                    ground: { surfaceY: 0 }
                },
                tileSize,
                occupyRatio: 1.0,
                layers: JSON.parse(JSON.stringify(pick('layers'))),
                facades: JSON.parse(JSON.stringify(pick('facades'))),
                windowDefinitions: JSON.parse(JSON.stringify(pick('windowDefinitions'))),
                materialSlots: JSON.parse(JSON.stringify(pick('materialSlots'))),
                wallDecorations: JSON.parse(JSON.stringify(pick('wallDecorations'))),
                attachments: JSON.parse(JSON.stringify(pick('attachments'))),
                edgeBevel: JSON.parse(JSON.stringify(pick('edgeBevel'))),
                cornerTreatment: JSON.parse(JSON.stringify(pick('cornerTreatment'))),
                overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
                walls: { inset: 0.0 }
            });
            const roles = {};
            const countRole = (obj) => {
                obj?.traverse?.((o) => {
                    const role = o?.userData?.buildingFab2Role;
                    if (role) roles[role] = (roles[role] ?? 0) + 1;
                });
            };
            for (const mesh of parts?.solidMeshes ?? []) countRole(mesh);
            countRole(parts?.beltCourse);
            countRole(parts?.windows);
            return { warnings: parts?.warnings ?? [], roles };
        }, { buildingId: building.buildingId ?? BASE_BUILDING_ID, overrides });
        console.log(`WARNINGS[${building.key}]: ${JSON.stringify(warnings)}`);
        if (process.env.SHOWCASE_PROBE_ONLY === '1') {
            shotNumber += building.views.length;
            continue;
        }

        for (const shot of building.views) {
            shotNumber += 1;
            const number = String(shotNumber).padStart(2, '0');
            const name = `showcase_${number}_${building.key}_${shot.view}`;

            await page.evaluate(async (args) => {
                const THREE = await import('three');
                const { computeFrameDistanceForSphere } = await import('/src/graphics/engine3d/camera/ToolCameraController.js');
                const engine = window.__testHooks.getEngine();
                const buildingObj = engine.scene.getObjectByName(`showcase_${args.entryConfigId}`);
                buildingObj.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(buildingObj);

                const resolvePoint = (p) => {
                    const x = box.min.x + (Number(p.fx) || 0) * (box.max.x - box.min.x) + (Number(p.xPad) || 0);
                    const z = box.min.z + (Number(p.fz ?? 0.5)) * (box.max.z - box.min.z) + (Number(p.zPad) || 0);
                    const y = Number.isFinite(Number(p.yTop))
                        ? box.max.y + Number(p.yTop)
                        : box.min.y + (Number(p.ym) || 0);
                    return new THREE.Vector3(x, y, z);
                };

                if (args.shot.framed) {
                    const sphere = new THREE.Sphere();
                    box.getBoundingSphere(sphere);
                    const dist = computeFrameDistanceForSphere({
                        radius: sphere.radius || 1,
                        fovDeg: engine.camera.fov,
                        aspect: engine.camera.aspect || 1,
                        padding: Number(args.shot.framed.padding) || 1.1
                    });
                    const d = args.shot.framed.dir;
                    const dir = new THREE.Vector3(Number(d.x) || 0, Number(d.y) || 0, Number(d.z) || 0).normalize();
                    const target = sphere.center.clone();
                    if (Number.isFinite(Number(args.shot.framed.targetYFrac))) {
                        const frac = Math.max(0, Math.min(1, Number(args.shot.framed.targetYFrac)));
                        target.y = box.min.y + (box.max.y - box.min.y) * frac;
                    }
                    engine.camera.position.copy(target).addScaledVector(dir, dist);
                    engine.camera.lookAt(target);
                } else {
                    engine.camera.position.copy(resolvePoint(args.shot.manual.eye));
                    engine.camera.lookAt(resolvePoint(args.shot.manual.target));
                }
                engine.camera.updateMatrixWorld(true);
                window.__testHooks.step(30, { render: true });

                for (const id of ['harness-status', 'harness-log']) {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                }
                let badge = document.getElementById('shot-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = 'shot-badge';
                    badge.style.cssText = [
                        'position:fixed', 'top:14px', 'left:16px', 'z-index:10000',
                        'font:700 46px system-ui,sans-serif', 'color:#fff',
                        'text-shadow:0 0 6px #000,0 2px 3px #000,0 0 2px #000',
                        'pointer-events:none', 'letter-spacing:2px'
                    ].join(';');
                    document.body.appendChild(badge);
                }
                badge.textContent = args.badgeText;
            }, {
                entryConfigId: building.buildingId ?? BASE_BUILDING_ID,
                shot: { framed: shot.framed ?? null, manual: shot.manual ?? null },
                badgeText: number
            });

            await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
            manifest.push({ number, building: building.key, view: shot.view, file: `${name}.png` });
        }
    }

    console.log('MANIFEST: ' + JSON.stringify(manifest, null, 1));
    const relevantErrors = consoleErrors.filter((e) => !/pbr\.material\.correction\.config/.test(e));
    console.log('CONSOLE ERRORS: ' + JSON.stringify(relevantErrors.slice(0, 20), null, 1));
});
