// Compare LOD4's 2 m/1 m border cards against live borders and LOD2 at fixed cameras.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_variants', process.env.GRASS_LOD4_PHASE || 'new');
const rounds = Number(process.env.GRASS_LOD4_BENCHMARK_ROUNDS || 3);
const treatments = ['LOD2', 'LOD4-leaves', 'LOD4-cards'];
const poseNames = process.env.GRASS_LOD4_BENCHMARK_POSES?.split(',') || ['one_overview', 'all_nine', 'closeup'];

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD4 compatible variants and border strategies hardware comparison', async ({ page, browser }) => {
    test.skip(process.env.GRASS_LOD4_BENCHMARK !== '1', 'Opt in with GRASS_LOD4_BENCHMARK=1.');
    test.setTimeout(300000); await mkdir(output, { recursive: true }); const errors = [], poses = {};
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?lod=LOD4&canopyBorder=leaves#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness); await page.mouse.move(30, 30);
    const metadata = await page.evaluate(async () => {
        const s = window.__grassLitterScene;
        const THREE = await import('three');
        if (!s.setCanopyBorder) throw Error('Missing LOD4 border strategy API.');
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer), frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const apply = treatment => {
            s.setCanopyBorder(treatment === 'LOD4-cards' ? 'cards' : 'leaves');
            s.setLod(treatment === 'LOD2' ? 'LOD2' : 'LOD4');
        };
        window.__canopyVariantsBenchmark = {
            prepare(pose) {
                s.setMode('all'); s.setLitterTreatment('merged'); s.setLod('LOD2');
                s.setFieldCount(pose === 'all_nine' ? 9 : 1);
                s.setView(pose === 'closeup' ? 5 : 0);
                if (pose === 'all_nine') s.frameFields();
                return s.getSnapshot();
            },
            async capture(treatment) {
                apply(treatment); for (let i = 0; i < 30; i++) await frame();
                return s.getSnapshot();
            },
            async run(treatment) {
                apply(treatment); for (let i = 0; i < 60; i++) await frame();
                const before = timer.getDiagnostics(), first = before.submissionSequence;
                const generation = s.getSnapshot().shadows.generations, intervals = []; let previous = performance.now();
                for (let i = 0; i < 120; i++) {
                    await frame(); const now = performance.now(); intervals.push(now - previous); previous = now;
                    if (s.getSnapshot().shadows.generations !== generation || s.renderer.shadowMap.needsUpdate || s.lighting.sun.shadow.needsUpdate)
                        throw Error('Shadow update inside measured block.');
                }
                const last = timer.getDiagnostics().submissionSequence;
                for (let i = 0; i < 120 && timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last).length < last - first; i++) await frame();
                const gpu = timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last).map(sample => sample.ms);
                const diagnostics = timer.getDiagnostics();
                if (!before.active || !diagnostics.active || before.disjointCount !== diagnostics.disjointCount || gpu.length !== 120 || last - first !== 120)
                    throw Error('Invalid GPU block: ' + JSON.stringify({ before, diagnostics, first, last, count: gpu.length }));
                return { treatment, gpu, intervals, diagnostics, state: s.getSnapshot() };
            }
        };
        const textures = new Map(), materials = new Set(Object.values(s.canopy.materials));
        s.canopy.group.traverse(mesh => { if (mesh.isMesh) materials.add(mesh.material); });
        function collect(texture) {
            if (!texture?.isTexture || !/^(GrassFieldCanopy|GrassCanopyBorder)/.test(texture.name)) return;
            const image = texture.image, channels = texture.format === THREE.RedFormat ? 1 : texture.format === THREE.RGFormat ? 2 : 4;
            const componentBytes = texture.type === THREE.UnsignedByteType ? 1 : texture.type === THREE.HalfFloatType ? 2 : 4;
            let width = image.width, height = image.height, texels = 0;
            do { texels += width * height; if (!texture.generateMipmaps || width === 1 && height === 1) break;
                width = Math.max(1, width >> 1); height = Math.max(1, height >> 1); } while (true);
            textures.set(texture.uuid, { name: texture.name, width: image.width, height: image.height,
                format: texture.format, type: texture.type, mipmaps: texture.generateMipmaps,
                bytes: texels * channels * componentBytes, cpuBytes: image.data?.byteLength || 0 });
        }
        for (const mode of ['all','grass']) {
            s.setMode(mode); s.setCanopyBorder('cards'); s.setLod('LOD4'); s.lighting.render(0);
            for (const material of materials) {
                for (const value of Object.values(material)) collect(value);
                for (const uniform of Object.values(s.renderer.properties.get(material).uniforms || {})) collect(uniform?.value);
            }
        }
        s.setMode('all');
        const inventory = [...textures.values()];
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), viewport: [innerWidth, innerHeight],
            pixelRatio: s.renderer.getPixelRatio(), msaa: s.lighting.pipeline.composer.renderTarget1.samples,
            shadowAutoUpdate: s.renderer.shadowMap.autoUpdate, canopy: s.canopy.getSnapshot(),
            memory: { textures: inventory, bytes: inventory.reduce((sum,item) => sum + item.bytes,0), cpuBytes: inventory.reduce((sum,item) => sum + item.cpuBytes,0),
                scope: 'Resident LOD4 canopy maps, both layer modes and tile variants, border-card maps and external shadow visibility; excludes common scene resources and driver allocation overhead.' },
            description: 'Three-way rotating order; 60 warm-up frames and 120 GPU samples per block. Includes post-processing and cached shadow sampling. No loading, refreshes or outlier removal.' };
    });
    Object.assign(metadata, { rounds, browser: browser.version(), date: new Date().toISOString(), treatments });
    metadata.sourceHashes = {};
    for (const filename of [
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2FieldCanopy.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyMaterial.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyBorderCards.js',
        'src/graphics/shaders/materials/grass/grass_field_canopy_coverage.frag.glsl',
        'src/graphics/shaders/materials/grass/grass_field_canopy_color.frag.glsl',
        'src/graphics/shaders/materials/grass/grass_field_canopy_sampling.frag.glsl',
        'src/graphics/shaders/materials/grass/grass_field_canopy_distance.frag.glsl'
    ]) metadata.sourceHashes[filename] = createHash('sha256').update(await readFile(filename)).digest('hex');
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    expect(metadata.pixelRatio).toBe(1); expect(metadata.msaa).toBe(4); expect(metadata.shadowAutoUpdate).toBe(false);
    for (const pose of poseNames) {
        const camera = await page.evaluate(pose => window.__canopyVariantsBenchmark.prepare(pose), pose), blocks = [];
        for (let round = 0; round < rounds; round++) {
            const order = treatments.map((_, index) => treatments[(index + round) % treatments.length]);
            for (const treatment of order) {
                const block = await page.evaluate(treatment => window.__canopyVariantsBenchmark.run(treatment), treatment);
                block.round = round; blocks.push(block);
                expect(block.state.position).toEqual(camera.position); expect(block.state.quaternion).toEqual(camera.quaternion);
                expect(block.state.cursorDistance.active).toBe(false);
                expect(block.state.shadows.source).toBe('LOD2'); expect(block.state.shadows.cached).toBe(true);
            }
            console.log('[CanopyVariants] ' + pose + ' round ' + (round + 1) + ': ' + blocks.filter(block => block.round === round)
                .map(block => block.treatment + ' ' + summarizeBenchmarkTimings(block.gpu).averageMs.toFixed(3) + ' ms').join(' / '));
        }
        poses[pose] = { camera, blocks, captures: {}, results: Object.fromEntries(treatments.map(treatment =>
            [treatment, summarizeBenchmarkTimings(blocks.filter(block => block.treatment === treatment).flatMap(block => block.gpu))])) };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify({ metadata, poses, errors }, null, 2));
    }
    for (const [pose, result] of Object.entries(poses)) {
        await page.evaluate(pose => window.__canopyVariantsBenchmark.prepare(pose), pose);
        for (const treatment of treatments) {
            result.captures[treatment] = await page.evaluate(treatment => window.__canopyVariantsBenchmark.capture(treatment), treatment);
            await page.screenshot({ path: path.join(output, pose + '_' + treatment + '.png') });
        }
    }
    await writeFile(path.join(output, 'benchmark.json'), JSON.stringify({ metadata, poses, errors }, null, 2));
    expect(errors).toEqual([]);
});
