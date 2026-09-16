// Separately measures repeated activation and retained memory in an isolated test browser.
import { writeFile } from 'node:fs/promises';

export async function captureBakedActivationLifecycle(page, output) {
    const session = await page.context().newCDPSession(page);
    const cycles = [];
    try {
        for (let cycle = 0; cycle < 4; cycle++) {
            const before = await session.send('Runtime.getHeapUsage');
            await page.evaluate(async () => {
                const engine = window.__busSim.engine;
                await engine.setBakedLightingSettings({ ...engine._bakedLighting.getSettings(), mode: 'current' });
            });
            await page.waitForFunction(() => !window.__busSim.engine._bakedLighting.shouldHoldView());
            await page.evaluate(async () => {
                await window.startBakedStartupCapture();
                const engine = window.__busSim.engine;
                await engine.setBakedLightingSettings({ ...engine._bakedLighting.getSettings(), mode: 'auto' });
            });
            await page.waitForFunction(() => window.bakedStartup.readyFrames >= 900, null, { timeout: 90_000 });
            await page.waitForTimeout(200);
            const capture = await page.evaluate(() => window.bakedStartup.finish());
            const samples = new Map(capture.samples.map(sample => [sample.submissionSequence, sample.ms]));
            for (const frame of capture.frames) frame.gpu = samples.get(frame.submission) ?? null;
            const after = await session.send('Runtime.getHeapUsage');
            if (!capture.baked.view.ready || capture.baked.failure
                || capture.finalTimer.disjointCount !== capture.initialTimer.disjointCount) {
                throw new Error('Repeated baked activation lost readiness or valid GPU timing');
            }
            const frame = capture.frames.at(-1);
            if (cycle) {
                const previous = cycles[0].capture.frames.at(-1);
                for (const key of ['calls', 'triangles', 'geometries', 'textures', 'programs', 'width', 'height']) {
                    if (frame[key] !== previous[key]) throw new Error(`Repeated activation changed ${key}`);
                }
            }
            cycles.push({ cycle, before, after, capture });
            await writeFile(`${output}/lifecycle.json`, JSON.stringify({ cycles }));
        }
        const beforeCollection = await session.send('Runtime.getHeapUsage');
        await session.send('HeapProfiler.collectGarbage');
        const afterCollection = await session.send('Runtime.getHeapUsage');
        await writeFile(`${output}/lifecycle.json`, JSON.stringify({ cycles, beforeCollection, afterCollection,
            collectionPolicy: 'Diagnostic only, after every timed window; main renderer heap and backing storage, not total RAM.' }));
        await page.locator('#game-canvas').screenshot({ path: `${output}/lifecycle.png`,
            style: 'body * {visibility:hidden!important} #game-canvas {visibility:visible!important}' });
    } finally {
        await session.detach();
    }
}
