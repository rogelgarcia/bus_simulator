// Headless browser tests: BF2 bay windows cut out wall opening and apply inset per face orientation.
import test, { expect } from '@playwright/test';

test.setTimeout(120_000);

async function attachFailFastConsole({ page }) {
    const errors = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
            const msg = e?.reason?.message ?? String(e?.reason ?? 'unhandledrejection');
            window.__e2eErrors.push({ kind: 'unhandledrejection', message: msg });
        });
    });
    page.on('pageerror', (err) => {
        errors.push({ kind: 'pageerror', message: err?.message ?? String(err) });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;
        errors.push({ kind: 'console.error', message: text });
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        errors.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        const status = res.status();
        if (status < 400) return;
        errors.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...errors, ...fromPage];
    };
}

function makeConfig({ insetMeters }) {
    return Object.freeze({
        id: 'bf2_window_cutout',
        name: 'BF2 Window Cutout',
        windowDefinitions: {
            nextWindowIndex: 2,
            items: [{
                id: 'win_1',
                label: 'Win 1',
                settings: {
                    width: 2.0,
                    height: 1.7,
                    arch: { enabled: true, heightRatio: 0.18 },
                    frame: { width: 0.1, depth: 0.12, inset: insetMeters }
                }
            }]
        },
        layers: [
            {
                id: 'floor_70',
                type: 'floor',
                floors: 2,
                floorHeight: 4.0,
                planOffset: 0,
                style: 'default',
                material: { kind: 'texture', id: 'default' },
                belt: { enabled: false },
                windows: {
                    enabled: false,
                    typeId: 'window.style.default',
                    params: {},
                    width: 2.2,
                    height: 1.4,
                    sillHeight: 1,
                    spacing: 1.6,
                    cornerEps: 0.01,
                    offset: 0.01
                },
                faceLinking: { links: { C: 'A' } }
            }
        ],
        facades: {
            floor_70: {
                A: {
                    layout: {
                        bays: {
                            nextBayIndex: 2,
                            items: [
                                {
                                    id: 'bay_1',
                                    size: { mode: 'range', minMeters: 4.0, maxMeters: null },
                                    expandPreference: 'prefer_expand',
                                    depth: { left: -1.4, right: -1.4 },
                                    window: {
                                        enabled: true,
                                        defId: 'win_1',
                                        width: { minMeters: 1.8, maxMeters: null },
                                        padding: { leftMeters: 0.2, rightMeters: 0.4, linked: false }
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        }
    });
}

async function loadIntoBf2(page, config) {
    await page.evaluate((cfg) => {
        const view = window.__busSim?.sm?.current?.view ?? null;
        if (!view?.scene?.loadBuildingConfig) return false;
        view._currentConfig = cfg;
        return !!view.scene.loadBuildingConfig(cfg, { preserveCamera: true });
    }, config);
}

test('BF2: bay window cuts wall + inset is face-relative (A vs C)', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('9');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();
    await page.waitForSelector('.building-fab2-layer-group.is-floor');

    const cfg0 = makeConfig({ insetMeters: 0.0 });
    await loadIntoBf2(page, cfg0);
    const baseline = await page.evaluate(async () => {
        const THREE = await import('three');
        const view = window.__busSim?.sm?.current?.view ?? null;
        if (!view) throw new Error('Missing BF2 view');

        const solidGroup = view.scene?._building?.solidGroup ?? null;
        if (!solidGroup?.traverse) throw new Error('Missing solid group');

        let wallMesh = null;
        solidGroup.traverse((obj) => {
            if (wallMesh) return;
            if (!obj?.isMesh) return;
            if (obj.userData?.buildingFab2Role === 'wall') wallMesh = obj;
        });
        if (!wallMesh?.geometry) throw new Error('Missing wall mesh');
        const applyDoubleSide = (mat) => {
            if (!mat || typeof mat !== 'object') return;
            mat.side = THREE.DoubleSide;
        };
        if (Array.isArray(wallMesh.material)) wallMesh.material.forEach(applyDoubleSide);
        else applyDoubleSide(wallMesh.material);
        wallMesh.updateMatrixWorld(true);

        const floorLines = (() => {
            const cfg = view?._currentConfig ?? null;
            const layer = Array.isArray(cfg?.layers) ? cfg.layers[0] : null;
            const floors = Math.max(0, Number(layer?.floors) || 0);
            const floorHeight = Math.max(0, Number(layer?.floorHeight) || 0);
            if (floors < 2 || !(floorHeight > 0)) return [];
            const out = [];
            let y = 0;
            for (let f = 0; f < floors - 1; f++) {
                y += floorHeight;
                out.push(y);
            }
            return out;
        })();

        const countTrianglesCrossingY = (yLine) => {
            const pos = wallMesh.geometry.getAttribute('position');
            const eps = 1e-4;
            let crosses = 0;
            for (let i = 0; i + 2 < pos.count; i += 3) {
                const y0 = pos.getY(i);
                const y1 = pos.getY(i + 1);
                const y2 = pos.getY(i + 2);
                const yMin = Math.min(y0, y1, y2);
                const yMax = Math.max(y0, y1, y2);
                if (yMin < yLine - eps && yMax > yLine + eps) crosses++;
            }
            return crosses;
        };

        const crossFloorTriangles = floorLines.reduce((sum, yLine) => sum + countTrianglesCrossingY(yLine), 0);

        const windowsGroup = view.scene?._building?.windowsGroup ?? null;
        if (!windowsGroup?.traverse) throw new Error('Missing windows group');

        let defGroup = null;
        windowsGroup.traverse((obj) => {
            if (defGroup) return;
            if (!obj?.isGroup) return;
            if (obj.userData?.buildingWindowSource === 'bf2_window_definition') defGroup = obj;
        });
        if (!defGroup) throw new Error('Missing bf2 window definition group');
        defGroup.updateMatrixWorld(true);

        const frameLayer = defGroup.userData?.layers?.frame ?? null;
        if (!frameLayer?.traverse) throw new Error('Missing frame layer');

        let frameMesh = null;
        frameLayer.traverse((obj) => {
            if (frameMesh) return;
            if (obj?.isInstancedMesh) frameMesh = obj;
        });
        if (!frameMesh) throw new Error('Missing frame instanced mesh');
        frameMesh.updateMatrixWorld(true);

        const vars = Array.isArray(defGroup.userData?.instanceVariations) ? defGroup.userData.instanceVariations : [];
        const indexById = new Map();
        for (let i = 0; i < vars.length; i++) {
            const id = typeof vars[i]?.id === 'string' ? vars[i].id : '';
            if (id) indexById.set(id, i);
        }

        const ids = {
            A: 'floor_70:0:0:win_1',
            C: 'floor_70:0:1:win_1'
        };

        const extract = (id) => {
            const idx = indexById.get(id);
            if (!Number.isInteger(idx)) throw new Error(`Missing instance id "${id}"`);

            const im = new THREE.Matrix4();
            frameMesh.getMatrixAt(idx, im);
            const wm = new THREE.Matrix4().multiplyMatrices(frameMesh.matrixWorld, im);

            const pos = new THREE.Vector3().setFromMatrixPosition(wm);
            const normal = new THREE.Vector3(0, 0, 1).transformDirection(wm);
            const origin = pos.clone().addScaledVector(normal, 0.6);
            const dir = normal.clone().multiplyScalar(-1);
            const ray = new THREE.Raycaster(origin, dir, 0, 1.2);
            const hits = ray.intersectObject(wallMesh, false);

            const tangent = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
            const probePos = pos.clone().addScaledVector(tangent, 1.25);
            const probeOrigin = probePos.clone().addScaledVector(normal, 0.6);
            const probeRay = new THREE.Raycaster(probeOrigin, dir, 0, 1.2);
            const probeHits = probeRay.intersectObject(wallMesh, false);
            const probeFaceNormalWorld = probeHits[0]?.face?.normal
                ? probeHits[0].face.normal.clone().transformDirection(wallMesh.matrixWorld).normalize()
                : null;

            return {
                pos: { x: pos.x, y: pos.y, z: pos.z },
                normal: { x: normal.x, y: normal.y, z: normal.z },
                wallHits: hits.length,
                probeHits: probeHits.length,
                probeNormalDot: probeFaceNormalWorld ? probeFaceNormalWorld.dot(normal) : null
            };
        };

        return {
            crossFloorTriangles,
            A: extract(ids.A),
            C: extract(ids.C)
        };
    });

    expect(baseline.crossFloorTriangles).toBe(0);
    expect(baseline.A.wallHits).toBe(0);
    expect(baseline.C.wallHits).toBe(0);
    expect(baseline.A.probeHits).toBeGreaterThan(0);
    expect(baseline.C.probeHits).toBeGreaterThan(0);
    expect(baseline.A.probeNormalDot).toBeGreaterThan(0.75);
    expect(baseline.C.probeNormalDot).toBeGreaterThan(0.75);

    const cfg1 = makeConfig({ insetMeters: 0.1 });
    await loadIntoBf2(page, cfg1);
    const inset = await page.evaluate(async () => {
        const THREE = await import('three');
        const view = window.__busSim?.sm?.current?.view ?? null;
        if (!view) throw new Error('Missing BF2 view');

        const windowsGroup = view.scene?._building?.windowsGroup ?? null;
        if (!windowsGroup?.traverse) throw new Error('Missing windows group');

        let defGroup = null;
        windowsGroup.traverse((obj) => {
            if (defGroup) return;
            if (!obj?.isGroup) return;
            if (obj.userData?.buildingWindowSource === 'bf2_window_definition') defGroup = obj;
        });
        if (!defGroup) throw new Error('Missing bf2 window definition group');
        defGroup.updateMatrixWorld(true);

        const frameLayer = defGroup.userData?.layers?.frame ?? null;
        if (!frameLayer?.traverse) throw new Error('Missing frame layer');

        let frameMesh = null;
        frameLayer.traverse((obj) => {
            if (frameMesh) return;
            if (obj?.isInstancedMesh) frameMesh = obj;
        });
        if (!frameMesh) throw new Error('Missing frame instanced mesh');
        frameMesh.updateMatrixWorld(true);

        const vars = Array.isArray(defGroup.userData?.instanceVariations) ? defGroup.userData.instanceVariations : [];
        const indexById = new Map();
        for (let i = 0; i < vars.length; i++) {
            const id = typeof vars[i]?.id === 'string' ? vars[i].id : '';
            if (id) indexById.set(id, i);
        }

        const ids = {
            A: 'floor_70:0:0:win_1',
            C: 'floor_70:0:1:win_1'
        };

        const extractPos = (id) => {
            const idx = indexById.get(id);
            if (!Number.isInteger(idx)) throw new Error(`Missing instance id "${id}"`);
            const im = new THREE.Matrix4();
            frameMesh.getMatrixAt(idx, im);
            const wm = new THREE.Matrix4().multiplyMatrices(frameMesh.matrixWorld, im);
            const pos = new THREE.Vector3().setFromMatrixPosition(wm);
            return { x: pos.x, y: pos.y, z: pos.z };
        };

        return {
            A: extractPos(ids.A),
            C: extractPos(ids.C)
        };
    });

    expect(inset.A.z - baseline.A.pos.z).toBeLessThan(-0.09);
    expect(inset.A.z - baseline.A.pos.z).toBeGreaterThan(-0.11);
    expect(inset.C.z - baseline.C.pos.z).toBeGreaterThan(0.09);
    expect(inset.C.z - baseline.C.pos.z).toBeLessThan(0.11);

    expect(await getErrors()).toEqual([]);
});
