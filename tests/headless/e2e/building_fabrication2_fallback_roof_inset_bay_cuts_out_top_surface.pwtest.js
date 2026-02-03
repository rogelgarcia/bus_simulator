// Headless browser tests: BF2 fallback roof cap should respect inset facade bays.
import test, { expect } from '@playwright/test';

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

test('BF2: fallback roof surface cuts out when bay insets inward', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('9');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();
    await page.waitForSelector('.building-fab2-layer-group.is-floor');

    const report = await page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view ?? null;
        if (!view) throw new Error('Missing BF2 view');

        const cfg = view._currentConfig ?? null;
        if (!cfg) throw new Error('Missing BF2 config');

        const layers = Array.isArray(cfg.layers) ? cfg.layers : [];
        const floor = layers.find((l) => l?.type === 'floor') ?? null;
        const floorId = typeof floor?.id === 'string' ? floor.id : '';
        if (!floorId) throw new Error('Missing floor layer id');

        cfg.layers = layers.filter((l) => l?.type !== 'roof');

        cfg.facades ??= {};
        cfg.facades[floorId] ??= {};
        const layerFacades = cfg.facades[floorId];

        const getTopFlatMeshes = () => {
            const building = view.scene?._building ?? null;
            const solidGroup = building?.solidGroup ?? null;
            if (!solidGroup?.traverse) throw new Error('Missing solid group');

            const flat = [];
            solidGroup.traverse((obj) => {
                if (!obj?.isMesh) return;
                const geo = obj.geometry ?? null;
                if (!geo?.computeBoundingBox) return;
                obj.updateMatrixWorld(true);
                geo.computeBoundingBox();
                const box = geo.boundingBox?.clone?.()?.applyMatrix4?.(obj.matrixWorld) ?? null;
                if (!box) return;
                const yExtent = box.max.y - box.min.y;
                if (yExtent > 0.02) return;
                flat.push({ mesh: obj, box });
            });

            if (!flat.length) throw new Error('Missing flat meshes');
            const topY = Math.max(...flat.map((it) => it.box.max.y));
            const topFlat = flat.filter((it) => it.box.max.y >= topY - 0.01);
            return { topY, meshes: topFlat };
        };

        const isPointCovered = (meshes, { x, z }) => {
            const eps = 1e-6;
            const baryEps = 1e-6;
            for (const entry of meshes) {
                const mesh = entry?.mesh ?? null;
                if (!mesh?.isMesh) continue;
                const geo = mesh.geometry ?? null;
                const pos = geo?.getAttribute?.('position') ?? null;
                const arr = pos?.array ?? null;
                const idx = geo?.index?.array ?? null;
                const mm = mesh.matrixWorld?.elements ?? null;
                if (!arr || !mm) continue;

                const getIdx = (i) => idx ? (idx[i] ?? 0) : i;
                const toWorldXZ = (i) => {
                    const o = i * 3;
                    const lx = arr[o];
                    const ly = arr[o + 1];
                    const lz = arr[o + 2];
                    const wx = mm[0] * lx + mm[4] * ly + mm[8] * lz + mm[12];
                    const wz = mm[2] * lx + mm[6] * ly + mm[10] * lz + mm[14];
                    return [wx, wz];
                };

                const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(arr.length / 9);
                for (let t = 0; t < triCount; t++) {
                    const i0 = getIdx(t * 3);
                    const i1 = getIdx(t * 3 + 1);
                    const i2 = getIdx(t * 3 + 2);
                    const [ax, az] = toWorldXZ(i0);
                    const [bx, bz] = toWorldXZ(i1);
                    const [cx, cz] = toWorldXZ(i2);

                    const v0x = cx - ax;
                    const v0z = cz - az;
                    const v1x = bx - ax;
                    const v1z = bz - az;
                    const v2x = x - ax;
                    const v2z = z - az;

                    const dot00 = v0x * v0x + v0z * v0z;
                    const dot01 = v0x * v1x + v0z * v1z;
                    const dot02 = v0x * v2x + v0z * v2z;
                    const dot11 = v1x * v1x + v1z * v1z;
                    const dot12 = v1x * v2x + v1z * v2z;
                    const denom = dot00 * dot11 - dot01 * dot01;
                    if (Math.abs(denom) < eps) continue;
                    const inv = 1 / denom;
                    const u = (dot11 * dot02 - dot01 * dot12) * inv;
                    const v = (dot00 * dot12 - dot01 * dot02) * inv;
                    if (u >= -baryEps && v >= -baryEps && u + v <= 1 + baryEps) return true;
                }
            }
            return false;
        };

        layerFacades.A = { depthOffset: 0, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };
        layerFacades.B = { depthOffset: 0, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };
        layerFacades.C = { depthOffset: 0, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };
        layerFacades.D = { depthOffset: 0, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };

        const loaded1 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!loaded1) throw new Error('loadBuildingConfig failed (baseline)');
        const baselineTop = getTopFlatMeshes();
        const baselineBox = baselineTop.meshes.reduce((acc, it) => {
            if (!acc) return it.box;
            return {
                min: {
                    x: Math.min(acc.min.x, it.box.min.x),
                    y: Math.min(acc.min.y, it.box.min.y),
                    z: Math.min(acc.min.z, it.box.min.z)
                },
                max: {
                    x: Math.max(acc.max.x, it.box.max.x),
                    y: Math.max(acc.max.y, it.box.max.y),
                    z: Math.max(acc.max.z, it.box.max.z)
                }
            };
        }, null);
        if (!baselineBox) throw new Error('Missing baseline roof bounds');

        const xMid = (baselineBox.min.x + baselineBox.max.x) * 0.5;
        const xLeft = baselineBox.min.x + (baselineBox.max.x - baselineBox.min.x) * 0.1;
        const xRight = baselineBox.min.x + (baselineBox.max.x - baselineBox.min.x) * 0.9;
        const zNearA = baselineBox.max.z - 0.01;

        const baselineMidCovered = isPointCovered(baselineTop.meshes, { x: xMid, z: zNearA });
        const baselineLeftCovered = isPointCovered(baselineTop.meshes, { x: xLeft, z: zNearA });
        const baselineRightCovered = isPointCovered(baselineTop.meshes, { x: xRight, z: zNearA });
        if (!baselineMidCovered || !baselineLeftCovered || !baselineRightCovered) throw new Error('Baseline roof did not cover probe points');

        layerFacades.A = {
            depthOffset: 0,
            layout: {
                items: [
                    { type: 'padding', id: 'pad_l', widthFrac: 0.25 },
                    { type: 'bay', id: 'bay_mid', widthFrac: 0.5, depth: { left: -0.5, right: -0.5 } },
                    { type: 'padding', id: 'pad_r', widthFrac: 0.25 }
                ]
            }
        };
        const loaded2 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!loaded2) throw new Error('loadBuildingConfig failed (inset bay)');
        const insetTop = getTopFlatMeshes();

        layerFacades.A = {
            depthOffset: 0,
            layout: {
                items: [
                    { type: 'bay', id: 'bay_left', widthFrac: 0.5, depth: { left: -0.5, right: -0.5 } },
                    { type: 'padding', id: 'pad_rest', widthFrac: 0.5 }
                ]
            }
        };
        const loaded3 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!loaded3) throw new Error('loadBuildingConfig failed (corner inset bay)');
        const cornerTop = getTopFlatMeshes();

        return {
            baseline: {
                midCovered: baselineMidCovered,
                leftCovered: baselineLeftCovered,
                rightCovered: baselineRightCovered
            },
            inset: {
                midCovered: isPointCovered(insetTop.meshes, { x: xMid, z: zNearA }),
                leftCovered: isPointCovered(insetTop.meshes, { x: xLeft, z: zNearA })
            },
            cornerInset: {
                leftCovered: isPointCovered(cornerTop.meshes, { x: xLeft, z: zNearA }),
                rightCovered: isPointCovered(cornerTop.meshes, { x: xRight, z: zNearA })
            }
        };
    });

    expect(report.baseline.midCovered).toBe(true);
    expect(report.baseline.leftCovered).toBe(true);
    expect(report.baseline.rightCovered).toBe(true);
    expect(report.inset.leftCovered).toBe(true);
    expect(report.inset.midCovered).toBe(false);
    expect(report.cornerInset.rightCovered).toBe(true);
    expect(report.cornerInset.leftCovered).toBe(false);
    expect(await getErrors()).toEqual([]);
});
