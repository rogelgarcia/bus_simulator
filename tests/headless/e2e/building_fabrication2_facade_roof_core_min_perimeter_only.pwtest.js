// Headless browser tests: BF2 roof core uses MinPerimeterLoop vertices only.
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

test('BF2: roof core triangulates MinPerimeter only (no bay/corner-cut vertices)', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

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

        const cornerCutouts = { startMeters: 2, endMeters: 2 };
        const pad = (id, widthFrac) => ({ type: 'padding', id, widthFrac, minWidthMeters: 0.25 });
        const bay = (id, widthFrac, depth) => ({ type: 'bay', id, widthFrac, minWidthMeters: 0.6, depth });

        layerFacades.A = {
            depthOffset: 0,
            cornerCutouts,
            layout: {
                items: [
                    pad('pad_l', 0.2),
                    bay('bay_1', 0.25, { left: 0.2, right: 0.6, linked: false }),
                    bay('bay_2', 0.25, { left: -0.4, right: -0.4 }),
                    pad('pad_r', 0.3)
                ]
            }
        };
        layerFacades.B = { depthOffset: 0, cornerCutouts, layout: { items: [pad('pad_b', 1)] } };
        layerFacades.C = { depthOffset: 0, cornerCutouts, layout: { items: [pad('pad_c', 1)] } };
        layerFacades.D = { depthOffset: 0, cornerCutouts, layout: { items: [pad('pad_d', 1)] } };

        const getRoofCoreSnapshot = () => {
            const building = view.scene?._building ?? null;
            const solidGroup = building?.solidGroup ?? null;
            if (!solidGroup?.traverse) throw new Error('Missing solid group');

            let roofCore = null;
            solidGroup.traverse((obj) => {
                if (roofCore) return;
                if (!obj?.isMesh) return;
                const ud = obj.userData ?? null;
                if (ud?.buildingFab2Role !== 'roof') return;
                if (ud?.buildingFab2RoofKind !== 'core') return;
                roofCore = obj;
            });
            if (!roofCore?.geometry) throw new Error('Missing roof core mesh');

            const geo = roofCore.geometry;
            const pos = geo.getAttribute?.('position') ?? null;
            const arr = pos?.array ?? null;
            const vCount = Number(pos?.count) || 0;
            if (!arr || !(vCount > 0)) throw new Error('Missing roof core positions');

            const idx = geo.index?.array ?? null;
            const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(vCount / 3);

            const keys = new Set();
            const round = (v) => Math.round(Number(v) * 1e6) / 1e6;
            for (let i = 0; i < vCount; i++) {
                const o = i * 3;
                const x = round(arr[o]);
                const z = round(arr[o + 2]);
                keys.add(`${x},${z}`);
            }

            const posSig = Array.from(arr, round).join(',');
            const idxSig = idx ? Array.from(idx).join(',') : '';
            return { triCount, uniqueXZ: keys.size, posSig, idxSig };
        };

        const ok1 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!ok1) throw new Error('loadBuildingConfig failed (first)');
        const a = getRoofCoreSnapshot();

        const ok2 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!ok2) throw new Error('loadBuildingConfig failed (second)');
        const b = getRoofCoreSnapshot();

        return { a, b };
    });

    expect(report.a.triCount).toBe(2);
    expect(report.a.uniqueXZ).toBe(4);
    expect(report.a.posSig).toBe(report.b.posSig);
    expect(report.a.idxSig).toBe(report.b.idxSig);
    expect(await getErrors()).toEqual([]);
});

