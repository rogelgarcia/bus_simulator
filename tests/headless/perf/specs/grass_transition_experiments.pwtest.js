// Compare one optional optimization at a time against the retained baseline in the same GPU cycles.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeGrassLod4ExperimentsReport, writeGrassExperimentsIndex } from '../../visual/grass_lod4_experiments_report.mjs';

const stage = process.env.GRASS_EXPERIMENT || 'filtering';
const candidates = { filtering: ['aniso4'], edges: ['strips'], environment: ['simple_ibl'], compression: ['compressed'], chunks: ['chunks4', 'chunks8'], adoption: ['recommended'] };
if (!Object.hasOwn(candidates, stage)) throw new Error('Unknown experiment ' + stage);
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/experiments', stage);
const versions = ['baseline', ...candidates[stage]], poses = ['front', 'rear', 'border'];
const scenarios = ['chunks', 'adoption'].includes(stage) ? ['lod4', 'full', 'half'] : ['lod4'], rounds = 6, samples = 30, warmup = 6;
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
function summary(values) {
    const averageMs = mean(values), variance = values.reduce((sum, value) => sum + (value - averageMs) ** 2, 0) / (values.length - 1);
    const margin = 2.57058183661474 * Math.sqrt(variance / values.length);
    return { averageMs, ci95Ms: [averageMs - margin, averageMs + margin], blocks: values };
}

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: ['--force-color-profile=srgb', '--disable-background-timer-throttling'] } });

