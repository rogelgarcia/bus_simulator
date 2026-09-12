// Control for the extra compiled shader code while the prototype is switched off.
// Serve the unextended parent GLSL in isolated browsers; never change game files.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { withGameBrowser } from '../../experiments/lighting_configurations/capture_baselines/GameBrowser.mjs';
import { measureGamePerformance } from '../../experiments/reference_matching/Performance.mjs';
import { writeJson, listFiles } from '../../../baking/Files.mjs';

export async function benchmarkUnextendedParent(ctx) {
    if (ctx.publish || !ctx.options.output || !ctx.options.pose) throw new Error('Diagnostic output and pose required');
    const output = path.resolve(ctx.root, ctx.options.output);
    if (!output.startsWith(path.join(ctx.root, 'tests/artifacts/screens/illumination_547') + path.sep)) throw new Error('Invalid diagnostic output');
    await mkdir(output);
    const pose = JSON.parse(await readFile(path.resolve(ctx.root, ctx.options.pose), 'utf8'));
    const file = 'src/graphics/illumination/static_sun_depth/StaticSunDepthMaterialAdapter.js';
    const source = await readFile(path.join(ctx.root, file), 'utf8');
    const start = source.indexOf('    sourceSet: !STREAMED_PROTOTYPE ? SHADER_SOURCES :');
    const end = source.indexOf('\n});', start);
    if (start < 0 || end < 0) throw new Error('Parent shader control anchor changed');
    const control = source.slice(0, start) + '    sourceSet: SHADER_SOURCES' + source.slice(end);
    const report = { policy: 'Original parent GLSL, same installed maps/defaults/pose, prototype off; diagnostic browser override only', passes: [] };
    for (let cold = 0; cold < 2; cold++) await withGameBrowser(ctx, { width: 1920, height: 1080 }, async (page, url) => {
        await page.route(url + '/' + file, route => route.fulfill({ body: control, contentType: 'application/javascript' }));
        await page.goto(`${url}/?coreTests=0&streamedShadowPrototype=0&gameplayPose=${encodeURIComponent(JSON.stringify({ ...pose, hud: { visible: false } }))}`);
        await page.waitForFunction(() => {
            const e = window.__busSim?.engine, d = e?.getBakedLightingDebugInfo();
            return d?.status.effectiveMode === 'baked' && d.receiverLightmaps.activationBlend === 1 && d.view?.ready !== false && !d.busLighting.transitionState;
        }, null, { timeout: 240000 });
        await page.evaluate(async () => {
            const { ensureGlobalPerfBar } = await import('/src/graphics/gui/perf_bar/PerfBar.js'); ensureGlobalPerfBar().setHidden(true);
            const canvas = window.__busSim.engine.canvas;
            for (const el of document.body.querySelectorAll('*')) if (el !== canvas && !el.contains(canvas) && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) el.style.visibility = 'hidden';
            canvas.style.visibility = 'visible';
        });
        for (let round = 0; round < 3; round++) {
            const performance = await page.evaluate(measureGamePerformance);
            report.passes.push({ cold, round, performance });
            ctx.log.line(ctx.id, `Original shader browser ${cold + 1}; pass ${round + 1}; GPU ${performance.gpuMs.median.toFixed(2)} ms`);
        }
        if (cold === 0) await page.locator('canvas').first().screenshot({ path: path.join(output, 'parent-original-shader.png') });
    });
    report.status = 'validated'; await writeJson(path.join(output, 'benchmark.json'), report);
    return { state: 'validated', output, files: await listFiles(output) };
}
