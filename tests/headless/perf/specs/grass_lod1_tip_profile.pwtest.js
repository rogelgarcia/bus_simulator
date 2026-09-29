// Compare original, previous fan and aligned-tip LOD1 meshes at the two requested field cameras.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod1_short_tip');
const originalFolder = path.resolve('tests/artifacts/screens/grass_debug_v2/tip_fan_9_fields');
const names = ['original', 'previous', 'current'];
const orders = [
    ['original', 'previous', 'current'], ['previous', 'current', 'original'], ['current', 'original', 'previous'],
    ['current', 'previous', 'original'], ['previous', 'original', 'current'], ['original', 'current', 'previous']
];
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD1 tip comparison: nine-field framing and a fixed one-field camera', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TIP_PROFILE_BENCHMARK !== '1', 'Opt in with GRASS_TIP_PROFILE_BENCHMARK=1.');
    test.setTimeout(300000);
    await mkdir(output, { recursive: true });
    const sourceFiles = {
        original: path.join(originalFolder, 'before_GrassDebugV2RibbonShoot.js'),
        previous: path.join(output, 'before_GrassDebugV2RibbonShoot.js'),
        current: 'src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js'
    };
    const sourceHashes = {}, errors = [], poses = {};
    const fieldSource = await readFile('src/graphics/gui/grass_debugger_v2/GrassDebugV2FieldLod1.js', 'utf8');
    for (const name of names) {
        const source = await readFile(sourceFiles[name], 'utf8');
        sourceHashes[name] = createHash('sha256').update(source).digest('hex');
        if (name === 'current') continue;
        await page.route('**/GrassDebugV2RibbonShoot.js?benchmark=profile-' + name,
            route => route.fulfill({ contentType: 'text/javascript', body: source }));
        await page.route('**/GrassDebugV2FieldLod1.js?benchmark=profile-' + name,
            route => route.fulfill({ contentType: 'text/javascript',
                body: fieldSource.replace(/\.\/GrassDebugV2RibbonShoot\.js\?v=[^']+/, './GrassDebugV2RibbonShoot.js?benchmark=profile-' + name) }));
    }
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod1-profile-benchmark#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    await page.mouse.move(30, 30);
    const metadata = await page.evaluate(async () => {
        const s = window.__grassLitterScene;
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer);
        s.setFieldCount(9); s.setMode('all'); s.setLod('LOD1');
        const current = s.scene.getObjectByName('GrassField-LOD1').geometry;
        const material = s.scene.getObjectByName('GrassField-LOD1').material;
        const manifest = await (await fetch('/tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m/scene.json', { cache: 'no-store' })).json();
        const sources = {}, geometries = { current };
        for (const name of ['original', 'previous']) {
            const { createGrassDebugV2FieldLod1 } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FieldLod1.js?benchmark=profile-' + name);
            sources[name] = createGrassDebugV2FieldLod1({ material, placements: manifest.placements, seed: manifest.seed });
            geometries[name] = sources[name].mesh.geometry;
        }
        const beforeFactory = (await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?benchmark=profile-previous')).createGrassDebugV2RibbonShoot;
        const currentFactory = (await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?v=lod1-short-tip-1')).createGrassDebugV2RibbonShoot;
        const a = beforeFactory({ material }), b = currentFactory({ material });
        a.trimAtSoil(() => 0); b.trimAtSoil(() => 0);
        const lod0Unchanged = a.leaves.every((leaf, i) => {
            const old = leaf.geometry, next = b.leaves[i].geometry;
            return old.index.array.length === next.index.array.length && old.index.array.every((v, j) => v === next.index.array[j])
                && Object.entries(old.attributes).every(([name, attribute]) => attribute.array.length === next.attributes[name].array.length
                    && attribute.array.every((v, j) => v === next.attributes[name].array[j]));
        });
        a.dispose(); b.dispose();
        const meshes = Array.from({ length: 9 }, (_, i) => s.scene.getObjectByName('GrassFieldTile_' + (i + 1)).getObjectByName('GrassField-LOD1'));
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const select = name => {
            s.setLod('LOD1');
            for (const mesh of meshes) mesh.geometry = geometries[name];
            s.lighting.sun.shadow.needsUpdate = true; s.renderer.shadowMap.needsUpdate = true;
        };
        const poseState = () => {
            const state = s.getSnapshot();
            return { position: s.camera.position.toArray(), quaternion: s.camera.quaternion.toArray(),
                distanceToOriginMeters: s.camera.position.length(), fov: s.camera.fov, fields: state.fields.count,
                visibleFields: state.visibleFields, visibleLeaves: state.visibleLeaves, visibleTriangles: state.visibleTriangles,
                cursorActive: state.cursorDistance.active, shadowSize: s.lighting.sun.shadow.mapSize.toArray() };
        };
        window.__tipProfileBenchmark = {
            async prepare(pose) {
                select('current'); s.setView(0); s.setFieldCount(pose === 'all_nine' ? 9 : 1); s.frameFields();
                await nextFrame();
                const framed = poseState();
                s.setFieldCount(9);
                for (let i = 0; i < 4; i++) await nextFrame();
                return { framed, measured: poseState() };
            },
            async capture(name) {
                select(name);
                for (let i = 0; i < 180; i++) await nextFrame();
                return poseState();
            },
            async run(name) {
                select(name);
                for (let i = 0; i < 60; i++) await nextFrame();
                const before = timer.getDiagnostics();
                let previous = await nextFrame();
                const first = timer.getDiagnostics().submissionSequence, frames = [];
                for (let i = 0; i < 120; i++) {
                    const now = await nextFrame(); frames.push(now - previous); previous = now;
                }
                const last = timer.getDiagnostics().submissionSequence;
                for (let i = 0; i < 120 && timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).length < last - first; i++) await nextFrame();
                const gpu = timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).map(x => x.ms);
                const diagnostics = timer.getDiagnostics();
                if (!before.active || !diagnostics.active || diagnostics.disjointCount !== before.disjointCount || gpu.length !== 120 || last - first !== 120)
                    throw new Error('Incomplete or disjoint GPU timer samples: ' + JSON.stringify({ before, diagnostics, first, last, count: gpu.length }));
                return { name, gpu, frames, diagnostics, state: poseState(), shared: meshes.every(mesh => mesh.geometry === geometries[name]) };
            },
            dispose() { for (const mesh of meshes) mesh.geometry = current; Object.values(sources).forEach(source => source.dispose()); }
        };
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            viewport: [innerWidth, innerHeight], pixelRatio: s.renderer.getPixelRatio(),
            samples: s.lighting.pipeline.composer.renderTarget1.samples, lod0Unchanged, leaves: 864000,
            cases: Object.fromEntries(Object.entries(geometries).map(([name, geometry]) => [name, {
                perLeaf: geometry.index.count / 3 / 96000, allFieldTriangles: geometry.index.count / 3 * 9 + 1472,
                verticesPerField: geometry.attributes.position.count
            }])) };
    });
    metadata.browser = browser.version(); metadata.date = new Date().toISOString(); metadata.sourceHashes = sourceHashes;
    metadata.schedule = '180 initial warmup frames per case; six balanced-order rounds, each with 60 warmup and 120 measured frames per case. Full lighting, 4x MSAA and static shadows; cursor over HUD.';
    expect(metadata.lod0Unchanged).toBe(true); expect(metadata.samples).toBe(4);
    expect(metadata.cases.original.perLeaf).toBe(16); expect(metadata.cases.previous.perLeaf).toBe(14); expect(metadata.cases.current.perLeaf).toBe(14);
    for (const pose of ['all_nine', 'one_then_nine']) {
        const camera = await page.evaluate(pose => window.__tipProfileBenchmark.prepare(pose), pose);
        expect(camera.measured.fields).toBe(9);
        expect(camera.measured.position).toEqual(camera.framed.position);
        expect(camera.measured.quaternion).toEqual(camera.framed.quaternion);
        if (pose === 'all_nine') expect(camera.measured.visibleFields).toBe(9);
        const blocks = [], captures = {};
        for (const name of names) {
            captures[name] = await page.evaluate(name => window.__tipProfileBenchmark.capture(name), name);
            expect(captures[name].cursorActive).toBe(false);
            await page.screenshot({ path: path.join(output, pose + '_' + name + '.png') });
        }
        for (const [round, order] of orders.entries()) for (const name of order) {
            const block = await page.evaluate(name => window.__tipProfileBenchmark.run(name), name);
            block.round = round; blocks.push(block);
            expect(block.shared).toBe(true); expect(block.state.fields).toBe(9);
            expect(block.state.visibleFields).toBe(camera.measured.visibleFields);
            expect(block.state.visibleLeaves).toBe(camera.measured.visibleLeaves);
            expect(block.state.position).toEqual(camera.measured.position);
            expect(block.state.quaternion).toEqual(camera.measured.quaternion);
            expect(block.state.visibleTriangles).toBe(captures[name].visibleTriangles);
            console.log('[TipProfile] ' + pose + ' round ' + (round + 1) + ' ' + name + ': ' + summarizeBenchmarkTimings(block.gpu).averageMs.toFixed(3) + ' ms GPU');
        }
        const results = Object.fromEntries(names.map(name => {
            const selected = blocks.filter(block => block.name === name), gpu = selected.flatMap(block => block.gpu), frames = selected.flatMap(block => block.frames);
            return [name, { gpu: summarizeBenchmarkTimings(gpu), frames: summarizeBenchmarkTimings(frames),
                fps: frames.length * 1000 / frames.reduce((sum, ms) => sum + ms, 0),
                roundMeans: selected.map(block => summarizeBenchmarkTimings(block.gpu).averageMs) }];
        }));
        const comparisons = Object.fromEntries(['original', 'previous'].map(name => {
            const deltas = results.current.roundMeans.map((ms, i) => ms - results[name].roundMeans[i]);
            const mean = deltas.reduce((sum, ms) => sum + ms, 0) / deltas.length;
            const sd = Math.sqrt(deltas.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / (deltas.length - 1));
            const margin = 2.571 * sd / Math.sqrt(deltas.length);
            return [name, { meanMs: mean, percent: mean / results[name].gpu.averageMs * 100,
                approximate95PercentIntervalMs: [mean - margin, mean + margin], roundDeltas: deltas }];
        }));
        poses[pose] = { camera, captures, results, comparisons, blocks };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify({ metadata, poses, errors }, null, 2));
    }
    await page.evaluate(() => window.__tipProfileBenchmark.dispose());
    expect(errors).toEqual([]);
    const lines = ['# LOD1 aligned tip: two-camera benchmark', '', metadata.renderer + '. Chrome ' + metadata.browser + '.', '',
        'Nine 12 x 12 m fields with 1 m gaps; 864,000 total leaves; 1920 x 1080, DPR 1. LOD0 is byte-for-byte unchanged.', '',
        'Original: 16 triangles/leaf, six-face tip. Previous: 14 triangles/leaf, four-face tip starting at 84%. Current: 14 triangles/leaf, four-face tip boundary aligned to LOD0 at 90%, longer bottom section and unchanged middle spine length.', '',
        metadata.schedule, ''];
    for (const [pose, record] of Object.entries(poses)) {
        lines.push('## ' + (pose === 'all_nine' ? 'Frame all nine fields' : 'Frame one field, then set nine without moving'), '',
            'Camera distance to field origin: ' + record.camera.measured.distanceToOriginMeters.toFixed(2) + ' m. Visible field meshes: '
            + record.camera.measured.visibleFields + '; counted leaves: ' + record.camera.measured.visibleLeaves.toLocaleString('en-US') + '.', '',
            '| Metric | Original | Previous fan | Current aligned tip |', '|---|---:|---:|---:|');
        for (const [label, values] of [
            ['Triangles per leaf', names.map(name => metadata.cases[name].perLeaf)],
            ['Visible scene triangles', names.map(name => record.captures[name].visibleTriangles.toLocaleString('en-US'))],
            ['Mean GPU (ms)', names.map(name => record.results[name].gpu.averageMs.toFixed(3))],
            ['P99 GPU (ms)', names.map(name => record.results[name].gpu.p99Ms.toFixed(3))],
            ['Observed FPS', names.map(name => record.results[name].fps.toFixed(2))]
        ]) lines.push('| ' + [label, ...values].join(' | ') + ' |');
        lines.push('');
        for (const name of ['original', 'previous']) {
            const c = record.comparisons[name];
            lines.push('Current vs ' + name + ': ' + c.meanMs.toFixed(3) + ' ms (' + c.percent.toFixed(2)
                + '%); approximate paired 95% interval ' + c.approximate95PercentIntervalMs.map(ms => ms.toFixed(3)).join(' to ') + ' ms.', '');
        }
        lines.push('![Current camera](' + pose + '_current.png)', '');
    }
    lines.push('720 GPU samples per case and camera; no samples discarded. FPS follows browser/display cadence. Clocks and other desktop workloads are not locked. Full scene GPU time includes lighting and post-processing. Fields intersecting the frustum are counted in full even when partially visible; the fixed close camera still has all nine fields loaded.', '',
        'Raw samples, exact camera transforms and source hashes: [benchmark.json](benchmark.json).', '');
    await writeFile(path.join(output, 'BENCHMARK.md'), lines.join('\n'));
});
