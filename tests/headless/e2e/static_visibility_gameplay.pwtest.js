import test, { expect } from '@playwright/test';

const POSE_URL = '/?pose=civic_center_curve_front&coreTests=0&visibilityMapDebug=1';

async function bootActiveVisibility(page) {
    const pageErrors = [];
    const visibilityMessages = [];
    page.on('pageerror', (error) => pageErrors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.text().includes('CityStaticVisibility')) visibilityMessages.push(message.text());
    });
    await page.addInitScript(() => localStorage.removeItem('bus_sim.staticVisibility.v1'));
    await page.goto(POSE_URL);
    await page.waitForFunction(() => {
        const city = window.__busSim?.sm?.current?.city;
        return window.__busSim?.sm?.currentName === 'game_mode'
            && !!city
            && ['active', 'fallback', 'disabled'].includes(city.getStaticVisibilityStatus?.().state);
    }, null, { timeout: 90_000 });
    const status = await page.evaluate(() => {
        const city = window.__busSim?.sm?.current?.city;
        return { status: city?.getStaticVisibilityStatus?.(), diagnostics: city?.getStaticVisibilityDiagnostics?.() };
    });
    expect(status.status?.state, JSON.stringify({ ...status, visibilityMessages })).toBe('active');
    await page.waitForFunction(() => window.__busSim?.sm?.current?.city?.getStaticVisibilityDiagnostics?.()?.culledRoots > 0);
    return pageErrors;
}

async function setOptionsToggle(page, label, value) {
    await page.evaluate(({ label, value }) => {
        const rows = Array.from(document.querySelectorAll('.options-row'));
        const row = rows.find((entry) => entry.querySelector('.options-row-label')?.textContent?.trim() === label);
        const input = row?.querySelector('input[type="checkbox"]');
        if (!input) throw new Error(`Missing options toggle: ${label}`);
        if (input.checked === value) return;
        input.checked = value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { label, value });
}

test('static visibility activates, persists through Options, and shows distinct fail-open warnings', async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors = await bootActiveVisibility(page);

    const active = await page.evaluate(() => {
        const state = window.__busSim.sm.current;
        const city = state.city;
        const units = [
            ...city.buildings.group.children.filter((root) => root.name !== 'BuildingSlabs'),
            ...city.trafficControls.group.children,
            ...city.world.trees.group.children
        ];
        return {
            status: city.getStaticVisibilityStatus(),
            diagnostics: city.getStaticVisibilityDiagnostics(),
            roots: units.length,
            hidden: units.filter((root) => root.visible === false).length,
            warningHidden: state.hud.visibilityMapWarning.classList.contains('hidden')
        };
    });
    expect(active.status.state).toBe('active');
    expect(active.roots).toBe(228);
    expect(active.hidden).toBeGreaterThan(0);
    expect(active.warningHidden).toBe(true);
    expect(active.diagnostics.profileId).toContain('grid3-pitch12');

    await page.keyboard.press('0');
    await page.getByRole('button', { name: 'Graphics' }).click();
    await setOptionsToggle(page, 'Visibility map', false);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForFunction(() => window.__busSim.sm.current.city.getStaticVisibilityStatus().state === 'active');
    expect(await page.evaluate(() => localStorage.getItem('bus_sim.staticVisibility.v1'))).toBeNull();

    await page.keyboard.press('0');
    await page.getByRole('button', { name: 'Graphics' }).click();
    await setOptionsToggle(page, 'Visibility map', false);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForFunction(() => window.__busSim.sm.current.city.getStaticVisibilityStatus().state === 'disabled');
    const disabled = await page.evaluate(() => {
        const state = window.__busSim.sm.current;
        const city = state.city;
        const units = [
            ...city.buildings.group.children.filter((root) => root.name !== 'BuildingSlabs'),
            ...city.trafficControls.group.children,
            ...city.world.trees.group.children
        ];
        return {
            warning: state.hud.visibilityMapWarning.textContent,
            warningHidden: state.hud.visibilityMapWarning.classList.contains('hidden'),
            allVisible: units.every((root) => root.visible !== false),
            saved: JSON.parse(localStorage.getItem('bus_sim.staticVisibility.v1'))
        };
    });
    expect(disabled.warning).toBe('The visibility map is disabled. Performance may be impacted.');
    expect(disabled.warningHidden).toBe(false);
    expect(disabled.allVisible).toBe(true);
    expect(disabled.saved.enabled).toBe(false);

    await page.keyboard.press('0');
    await page.getByRole('button', { name: 'Graphics' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForFunction(() => window.__busSim.sm.current.city.getStaticVisibilityStatus().state === 'active');

    await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        const city = sm.current.city;
        window.__staticVisibilityRemovedTree = city.world.trees.group.children.at(-1);
        window.__staticVisibilityRemovedTree.removeFromParent();
        city.disableStaticVisibility();
        city.enableStaticVisibility(engine);
    });
    await page.waitForFunction(() => window.__busSim.sm.current.city.getStaticVisibilityStatus().state === 'fallback');
    await page.waitForFunction(() => !window.__busSim.sm.current.hud.visibilityMapWarning.classList.contains('hidden'));
    const failure = await page.evaluate(() => {
        const state = window.__busSim.sm.current;
        return {
            warning: state.hud.visibilityMapWarning.textContent,
            warningHidden: state.hud.visibilityMapWarning.classList.contains('hidden'),
            reason: state.city.getStaticVisibilityStatus().reason
        };
    });
    expect(failure.warning).toBe('The visibility map could not be loaded. Performance may be impacted.');
    expect(failure.warningHidden).toBe(false);
    expect(failure.reason).toBe('async_tree_mismatch');

    await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        const city = sm.current.city;
        city.world.trees.group.add(window.__staticVisibilityRemovedTree);
        delete window.__staticVisibilityRemovedTree;
        city.disableStaticVisibility();
        city.enableStaticVisibility(engine);
    });
    await page.waitForFunction(() => window.__busSim.sm.current.city.getStaticVisibilityStatus().state === 'active');
    await page.waitForFunction(() => window.__busSim.sm.current.hud.visibilityMapWarning.classList.contains('hidden'));

    const unsupportedCamera = await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        const city = sm.current.city;
        engine.camera.fov += 5;
        engine.camera.updateProjectionMatrix();
        city.updateStaticVisibility(engine.camera, performance.now() + 2000);
        const roots = [
            ...city.buildings.group.children.filter((root) => root.name !== 'BuildingSlabs'),
            ...city.trafficControls.group.children,
            ...city.world.trees.group.children
        ];
        const result = {
            reason: city.getStaticVisibilityStatus().reason,
            allVisible: roots.every((root) => root.visible !== false)
        };
        engine.camera.fov -= 5;
        engine.camera.updateProjectionMatrix();
        city.updateStaticVisibility(engine.camera, performance.now() + 3000);
        return result;
    });
    expect(unsupportedCamera.reason).toBe('camera_fov_unsupported');
    expect(unsupportedCamera.allVisible).toBe(true);
    await page.waitForFunction(() => window.__busSim.sm.current.city.getStaticVisibilityStatus().state === 'active');

    await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        const city = sm.current.city;
        city.cityId = 'unsupported-test-city';
        city.disableStaticVisibility();
        city.enableStaticVisibility(engine);
    });
    await page.waitForFunction(() => window.__busSim.sm.current.city.getStaticVisibilityStatus().reason === 'unsupported_city');
    await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        const city = sm.current.city;
        city.cityId = 'bigcity2';
        city.disableStaticVisibility();
        city.enableStaticVisibility(engine);
    });
    await page.waitForFunction(() => window.__busSim.sm.current.city.getStaticVisibilityStatus().state === 'active');
    expect(pageErrors).toEqual([]);
});

