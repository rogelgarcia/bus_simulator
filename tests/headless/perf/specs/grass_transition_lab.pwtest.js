// Measures abrupt grass LOD selection against matched soil-only frames on hardware.
import test, { expect } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';
import { writeGrassTransitionReport } from '../../visual/grass_transition_report.mjs';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab');
const rounds = 6;
const treatments = ['soil', 'full', 'half'];
const poses = ['front', 'rear', 'border'];
const warmupFrames = 30;
const sampleFrames = 60;
const startupSoakFrames = 120;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const counterKeys = ['updates', 'scans', 'visitedCells', 'changedCells', 'skippedStationary', 'skippedInterval', 'totalCpuMs'];

function summarizeRounds(samples) {
    const averageMs = mean(samples);
    const variance = samples.reduce((sum, value) => sum + (value - averageMs) ** 2, 0) / (samples.length - 1);
    const margin = 2.57058183661474 * Math.sqrt(variance / samples.length);
    return { count: samples.length, averageMs, ci95Ms: [averageMs - margin, averageMs + margin], blockMeans: samples };
}

function summarizeBlocks(blocks) {
    const soil = blocks.filter(block => block.treatment === 'soil').sort((a, b) => a.round - b.round);
    return Object.fromEntries(treatments.map(treatment => {
        const selected = blocks.filter(block => block.treatment === treatment).sort((a, b) => a.round - b.round);
        return [treatment, {
            totalGpu: summarizeRounds(selected.map(block => mean(block.gpu))),
            aboveSoilGpu: summarizeRounds(selected.map((block, index) => mean(block.gpu) - mean(soil[index].gpu))),
            gpuSamples: summarizeBenchmarkTimings(selected.flatMap(block => block.gpu)),
            totalCpu: summarizeRounds(selected.map(block => mean(block.cpu))),
            aboveSoilCpu: summarizeRounds(selected.map((block, index) => mean(block.cpu) - mean(soil[index].cpu))),
            cpuSamples: summarizeBenchmarkTimings(selected.flatMap(block => block.cpu))
        }];
    }));
}

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: ['--force-color-profile=srgb', '--disable-background-timer-throttling'] } });

