// Contact hardening must follow world geometry and survive changing native shader variants.
import {test, expect} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

test('finite sun follows separation and angle, preserves hooks, and reports GPU cost', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks);
    const result = await page.evaluate(async () => {
        const {runFiniteSunShadowFixture} = await import('./../e2e/fixtures/FiniteSunShadowFixture.js');
        await window.__testHooks.unloadScenario();
        return runFiniteSunShadowFixture(window.__testHooks.getEngine());
    });
    const directory = path.resolve('tests/artifacts/screens/ai564_physical_calibration/finite_sun_fix');
    await mkdir(directory, {recursive:true});
    await writeFile(path.join(directory, 'runtime.json'), JSON.stringify(result, null, 2) + '\n');
    expect(errors).toEqual([]);
    expect(result.widths.far).toBeGreaterThan(2.5 * result.widths.near);
    expect(result.widths.far).toBeGreaterThan(1.7 * result.widths.halfAngle);
    expect(result.widths.hard).toBeLessThanOrEqual(2 / 384);
    expect(result.frustumDifference).toBeLessThan(0.004);
    expect(result.zoomDifference).toBeLessThan(0.00001);
    expect(result.mapDifference).toBeLessThan(0.004);
    expect(result.angleProgramGrowth).toBe(0);
    expect(result.identity).toEqual({mapUnchanged:true, depthUnchanged:true});
    expect(result.toggle.profileDifference).toBeLessThan(0.00001);
    expect(result.toggle.programGrowth).toBeLessThanOrEqual(1);
    expect(result.toggle.restoredKey).toBe(true);
    expect(result.toggle.companionPreserved).toBe(true);
    expect(result.toggle.hookCount).toBe(2);
    expect(result.finalHooks).toEqual(['fixture-companion']);
    for (const key of ['invalidAngle','extraLightRejected','comparisonSamplerRejected','duplicateOwnerRejected']) expect(result[key], key).toBe(true);
    expect(result.materialVariants).toEqual(['MeshPhongMaterial','MeshStandardMaterial','MeshPhysicalMaterial']);
});
