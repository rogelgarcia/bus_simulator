// Compare the preserved six-triangle tip with the four-triangle tip in the live nine-field scene.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/tip_fan_9_fields');
const baselineOnly = process.env.GRASS_TIP_FAN_PHASE === 'before';
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Nine fields: before/after four-triangle LOD1 tip', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TIP_FAN_BENCHMARK !== '1', 'Opt in with GRASS_TIP_FAN_BENCHMARK=1.');
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const oldShoot = await readFile(path.join(output, 'before_GrassDebugV2RibbonShoot.js'), 'utf8');
    const afterShoot = await readFile(path.join(output, 'after_GrassDebugV2RibbonShoot.js'), 'utf8');
    await page.route('**/GrassDebugV2RibbonShoot.js?benchmark=tip-after', route => route.fulfill({
        contentType: 'text/javascript', body: baselineOnly ? oldShoot : afterShoot
    }));
    const oldField = await readFile(path.join(output, 'before_GrassDebugV2FieldLod1.js'), 'utf8');
    await page.route('**/GrassDebugV2RibbonShoot.js?benchmark=tip-before', route => route.fulfill({ contentType: 'text/javascript', body: oldShoot }));
    await page.route('**/GrassDebugV2FieldLod1.js?benchmark=tip-before', route => route.fulfill({
        contentType: 'text/javascript', body: oldField.replace("./GrassDebugV2RibbonShoot.js?v=lod1-1", "./GrassDebugV2RibbonShoot.js?benchmark=tip-before")
    }));
    await page.route('**/GrassDebugV2FieldLod1.js?benchmark=tip-after', route => route.fulfill({
        contentType: 'text/javascript', body: oldField.replace("./GrassDebugV2RibbonShoot.js?v=lod1-1", "./GrassDebugV2RibbonShoot.js?benchmark=tip-after")
    }));
    const errors = [], blocks = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=tip-fan-benchmark#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    await page.mouse.move(30, 30);
    const metadata = await page.evaluate(async baselineOnly => {
        const s = window.__grassLitterScene;
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        s.setFieldCount(9); s.setMode('all'); s.setLod('LOD1'); s.frameFields();
        const timer = getOrCreateGpuFrameTimer(s.renderer), live = s.scene.getObjectByName('GrassField-LOD1').geometry;
        const manifest = await (await fetch('/tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m/scene.json', { cache: 'no-store' })).json();
        const { createGrassDebugV2FieldLod1 } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FieldLod1.js?benchmark=tip-before');
        const original = createGrassDebugV2FieldLod1({ material: s.scene.getObjectByName('GrassField-LOD1').material, placements: manifest.placements, seed: manifest.seed });
        const afterFactory = (await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FieldLod1.js?benchmark=tip-after')).createGrassDebugV2FieldLod1;
        const archivedAfter = afterFactory({ material: s.scene.getObjectByName('GrassField-LOD1').material, placements: manifest.placements, seed: manifest.seed });
        const after = archivedAfter.mesh.geometry, geometries = { before: original.mesh.geometry, after };
        const oldFactory = (await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?benchmark=tip-before')).createGrassDebugV2RibbonShoot;
        const newFactory = (await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?benchmark=tip-after')).createGrassDebugV2RibbonShoot;
        const material = s.scene.getObjectByName('GrassField-LOD1').material;
        const reference = oldFactory({ material, lod: 'LOD1' }), candidate = newFactory({ material, lod: 'LOD1' });
        reference.trimAtSoil(() => 0); candidate.trimAtSoil(() => 0);
        const proof = candidate.leaves.map((leaf, index) => {
            const a = reference.leaves[index].geometry, b = leaf.geometry;
            const key = (geometry, i) => Array.from(geometry.attributes.position.array.slice(i * 3, i * 3 + 3)).join(',');
            const lookup = new Map(Array.from({ length: a.attributes.position.count }, (_, i) => [key(a, i) + ':' + a.attributes.normal.array.slice(i * 3, i * 3 + 3).join(','), i]));
            let identical = true;
            for (let i = 0; i < b.attributes.position.count; i++) {
                const j = lookup.get(key(b, i) + ':' + b.attributes.normal.array.slice(i * 3, i * 3 + 3).join(','));
                if (j === undefined) { identical = false; break; }
                for (const name of ['uv', 'color', 'grassFacingNormal']) {
                    const attr = b.attributes[name], old = a.attributes[name];
                    for (let c = 0; c < attr.itemSize; c++) if (attr.array[i * attr.itemSize + c] !== old.array[j * old.itemSize + c]) identical = false;
                }
            }
            const outline = geometry => {
                const p = geometry.attributes.position, uv = geometry.attributes.uv, result = [];
                for (let i = 0; i < p.count; i++) if (uv.getX(i) === 0 || uv.getX(i) === 1 || uv.getY(i) === 1) result.push(key(geometry, i));
                return result.sort().join(';');
            };
            return { retainedAttributesIdentical: identical, outlineIdentical: outline(a) === outline(b),
                removedVertices: a.attributes.position.count - b.attributes.position.count };
        });
        reference.dispose(); candidate.dispose();
        const meshes = Array.from({ length: 9 }, (_, i) => s.scene.getObjectByName('GrassFieldTile_' + (i + 1)).getObjectByName('GrassField-LOD1'));
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const select = name => {
            s.setLod('LOD1');
            meshes.forEach(mesh => { mesh.geometry = geometries[name]; });
            s.lighting.sun.shadow.needsUpdate = true; s.renderer.shadowMap.needsUpdate = true;
        };
        window.__tipFanBenchmark = {
            async capture(name) {
                select(name);
                for (let i = 0; i < 180; i++) await nextFrame();
                return s.getSnapshot();
            },
            async run(name) {
                select(name);
                for (let i = 0; i < 60; i++) await nextFrame();
                const before = timer.getDiagnostics(), start = before.submissionSequence;
                const frames = []; let previous = await nextFrame();
                const first = timer.getDiagnostics().submissionSequence;
                for (let i = 0; i < 120; i++) {
                    const now = await nextFrame(); frames.push(now - previous); previous = now;
                }
                const last = timer.getDiagnostics().submissionSequence;
                for (let i = 0; i < 120 && timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last).length < last - first; i++) await nextFrame();
                const gpu = timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last).map(sample => sample.ms);
                const diagnostics = timer.getDiagnostics();
                if (!before.active || !diagnostics.active || diagnostics.disjointCount !== before.disjointCount || gpu.length !== 120 || last - first !== 120) {
                    throw new Error('Incomplete/disjoint GPU samples: ' + JSON.stringify({ before, diagnostics, first, last, received: gpu.length, start }));
                }
                return { name, gpu, frames, diagnostics, visibleFields: s.getSnapshot().visibleFields,
                    visibleTriangles: s.getSnapshot().visibleTriangles, shared: meshes.every(mesh => mesh.geometry === geometries[name]),
                    position: s.camera.position.toArray(), quaternion: s.camera.quaternion.toArray() };
            },
            dispose() { meshes.forEach(mesh => { mesh.geometry = live; }); original.dispose(); archivedAfter.dispose(); }
        };
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { leaves: 864000, fields: 9, lod: 'LOD1', mode: 'all', viewport: [innerWidth, innerHeight],
            pixelRatio: s.renderer.getPixelRatio(), renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            position: s.camera.position.toArray(), quaternion: s.camera.quaternion.toArray(), fov: s.camera.fov,
            shadowSize: s.lighting.sun.shadow.mapSize.toArray(), cursorActive: s.getSnapshot().cursorDistance.active,
            msaaSamples: s.lighting.pipeline.composer.renderTarget1.samples,
            baselineOnly, proof, cases: Object.fromEntries(Object.entries(geometries).map(([name, geometry]) => [name, {
                perLeaf: geometry.index.count / 3 / 96000, leafTriangles: geometry.index.count / 3 * 9,
                sceneTriangles: geometry.index.count / 3 * 9 + 1472,
                verticesPerField: geometry.attributes.position.count,
                bytesPerField: Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, geometry.index.array.byteLength)
            }])) };
    }, baselineOnly);
    metadata.browser = browser.version(); metadata.date = new Date().toISOString();
    metadata.beforeSourceSha256 = createHash('sha256').update(oldShoot).digest('hex');
    metadata.afterSourceSha256 = createHash('sha256').update(baselineOnly ? oldShoot : afterShoot).digest('hex');
    metadata.schedule = '180 initial warmup frames per case; 60 warmup + 120 measured frames per block. Six alternating before/after rounds; all GPU samples and frame intervals retained. Live full lighting/post-processing with static shadows; cursor outside scene.';
    expect(metadata.cases.before.perLeaf).toBe(16);
    expect(metadata.cases.after.perLeaf).toBe(baselineOnly ? 16 : 14);
    expect(metadata.cursorActive).toBe(false); expect(metadata.msaaSamples).toBe(4);
    expect(metadata.proof.every(leaf => leaf.retainedAttributesIdentical && leaf.outlineIdentical && leaf.removedVertices === (baselineOnly ? 0 : 2))).toBe(true);
    const cases = baselineOnly ? ['before'] : ['before', 'after'];
    for (const name of cases) {
        const state = await page.evaluate(name => window.__tipFanBenchmark.capture(name), name);
        expect(state.visibleFields).toBe(9);
        expect(state.visibleTriangles).toBe(metadata.cases[name].sceneTriangles);
        await page.screenshot({ path: path.join(output, 'nine_fields_' + name + '.png') });
    }
    for (let round = 0; round < (baselineOnly ? 3 : 6); round++) {
        for (const name of round % 2 ? [...cases].reverse() : cases) {
            const block = await page.evaluate(name => window.__tipFanBenchmark.run(name), name);
            block.round = round; blocks.push(block);
            expect(block.shared).toBe(true); expect(block.visibleFields).toBe(9);
            expect(block.visibleTriangles).toBe(metadata.cases[name].sceneTriangles);
            expect(block.position).toEqual(metadata.position); expect(block.quaternion).toEqual(metadata.quaternion);
            console.log('[TipFan] Round ' + (round + 1) + ' ' + name + ': ' + summarizeBenchmarkTimings(block.gpu).averageMs.toFixed(3) + ' ms GPU');
        }
        await writeFile(path.join(output, 'partial.json'), JSON.stringify({ metadata, blocks, errors }, null, 2));
    }
    const results = Object.fromEntries(cases.map(name => {
        const selected = blocks.filter(block => block.name === name), gpu = selected.flatMap(block => block.gpu), frames = selected.flatMap(block => block.frames);
        return [name, { gpu: summarizeBenchmarkTimings(gpu), frames: summarizeBenchmarkTimings(frames),
            fps: frames.length * 1000 / frames.reduce((sum, value) => sum + value, 0),
            medianGpuMs: [...gpu].sort((a, b) => a - b)[Math.floor(gpu.length / 2)],
            roundMeans: selected.map(block => summarizeBenchmarkTimings(block.gpu).averageMs) }];
    }));
    let comparison = null;
    if (!baselineOnly) {
        const deltas = results.after.roundMeans.map((value, index) => value - results.before.roundMeans[index]);
        const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
        const sd = Math.sqrt(deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (deltas.length - 1));
        const margin = 2.571 * sd / Math.sqrt(deltas.length);
        comparison = { meanMs: mean, percent: mean / results.before.gpu.averageMs * 100, roundDeltas: deltas,
            approximate95PercentIntervalMs: [mean - margin, mean + margin] };
    }
    await page.evaluate(() => window.__tipFanBenchmark.dispose());
    expect(errors).toEqual([]);
    await writeFile(path.join(output, baselineOnly ? 'baseline.json' : 'results.json'), JSON.stringify({ metadata, results, comparison, blocks, errors }, null, 2));
    if (!baselineOnly) {
        const lines = ['# Four-triangle leaf tip: nine-field benchmark', '', metadata.renderer + '. Chrome ' + metadata.browser + '.', '',
            '864,000 leaves; LOD1; nine 12 × 12 m fields with 1 m gaps. All fields in view at 1920 × 1080, DPR 1, 4× MSAA. Identical materials, placements, camera and lighting.', '',
            metadata.schedule, '', '| Metric | Before | After |', '|---|---:|---:|'];
        for (const [label, a, b] of [
            ['Triangles per leaf', metadata.cases.before.perLeaf, metadata.cases.after.perLeaf],
            ['Scene triangles', metadata.cases.before.sceneTriangles, metadata.cases.after.sceneTriangles],
            ['GPU mean (ms)', results.before.gpu.averageMs.toFixed(3), results.after.gpu.averageMs.toFixed(3)],
            ['GPU median (ms)', results.before.medianGpuMs.toFixed(3), results.after.medianGpuMs.toFixed(3)],
            ['GPU P99 (ms)', results.before.gpu.p99Ms.toFixed(3), results.after.gpu.p99Ms.toFixed(3)],
            ['Observed FPS', results.before.fps.toFixed(2), results.after.fps.toFixed(2)],
            ['GPU samples', results.before.gpu.count, results.after.gpu.count]
        ]) lines.push('| ' + [label, a, b].join(' | ') + ' |');
        lines.push('', 'Paired mean change: ' + comparison.meanMs.toFixed(3) + ' ms (' + comparison.percent.toFixed(2) + '%). Approximate 95% interval: '
            + comparison.approximate95PercentIntervalMs.map(value => value.toFixed(3)).join(' to ') + ' ms.', '',
            'FPS is limited by the browser/display cadence; GPU time is the primary comparison. GPU clocks and other desktop workloads are not locked. This measures the full live scene, not isolated triangle throughput. The topology preserves the outline but changes interpolation inside the tip.', '',
            'Raw measurements and source hashes: [results.json](results.json). Preserved original sources are stored beside this report.',
            '', '![Before](nine_fields_before.png)', '', '![After](nine_fields_after.png)', '');
        await writeFile(path.join(output, 'REPORT.md'), lines.join('\n'));
    }
});
