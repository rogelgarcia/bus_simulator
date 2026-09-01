// Headless browser regression: interrupted city attachment must not strand CSM material hooks.
import test, { expect } from '@playwright/test';

async function enterGameplayThroughSelection(page) {
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120_000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'bus_select', null, { timeout: 120_000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (
        window.__busSim?.sm?.currentName === 'game_mode'
        && window.__busSim?.sm?.current?.city?._attached === true
    ), null, { timeout: 180_000 });
}

test('Gameplay: cascade selection recovers an orphaned scene-shadow owner', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/Material shader hook|Shader Error|VALIDATE_STATUS|shader is not compiled/i.test(text)) {
            errors.push(text);
        }
    });

    await page.goto('/?coreTests=0&shadows=cascade_high');
    await enterGameplayThroughSelection(page);

    // Model a transition interrupted after cascade registration but before
    // City.attach commits. Gameplay exit must not be our only cleanup path.
    await page.evaluate(() => {
        window.__busSim.sm.current.city._attached = false;
        window.__busSim.sm.go('welcome');
    });
    await enterGameplayThroughSelection(page);

    const result = await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        const programs = Array.isArray(engine?.renderer?.info?.programs)
            ? engine.renderer.info.programs
            : [];
        return {
            stateName: sm?.currentName ?? null,
            cityAttached: sm?.current?.city?._attached ?? null,
            csmDisposed: sm?.current?.city?._csm?._disposed ?? null,
            registeredCsmMaterials: sm?.current?.city?._csm?._registered?.size ?? 0,
            failedProgramCount: programs.filter((program) => program?.diagnostics?.runnable === false).length
        };
    });

    expect(result).toEqual({
        stateName: 'game_mode',
        cityAttached: true,
        csmDisposed: false,
        registeredCsmMaterials: expect.any(Number),
        failedProgramCount: 0
    });
    expect(result.registeredCsmMaterials).toBeGreaterThan(0);
    expect(errors).toEqual([]);
});
