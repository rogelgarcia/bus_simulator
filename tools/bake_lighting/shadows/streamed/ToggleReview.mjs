// Captures the player baked-shadow toggle, retaining indirect lighting and the pose.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { withGameBrowser } from '../../experiments/lighting_configurations/capture_baselines/GameBrowser.mjs';
import { settleGameFrames, readGameEvidence } from '../../experiments/lighting_configurations/capture_baselines/GameEvidence.mjs';
import { measureGamePerformance } from '../../experiments/reference_matching/Performance.mjs';
import { writeJson, listFiles } from '../../../baking/Files.mjs';

export async function reviewShadowToggle(ctx) {
    if (ctx.publish || !ctx.options.output || !ctx.options.pose) throw new Error('Diagnostic output and pose required');
    const output = path.resolve(ctx.root, ctx.options.output);
    if (!output.startsWith(path.join(ctx.root, 'tests/artifacts/screens') + path.sep)) throw new Error('Output must be under tests/artifacts/screens');
    await mkdir(output);
    const pose = JSON.parse(await readFile(path.resolve(ctx.root, ctx.options.pose), 'utf8'));
    const benchmark = ctx.options.benchmark === true || ctx.options['compare-live'] === true;
    const report = { pose, conditions: benchmark
        ? 'Two fresh browsers; three alternating passes at the same pose and 1920x1080; live shadows explicitly Single/High; baked indirect isolated from shadow filtering; legacy filter uses current maps, not historical assets'
        : 'Same session, pose, 1920x1080 viewport and installed indirect light; only the player baked-shadow preference changes', variants: [] };
    for (let cold = 0; cold < (benchmark ? 2 : 1); cold++) await withGameBrowser(ctx, { width: 1920, height: 1080 }, async (page, url) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (benchmark) await page.addInitScript(() => localStorage.setItem('bus_sim.shadows.v1', JSON.stringify({ type: 'single', quality: 'high' })));
        await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify({ ...pose, hud: { visible: false } }))}`);
        await page.waitForFunction(() => window.__busSim?.engine?.getBakedLightingDebugInfo().status.effectiveMode === 'baked');
        await page.evaluate(async () => {
            const { ensureGlobalPerfBar } = await import('/src/graphics/gui/perf_bar/PerfBar.js');
            ensureGlobalPerfBar().setHidden(true);
            const canvas = window.__busSim.engine.canvas;
            for (const el of document.body.querySelectorAll('*')) if (el !== canvas && !el.contains(canvas) && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) el.style.visibility = 'hidden';
            canvas.style.visibility = 'visible';
        });
        const tangent = await page.evaluate(() => window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthFilterPolicy.value.w);
        const configurations = ctx.options['compare-live']
            ? [['single-indirect', false, true], ['baked', true, true]] : benchmark
            ? [['single-current', false, false], ['single-indirect', false, true], ['baked', true, true], ['baked-legacy-filter', true, true]]
            : [['baked', true, true], ['live', false, true], ['baked-restored', true, true]];
        for (let round = 0; round < (benchmark ? 3 : 1); round++) for (const [name, enabled, indirect] of (round % 2 ? [...configurations].reverse() : configurations)) {
            await page.evaluate(({ enabled, indirect, legacy }) => {
                const e = window.__busSim.engine, settings = e.bakedLightingSettings;
                return e.setBakedLightingSettings({ ...settings, mode: indirect ? 'auto' : 'current',
                    shadows: { ...settings.shadows, enabled, streamedDetail: !legacy }, receivers: { ...settings.receivers, indirect } });
            }, { enabled, indirect, legacy: name === 'baked-legacy-filter' });
            await page.waitForFunction(({ enabled, indirect }) => {
                const e = window.__busSim.engine, d = e.getBakedLightingDebugInfo();
                const shadow = e._bakedLighting.shadows.getDiagnostics();
                return d.status.effectiveMode === (indirect ? 'baked' : 'current')
                    && d.receiverLightmaps.effective.indirect === indirect
                    && (!indirect || d.receiverLightmaps.activationBlend === 1) && d.view?.ready !== false
                    && shadow.status.effectiveMode === (enabled ? 'baked' : 'current')
                    && shadow.pipeline.materials.shaderHooksEnabled === enabled;
            }, { enabled, indirect });
            if(enabled && name !== 'baked-legacy-filter') await page.waitForFunction(()=>{
                const d=window.__busSim.engine._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows;
                return d.state==='ready' && d.resident>0 && d.pending===0 && d.queued===0;
            },null,{timeout:90000});
            if (enabled) await page.evaluate(({ tangent, legacy }) => {
                window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthFilterPolicy.value.w = legacy ? 0 : tangent;
            }, { tangent, legacy: name === 'baked-legacy-filter' });
            await page.evaluate(settleGameFrames, 90);
            if (cold === 0 && round === 0) await page.locator('canvas').first().screenshot({ path: path.join(output, `${name}.png`) });
            const performance = benchmark ? await page.evaluate(measureGamePerformance) : null;
            const evidence = await page.evaluate(readGameEvidence);
            const pipeline = await page.evaluate(() => JSON.parse(JSON.stringify(
                window.__busSim.engine._bakedLighting.shadows.getDiagnostics().pipeline,
                (key, value) => key === 'registries' ? undefined : value)));
            report.variants.push({ cold, round, name, enabled, indirect, performance, evidence, pipeline });
            await writeJson(path.join(output, 'review.json'), report);
            ctx.log.line(ctx.id, `Browser ${cold + 1}, pass ${round + 1}, ${name}: ${evidence.shadow.effectiveMode}; indirect ${evidence.baked.receiverLightmaps.effective.indirect}${performance ? '; GPU ' + performance.gpuMs?.median.toFixed(2) + ' ms' : ''}`);
        }
        if (errors.length) throw new Error(errors.join('\n'));
    });
    return { state: 'validated', output, files: await listFiles(output) };
}
