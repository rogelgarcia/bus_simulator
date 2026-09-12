// Compare installed-map filtering with an archived shader in isolated game sessions.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { withGameBrowser } from '../../experiments/lighting_configurations/capture_baselines/GameBrowser.mjs';
import { settleGameFrames, readGameEvidence } from '../../experiments/lighting_configurations/capture_baselines/GameEvidence.mjs';
import { measureGamePerformance } from '../../experiments/reference_matching/Performance.mjs';
import { writeJson, listFiles } from '../../../baking/Files.mjs';

export async function reviewShadowFilter(ctx) {
    if (ctx.publish || !ctx.options.output || !ctx.options.pose || !ctx.options.before) throw new Error('Diagnostic output, pose and before shader required');
    const output = path.resolve(ctx.root, ctx.options.output);
    const artifactRoot = path.join(ctx.root, 'tests/artifacts/screens') + path.sep;
    if (!output.startsWith(artifactRoot)) throw new Error('Diagnostic output must be under tests/artifacts/screens');
    const before = path.resolve(ctx.root, ctx.options.before);
    if (!before.startsWith(artifactRoot)) throw new Error('Before shader must be an archived diagnostic artifact');
    await mkdir(output);
    const pose = JSON.parse(await readFile(path.resolve(ctx.root, ctx.options.pose), 'utf8'));
    const oldShader = await readFile(before, 'utf8');
    const report = { pose, conditions: 'Same installed maps, defaults, camera and 1920x1080 viewport',
        timingPassesPerVariant: ctx.options['diagnostics-only'] ? 0 : 3,
        diagnostics: { shadowHookOff: 'Disables the static hook and its moving-object shadow composition',
            indirectPreferenceOff: 'Disables the indirect preference; not an isolated per-material irradiance pass' }, variants: [] };
    for (const variant of ctx.options['diagnostics-only'] ? ['after'] : ['before', 'after']) await withGameBrowser(ctx, { width: 1920, height: 1080 }, async (page, url) => {
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        if (variant === 'before') await page.route('**/shaders/materials/static_sun_depth.frag.glsl', route => route.fulfill({ body: oldShader, contentType: 'text/plain' }));
        await page.goto(`${url}/?coreTests=0&streamedShadowPrototype=0&gameplayPose=${encodeURIComponent(JSON.stringify({ ...pose, hud: { visible: false } }))}`);
        await page.waitForFunction(() => {
            const d = window.__busSim?.engine?.getBakedLightingDebugInfo();
            return d?.status.effectiveMode === 'baked' && d.receiverLightmaps.activationBlend === 1 && d.view?.ready !== false && !d.busLighting.transitionState;
        }, null, { timeout: 240000 });
        await page.evaluate(async () => {
            const { ensureGlobalPerfBar } = await import('/src/graphics/gui/perf_bar/PerfBar.js'); ensureGlobalPerfBar().setHidden(true);
            const canvas = window.__busSim.engine.canvas;
            for (const el of document.body.querySelectorAll('*')) if (el !== canvas && !el.contains(canvas) && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) el.style.visibility = 'hidden';
            canvas.style.visibility = 'visible';
        });
        await page.evaluate(settleGameFrames, 90);
        await page.locator('canvas').first().screenshot({ path: path.join(output, `${variant}.png`) });
        const passes = [];
        for (let i = 0; i < (ctx.options['diagnostics-only'] ? 0 : 3); i++) passes.push(await page.evaluate(measureGamePerformance));
        const evidence = await page.evaluate(readGameEvidence);
        if (variant === 'after') {
            const angularTangent = await page.evaluate(() => {
                const u = window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthFilterPolicy;
                const tangent = u.value.w; u.value.w = 0; return tangent;
            });
            await page.evaluate(settleGameFrames, 20);
            await page.locator('canvas').first().screenshot({ path: path.join(output, 'diagnostic-legacy-filter.png') });
            const filter = await page.evaluate(() => {
                const u = window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms;
                const saved = u.staticSunDepthFilterPolicy.value.toArray(); u.staticSunDepthFilterPolicy.value.set(0,0,0,0); return saved;
            });
            await page.evaluate(settleGameFrames, 20);
            await page.locator('canvas').first().screenshot({ path: path.join(output, 'diagnostic-nearest.png') });
            await page.evaluate(saved => window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthFilterPolicy.value.fromArray(saved), filter);
            await page.evaluate(tangent => { window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthFilterPolicy.value.w = tangent; }, angularTangent);
            await page.evaluate(() => { window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthEnabled.value = 0; });
            await page.evaluate(settleGameFrames, 20);
            await page.locator('canvas').first().screenshot({ path: path.join(output, 'diagnostic-without-hybrid-shadows.png') });
            await page.evaluate(() => { window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthEnabled.value = 1; });
            await page.evaluate(() => {
                const e = window.__busSim.engine, s = e.bakedLightingSettings;
                return e.setBakedLightingSettings({ ...s, receivers: { ...s.receivers, indirect: false } });
            });
            await page.waitForFunction(() => { const d = window.__busSim.engine.getBakedLightingDebugInfo(); return d.status.effectiveMode === 'baked' && !d.receiverLightmaps.effective.indirect; });
            await page.evaluate(settleGameFrames, 60);
            await page.locator('canvas').first().screenshot({ path: path.join(output, 'diagnostic-without-baked-indirect.png') });
        }
        if (errors.length) throw new Error(errors.join('\n'));
        report.variants.push({ variant, passes, evidence });
        await writeJson(path.join(output, 'review.json'), report);
        ctx.log.line(ctx.id, `${variant}: captured${passes.length ? '; GPU ' + passes.map(p => p.gpuMs.median.toFixed(2)).join(', ') + ' ms' : '; diagnostics only'}`);
    });
    return { state: 'validated', output, files: await listFiles(output) };
}
