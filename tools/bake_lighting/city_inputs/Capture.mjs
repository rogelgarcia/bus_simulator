// Captures resolved planner inputs and compares the candidate in a fresh game.
import path from 'node:path';
import { withGameBrowser } from '../experiments/lighting_configurations/capture_baselines/GameBrowser.mjs';

export async function captureCityInputs(ctx, { candidate = null } = {}) {
    return withGameBrowser(ctx, { width: 1280, height: 720 }, async (page, url) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        if (candidate) {
            await page.route('**/src/app/city/precomputed/bakes/**', route => {
                const file = new URL(route.request().url()).pathname.split('/').pop();
                const body = file === 'bigcity2.index.json' ? JSON.stringify(candidate.index)
                    : file === candidate.index.file ? candidate.bytes : null;
                return body ? route.fulfill({ body, contentType: 'application/json' }) : route.abort();
            });
        }
        await page.goto(`${url}/?coreTests=0&debug=true`);
        await page.waitForFunction(() => !!window.__busSim?.engine.context.cityInputs);
        await page.evaluate(() => window.__busSim.sm.go('bus_select'));
        await page.waitForFunction(() => !!window.__busSim.sm.current.showcase);
        await page.evaluate(async capture => {
            const { engine, sm } = window.__busSim;
            await sm.current.showcase.bus.userData.readyPromise;
            await engine.waitForLightingReady();
            if (capture) {
                const { createCityInputPlans } = await import('/src/app/city/precomputed/CityInputPlans.js');
                engine.context.cityInputs = createCityInputPlans(null, { capture: true });
            }
            sm.go('game_mode');
        }, !candidate);
        await page.waitForFunction(() => {
            const { engine, sm } = window.__busSim, b = engine._bakedLighting;
            return sm.currentName === 'game_mode' && b.effectiveMode === 'baked' && b.getDiagnostics().view.ready;
        }, null, { timeout: 240000 });
        const result = await page.evaluate(async capture => {
            const { engine } = window.__busSim, runtime = engine._bakedLighting.receivers;
            const { rawSha256Hex } = await import('/src/app/illumination/package/RawSha256.js');
            const records = [], tasks = [];
            engine.context.city.group.updateMatrixWorld(true);
            engine.context.city.group.traverse(object => {
                if (!object.geometry) return;
                const geometry = object.geometry;
                const record = { name: object.name, matrix: object.matrixWorld.toArray(), groups: geometry.groups,
                    drawRange: geometry.drawRange, attributes: {}, index: null };
                records.push(record);
                for (const [key, attribute] of Object.entries(geometry.attributes)) {
                    const data = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
                    tasks.push(rawSha256Hex(data).then(hash => { record.attributes[key] = { hash, itemSize: attribute.itemSize, normalized: attribute.normalized }; }));
                }
                if (geometry.index) tasks.push(rawSha256Hex(geometry.index.array).then(hash => { record.index = hash; }));
            });
            await Promise.all(tasks);
            for (const record of records) record.attributes = Object.fromEntries(Object.entries(record.attributes).sort(([a], [b]) => a.localeCompare(b)));
            return { source: runtime.source.hashes, geometryHash: await rawSha256Hex(new TextEncoder().encode(JSON.stringify(records))),
                geometryCount: records.length, diagnostics: engine.context.cityInputs.diagnostics(),
                captured: capture ? engine.context.cityInputs.captured() : null };
        }, !candidate);
        if (errors.length) throw new Error(`City input capture errors: ${errors.join('; ')}`);
        await page.locator('#game-canvas').screenshot({ path: path.join(ctx.stage, candidate ? 'cached.png' : 'runtime.png'),
            style: 'body * {visibility:hidden!important} #game-canvas {visibility:visible!important}' });
        return result;
    });
}
