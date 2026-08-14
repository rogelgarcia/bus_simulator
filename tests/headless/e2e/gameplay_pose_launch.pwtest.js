import test, { expect } from '@playwright/test';

test('named gameplay pose launches directly with the catalog transform and camera', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/?pose=civic_center_curve_front&coreTests=0');
    await page.waitForFunction(() => {
        const sim = window.__busSim;
        return sim?.sm?.currentName === 'game_mode'
            && sim?.sm?.current?.busAnchor
            && sim?.sm?.current?._poseCamera;
    }, null, { timeout: 45_000 });

    const actual = await page.evaluate(() => {
        const sim = window.__busSim;
        const state = sim.sm.current;
        return {
            stateName: sim.sm.currentName,
            selectedBusId: sim.engine.context.selectedBusId,
            presetId: state._gameplayPose?.presetId ?? null,
            cityId: state._gameplayPose?.city ?? null,
            bus: {
                x: state.busAnchor.position.x,
                z: state.busAnchor.position.z,
                yawDeg: state.busAnchor.rotation.y * (180 / Math.PI)
            },
            camera: {
                x: sim.engine.camera.position.x,
                y: sim.engine.camera.position.y,
                z: sim.engine.camera.position.z,
                fovDeg: sim.engine.camera.fov
            },
            paused: state.gameLoop?.paused === true,
            hudVisible: !state.hud?.root?.classList?.contains('hidden')
        };
    });

    expect(actual.stateName).toBe('game_mode');
    expect(actual.selectedBusId).toBe('city');
    expect(actual.presetId).toBe('civic_center_curve_front');
    expect(actual.cityId).toBe('bigcity2');
    expect(actual.bus.x).toBeCloseTo(-144, 5);
    expect(actual.bus.z).toBeCloseTo(48, 5);
    expect(actual.bus.yawDeg).toBeCloseTo(-45, 5);
    expect(actual.camera.x).toBeCloseTo(-157, 5);
    expect(actual.camera.y).toBeCloseTo(4.2, 5);
    expect(actual.camera.z).toBeCloseTo(61, 5);
    expect(actual.camera.fovDeg).toBeCloseTo(55, 5);
    expect(actual.paused).toBe(true);
    expect(actual.hudVisible).toBe(true);
    expect(pageErrors).toEqual([]);
});
