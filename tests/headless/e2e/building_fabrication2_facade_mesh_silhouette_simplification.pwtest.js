// Headless browser tests: BF2 facade mesh silhouette simplification.
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

test('BF2: facade silhouette should not explode triangles on micro depth noise', async ({ page }) => {
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

        const buildNoisyItems = (count) => {
            const items = [];
            for (let i = 0; i < count; i++) {
                const noise = ((i % 3) - 1) * 0.00005;
                const depth = 0.2 + noise;
                items.push({
                    type: 'bay',
                    id: `bay_${i + 1}`,
                    widthFrac: 1,
                    depth: { left: depth, right: depth }
                });
            }
            return items;
        };

        const items = buildNoisyItems(200);
        layerFacades.A = { depthOffset: 0, layout: { items } };
        layerFacades.B = { depthOffset: 0, layout: { items } };

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

        const geo = wallMesh?.geometry ?? null;
        const pos = geo?.attributes?.position ?? null;
        const arr = pos?.array ?? null;
        const count = Number(pos?.count) || 0;
        if (!arr || !(count > 0)) throw new Error('Missing wall mesh geometry');

        let nonFinite = 0;
        for (let i = 0; i < arr.length; i++) {
            if (!Number.isFinite(arr[i])) nonFinite++;
        }
        return { triangles: count / 3, nonFinite };
    });

    expect(res.nonFinite).toBe(0);
    expect(res.triangles).toBeLessThan(2000);
    expect(await getErrors()).toEqual([]);
});
