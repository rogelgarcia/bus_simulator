// Headless browser tests: BF2 facade bay face mapping + material variation shader compile.
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

function bayDepthNumberInput(bayEditor, label) {
    const row = bayEditor.locator('.building-fab-row').filter({ hasText: label });
    return row.locator('input.building-fab-number');
}

async function setCurrentBayMaterialToColor({ page, floorLayer, colorLabel }) {
    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    await bayEditor.locator('.building-fab2-bay-material-content .building-fab-material-button').click();
    const materialPanel = page.locator('.building-fab2-material-panel:not(.hidden)');
    await expect(materialPanel).toBeVisible();

    const baseSection = materialPanel.locator('.building-fab-details').first();
    await baseSection.locator('.building-fab-material-button').first().click();

    const pickerOverlay = page.locator('.ui-picker-overlay:not(.hidden)');
    await expect(pickerOverlay).toBeVisible();
    await pickerOverlay.locator('.ui-picker-tab').filter({ hasText: 'Color' }).click();
    await pickerOverlay.locator('.ui-picker-option').filter({ hasText: colorLabel }).click();

    await materialPanel.locator('button').filter({ hasText: 'Close' }).click();
    await expect(materialPanel).toBeHidden();
}

async function getSceneSnapshot(page) {
    return page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view ?? null;
        const building = view?.scene?._building ?? null;
        const solidGroup = building?.solidGroup ?? null;
        if (!view || !building || !solidGroup) return null;

        let wallMesh = null;
        solidGroup.traverse((obj) => {
            if (wallMesh) return;
            if (!obj?.isMesh) return;
            if (obj.userData?.buildingFab2Role === 'wall') wallMesh = obj;
        });
        if (!wallMesh || !wallMesh.geometry) return null;

        wallMesh.updateMatrixWorld(true);
        wallMesh.geometry.computeBoundingBox?.();
        const wallBox = wallMesh.geometry.boundingBox?.clone?.()?.applyMatrix4?.(wallMesh.matrixWorld) ?? null;
        if (!wallBox) return null;

        const wallKind = wallMesh.userData?.buildingFab2WallKind ?? null;
        const baseMaterialIndex = Number.isFinite(wallMesh.userData?.buildingFab2WallBaseMaterialIndex)
            ? wallMesh.userData.buildingFab2WallBaseMaterialIndex
            : 0;

        const nonBaseGroups = [];
        const geo = wallMesh.geometry ?? null;
        const pos = geo?.getAttribute?.('position') ?? null;
        const arr = pos?.array ?? null;
        const groups = Array.isArray(geo?.groups) ? geo.groups : [];
        const m = wallMesh.matrixWorld?.elements ?? null;
        if (wallKind === 'facade' && arr && m && groups.length) {
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

            for (const g of groups) {
                const matIndex = Number(g?.materialIndex);
                if (!Number.isFinite(matIndex) || matIndex === baseMaterialIndex) continue;
                const start = Math.max(0, Math.floor(Number(g?.start) || 0));
                const count = Math.max(0, Math.floor(Number(g?.count) || 0));
                if (!count) continue;

                let minX = Infinity;
                let maxX = -Infinity;
                let minZ = Infinity;
                let maxZ = -Infinity;
                for (let i = 0; i < count; i++) {
                    const v = toWorld(start + i);
                    if (v.x < minX) minX = v.x;
                    if (v.x > maxX) maxX = v.x;
                    if (v.z < minZ) minZ = v.z;
                    if (v.z > maxZ) maxZ = v.z;
                }
                if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) continue;
                nonBaseGroups.push({ materialIndex: matIndex, center: { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5 } });
            }
        }

        const cfg = view?._currentConfig ?? null;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const layerId = typeof layers?.[0]?.id === 'string' ? layers[0].id : '';
        const layerFacades = (cfg?.facades && typeof cfg.facades === 'object') ? (cfg.facades[layerId] ?? null) : null;
        const baysA = Array.isArray(layerFacades?.A?.layout?.bays?.items) ? layerFacades.A.layout.bays.items.length : 0;
        const baysB = Array.isArray(layerFacades?.B?.layout?.bays?.items) ? layerFacades.B.layout.bays.items.length : 0;

        return {
            wall: { min: wallBox.min, max: wallBox.max },
            wallKind,
            baseMaterialIndex,
            nonBaseGroups,
            config: { layerId, baysA, baysB }
        };
    });
}

