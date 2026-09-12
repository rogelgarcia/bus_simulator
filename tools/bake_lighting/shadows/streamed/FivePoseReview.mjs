// Repeats the original five views with identical lighting and three shadow modes.
import path from 'node:path';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { withGameBrowser } from '../../experiments/lighting_configurations/capture_baselines/GameBrowser.mjs';
import { settleGameFrames, setGamePose, readGameEvidence } from '../../experiments/lighting_configurations/capture_baselines/GameEvidence.mjs';
import { resolvePoses, assertPoseMatches } from '../../experiments/lighting_configurations/Inputs.mjs';
import { collectShadowFrameSamples, summarizeShadowFrames, distribution, comparableShadowSettings, shadowMemoryEstimate } from './FrameSamples.mjs';
import { writeJson, listFiles } from '../../../baking/Files.mjs';

const variants = [
    { id: 'single-high', label: 'Single / High', enabled: false, detail: false },
    { id: 'baked-parent', label: 'Baked / parent', enabled: true, detail: false },
    { id: 'baked-fine', label: 'Baked / fine', enabled: true, detail: true }
];
export const FIVE_POSE_INPUT = 'tools/bake_lighting/experiments/lighting_configurations/config/poses.json';

async function applyVariant(page, variant) {
    await page.evaluate(({ enabled, detail }) => {
        const e = window.__busSim.engine, s = e.bakedLightingSettings;
        return e.setBakedLightingSettings({ ...s, mode: 'auto', shadows: { ...s.shadows, enabled, streamedDetail: detail },
            receivers: { ...s.receivers, indirect: true } });
    }, variant);
    await page.waitForFunction(({ enabled, detail }) => {
        const e = window.__busSim.engine, d = e.getBakedLightingDebugInfo(), s = e._bakedLighting.shadows.getDiagnostics();
        const fine = s.pipeline.streamedShadows;
        return d.status.effectiveMode === 'baked' && d.receiverLightmaps.effective.indirect
            && d.receiverLightmaps.activationBlend === 1 && d.view?.ready !== false
            && s.status.effectiveMode === (enabled ? 'baked' : 'current')
            && s.pipeline.materials.shaderHooksEnabled === enabled
            && (!detail || (fine.state === 'ready' && fine.resident > 0 && fine.pending === 0 && fine.queued === 0));
    }, variant);
    await page.evaluate(settleGameFrames, 120);
}

function readShadowAllocations() {
    const e = window.__busSim.engine, pipeline = e._bakedLighting.shadows._pipeline;
    const d = pipeline.getDiagnostics(), liveMaps = [];
    e.scene.traverse(object => {
        if (!object.isLight || !object.shadow?.map) return;
        const target = object.shadow.map;
        liveMaps.push({ name: object.name, castShadow: object.castShadow, width: target.width, height: target.height,
            estimatedGpuBytes: target.width * target.height * 8 });
    });
    const binding = (pipeline._active ?? pipeline._cachedActivation)?.binding;
    const cachedDetail = binding?.streamedDetail?.diagnostics();
    const parentBytes = binding?.texture.image.data.byteLength ?? 0;
    const fineBytes = cachedDetail?.gpuBytes ?? 0;
    const movingBytes = d.dynamicShadows.map.estimatedGpuBytes;
    return { parentResidentBytes: parentBytes, detailResidentBytes: fineBytes,
        movingShadowBytes: movingBytes, liveMaps,
        retainedShadowBytes: parentBytes + fineBytes + movingBytes + liveMaps.reduce((sum, map) => sum + map.estimatedGpuBytes, 0),
        sharedIndirectBytes: e.getBakedLightingDebugInfo().receiverLightmaps.residentGpuBytes,
        detail: cachedDetail ?? null,
        renderer: e.renderer.getContext().getParameter(e.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),
        pipeline: JSON.parse(JSON.stringify(d, (key, value) => key === 'registries' ? undefined : value)) };
}