test('Grass transition lab reports full and half ranges above matched soil-only GPU cost', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TRANSITION_BENCHMARK !== '1', 'Opt in with GRASS_TRANSITION_BENCHMARK=1.');
    test.setTimeout(600000);
    await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?transition=0&experiment=baseline&revision=transition-benchmark-1');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness);
    await page.evaluate(() => window.__grassTransitionReadiness);
    await page.mouse.move(20, 20);
    const metadata = await page.evaluate(async ({ warmupFrames, sampleFrames, counterKeys }) => {
        const s = window.__grassTransitionScene;
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer);
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const snapshot = () => {
            const { canopy, ...state } = s.getSnapshot();
            return state;
        };
        s.setAnimating(false);
        s.setHelpers(false);
        let clockMs = performance.now();
        async function renderFrame() {
            await frame();
            clockMs += 1000 / 60;
            const start = performance.now();
            s.step(1 / 60, clockMs);
            return performance.now() - start;
        }
        function apply(pose, treatment) {
            s.setPose(pose);
            s.setDistanceScale(treatment === 'half' ? 0.5 : 1);
            s.setSoilOnly(treatment === 'soil');
            s.setHelpers(false);
            clockMs = Math.max(clockMs, performance.now());
        }
        window.__grassTransitionBenchmark = {
            async soak(pose, treatment, frames) {
                apply(pose, treatment);
                for (let i = 0; i < frames; i++) await renderFrame();
            },
            async capture(pose, treatment) {
                apply(pose, treatment === 'helpers' ? 'full' : treatment);
                if (treatment === 'helpers') s.setHelpers(true);
                for (let i = 0; i < warmupFrames; i++) await renderFrame();
                return snapshot();
            },
            async run(pose, treatment, moving, selectionSettings = { movementThreshold: 0.25, intervalMs: 100 }) {
                apply(pose, treatment);
                s.setSettings(selectionSettings);
                clockMs = Math.max(clockMs, performance.now());
                for (let i = 0; i < warmupFrames; i++) await renderFrame();
                const beforeState = snapshot();
                const beforeTimer = timer.getDiagnostics();
                const first = beforeTimer.submissionSequence;
                const initialPosition = s.camera.position.clone();
                const cpu = [], intervals = [];
                let previous = performance.now();
                for (let i = 0; i < sampleFrames; i++) {
                    if (moving) {
                        const distance = 3 * (i + 1) / sampleFrames;
                        s.camera.position.set(initialPosition.x + distance * 0.6, initialPosition.y, initialPosition.z - distance * 0.8);
                        s.camera.updateMatrixWorld(true);
                    }
                    cpu.push(await renderFrame());
                    const now = performance.now();
                    intervals.push(now - previous);
                    previous = now;
                }
                const afterState = snapshot();
                const last = timer.getDiagnostics().submissionSequence;
                const selected = () => timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last);
                for (let i = 0; i < 120 && selected().length < sampleFrames; i++) {
                    await frame();
                    timer.poll();
                }
                const gpu = selected().map(sample => sample.ms);
                const diagnostics = timer.getDiagnostics();
                if (!beforeTimer.active || !diagnostics.active || beforeTimer.disjointCount !== diagnostics.disjointCount
                    || gpu.length !== sampleFrames || last - first !== sampleFrames) {
                    throw Error('Invalid hardware GPU timing block: ' + JSON.stringify({ beforeTimer, diagnostics, first, last, count: gpu.length }));
                }
                const selectionDelta = Object.fromEntries(counterKeys.map(key => [key, afterState.selection[key] - beforeState.selection[key]]));
                const applicationDelta = { calls: afterState.fields.selectionScans - beforeState.fields.selectionScans,
                    instanceUploads: afterState.fields.instanceUploads - beforeState.fields.instanceUploads,
                    totalCpuMs: afterState.fields.totalApplyMilliseconds - beforeState.fields.totalApplyMilliseconds };
                return { pose, treatment, moving, gpu, cpu, intervals, selectionDelta, applicationDelta,
                    beforeState, state: afterState, diagnostics, firstSubmission: first + 1, lastSubmission: last };
            }
        };
        const gl = s.renderer.getContext();
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), unmaskedRendererAvailable: !!info, viewport: [innerWidth, innerHeight],
            pixelRatio: s.renderer.getPixelRatio(), shadowAutoUpdate: s.renderer.shadowMap.autoUpdate,
            settings: snapshot(), canopy: s.getSnapshot().canopy, warmupFrames, sampleFrames,
            description: 'Hardware disjoint timer queries wrap one complete scene render per submitted frame. Constant 1/60 s updates use a monotonic simulated selector clock. Camera helpers are disabled. Soil, requested ranges and half ranges rotate order across six rounds. Initial texture, shader and shadow preparation is outside timed blocks. No outlier filtering.' };
    }, { warmupFrames, sampleFrames, counterKeys });
    Object.assign(metadata, { rounds, browser: browser.version(), date: new Date().toISOString(), treatments,
        startupSoakFrames, startupSoakCases: poses.length * treatments.length });
    metadata.initialRun = await stat(path.join(output, 'post_fix_initial/benchmark.json')).then(() => 'post_fix_initial/benchmark.json', error => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    expect(metadata.unmaskedRendererAvailable).toBe(true);
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    expect(metadata.pixelRatio).toBe(1);
    expect(metadata.viewport).toEqual([1920, 1080]);
    expect(metadata.shadowAutoUpdate).toBe(false);
    for (const pose of poses) {
        for (const treatment of treatments) {
            await page.evaluate(({ pose, treatment, frames }) => window.__grassTransitionBenchmark.soak(pose, treatment, frames),
                { pose, treatment, frames: startupSoakFrames });
        }
    }
    const report = { metadata, poses: {}, cpuReference: [], errors };
    for (const name of [...poses, 'moving_border']) {
        const moving = name === 'moving_border';
        const pose = moving ? 'border' : name;
        const blocks = [];
        for (let round = 0; round < rounds; round++) {
            const order = treatments.map((_, index) => treatments[(round + index) % treatments.length]);
            for (const treatment of order) {
                const block = await page.evaluate(({ pose, treatment, moving }) => window.__grassTransitionBenchmark.run(pose, treatment, moving), { pose, treatment, moving });
                blocks.push({ ...block, round });
                expect(block.beforeState.glError).toBe(0);
                expect(block.state.glError).toBe(0);
                expect(block.state.shadows.generations).toBe(block.beforeState.shadows.generations);
                expect(block.state.quaternion).toEqual(block.beforeState.quaternion);
                expect(block.state.position[1]).toBe(block.beforeState.position[1]);
                if (!moving) expect(block.state.position).toEqual(block.beforeState.position);
                for (const value of Object.values(block.selectionDelta)) expect(Number.isFinite(value)).toBe(true);
                if (treatment === 'soil') {
                    expect(block.selectionDelta.updates).toBe(0);
                } else if (moving) {
                    expect(block.selectionDelta.scans).toBeGreaterThan(0);
                    expect(block.selectionDelta.scans).toBeLessThan(sampleFrames / 2);
                    expect(block.selectionDelta.changedCells).toBeGreaterThan(0);
                } else {
                    expect(block.selectionDelta.scans).toBe(0);
                    expect(block.selectionDelta.skippedStationary).toBe(sampleFrames);
                }
            }
            console.log('[GrassTransition] ' + name + ' round ' + (round + 1) + ': ' + blocks.filter(block => block.round === round)
                .map(block => block.treatment + ' ' + mean(block.gpu).toFixed(3) + ' ms').join(' / '));
        }
        report.poses[name] = { blocks, results: summarizeBlocks(blocks), captures: {} };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
    }
    for (let round = 0; round < rounds; round++) {
        for (const treatment of round % 2 ? ['half', 'full'] : ['full', 'half']) {
            const block = await page.evaluate(({ treatment }) => window.__grassTransitionBenchmark.run('border', treatment, true,
                { movementThreshold: 0, intervalMs: 0 }), { treatment });
            report.cpuReference.push({ ...block, round });
            expect(block.beforeState.glError).toBe(0);
            expect(block.state.glError).toBe(0);
            expect(block.selectionDelta.scans).toBe(sampleFrames);
            expect(block.state.shadows.generations).toBe(block.beforeState.shadows.generations);
        }
    }
    await page.evaluate(() => window.__grassTransitionScene.setSettings({ movementThreshold: 0.25, intervalMs: 100 }));
    await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
    for (const pose of poses) {
        for (const treatment of [...treatments, 'helpers']) {
            report.poses[pose].captures[treatment] = await page.evaluate(({ pose, treatment }) => window.__grassTransitionBenchmark.capture(pose, treatment), { pose, treatment });
            await page.screenshot({ path: path.join(output, pose + '_' + treatment + '.png') });
        }
    }
    await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
    await writeGrassTransitionReport(output, report);
    await page.goto('/tests/artifacts/screens/grass_debug_v2/transition_lab/index.html');
    for (const pose of poses) {
        await page.locator('#pose').selectOption(pose);
        for (const treatment of [...treatments, 'helpers']) {
            await page.locator('#left').selectOption(treatment);
            await page.waitForFunction(() => [...document.querySelectorAll('.compare img')].every(image => image.complete && image.naturalWidth === 1920));
        }
    }
    await page.locator('#pose').selectOption('front');
    await page.locator('#left').selectOption('full');
    await page.waitForFunction(() => [...document.querySelectorAll('.compare img')].every(image => image.complete && image.naturalWidth === 1920));
    await page.screenshot({ path: path.join(output, 'report-preview.png'), fullPage: true });
    expect(errors).toEqual([]);
});
