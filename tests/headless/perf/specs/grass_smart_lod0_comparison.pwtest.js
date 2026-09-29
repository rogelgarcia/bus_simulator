// Historical hardware GPU comparison of original and first-version Smart LOD0.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/smart_lod0');
const lods = ['LOD0', 'LOD0_SMART'];
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Original versus Smart LOD0: nine fields at overview and fixed single-field camera', async ({ page, browser }) => {
    test.skip(process.env.GRASS_SMART_LOD0_BENCHMARK !== '1', 'Opt in with GRASS_SMART_LOD0_BENCHMARK=1.');
    test.setTimeout(360000); await mkdir(output, { recursive: true });
    const errors = [], poses = {};
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const before = await readFile(path.join(output, 'before_GrassDebugV2RibbonShoot.js'), 'utf8');
    const candidate = await readFile(path.join(output, 'after_GrassDebugV2RibbonShoot.js'), 'utf8');
    await page.route('**/GrassDebugV2RibbonShoot.js?v=*', route => route.fulfill({ contentType: 'text/javascript', body: candidate }));
    await page.route('**/GrassDebugV2RibbonShoot.js?benchmark=before-smart-lod0', route => route.fulfill({ contentType: 'text/javascript', body: before }));
    await page.goto('/debug_tools/grass_litter_scene.html?revision=smart-lod0-benchmark#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness); await page.evaluate(() => window.__grassLitterReadiness);
    await page.mouse.move(30, 30);
    const metadata = await page.evaluate(async () => {
        const s = window.__grassLitterScene;
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer), nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
        s.setMode('all'); s.setFieldCount(9); s.setLod('LOD0');
        const oldFactory = (await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?benchmark=before-smart-lod0')).createGrassDebugV2RibbonShoot;
        const newFactory = (await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?v=smart-lod0-1')).createGrassDebugV2RibbonShoot;
        const material = s.scene.getObjectByName('GrassField-LOD1').material, unchanged = {};
        for (const lod of ['LOD0', 'LOD1', 'LOD2']) {
            const a = oldFactory({ material, lod }), b = newFactory({ material, lod });
            a.trimAtSoil(() => 0); b.trimAtSoil(() => 0);
            unchanged[lod] = a.leaves.every((leaf, i) => {
                const old = leaf.geometry, next = b.leaves[i].geometry;
                return old.index.count === next.index.count && old.index.array.every((v, j) => v === next.index.array[j])
                    && Object.entries(old.attributes).every(([name, a]) => a.array.length === next.attributes[name].array.length
                        && a.array.every((v, j) => v === next.attributes[name].array[j]));
            });
            a.dispose(); b.dispose();
        }
        const state = () => {
            const x = s.getSnapshot();
            return { position: s.camera.position.toArray(), quaternion: s.camera.quaternion.toArray(),
                distanceToOriginMeters: s.camera.position.length(), fov: s.camera.fov, fields: x.fields.count,
                visibleFields: x.visibleFields, visibleLeaves: x.visibleLeaves, visibleTriangles: x.visibleTriangles,
                cursorActive: x.cursorDistance.active };
        };
        window.__smartLod0Benchmark = {
            async prepare(pose) {
                s.setLod('LOD0'); s.setView(0); s.setFieldCount(pose === 'all_nine' ? 9 : 1); s.frameFields();
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
            viewport: [innerWidth, innerHeight], pixelRatio: s.renderer.getPixelRatio(), msaaSamples: s.lighting.pipeline.composer.renderTarget1.samples,
            shadowSize: s.lighting.sun.shadow.mapSize.toArray(), unchanged, totalLeaves: 864000, lods: s.getSnapshot().lods };
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString(); metadata.sourceHashes = {};
    for (const file of ['GrassDebugV2RibbonShoot.js', 'GrassDebugV2FieldLod1.js', 'GrassDebugV2FieldLayout.js', 'GrassDebugV2LitterScene.js'])
        metadata.sourceHashes[file] = createHash('sha256').update(await readFile('src/graphics/gui/grass_debugger_v2/' + file)).digest('hex');
    metadata.sourceHashes['GrassDebugV2RibbonShoot.js'] = createHash('sha256').update(candidate).digest('hex');
    metadata.revision = 'First Smart LOD0: five triangles per wing; before the raised-junction refinement.';
    metadata.schedule = '180 initial warmup frames per LOD/pose, then 12 alternating paired rounds, each block with 30 warmup and 60 measured frames. 720 valid GPU samples per LOD/pose; static shadows, full lighting, 4x MSAA and cursor over HUD.';
    expect(metadata.unchanged).toEqual({ LOD0: true, LOD1: true, LOD2: true }); expect(metadata.msaaSamples).toBe(4);
    expect(metadata.lods.LOD0.triangles).toBe(4235466); expect(metadata.lods.LOD0_SMART.triangles).toBe(3467466);
    for (const pose of ['all_nine', 'one_then_nine']) {
        const camera = await page.evaluate(pose => window.__smartLod0Benchmark.prepare(pose), pose);
        expect(camera.measured.position).toEqual(camera.framed.position);
        expect(camera.measured.quaternion).toEqual(camera.framed.quaternion); expect(camera.measured.fields).toBe(9);
        const captures = {}, blocks = [];
        for (const lod of lods) {
            captures[lod] = await page.evaluate(lod => window.__smartLod0Benchmark.capture(lod), lod);
            expect(captures[lod].cursorActive).toBe(false);
            await page.screenshot({ path: path.join(output, pose + '_' + lod + '.png') });
        }
        for (let round = 0; round < 12; round++) {
            for (const lod of round % 2 ? [...lods].reverse() : lods) {
                const block = await page.evaluate(lod => window.__smartLod0Benchmark.run(lod), lod);
                block.round = round; blocks.push(block);
                expect(block.state.position).toEqual(camera.measured.position); expect(block.state.quaternion).toEqual(camera.measured.quaternion);
                expect(block.state.fields).toBe(9); expect(block.state.visibleFields).toBe(captures[lod].visibleFields);
                expect(block.state.visibleTriangles).toBe(captures[lod].visibleTriangles);
            }
            const pair = blocks.filter(block => block.round === round);
            console.log('[Smart LOD0] ' + pose + ' round ' + (round + 1) + ': ' + pair.map(b => b.lod + ' ' + summarizeBenchmarkTimings(b.gpu).averageMs.toFixed(3) + ' ms').join(' / '));
            await writeFile(path.join(output, 'partial_benchmark.json'), JSON.stringify({ metadata, poses, pose, camera, blocks, errors }, null, 2));
        }
        const results = Object.fromEntries(lods.map(lod => {
            const selected = blocks.filter(b => b.lod === lod), gpu = selected.flatMap(b => b.gpu), frames = selected.flatMap(b => b.frames);
            return [lod, { gpu: summarizeBenchmarkTimings(gpu), frames: summarizeBenchmarkTimings(frames),
                fps: frames.length * 1000 / frames.reduce((sum, ms) => sum + ms, 0),
                roundMeans: selected.map(b => summarizeBenchmarkTimings(b.gpu).averageMs) }];
        }));
        const deltas = results.LOD0_SMART.roundMeans.map((ms, i) => ms - results.LOD0.roundMeans[i]);
        const mean = deltas.reduce((sum, ms) => sum + ms, 0) / deltas.length;
        const sd = Math.sqrt(deltas.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / (deltas.length - 1)), margin = 2.201 * sd / Math.sqrt(deltas.length);
        const comparison = { meanMs: mean, percent: mean / results.LOD0.gpu.averageMs * 100,
            approximate95PercentIntervalMs: [mean - margin, mean + margin], roundDeltas: deltas };
        poses[pose] = { camera, captures, results, comparison, blocks };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify({ metadata, poses, errors }, null, 2));
    }
    expect(errors).toEqual([]);
    const lines = ['# Original LOD0 versus Smart LOD0', '', metadata.renderer + '. Chrome ' + metadata.browser + '.', '',
        'Nine 12 x 12 m fields with 1 m gaps; 864,000 leaves; 1920 x 1080, DPR 1. Original LOD0, LOD1 and LOD2 source geometry are byte-for-byte unchanged.', '',
        metadata.schedule, '', 'Smart LOD0 preserves every outer-edge vertex and reduces the upper region from nine to five triangles per side, saving eight per leaf. Larger inner triangles use a direct center-crease edge; surviving normals, UVs and colors are unchanged. Original LOD0 stays available. Placement seed, inclinations, materials and colors are shared. Soil clipping adds the same root faces in both versions.', ''];
    for (const [pose, record] of Object.entries(poses)) {
        lines.push('## ' + (pose === 'all_nine' ? 'Frame all nine fields' : 'Frame one field, then enable nine without moving'), '',
            'Camera distance to origin: ' + record.camera.measured.distanceToOriginMeters.toFixed(2) + ' m; counted grass meshes: '
            + record.camera.measured.visibleFields + '; counted leaves: ' + record.camera.measured.visibleLeaves.toLocaleString('en-US') + '.', '',
            '| Metric | Original LOD0 | Smart LOD0 |', '|---|---:|---:|');
        for (const [label, values] of [
            ['Triangles per field leaf (after soil clipping)', ['44–47', '36–39']], ['Visible scene triangles', lods.map(lod => record.captures[lod].visibleTriangles.toLocaleString('en-US'))],
            ['Mean GPU (ms)', lods.map(lod => record.results[lod].gpu.averageMs.toFixed(3))],
            ['P99 GPU (ms)', lods.map(lod => record.results[lod].gpu.p99Ms.toFixed(3))],
            ['Observed FPS', lods.map(lod => record.results[lod].fps.toFixed(2))]
        ]) lines.push('| ' + [label, ...values].join(' | ') + ' |');
        const c = record.comparison;
        lines.push('', 'Paired change: ' + c.meanMs.toFixed(3) + ' ms (' + c.percent.toFixed(2) + '%). Approximate 95% interval: '
            + c.approximate95PercentIntervalMs.map(v => v.toFixed(3)).join(' to ') + ' ms.', '',
            '![Original LOD0](' + pose + '_LOD0.png)', '', '![Smart LOD0](' + pose + '_LOD0_SMART.png)', '');
    }
    lines.push('No samples discarded. FPS follows display cadence. GPU clocks and other desktop workloads are not locked. These are full-scene timings, not isolated triangle throughput. Partially visible field meshes are counted in full. The close setup retains all nine fields and exactly the one-field framing camera.', '',
        'Raw timings, source hashes and camera transforms: [benchmark.json](benchmark.json).',
        '', '![Original topology](tip_LOD0.png)', '', '![Smart topology](tip_LOD0_SMART.png)', '');
    await writeFile(path.join(output, 'BENCHMARK.md'), lines.join('\n'));
});