test('BF2: face A bays affect A/C (not B/D)', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();

    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();

    const base = await getSceneSnapshot(page);
    expect(base).not.toBeNull();

    await floorLayer.locator('.building-fab2-face-btn').filter({ hasText: 'A' }).click();
    const addBayBtn = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBayBtn.click();
    await addBayBtn.click();

    const bayButtons = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtons).toHaveCount(2);
    await bayButtons.first().click();

    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    await expect(bayEditor).toBeVisible();
    const left = bayDepthNumberInput(bayEditor, 'Left edge depth');
    const right = bayDepthNumberInput(bayEditor, 'Right edge depth');
    await left.fill('1');
    await right.fill('1');

    await setCurrentBayMaterialToColor({ page, floorLayer, colorLabel: 'Blue tint' });

    await expect.poll(async () => {
        const snap = await getSceneSnapshot(page);
        if (!snap) return null;
        const dz = snap.wall.max.z - base.wall.max.z;
        return { dz, snap };
    }, { timeout: 8_000 }).toMatchObject({ dz: expect.any(Number) });

    const after = await getSceneSnapshot(page);
    expect(after).not.toBeNull();
    expect(after.config.baysA).toBe(2);
    expect(after.config.baysB).toBe(0);

    expect(after.wall.max.z).toBeGreaterThan(base.wall.max.z + 0.75);
    expect(after.wall.min.z).toBeLessThan(base.wall.min.z - 0.75);

    expect(after.wallKind).toBe('facade');
    expect(after.nonBaseGroups.length).toBeGreaterThan(0);

    const zTop = after.wall.max.z;
    const zBot = after.wall.min.z;
    const xRight = after.wall.max.x;
    const xLeft = after.wall.min.x;
    const eps = 0.05;

    const onA = after.nonBaseGroups.some((s) => s.center.z > zTop - eps);
    const onC = after.nonBaseGroups.some((s) => s.center.z < zBot + eps);
    const onB = after.nonBaseGroups.some((s) => s.center.x > xRight - eps);
    const onD = after.nonBaseGroups.some((s) => s.center.x < xLeft + eps);
    expect(onA).toBe(true);
    expect(onC).toBe(true);
    expect(onB).toBe(false);
    expect(onD).toBe(false);

    expect(await getErrors()).toEqual([]);
});

test('BF2: enabling bay material variation should not break shaders', async ({ page }) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('/index.html?ibl=0&bloom=0&coreTests=0&shadows=off');

    await page.waitForSelector('#ui-welcome:not(.hidden)');
    await page.keyboard.press('Q');
    await page.waitForSelector('#ui-setup:not(.hidden)');
    await page.keyboard.press('4');

    await page.waitForSelector('#building-fab2-hud');
    await page.locator('.building-fab2-create-btn').click();

    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();
    await floorLayer.locator('.building-fab2-face-btn').filter({ hasText: 'A' }).click();

    const addBayBtn = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBayBtn.click();

    const bayButtons = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(bayButtons).toHaveCount(1);
    await bayButtons.first().click();

    const bayEditor = floorLayer.locator('.building-fab2-bay-editor');
    await expect(bayEditor).toBeVisible();

    await setCurrentBayMaterialToColor({ page, floorLayer, colorLabel: 'Blue tint' });

    await page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view ?? null;
        const cfg = view?._currentConfig ?? null;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const layerId = typeof layers?.[0]?.id === 'string' ? layers[0].id : '';
        const facadesByLayerId = (cfg?.facades && typeof cfg.facades === 'object') ? cfg.facades : null;
        const layerFacades = layerId && facadesByLayerId ? (facadesByLayerId[layerId] ?? null) : null;
        const bay = layerFacades?.A?.layout?.bays?.items?.[0] ?? null;
        if (bay && typeof bay === 'object') {
            bay.materialVariation = { enabled: true, seedOffset: 0 };
        }
        view?.scene?.loadBuildingConfig?.(cfg, { preserveCamera: true });
    });

    await page.waitForTimeout(500);

    expect(await getErrors()).toEqual([]);
});
