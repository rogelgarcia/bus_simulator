// Headless browser tests: BF2 corner resolution strategy.
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

function buildCornerConflictItems({ startDepth, endDepth }) {
    return [
        {
            type: 'bay',
            id: 'bay_1',
            widthFrac: 1,
            depth: { left: startDepth, right: endDepth, linked: false }
        }
    ];
}

test('BF2: corner joins trim/extend without shifting orthogonal axis', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();
    await page.waitForSelector('.building-fab2-layer-group.is-floor');

    const delta = await page.evaluate(({ baselineItems, changedItems }) => {
        const view = window.__busSim?.sm?.current?.view ?? null;
        if (!view) throw new Error('Missing BF2 view');

        const cfg = view._currentConfig ?? null;
        if (!cfg) throw new Error('Missing BF2 config');

        const layers = Array.isArray(cfg.layers) ? cfg.layers : [];
        const floor = layers.find((l) => l?.type === 'floor') ?? null;
        const layerId = typeof floor?.id === 'string' ? floor.id : '';
        if (!layerId) throw new Error('Missing floor layer id');

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

            let maxX = -Infinity;
            let maxZ = -Infinity;
            for (let i = 0; i < arr.length; i += 3) {
                const x = arr[i];
                const z = arr[i + 2];
                if (x > maxX) maxX = x;
                if (z > maxZ) maxZ = z;
            }
            return { maxX, maxZ };
        };

        cfg.facades ??= {};
        cfg.facades[layerId] ??= {};
        const layerFacades = cfg.facades[layerId];

        layerFacades.A = { depthOffset: 0, layout: { items: baselineItems } };
        layerFacades.B = {
            depthOffset: 0,
            layout: {
                items: [
                    {
                        type: 'bay',
                        id: 'bay_b',
                        widthFrac: 1,
                        depth: { left: -0.2, right: 0.0, linked: false }
                    }
                ]
            }
        };

        const loaded1 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!loaded1) throw new Error('loadBuildingConfig failed (baseline)');
        const b1 = getWallBounds();

        layerFacades.A = { depthOffset: 0, layout: { items: changedItems } };
        const loaded2 = view.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
        if (!loaded2) throw new Error('loadBuildingConfig failed (changed)');
        const b2 = getWallBounds();

        return { dx: b2.maxX - b1.maxX, dz: b2.maxZ - b1.maxZ };
    }, {
        baselineItems: buildCornerConflictItems({ startDepth: 0.0, endDepth: 0.0 }),
        changedItems: buildCornerConflictItems({ startDepth: 0.0, endDepth: 0.5 })
    });

    expect(Math.abs(delta.dx)).toBeLessThan(0.05);
    expect(delta.dz).toBeGreaterThan(0.45);
    expect(delta.dz).toBeLessThan(0.55);
    expect(await getErrors()).toEqual([]);
});