async function writeSummary(output, report) {
    for (const run of report.runs) run.allocations = shadowMemoryEstimate(run.allocations);
    report.summary = report.poses.flatMap(pose => variants.map(variant => {
        const runs = report.runs.filter(run => run.poseId === pose.id && run.variant === variant.id);
        const frames = runs.flatMap(run => run.samples.frames);
        return { pose: pose.id, variant: variant.id, passes: runs.length, ...summarizeShadowFrames(frames),
            passGpuMedians: distribution(runs.map(run => run.summary.gpuMs.median)),
            retainedShadowBytes: distribution(runs.map(run => run.allocations.retainedShadowBytes)),
            activeShadowBytes: distribution(runs.map(run => run.allocations.activeShadowBytes)),
            allocations: runs[0].allocations, screenshot: runs[0].screenshot };
    }));
    const columns = ['pose', 'variant', 'passes', 'gpuMs.median', 'gpuMs.p01', 'gpuMs.p99', 'gpuMs.fastestOnePercentMean',
        'gpuMs.slowestOnePercentMean', 'cpuMs.median', 'frameMs.median', 'calls.median', 'triangles.median',
        'textures.median', 'geometries.median', 'programs.median', 'activeShadowBytes.median', 'retainedShadowBytes.median'];
    const value = (row, key) => key.split('.').reduce((v, field) => v[field], row);
    await writeFile(path.join(output, 'comparison.csv'), columns.join(',') + '\n'
        + report.summary.map(row => columns.map(key => value(row, key)).join(',')).join('\n') + '\n');
    const table = ['| Pose | Shadows | GPU median ms | GPU p1–p99 ms | CPU median ms | Calls | Triangles |', '|---|---|---:|---:|---:|---:|---:|',
        ...report.summary.map(r => `| ${r.pose} | ${r.variant} | ${r.gpuMs.median.toFixed(2)} | ${r.gpuMs.p01.toFixed(2)}–${r.gpuMs.p99.toFixed(2)} | ${r.cpuMs.median.toFixed(2)} | ${r.calls.median} | ${r.triangles.median} |`)];
    await writeFile(path.join(output, 'comparison.md'), report.conditions + '\n\n' + table.join('\n') + '\n\n' + report.policies.join('\n\n') + '\n');
    await writeJson(path.join(output, 'review.json'), report);
}