test('Isolated grass experiments retain paired soil baselines', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TRANSITION_BENCHMARK !== '1', 'Opt in with GRASS_TRANSITION_BENCHMARK=1.');
    test.setTimeout(900000); await mkdir(output, { recursive: true }); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?transition=0&configuration=lod4-elevated-sides&revision=lod4-interior-quads-1#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness);
    await page.evaluate(() => window.__grassTransitionReadiness);
    const metadata = await page.evaluate(async ({ versions, samples, warmup }) => {
        const THREE = await import('three');
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const s = window.__grassTransitionScene, timer = getOrCreateGpuFrameTimer(s.renderer), sun = s.lighting.sun;
        s.setAnimating(false); s.setHelpers(false);
        const groups = new Map(), snapshots = {}, ownedGeometries = new Set(), grassShadow = sun.shadow.map;
        function copyBatch(source) {
            // Edge attributes are instance-order dependent and will change when another version is selected.
            const geometry = source.geometry.attributes.grassTransitionOpenEdges ? source.geometry.clone() : source.geometry;
            if (geometry !== source.geometry) ownedGeometries.add(geometry);
            const mesh = new THREE.InstancedMesh(geometry, source.material, source.count);
            mesh.name = source.name; mesh.userData = { ...source.userData }; mesh.receiveShadow = source.receiveShadow;
            mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0, source.count * 16)); mesh.instanceMatrix.needsUpdate = true;
            mesh.position.copy(source.position); mesh.computeBoundingBox(); mesh.computeBoundingSphere(); return mesh;
        }
        sun.shadow.map = null; s.setSoilOnly(true); const emptyShadow = sun.shadow.map, soil = new THREE.Group();
        s.fields.group.traverse(mesh => { if (mesh.isInstancedMesh && mesh.name.endsWith('-Ground')) soil.add(copyBatch(mesh)); });
        sun.shadow.map = grassShadow; s.setSoilOnly(false); soil.visible = false; s.scene.add(soil);
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve)); let clock = performance.now(), referencePixels;
        const render = () => { clock = Math.max(clock + 1000 / 60, performance.now()); const before = performance.now(); s.step(1 / 60, clock); return performance.now() - before; };
        function select(version) {
            s.fields.group.visible = false; soil.visible = version === 'soil';
            for (const [id, group] of groups) group.visible = id === version;
            sun.shadow.map = version === 'soil' ? emptyShadow : grassShadow;
        }
        function clearGroups() {
            for (const group of groups.values()) { group.removeFromParent(); group.children.forEach(mesh => mesh.dispose()); }
            groups.clear(); for (const geometry of ownedGeometries) geometry.dispose(); ownedGeometries.clear();
        }
        const metrics = () => {
            const state = s.getSnapshot(); return { scans: state.selection.scans, uploads: state.fields.instanceUploads,
                shadows: state.shadows.generations, glError: state.glError, draw: state.performance.draw };
        };
        window.__grassExperiments = {
            async prepare(scenario, pose) {
                clearGroups(); soil.visible = false; s.fields.group.visible = true; sun.shadow.map = grassShadow;
                s.setConfiguration(scenario === 'lod4' ? 'lod4-elevated-sides' : 'distance');
                s.setDistanceScale(scenario === 'half' ? .5 : 1); s.setPose(pose);
                for (const version of versions) {
                    await s.setExperiment(version); const group = new THREE.Group(); group.name = 'Version-' + version;
                    s.fields.group.traverse(mesh => { if (mesh.isInstancedMesh && mesh.visible && mesh.count) group.add(copyBatch(mesh)); });
                    snapshots[version] = { ...s.fields.getSnapshot(), canopy: s.getSnapshot().canopy, experiments: s.getSnapshot().experiments }; group.visible = false; groups.set(version, group); s.scene.add(group);
                }
                for (const version of [...versions, 'soil']) { select(version); for (let i = 0; i < 90; i++) { await frame(); render(); } }
                return { snapshots: structuredClone(snapshots), pose: s.getSnapshot().position, levels: s.fields.getSnapshot().levels };
            },
            async run(round) {
                const labels = [...versions, 'soil']; const records = [];
                const submit = async (i, measured) => {
                    await frame();
                    for (let j = 0; j < labels.length; j++) {
                        const offset = (i + round + j) % labels.length, version = labels[round % 2 ? labels.length - 1 - offset : offset];
                        select(version); const cpu = render(), sequence = timer.getDiagnostics().submissionSequence;
                        if (measured) records.push({ version, cpu, sequence });
                    }
                };
                for (let i = 0; i < (round === 0 ? 120 : warmup); i++) await submit(i, false);
                const initial = metrics(), before = timer.getDiagnostics();
                for (let i = 0; i < samples; i++) await submit(i, true);
                const last = timer.getDiagnostics().submissionSequence;
                const read = () => timer.getSamplesSince(0).filter(sample => sample.submissionSequence > before.submissionSequence && sample.submissionSequence <= last);
                for (let i = 0; i < 120 && read().length < samples * labels.length; i++) { await frame(); timer.poll(); }
                const after = timer.getDiagnostics(), values = read(), final = metrics();
                if (!before.active || !after.active || before.disjointCount !== after.disjointCount || values.length !== samples * labels.length
                    || last - before.submissionSequence !== samples * labels.length) throw new Error('Invalid hardware timing block.');
                const lookup = new Map(values.map(value => [value.submissionSequence, value.ms]));
                return { round, gpu: Object.fromEntries(labels.map(id => [id, records.filter(row => row.version === id).map(row => lookup.get(row.sequence))])),
                    cpu: Object.fromEntries(labels.map(id => [id, records.filter(row => row.version === id).map(row => row.cpu)])),
                    scans: final.scans - initial.scans, uploads: final.uploads - initial.uploads, shadowGenerations: final.shadows - initial.shadows, glError: final.glError };
            },
            async capture(version) {
                select(version); for (let i = 0; i < warmup; i++) { await frame(); render(); }
                const previous = [], draws = []; let shadowDraws = 0;
                s.scene.traverse(mesh => {
                    if (!mesh.isMesh) return; const before = mesh.onBeforeRender, shadow = mesh.onBeforeShadow; previous.push([mesh, before, shadow]);
                    mesh.onBeforeRender = function(...args) { draws.push({ name: mesh.name, instances: mesh.count ?? 1,
                        triangles: (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 }); return before.apply(this, args); };
                    mesh.onBeforeShadow = function(...args) { shadowDraws++; return shadow.apply(this, args); };
                });
                try { render(); } finally { for (const [mesh, before, shadow] of previous) { mesh.onBeforeRender = before; mesh.onBeforeShadow = shadow; } }
                const gl = s.renderer.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let difference = null;
                if (version === 'baseline') referencePixels = pixels;
                else {
                    const histogram = new Uint32Array(256); let sum = 0, changed = 0, maximum = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        let pixelError = 0;
                        for (let c = 0; c < 3; c++) { const error = Math.abs(pixels[i + c] - referencePixels[i + c]); sum += error; pixelError = Math.max(pixelError, error); }
                        histogram[pixelError]++; changed += Number(pixelError > 0); maximum = Math.max(maximum, pixelError);
                    }
                    const count = pixels.length / 4; let cumulative = 0, p99 = 0;
                    while (p99 < 255 && (cumulative += histogram[p99]) < count * .99) p99++;
                    difference = { pixels: count, changed, meanChannelError: sum / (count * 3), maximumChannelError: maximum,
                        p99PixelError: p99, pixelsOver8: histogram.slice(9).reduce((a, b) => a + b, 0) };
                }
                return { ...metrics(), draws, shadowDraws, difference };
            },
            async movingCpu(version, repeat) {
                clearGroups(); soil.visible = false; s.fields.group.visible = true; sun.shadow.map = grassShadow;
                s.setConfiguration('distance'); s.setDistanceScale(.5); s.setPose('border'); await s.setExperiment(version);
                const position = s.camera.position.clone();
                for (let i = 0; i < 15; i++) { await frame(); render(); }
                const before = s.getSnapshot(), cpu = []; clock = Math.max(clock, performance.now());
                for (let i = 0; i < 60; i++) {
                    await frame(); s.camera.position.set(position.x + (i + 1) * .04, position.y, position.z - (i + 1) * .03);
                    cpu.push(render());
                }
                const after = s.getSnapshot();
                return { version, repeat, cpu, scans: after.selection.scans - before.selection.scans,
                    selectionCpuMs: after.selection.totalCpuMs - before.selection.totalCpuMs,
                    batchCpuMs: after.fields.totalApplyMilliseconds - before.fields.totalApplyMilliseconds,
                    uploads: after.fields.instanceUploads - before.fields.instanceUploads,
                    shadowGenerations: after.shadows.generations - before.shadows.generations, glError: after.glError };
            },
            async restore() { clearGroups(); soil.removeFromParent(); soil.children.forEach(mesh => mesh.dispose()); emptyShadow.dispose();
                sun.shadow.map = grassShadow; s.fields.group.visible = true; await s.setExperiment('baseline'); s.setConfiguration('distance'); s.setDistanceScale(1); s.setPose('front'); s.step(); }
        };
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), viewport: [innerWidth, innerHeight],
            pixelRatio: s.renderer.getPixelRatio(), versions, samples, warmup,
            method: 'Six paired rounds, 30 samples per variant and soil per round. Pre-uploaded copies of real batches, interleaved in the same RAF with rotating/reversed order. 90 startup frames per view/variant; 120 warmup cycles before round one, then six before each remaining round. Hardware GPU queries, matched cached grass/soil shadows; helpers hidden. CPU motion uses real production selection and batches. 95% confidence intervals use round means; no outlier filtering.' };
    }, { versions, samples, warmup });
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility: hidden !important; }' });
    const report = { metadata: { ...metadata, stage, rounds, browser: browser.version(), date: new Date().toISOString() }, comparisons: {}, cpuMotion: [], errors };
    for (const scenario of scenarios) for (const pose of poses) {
        const key = scenario + '_' + pose; console.log('[GrassExperiments] ' + key);
        const setup = await page.evaluate(({ scenario, pose }) => window.__grassExperiments.prepare(scenario, pose), { scenario, pose });
        expect(errors).toEqual([]); const blocks = [];
        for (let round = 0; round < rounds; round++) {
            const block = await page.evaluate(round => window.__grassExperiments.run(round), round); blocks.push(block);
            expect(block.glError).toBe(0); expect(block.scans).toBe(0); expect(block.uploads).toBe(0); expect(block.shadowGenerations).toBe(0);
        }
        const results = Object.fromEntries(versions.map(version => [version, {
            totalGpu: summary(blocks.map(block => mean(block.gpu[version]))),
            aboveSoilGpu: summary(blocks.map(block => mean(block.gpu[version]) - mean(block.gpu.soil))),
            savedFromBaselineGpu: summary(blocks.map(block => mean(block.gpu.baseline) - mean(block.gpu[version]))),
            cpu: summary(blocks.map(block => mean(block.cpu[version])))
        }]));
        report.comparisons[key] = { scenario, pose, setup, blocks, results, captures: {} };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
        for (const version of versions) {
            const capture = await page.evaluate(version => window.__grassExperiments.capture(version), version);
            report.comparisons[key].captures[version] = capture;
            await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
            expect(capture.glError).toBe(0); expect(capture.shadowDraws).toBe(0);

            await page.screenshot({ path: path.join(output, key + '_' + version + '.png') });
        }
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
    }
    for (let repeat = 0; repeat < 3; repeat++) for (const version of versions) {
        const result = await page.evaluate(({ version, repeat }) => window.__grassExperiments.movingCpu(version, repeat), { version, repeat });
        report.cpuMotion.push(result); expect(result.scans).toBeGreaterThan(0); expect(result.scans).toBeLessThan(30);
        expect(result.shadowGenerations).toBe(0); expect(result.glError).toBe(0);
    }
    await page.evaluate(() => window.__grassExperiments.restore()); expect(errors).toEqual([]);
    await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
    await writeGrassLod4ExperimentsReport(output, report);
    await writeGrassExperimentsIndex(path.dirname(output));
});
