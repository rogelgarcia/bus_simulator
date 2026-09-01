// Headless browser regression: gameplay materials must compile when dynamic shadows are disabled.
import test, { expect } from '@playwright/test';

test('Gameplay: shadow-off materials compile and render', async ({ page }) => {
    test.setTimeout(180_000);
    const shaderErrors = [];

    page.on('pageerror', (error) => shaderErrors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/Shader Error|VALIDATE_STATUS|shader is not compiled/i.test(text)) {
            shaderErrors.push(text);
        }
    });

    await page.goto('/?pose=civic_center_curve_front&coreTests=0&shadows=off');
    await page.waitForFunction(() => (
        window.__busSim?.sm?.currentName === 'game_mode'
        && !!window.__busSim?.sm?.current?.busAnchor
    ), null, { timeout: 120_000 });

    const result = await page.evaluate(() => {
        const engine = window.__busSim?.engine ?? null;
        const programs = Array.isArray(engine?.renderer?.info?.programs)
            ? engine.renderer.info.programs
            : [];
        return {
            shadowType: engine?.shadowSettings?.type ?? null,
            renderCalls: engine?.renderer?.info?.render?.calls ?? 0,
            failedPrograms: programs
                .filter((program) => program?.diagnostics?.runnable === false)
                .map((program) => ({
                    materialName: program.diagnostics?.material?.name ?? '',
                    materialType: program.diagnostics?.material?.type ?? '',
                    programLog: program.diagnostics?.programLog ?? '',
                    vertexLog: program.diagnostics?.vertexShader?.log ?? '',
                    fragmentLog: program.diagnostics?.fragmentShader?.log ?? ''
                }))
        };
    });

    expect(result.shadowType).toBe('off');
    expect(result.renderCalls).toBeGreaterThan(0);
    expect(result.failedPrograms).toEqual([]);
    expect(shaderErrors).toEqual([]);
});
