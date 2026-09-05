import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });
test('AI 548: caster identity is independent of runtime shadow suppression', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ shadows: { enabled: true, dynamicResolution: 'high' } })));
    await page.goto('/?pose=civic_center_curve_front&coreTests=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    const result = await page.evaluate(async () => {
        const engine = window.__busSim.engine, city = engine.context.city;
        const stages = [];
        function snapshot(label) {
            const casters = new Set(city.getStaticSunDepthCasterMeshes());
            const traffic = []; city.trafficControls.group.traverse((o) => { if (o.isMesh) traffic.push({ name: o.name,
                cast: o.castShadow, indexed: casters.has(o), original: city._staticSunDepthCasterController?.getOriginalCasterState(o),
                suppressed: city._staticSunDepthCasterController?._snapshot.get(o), merged: city._shadowMerge.some((e) => e.sources.includes(o)) }); });
            stages.push({ label, shadow: engine.getBakedLightingDebugInfo().status, traffic });
        }
        snapshot('entered'); await engine._bakedLighting.shadows.refresh();
        for (let i = 0; i < 240 && engine.getBakedLightingDebugInfo().status.effectiveMode !== 'baked'; i++) await new Promise((resolve) => setTimeout(resolve, 500));
        snapshot('loaded');
        await engine.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true } });
        snapshot('enhanced-selected');
        return stages;
    });
    await mkdir('tests/artifacts/screens/illumination_548', { recursive: true });
    await writeFile('tests/artifacts/screens/illumination_548/caster-identity.json', JSON.stringify(result, null, 2));
    const before = result[0].traffic.filter((object) => object.indexed).map((object) => object.name);
    expect(before.length).toBeGreaterThan(0);
    for (const stage of result.slice(1)) {
        expect(stage.shadow.effectiveMode).toBe('baked');
        expect(stage.traffic.filter((object) => object.indexed).map((object) => object.name)).toEqual(before);
    }
});