/** Registered diagnostic leaf; never changes or publishes game assets. */
export async function reviewFiveShadowPoses(ctx) {
    if (ctx.publish || !ctx.options.output) throw new Error('A diagnostic output directory is required; publication is not supported');
    const output = path.resolve(ctx.root, ctx.options.output);
    if (!output.startsWith(path.join(ctx.root, 'tests/artifacts/screens') + path.sep)) throw new Error('Output must be under tests/artifacts/screens');
    const input = JSON.parse(await readFile(path.join(ctx.root, FIVE_POSE_INPUT), 'utf8'));
    const poses = resolvePoses(input), startedAt = new Date().toISOString(), start = performance.now();
    await mkdir(path.dirname(output), { recursive: true });
    await mkdir(output);
    const report = { schema: 'five-pose-shadow-review-v1', startedAt, poses, variants,
        conditions: '1920x1080, device scale 1, calibrated game defaults, paused simulation and locked cameras. Same baked indirect in all variants. Two fresh sequential browsers, reversed pose order, three balanced passes per variant in each browser; 60 warmup + 360 measured frames per pass, after 120 settling frames.',
        policies: [
            'GPU ms: completed asynchronous whole-render timer queries joined uniquely by submission ID. CPU ms: GameEngine.updateFrame wall duration, including simulation/preparation/render submission. These overlap and must not be added. Frame intervals include browser/display pacing.',
            'Percentiles interpolate the sorted pooled samples (p1 fast threshold, p99 slow threshold); fastest/slowest one-percent means are separate fields. Startup, page loading and toggle transitions are outside these stationary measurements.',
            'Calls and triangles sum all renderer.render invocations, including the hybrid moving-shadow pass, post-processing and repeated geometry. HUD counters are also retained separately. Geometry/texture/program counts describe resident objects, not byte sizes.',
            'Memory uses logical RG8 byte lengths plus render-target width*height*8 (RGBA8 and modeled 32-bit depth). Driver allocation, compression, alignment, transient upload memory and other shared buffers are not measured. Cached parent/live targets can remain resident across toggles; retained and active working-set costs are distinct.'
        ], runs: [] };
    if (ctx.options.resume) {
        const previousRoot = path.resolve(ctx.root, ctx.options.resume);
        if (!previousRoot.startsWith(path.join(ctx.root, 'tests/artifacts/screens') + path.sep)) throw new Error('Resume input must be an artifact directory');
        const previous = JSON.parse(await readFile(path.join(previousRoot, 'review.json'), 'utf8'));
        if (previous.schema !== report.schema || JSON.stringify(previous.poses) !== JSON.stringify(poses)
            || previous.runs.length !== 45 || previous.runs.some(run => run.cold !== 0)) throw new Error('Resume requires one complete first browser with the same five poses');
        for (const pose of poses) for (const variant of variants) {
            const runs = previous.runs.filter(run => run.poseId === pose.id && run.variant === variant.id);
            if (runs.length !== 3 || new Set(runs.map(run => run.pass)).size !== 3) throw new Error('Incomplete first-browser passes');
        }
        for (const run of previous.runs) if (run.screenshot) {
            if (path.basename(run.screenshot) !== run.screenshot) throw new Error('Invalid screenshot filename');
            await copyFile(path.join(previousRoot, run.screenshot), path.join(output, run.screenshot));
        }
        report.runs = previous.runs;
        report.resumedFirstBrowser = { input: ctx.options.resume, startedAt: previous.startedAt, reason: 'Reuse completed first browser; validate identical settings and source against the second browser' };
    }
    let commonSettings = report.runs[0] ? comparableShadowSettings(report.runs[0].evidence) : null;
    let commonSource = report.runs[0] ? JSON.stringify(report.runs[0].evidence.sourceHashes) : null;
    for (let cold = report.runs.length ? 1 : 0; cold < 2; cold++) await withGameBrowser(ctx, input.comparisonViewport, async (page, url, browserVersion) => {
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('bus_sim.shadows.v1', JSON.stringify({ type: 'single', quality: 'high' })));
        const orderedPoses = cold ? [...poses].reverse() : poses;
        ctx.log.line(ctx.id, `Starting fresh browser ${cold + 1}`);
        await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(orderedPoses[0].pose))}`);
        await page.waitForFunction(() => window.__busSim?.engine?.getBakedLightingDebugInfo().status.effectiveMode === 'baked');
        await page.evaluate(async () => {
            const { ensureGlobalPerfBar } = await import('/src/graphics/gui/perf_bar/PerfBar.js');
            ensureGlobalPerfBar().setHidden(true);
            const canvas = window.__busSim.engine.canvas;
            for (const el of document.body.querySelectorAll('*')) if (el !== canvas && !el.contains(canvas) && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) el.style.visibility = 'hidden';
            canvas.style.visibility = 'visible';
        });
        for (const pose of orderedPoses) {
            await page.evaluate(setGamePose, pose.pose);
            await page.evaluate(settleGameFrames, 120);
            for (let pass = 0; pass < 3; pass++) {
                const order = variants.map((_, index) => variants[(index + pass) % variants.length]);
                if (cold) order.reverse();
                for (const variant of order) {
                    ctx.signal.throwIfAborted();
                    await applyVariant(page, variant);
                    const samples = await page.evaluate(collectShadowFrameSamples, {});
                    const summary = summarizeShadowFrames(samples.frames);
                    const evidence = await page.evaluate(readGameEvidence), allocations = await page.evaluate(readShadowAllocations);
                    assertPoseMatches(pose.pose, evidence.actualPose);
                    if (!evidence.baked.receiverLightmaps.effective.indirect || evidence.baked.receiverLightmaps.activationBlend !== 1
                        || evidence.shadow.effectiveMode !== (variant.enabled ? 'baked' : 'current')
                        || (variant.detail && (allocations.detail.state !== 'ready' || allocations.detail.resident < 1))) throw new Error('Lighting changed during measurement');
                    const settings = comparableShadowSettings(evidence);
                    if (commonSettings && commonSettings !== settings) throw new Error('Common lighting/graphics changed between variants');
                    commonSettings = settings;
                    const source = JSON.stringify(evidence.sourceHashes);
                    if (commonSource && commonSource !== source) throw new Error('Resolved city source changed between browsers');
                    commonSource = source;
                    let screenshot = null;
                    if (cold === 0 && pass === 0) {
                        screenshot = `${pose.id}-${variant.id}.png`;
                        await page.locator('canvas').first().screenshot({ path: path.join(output, screenshot) });
                    }
                    report.runs.push({ cold, pass, poseId: pose.id, variant: variant.id, browserVersion, samples, summary, evidence, allocations, screenshot });
                    await writeJson(path.join(output, 'review.json'), report);
                    ctx.log.line(ctx.id, `Browser ${cold + 1}, ${pose.id}, pass ${pass + 1}, ${variant.id}: GPU ${summary.gpuMs.median.toFixed(2)} ms (${summary.gpuMs.p01.toFixed(2)}–${summary.gpuMs.p99.toFixed(2)} p1–p99), ${summary.calls.median} calls`);
                }
            }
        }
        if (errors.length) throw new Error(errors.join('\n'));
    });
    report.elapsedSeconds = (performance.now() - start) / 1000;
    report.wallSpanSeconds = (Date.now() - Date.parse(report.resumedFirstBrowser?.startedAt ?? report.startedAt)) / 1000;
    await writeSummary(output, report);
    return { state: 'validated', output, files: await listFiles(output), elapsedSeconds: report.elapsedSeconds };
}
