// Compare geometric grass and dynamic plates using interleaved, hardware-timed blocks.
import test, { expect } from '@playwright/test';
test.skip(true, 'Historical card strategy; use grass_lod4_canopy_comparison with GRASS_LOD4_BENCHMARK_LODS=LOD2,LOD3,LOD4.');
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';
const label = process.env.GRASS_PLATE_REVISION || 'runtime-512';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2', label === 'runtime-512' ? 'lod3_runtime_512' : label === 'triads' ? 'lod3_triads' : label === 'billboards' ? 'lod3_billboards' : 'lod3_four_reuse', label);
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
test('LOD2 and LOD3 hardware comparison at fixed field cameras', async ({ page, browser }) => {
    test.skip(process.env.GRASS_PLATE_BENCHMARK !== '1', 'Opt in with GRASS_PLATE_BENCHMARK=1.');
    test.setTimeout(360000); await mkdir(output, { recursive: true });
    const errors = [], poses = {};
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?litter=alpha&revision=plate-benchmark-' + label + '#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness); await page.mouse.move(30, 30);
    const metadata = await page.evaluate(async () => {
        const s = window.__grassLitterScene;
        const THREE = await import('three');
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer), frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const state = () => ({ position: s.camera.position.toArray(), quaternion: s.camera.quaternion.toArray(), ...s.getSnapshot() });
        window.__plateBenchmark = {
            async prepare(pose) {
                s.setMode('all'); s.setView(0); s.setFieldCount(pose === 'all_nine' ? 9 : 1);
                if (pose !== 'one_overview') s.frameFields();
                if (pose === 'one_then_nine') s.setFieldCount(9);
                return state();
            },
            async capture(lod) { s.setLod(lod); for (let i = 0; i < 120; i++) await frame(); return state(); },
            async motion(lod) {
                s.setLod(lod);
                const original = s.camera.quaternion.clone(), euler = new THREE.Euler().setFromQuaternion(original, 'YXZ'), yaw = euler.y;
                for (let i = 0; i < 30; i++) await frame();
                const first = timer.getDiagnostics().submissionSequence, cpu = [], intervals = [];
                let previous = performance.now();
                for (let i = 0; i < 120; i++) {
                    euler.y = yaw + .12 * Math.sin(i * Math.PI * 2 / 120); s.camera.quaternion.setFromEuler(euler);
                    await frame();
                    const now = performance.now(); intervals.push(now - previous); previous = now;
                    if (lod === 'LOD3') cpu.push(s.dynamicPlates.getSnapshot().updateMilliseconds);
                }
                const last = timer.getDiagnostics().submissionSequence;
                for (let i = 0; i < 120 && timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).length < last - first; i++) await frame();
                const gpu = timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).map(x => x.ms);
                s.camera.quaternion.copy(original);
                if (gpu.length !== 120 || last - first !== 120) throw Error('Incomplete motion GPU block.');
                return { lod, gpu, cpu, intervals };
            },
            async run(lod) {
                s.setLod(lod); for (let i = 0; i < 30; i++) await frame();
                const before = timer.getDiagnostics();
                const first = before.submissionSequence;
                for (let i = 0; i < 60; i++) await frame();
                const last = timer.getDiagnostics().submissionSequence;
                for (let i = 0; i < 120 && timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).length < last - first; i++) await frame();
                const gpu = timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).map(x => x.ms);
                const diagnostics = timer.getDiagnostics();
                if (!before.active || !diagnostics.active || before.disjointCount !== diagnostics.disjointCount || gpu.length !== 60 || last - first !== 60)
                    throw Error('Invalid GPU block: ' + JSON.stringify({ before, diagnostics, first, last, count: gpu.length }));
                return { lod, gpu, diagnostics, state: state() };
            }
        };
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), viewport: [innerWidth, innerHeight],
            pixelRatio: s.renderer.getPixelRatio(), msaa: s.lighting.pipeline.composer.renderTarget1.samples,
            plates: s.dynamicPlates.getSnapshot(), shadowAutoUpdate: s.renderer.shadowMap.autoUpdate };
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString(); metadata.label = label;
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    expect(metadata.pixelRatio).toBe(1); expect(metadata.msaa).toBe(4); expect(metadata.shadowAutoUpdate).toBe(false);
    const sourceFiles = metadata.plates.layout === 'runtime-patch-impostors'
        ? ['GrassDebugV2RuntimeImpostors.js', 'GrassDebugV2ImpostorSource.js', 'GrassDebugV2ImpostorCapture.js', 'GrassDebugV2ImpostorMaterial.js']
        : ['camera-facing-strips','fixed-triads'].includes(metadata.plates.layout)
            ? ['GrassDebugV2BillboardPlates.js', metadata.plates.layout === 'fixed-triads' ? 'GrassDebugV2TriadLayout.js' : 'GrassDebugV2BillboardLayout.js', 'GrassDebugV2BillboardAtlas.js', 'GrassDebugV2BillboardMaterial.js']
            : ['GrassDebugV2DynamicPlates.js', 'GrassDebugV2PlatePlan.js', 'GrassDebugV2PlateMaterial.js'];
    for (const file of sourceFiles)
        await writeFile(path.join(output, file), await readFile('src/graphics/gui/grass_debugger_v2/' + file));
    for (const pose of process.env.GRASS_PLATE_MOTION_ONLY === '1' ? [] : ['one_overview', 'all_nine', 'one_then_nine']) {
        const camera = await page.evaluate(pose => window.__plateBenchmark.prepare(pose), pose), captures = {}, blocks = [];
        for (const lod of ['LOD2', 'LOD3']) {
            captures[lod] = await page.evaluate(lod => window.__plateBenchmark.capture(lod), lod);
            await page.screenshot({ path: path.join(output, pose + '_' + lod + '.png') });
        }
        for (let round = 0; round < 6; round++) {
            for (const lod of round % 2 ? ['LOD3', 'LOD2'] : ['LOD2', 'LOD3']) {
                const block = await page.evaluate(lod => window.__plateBenchmark.run(lod), lod);
                block.round = round; blocks.push(block);
                expect(block.state.position).toEqual(camera.position); expect(block.state.quaternion).toEqual(camera.quaternion);
                expect(block.state.cursorDistance.active).toBe(false);
            }
            console.log('[Plates] ' + label + ' ' + pose + ' round ' + (round + 1) + ': ' + blocks.filter(b => b.round === round)
                .map(b => b.lod + ' ' + summarizeBenchmarkTimings(b.gpu).averageMs.toFixed(3) + ' ms').join(' / '));
        }
        const results = Object.fromEntries(['LOD2', 'LOD3'].map(lod => [lod, summarizeBenchmarkTimings(blocks.filter(b => b.lod === lod).flatMap(b => b.gpu))]));
        poses[pose] = { camera, captures, blocks, results };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify({ metadata, poses, errors }, null, 2));
    }
    await page.evaluate(() => window.__plateBenchmark.prepare('one_then_nine'));
    const motion = [];
    for (let round = 0; round < 2; round++) for (const lod of round ? ['LOD3', 'LOD2'] : ['LOD2', 'LOD3']) {
        const block = await page.evaluate(lod => window.__plateBenchmark.motion(lod), lod); block.round = round; motion.push(block);
        console.log('[Plates] moving camera ' + lod + ' ' + summarizeBenchmarkTimings(block.gpu).averageMs.toFixed(3) + ' ms GPU');
    }
    let frozenShadows = null;
    if (process.env.GRASS_PLATE_MOTION_ONLY === '1') {
        await page.evaluate(() => {
            const s = window.__grassLitterScene, render = s.lighting.render.bind(s.lighting);
            s.lighting.render = dt => { s.renderer.shadowMap.needsUpdate = false; s.lighting.sun.shadow.needsUpdate = false; render(dt); };
        });
        frozenShadows = await page.evaluate(() => window.__plateBenchmark.motion('LOD3'));
    }
    await writeFile(path.join(output, process.env.GRASS_PLATE_MOTION_ONLY === '1' ? 'motion-shadow-check.json' : 'benchmark.json'), JSON.stringify({ metadata, poses, motion, frozenShadows, errors }, null, 2));
    expect(errors).toEqual([]);
});
