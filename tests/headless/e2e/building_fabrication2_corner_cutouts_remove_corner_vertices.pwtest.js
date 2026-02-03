// Headless browser tests: BF2 corner cutouts remove wall corner vertices deterministically.
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

test('BF2: corner cutouts remove wall corner vertices', async ({ page }) => {
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

        cfg.facades ??= {};
        cfg.facades[floorId] ??= {};
        const layerFacades = cfg.facades[floorId];

        const getFacadeWallVertsXZ = () => {
            const building = view.scene?._building ?? null;
            const solidGroup = building?.solidGroup ?? null;
            if (!solidGroup?.traverse) throw new Error('Missing solid group');

            const meshes = [];
            solidGroup.traverse((obj) => {
                if (!obj?.isMesh) return;
                const ud = obj.userData ?? null;
                if (ud?.buildingFab2Role !== 'wall') return;
                if (ud?.buildingFab2WallKind !== 'facade') return;
                meshes.push(obj);
            });
            if (!meshes.length) throw new Error('Missing facade wall mesh');

            const verts = [];
            for (const mesh of meshes) {
                const geo = mesh.geometry ?? null;
                const pos = geo?.getAttribute?.('position') ?? null;
                const arr = pos?.array ?? null;
                if (!arr || !mesh.matrixWorld?.elements) continue;
                mesh.updateMatrixWorld(true);
                const mm = mesh.matrixWorld.elements;
                for (let i = 0; i < pos.count; i++) {
                    const o = i * 3;
                    const lx = arr[o];
                    const ly = arr[o + 1];
                    const lz = arr[o + 2];
                    const wx = mm[0] * lx + mm[4] * ly + mm[8] * lz + mm[12];
                    const wz = mm[2] * lx + mm[6] * ly + mm[10] * lz + mm[14];
                    verts.push([wx, wz]);
                }
            }
            if (!verts.length) throw new Error('Missing wall vertices');
            return verts;
        };

        const cornerReport = (verts) => {
            let minX = Infinity;
            let maxX = -Infinity;
            let minZ = Infinity;
            let maxZ = -Infinity;
            for (const [x, z] of verts) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (z < minZ) minZ = z;
                if (z > maxZ) maxZ = z;
            }
            const eps = 0.006;
            const hasVertexNear = (tx, tz) => {
                for (const [x, z] of verts) {
                    if (Math.abs(x - tx) > eps) continue;
                    if (Math.abs(z - tz) > eps) continue;
                    return true;
                }
                return false;
            };
            return {
                bounds: { minX, maxX, minZ, maxZ },
                corners: {
                    minX_minZ: hasVertexNear(minX, minZ),
                    minX_maxZ: hasVertexNear(minX, maxZ),
                    maxX_minZ: hasVertexNear(maxX, minZ),
                    maxX_maxZ: hasVertexNear(maxX, maxZ)
                }
            };
        };

        const baseFacade = { depthOffset: 0, layout: { items: [{ type: 'padding', id: 'pad', widthFrac: 1 }] } };
        layerFacades.A = { ...baseFacade };
        layerFacades.B = { ...baseFacade };
        layerFacades.C = { ...baseFacade };
        layerFacades.D = { ...baseFacade };

        const ok1 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!ok1) throw new Error('loadBuildingConfig failed (baseline)');
        const baselineVerts = getFacadeWallVertsXZ();
        const baseline = cornerReport(baselineVerts);

        const cornerCutouts = { startMeters: 2, endMeters: 2 };
        layerFacades.A = { ...baseFacade, cornerCutouts };
        layerFacades.B = { ...baseFacade, cornerCutouts };
        layerFacades.C = { ...baseFacade, cornerCutouts };
        layerFacades.D = { ...baseFacade, cornerCutouts };

        const ok2 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!ok2) throw new Error('loadBuildingConfig failed (corner cutouts)');
        const cutVerts = getFacadeWallVertsXZ();
        const cut = cornerReport(cutVerts);

        return { baseline, cut };
    });

    expect(report.baseline.corners.minX_minZ).toBeTruthy();
    expect(report.baseline.corners.minX_maxZ).toBeTruthy();
    expect(report.baseline.corners.maxX_minZ).toBeTruthy();
    expect(report.baseline.corners.maxX_maxZ).toBeTruthy();

    expect(report.cut.corners.minX_minZ).toBeFalsy();
    expect(report.cut.corners.minX_maxZ).toBeFalsy();
    expect(report.cut.corners.maxX_minZ).toBeFalsy();
    expect(report.cut.corners.maxX_maxZ).toBeFalsy();

    const errors = await getErrors();
    expect(errors).toEqual([]);
});

