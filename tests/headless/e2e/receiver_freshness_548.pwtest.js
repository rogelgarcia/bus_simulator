import test from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });
test('AI 548: source watch work breakdown', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 100_000 });
    const result = await page.evaluate(async () => {
        const engine = window.__busSim.engine; engine.stop();
        const { createEnhancedSourceWatch } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverFreshness.js');
        const references = new Map(); engine.context.city.group.traverse((o) => { if (o.isMesh) references.set(o.uuid, o); });
        const watch = createEnhancedSourceWatch(references), samples = [];
        for (let i = 0; i < 40; i++) { const value = watch.profile(); if (i >= 10) samples.push(value); }
        return { statistics: watch.statistics, samples };
    });
    console.log(JSON.stringify(result));
    await mkdir('tests/artifacts/screens/illumination_548', { recursive: true });
    await writeFile('tests/artifacts/screens/illumination_548/freshness-profile.json', JSON.stringify(result, null, 2));
});