test('static visibility is color-only across real single and cascaded shadow passes', async ({ page }) => {
    test.setTimeout(240_000);
    const pageErrors = await bootActiveVisibility(page);
    const result = await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        const city = state.city;
        state._updateChaseCamera = () => {};
        const units = [
            ...city.buildings.group.children.filter((root) => root.name !== 'BuildingSlabs'),
            ...city.trafficControls.group.children,
            ...city.world.trees.group.children
        ];
        const bridge = city.staticVisibility._bridge;
        const rows = [];
        for (const [type, quality] of [['single', 'low'], ['cascade', 'low']]) {
            engine.setShadowSettings({ ...engine.shadowSettings, type, quality });
            city.applyShadowSettings(engine);
            city.update(engine);
            city.updateStaticVisibility(engine.camera, performance.now() + 1000);
            const hiddenBefore = units.filter((root) => root.visible === false).length;
            const castShadowBefore = [];
            for (const root of units) root.traverse((object) => {
                if (object?.isMesh) castShadowBefore.push([object, object.castShadow]);
            });
            let shadowPasses = 0;
            let allRootsOriginalDuringShadow = true;
            const originalShadowRender = bridge._originalShadowRender;
            bridge._originalShadowRender = function checkedShadowRender(...args) {
                shadowPasses += 1;
                if (!units.every((root, index) => root.visible === bridge._originalVisibility[index])) {
                    allRootsOriginalDuringShadow = false;
                }
                return originalShadowRender.apply(this, args);
            };
            rendererLoop: for (let frame = 0; frame < 4; frame += 1) {
                engine.renderer.shadowMap.needsUpdate = true;
                engine.renderFrame();
                if (shadowPasses > 0) break rendererLoop;
            }
            bridge._originalShadowRender = originalShadowRender;
            rows.push({
                type,
                quality,
                hiddenBefore,
                hiddenAfter: units.filter((root) => root.visible === false).length,
                shadowPasses,
                allRootsOriginalDuringShadow,
                castShadowUnchanged: castShadowBefore.every(([object, value]) => object.castShadow === value),
                bridgeShadowRestores: bridge.stats.shadowRestoreWrites
            });
        }
        return rows;
    });

    for (const row of result) {
        expect(row.hiddenBefore, `${row.type}: color PVS must be active`).toBeGreaterThan(0);
        expect(row.hiddenAfter, `${row.type}: color PVS must be restored after shadow pass`).toBe(row.hiddenBefore);
        expect(row.shadowPasses, `${row.type}: a real shadow pass ran`).toBeGreaterThan(0);
        expect(row.allRootsOriginalDuringShadow, `${row.type}: every PVS root was restored for shadows`).toBe(true);
        expect(row.castShadowUnchanged, `${row.type}: PVS never writes castShadow`).toBe(true);
        expect(row.bridgeShadowRestores, `${row.type}: bridge performed shadow visibility isolation`).toBeGreaterThan(0);
    }
    expect(pageErrors).toEqual([]);
});
