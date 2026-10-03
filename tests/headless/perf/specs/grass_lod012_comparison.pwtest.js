// Hardware GPU comparison of the current LOD0, LOD1 and LOD2 at both field-framing distances.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod012_current');
const lods = ['LOD0_SMART', 'LOD1', 'LOD2'];
const labels = { LOD0_SMART: 'LOD0', LOD1: 'LOD1', LOD2: 'LOD2' };
const triangles = { LOD0_SMART: 18, LOD1: 10, LOD2: 2 };
const orders = [
    [0, 1, 2], [2, 1, 0], [1, 2, 0], [0, 2, 1], [2, 0, 1], [1, 0, 2]
];

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Current LOD0, LOD1 and LOD2: nine fields at overview and fixed single-field camera', async ({ page, browser }) => {
    test.skip(process.env.GRASS_LOD012_BENCHMARK !== '1', 'Opt in with GRASS_LOD012_BENCHMARK=1.');
    test.setTimeout(420000);
    await mkdir(output, { recursive: true });
    const errors = [], poses = {};
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?litter=alpha&revision=lod012-benchmark#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    await page.mouse.move(30, 30);
    const metadata = await page.evaluate(async () => {
        const s = window.__grassLitterScene;
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer), nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
        s.setMode('all'); s.setFieldCount(9); s.setLod('LOD0_SMART');
        const state = () => {
            const x = s.getSnapshot();
            return { position: s.camera.position.toArray(), quaternion: s.camera.quaternion.toArray(),
                distanceToOriginMeters: s.camera.position.length(), fov: s.camera.fov,
                near: s.camera.near, far: s.camera.far, fields: x.fields.count, mode: x.mode, lod: x.lod,
                sceneTriangles: x.sceneTriangles, visibleFields: x.visibleFields, visibleLeaves: x.visibleLeaves,
                visibleTriangles: x.visibleTriangles, cursorActive: x.cursorDistance.active };
        };
        window.__lod012Benchmark = {
            async prepare(pose) {
                s.setLod('LOD0_SMART'); s.setView(0); s.setFieldCount(pose === 'all_nine' ? 9 : 1); s.frameFields();
                await nextFrame(); const framed = state();
                s.setFieldCount(9); for (let i = 0; i < 4; i++) await nextFrame();
                return { framed, measured: state() };
            },
            async capture(lod) {
                s.setLod(lod); for (let i = 0; i < 180; i++) await nextFrame();
                return state();
            },
            async run(lod) {
                s.setLod(lod); for (let i = 0; i < 30; i++) await nextFrame();
                const before = timer.getDiagnostics();
                let previous = await nextFrame();
                const first = timer.getDiagnostics().submissionSequence, frames = [];
                for (let i = 0; i < 60; i++) { const now = await nextFrame(); frames.push(now - previous); previous = now; }
                const last = timer.getDiagnostics().submissionSequence;
                for (let i = 0; i < 120 && timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).length < last - first; i++) await nextFrame();
                const gpu = timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).map(x => x.ms);
                const diagnostics = timer.getDiagnostics();
                if (!before.active || !diagnostics.active || diagnostics.disjointCount !== before.disjointCount || gpu.length !== 60 || last - first !== 60)
                    throw new Error('Incomplete/disjoint samples: ' + JSON.stringify({ before, diagnostics, first, last, count: gpu.length }));
                return { lod, gpu, frames, diagnostics, state: state() };
            }
        };
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            viewport: [innerWidth, innerHeight], pixelRatio: s.renderer.getPixelRatio(),
            msaaSamples: s.lighting.pipeline.composer.renderTarget1.samples,
            shadowSize: s.lighting.sun.shadow.mapSize.toArray(), shadowAutoUpdate: s.renderer.shadowMap.autoUpdate,
            totalLeaves: 864000, lods: s.getSnapshot().lods, lighting: s.getSnapshot().lighting };
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString(); metadata.sourceHashes = {};
    metadata.labels = labels; metadata.trianglesPerLeaf = triangles;
    for (const file of ['GrassDebugV2RibbonShoot.js', 'GrassDebugV2RibbonLod2.js', 'GrassDebugV2RibbonRoot.js',
        'GrassDebugV2FieldLod1.js', 'GrassDebugV2FieldLayout.js', 'GrassDebugV2LitterScene.js', 'GrassDebugV2Lighting.js', 'GrassDebugV2ShootAppearance.js']) {
        const content = await readFile('src/graphics/gui/grass_debugger_v2/' + file);
        metadata.sourceHashes[file] = createHash('sha256').update(content).digest('hex');
        await writeFile(path.join(output, 'source_' + file), content);
    }
    metadata.schedule = '180 initial warmup frames per LOD/pose; 12 rounds using all six LOD order permutations twice; 30 warmup and 60 measured frames per block. 720 valid GPU samples per LOD/pose. Full scene with litter and table, static shadows, 4x MSAA; cursor over HUD.';
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    expect(metadata.msaaSamples).toBe(4); expect(metadata.pixelRatio).toBe(1); expect(metadata.shadowAutoUpdate).toBe(false);
    for (const lod of lods) expect(metadata.lods[lod].triangles).toBe(triangles[lod] * 96000);
    console.log('[LOD012] Hardware: ' + metadata.renderer);
    for (const pose of ['all_nine', 'one_then_nine']) {
        const camera = await page.evaluate(pose => window.__lod012Benchmark.prepare(pose), pose);
        expect(camera.measured.position).toEqual(camera.framed.position);
        expect(camera.measured.quaternion).toEqual(camera.framed.quaternion);
        expect(camera.measured.fov).toBe(camera.framed.fov);
        expect(camera.framed.fields).toBe(pose === 'all_nine' ? 9 : 1);
        expect(camera.measured.fields).toBe(9);
        const captures = {}, blocks = [];
        for (const lod of lods) {
            captures[lod] = await page.evaluate(lod => window.__lod012Benchmark.capture(lod), lod);
            expect(captures[lod].cursorActive).toBe(false);
            expect(captures[lod].sceneTriangles).toBe(triangles[lod] * 864000 + 1472);
            await page.screenshot({ path: path.join(output, pose + '_' + labels[lod] + '.png') });
        }
        expect(new Set(lods.map(lod => captures[lod].visibleFields)).size).toBe(1);
        for (let round = 0; round < 12; round++) {
            for (const index of orders[round % orders.length]) {
                const lod = lods[index], block = await page.evaluate(lod => window.__lod012Benchmark.run(lod), lod);
                block.round = round; blocks.push(block);
                expect(block.state.position).toEqual(camera.measured.position);
                expect(block.state.quaternion).toEqual(camera.measured.quaternion);
                expect(block.state.fields).toBe(9); expect(block.state.mode).toBe('all'); expect(block.state.lod).toBe(lod);
                expect(block.state.visibleFields).toBe(captures[lod].visibleFields);
                expect(block.state.visibleTriangles).toBe(captures[lod].visibleTriangles);
                expect(block.state.cursorActive).toBe(false);
            }
            console.log('[LOD012] ' + pose + ' round ' + (round + 1) + ': ' + blocks.filter(b => b.round === round)
                .map(b => labels[b.lod] + ' ' + summarizeBenchmarkTimings(b.gpu).averageMs.toFixed(3) + ' ms').join(' / '));
            await writeFile(path.join(output, 'partial_benchmark.json'), JSON.stringify({ metadata, poses, pose, camera, blocks, errors }, null, 2));
        }
        const results = Object.fromEntries(lods.map(lod => {
            const selected = blocks.filter(b => b.lod === lod), gpu = selected.flatMap(b => b.gpu), frames = selected.flatMap(b => b.frames);
            return [lod, { gpu: summarizeBenchmarkTimings(gpu), frames: summarizeBenchmarkTimings(frames),
                fps: frames.length * 1000 / frames.reduce((sum, ms) => sum + ms, 0),
                roundMeans: selected.map(b => summarizeBenchmarkTimings(b.gpu).averageMs) }];
        }));
        const comparisons = {};
        for (const [from, to] of [[lods[0], lods[1]], [lods[1], lods[2]], [lods[0], lods[2]]]) {
            const deltas = results[to].roundMeans.map((ms, i) => ms - results[from].roundMeans[i]);
            const mean = deltas.reduce((sum, ms) => sum + ms, 0) / deltas.length;
            const sd = Math.sqrt(deltas.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / (deltas.length - 1));
            const margin = 2.201 * sd / Math.sqrt(deltas.length);
            comparisons[labels[from] + '_to_' + labels[to]] = { meanMs: mean, percent: mean / results[from].gpu.averageMs * 100,
                approximate95PercentIntervalMs: [mean - margin, mean + margin], roundDeltas: deltas };
        }
        poses[pose] = { camera, captures, results, comparisons, blocks };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify({ metadata, poses, errors }, null, 2));
    }
    expect(errors).toEqual([]);
    for (const [file, hash] of Object.entries(metadata.sourceHashes))
        expect(createHash('sha256').update(await readFile('src/graphics/gui/grass_debugger_v2/' + file)).digest('hex')).toBe(hash);
    const lines = ['# Current LOD0 / LOD1 / LOD2 benchmark', '', metadata.renderer + '. Chrome ' + metadata.browser + '.', '',
        'Run: ' + metadata.date + '. Nine 12 x 12 m fields with 1 m gaps; 864,000 leaves; 1920 x 1080, DPR 1.', '',
        'LOD0 is the current 18-triangle mesh (internal key LOD0_SMART). Reference is excluded. LOD1 includes the narrowed upper corners. LOD2 is the two-triangle folded leaf.', '',
        metadata.schedule, ''];
    for (const [pose, record] of Object.entries(poses)) {
        lines.push('## ' + (pose === 'all_nine' ? 'Frame all nine fields' : 'Frame one field, then enable nine without moving'), '',
            'Camera distance to origin: ' + record.camera.measured.distanceToOriginMeters.toFixed(2) + ' m; counted grass meshes: '
            + record.camera.measured.visibleFields + '; counted leaves: ' + record.camera.measured.visibleLeaves.toLocaleString('en-US') + '.', '',
            '| Metric | LOD0 | LOD1 | LOD2 |', '|---|---:|---:|---:|');
        for (const [label, values] of [
            ['Triangles per leaf', lods.map(lod => triangles[lod])],
            ['Total scene triangles', lods.map(lod => record.captures[lod].sceneTriangles.toLocaleString('en-US'))],
            ['Camera-visible scene triangles', lods.map(lod => record.captures[lod].visibleTriangles.toLocaleString('en-US'))],
            ['Mean GPU (ms)', lods.map(lod => record.results[lod].gpu.averageMs.toFixed(3))],
            ['P99 GPU (ms)', lods.map(lod => record.results[lod].gpu.p99Ms.toFixed(3))],
            ['Observed FPS', lods.map(lod => record.results[lod].fps.toFixed(2))]
        ]) lines.push('| ' + [label, ...values].join(' | ') + ' |');
        for (const [name, c] of Object.entries(record.comparisons))
            lines.push('', name.replaceAll('_', ' ') + ': ' + c.meanMs.toFixed(3) + ' ms (' + c.percent.toFixed(2)
                + '%); approximate paired 95% interval: ' + c.approximate95PercentIntervalMs.map(v => v.toFixed(3)).join(' to ') + ' ms.');
        for (const lod of lods) lines.push('', '![' + labels[lod] + '](' + pose + '_' + labels[lod] + '.png)');
        lines.push('');
    }
    lines.push('No measured samples discarded. Warmup excludes shader compilation, LOD switching and shadow-map rebuilds. These are steady-state full-scene GPU times, not isolated triangle throughput. FPS follows display cadence. GPU clocks and other desktop workloads are not locked. Partially visible field meshes are counted in full. Both camera setups retain all nine fields.', '',
        'Raw timings, diagnostics, source hashes and camera transforms: [benchmark.json](benchmark.json).', '');
    await writeFile(path.join(output, 'BENCHMARK.md'), lines.join('\n'));
});
