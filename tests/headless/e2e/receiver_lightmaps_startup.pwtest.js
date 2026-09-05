import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });
const enhanced = process.env.AI548_VARIANT === 'enhanced';
const artifacts = path.resolve(`tests/artifacts/screens/illumination_${enhanced ? '548' : '533'}/loading`);

test('Receiver illumination: saved toggles activate on a fresh page with the installed bake', async ({ page }) => {
    test.setTimeout(480_000);
    await mkdir(artifacts, { recursive: true });
    await page.addInitScript((enhanced) => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { direct: true, indirect: true, enhanced }
    })), enhanced);
    await page.goto('/?pose=civic_center_curve_front&coreTests=0', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__busSim?.engine?._bakedLighting, null, { timeout: 120_000 });
    await page.evaluate(() => {
        window.__busSim.engine._bakedLighting.receivers.onSourceExport = (manifest) => { window.__startupSource = manifest; };
    });
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    let lastPhase, fallbackPasses = 0, result;
    for (let i = 0; i < 180; i++) {
        result = await page.evaluate(() => window.__busSim.engine._bakedLighting.receivers.getDiagnostics());
        const phase = result.state + ':' + result.reason;
        if (phase !== lastPhase) {
            console.log('Saved startup: ' + phase);
            await writeFile(path.join(artifacts, 'saved-startup.json'), JSON.stringify(result, null, 2));
            lastPhase = phase;
        }
        if (result.state === 'active' && result.effective.direct && result.effective.indirect) break;
        fallbackPasses = result.state === 'fallback' ? fallbackPasses + 1 : 0;
        if (fallbackPasses >= 5) break;
        await page.waitForTimeout(1000);
    }
    await writeFile(path.join(artifacts, 'saved-startup.json'), JSON.stringify(result, null, 2));
    if (result.state !== 'active') {
        const manifest = await page.evaluate(() => window.__startupSource ?? null);
        await writeFile(path.join(artifacts, 'startup-source.json'), JSON.stringify(manifest));
    }
    expect(result.state, JSON.stringify(result)).toBe('active');
    expect(result.effective).toEqual({ direct: true, indirect: true });
});
