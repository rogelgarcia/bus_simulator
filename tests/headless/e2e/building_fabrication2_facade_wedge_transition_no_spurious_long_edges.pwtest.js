// Headless browser tests: BF2 facade wedge transition topology.
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

test('BF2: straight→wedge transition should not create long cross-bay edges', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();
    await page.waitForSelector('.building-fab2-layer-group.is-floor');

    const res = await page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view ?? null;
        if (!view) throw new Error('Missing BF2 view');

        const cfg = view._currentConfig ?? null;
        if (!cfg) throw new Error('Missing BF2 config');

        const layers = Array.isArray(cfg.layers) ? cfg.layers : [];
        const floor = layers.find((l) => l?.type === 'floor') ?? null;
        const layerId = typeof floor?.id === 'string' ? floor.id : '';
        if (!layerId) throw new Error('Missing floor layer id');

        cfg.facades ??= {};
        cfg.facades[layerId] ??= {};
        const layerFacades = cfg.facades[layerId];

        layerFacades.A = {
            depthOffset: 0,
            layout: {
                items: [
                    { type: 'bay', id: 'bay_straight', widthFrac: 0.5, depth: { left: 0.2, right: 0.2 } },
                    { type: 'bay', id: 'bay_wedge', widthFrac: 0.5, depth: { left: 0.2, right: 0.6, linked: false } }
                ]
            }
        };

        const loaded = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!loaded) throw new Error('loadBuildingConfig failed');

        const building = view.scene?._building ?? null;
        const solidGroup = building?.solidGroup ?? null;
        if (!solidGroup?.traverse) throw new Error('Missing solid group');

        let wallMesh = null;
        solidGroup.traverse((obj) => {
            if (wallMesh) return;
            if (!obj?.isMesh) return;
            if (obj.userData?.buildingFab2Role === 'wall') wallMesh = obj;
        });
        if (!wallMesh?.geometry) throw new Error('Missing wall mesh');

        wallMesh.updateMatrixWorld(true);
        wallMesh.geometry.computeBoundingBox?.();
        const box = wallMesh.geometry.boundingBox?.clone?.()?.applyMatrix4?.(wallMesh.matrixWorld) ?? null;
        if (!box) throw new Error('Missing wall bbox');

        const geo = wallMesh.geometry;
        const pos = geo.getAttribute?.('position') ?? null;
        const arr = pos?.array ?? null;
        const vCount = Number(pos?.count) || 0;
        if (!arr || !(vCount > 0)) throw new Error('Missing wall positions');

        const idxArr = geo.index?.array ?? null;
        const triCount = idxArr ? Math.floor(idxArr.length / 3) : Math.floor(vCount / 3);
        const m = wallMesh.matrixWorld?.elements ?? null;
        if (!m) throw new Error('Missing wall matrix');

        const toWorld = (idx) => {
            const o = idx * 3;
            const x = arr[o];
            const y = arr[o + 1];
            const z = arr[o + 2];
            const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
            const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
            const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
            return { x: wx, y: wy, z: wz };
        };

        const zThreshold = box.min.z + (box.max.z - box.min.z) * 0.6;
        const faceLenEstimate = box.max.x - box.min.x;
        const edgeLenLimit = faceLenEstimate * 0.75;

        let maxPlanEdgeLen = 0;
        const getIdx = (i) => (idxArr ? (idxArr[i] ?? 0) : i);

        for (let t = 0; t < triCount; t++) {
            const i0 = getIdx(t * 3);
            const i1 = getIdx(t * 3 + 1);
            const i2 = getIdx(t * 3 + 2);
            if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= vCount || i1 >= vCount || i2 >= vCount) continue;

            const a = toWorld(i0);
            const b = toWorld(i1);
            const c = toWorld(i2);
            const edges = [
                [a, b],
                [b, c],
                [c, a]
            ];
            for (const [p, q] of edges) {
                if (p.z <= zThreshold || q.z <= zThreshold) continue;
                const len = Math.hypot(p.x - q.x, p.z - q.z);
                if (len > maxPlanEdgeLen) maxPlanEdgeLen = len;
            }
        }

        return { faceLenEstimate, edgeLenLimit, maxPlanEdgeLen };
    });

    expect(res.faceLenEstimate).toBeGreaterThan(1);
    expect(res.maxPlanEdgeLen).toBeLessThan(res.edgeLenLimit + 1e-4);
    expect(await getErrors()).toEqual([]);
});

