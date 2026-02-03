// Headless browser tests: BF2 facade negative depth should not shift orthogonal faces.
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

test('BF2: negative face depth on A changes Z only (no X shift)', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('9');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();
    await page.waitForSelector('.building-fab2-layer-group.is-floor');

    const delta = await page.evaluate(() => {
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

        const getWallBounds = () => {
            const building = view.scene?._building ?? null;
            const solidGroup = building?.solidGroup ?? null;
            if (!solidGroup?.traverse) throw new Error('Missing solid group');

            let wallMesh = null;
            solidGroup.traverse((obj) => {
                if (wallMesh) return;
                if (!obj?.isMesh) return;
                if (obj.userData?.buildingFab2Role === 'wall') wallMesh = obj;
            });
            if (!wallMesh) throw new Error('Missing wall mesh');

            const geo = wallMesh.geometry ?? null;
            const pos = geo?.attributes?.position ?? null;
            const arr = pos?.array ?? null;
            if (!arr) throw new Error('Missing wall positions');

            let minX = Infinity;
            let maxX = -Infinity;
            let minZ = Infinity;
            let maxZ = -Infinity;
            for (let i = 0; i < arr.length; i += 3) {
                const x = arr[i];
                const z = arr[i + 2];
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (z < minZ) minZ = z;
                if (z > maxZ) maxZ = z;
            }
            return { minX, maxX, minZ, maxZ };
        };

        layerFacades.A = { depthOffset: 0, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };
        layerFacades.B = { depthOffset: 0, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };
        layerFacades.C = { depthOffset: 0, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };
        layerFacades.D = { depthOffset: 0, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };

        const loaded1 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!loaded1) throw new Error('loadBuildingConfig failed (baseline)');
        const b1 = getWallBounds();

        layerFacades.A = { depthOffset: -0.5, layout: { items: [{ type: 'padding', widthFrac: 1 }] } };
        const loaded2 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!loaded2) throw new Error('loadBuildingConfig failed (changed)');
        const b2 = getWallBounds();

        return {
            dxMin: b2.minX - b1.minX,
            dxMax: b2.maxX - b1.maxX,
            dzMin: b2.minZ - b1.minZ,
            dzMax: b2.maxZ - b1.maxZ
        };
    });
    expect(Math.abs(delta.dxMin)).toBeLessThan(1e-3);
    expect(Math.abs(delta.dxMax)).toBeLessThan(1e-3);
    expect(delta.dzMax).toBeLessThan(-0.45);
    expect(delta.dzMax).toBeGreaterThan(-0.55);
    expect(await getErrors()).toEqual([]);
});
