// Compare full LOD2 leaves with the raised opaque LOD4 canopy at identical cameras.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
async function gpuState() {
    try {
        const { stdout } = await execFileAsync('nvidia-smi', ['--query-gpu=pstate,clocks.current.graphics,utilization.gpu,memory.used,temperature.gpu,power.draw', '--format=csv,noheader'], { windowsHide: true, timeout: 3000 });
        return stdout.trim();
    } catch { return null; }
}
import { summarizeBenchmarkTimings } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2',process.env.GRASS_LOD4_BENCHMARK_FOLDER||'lod4_canopy');
const rounds = Number(process.env.GRASS_LOD4_BENCHMARK_ROUNDS||6);
const treatments = process.env.GRASS_LOD4_BENCHMARK_LODS?.split(',') || ['LOD2', 'LOD4'];
const poseNames = process.env.GRASS_LOD4_BENCHMARK_POSES?.split(',')||['one_overview','one_rear','closeup','all_nine','one_then_nine'];
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
test('Grass geometry versus canopy hardware benchmark', async ({ page, browser }) => {
    test.skip(process.env.GRASS_LOD4_BENCHMARK !== '1', 'Opt in with GRASS_LOD4_BENCHMARK=1.');
    test.setTimeout(300000); await mkdir(output, { recursive: true });
    const errors = [], poses = {};
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-masked-color-1&lod=LOD2#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness); await page.mouse.move(30, 30);
    const metadata = await page.evaluate(async treatments => {
        const s = window.__grassLitterScene;
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer), frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const state = () => s.getSnapshot();
        window.__canopyBenchmark = {
            prepare(pose) {
                s.setMode('all'); s.setLitterTreatment('merged'); s.setLod('LOD2'); s.setFieldCount(pose === 'all_nine' ? 9 : 1);
                s.setView(pose === 'one_rear' ? 2 : pose === 'closeup' ? 5 : 0);
                if (pose === 'all_nine' || pose === 'one_then_nine') s.frameFields();
                if (pose === 'one_then_nine') s.setFieldCount(9);
                return state();
            },
            async capture(treatment) {
                s.setLod(treatment); for (let i = 0; i < 60; i++) await frame();
                return state();
            },
            async run(treatment) {
                s.setLod(treatment); for (let i = 0; i < 60; i++) await frame();
                const before = timer.getDiagnostics(), first = before.submissionSequence;
                const intervals = [], shadowGeneration = state().shadows.generations;
                let lastTime = performance.now();
                for (let i = 0; i < 120; i++) {
                    await frame(); const now = performance.now(); intervals.push(now-lastTime); lastTime=now;
                    if(state().shadows.generations !== shadowGeneration || s.renderer.shadowMap.needsUpdate || s.lighting.sun.shadow.needsUpdate) throw Error('Shadow redraw in measured block.');
                }
                const last = timer.getDiagnostics().submissionSequence;
                for (let i = 0; i < 120 && timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).length < last - first; i++) await frame();
                const gpu = timer.getSamplesSince(0).filter(x => x.submissionSequence > first && x.submissionSequence <= last).map(x => x.ms);
                const diagnostics = timer.getDiagnostics();
                if (!before.active || !diagnostics.active || before.disjointCount !== diagnostics.disjointCount || gpu.length !== 120 || last-first !== 120)
                    throw Error('Invalid GPU block: '+JSON.stringify({before,diagnostics,first,last,count:gpu.length}));
                return {treatment,gpu,intervals,diagnostics,state:state()};
            }
        };
        const gl=s.renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
        return {renderer:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER),viewport:[innerWidth,innerHeight],
            pixelRatio:s.renderer.getPixelRatio(),msaa:s.lighting.pipeline.composer.renderTarget1.samples,
            lods:treatments,layers:'all',litter:'merged',canopy:s.canopy.getSnapshot(),relief:s.relief.getSnapshot(),shadowAutoUpdate:s.renderer.shadowMap.autoUpdate,
            description:'Alternating blocks per treatment and pose (count recorded in metadata), 60 warm-up frames followed by 120 GPU samples. Cached shadow sampling and post-processing included; refreshes and loading excluded. No outliers removed.'};
    }, treatments);
    metadata.rounds=rounds;metadata.browser=browser.version();metadata.date=new Date().toISOString();
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    expect(metadata.pixelRatio).toBe(1);expect(metadata.msaa).toBe(4);expect(metadata.shadowAutoUpdate).toBe(false);
    metadata.sourceHashes={};
    for(const name of ['GrassDebugV2LitterScene.js','GrassDebugV2FieldCanopy.js','GrassDebugV2FieldCanopyBake.js','GrassDebugV2FieldShadows.js','GrassDebugV2CanopyShadows.js','GrassDebugV2LitterSoilSurface.js','GrassDebugV2GroundCutout.js'])
        metadata.sourceHashes[name]=createHash('sha256').update(await readFile('src/graphics/gui/grass_debugger_v2/'+name)).digest('hex');
    for(const name of ['color','lighting','shadow_pars','capture','sampling'])
        metadata.sourceHashes['grass_field_canopy_'+name]=createHash('sha256').update(await readFile('src/graphics/shaders/materials/grass/grass_field_canopy_'+name+'.frag.glsl')).digest('hex');
    for(const pose of poseNames) {
        const camera=await page.evaluate(p=>window.__canopyBenchmark.prepare(p),pose),captures={},blocks=[];
        for(let round=0;round<rounds;round++) {
            for(const treatment of round%2?[...treatments].reverse():treatments) {
                const block=await page.evaluate(t=>window.__canopyBenchmark.run(t),treatment);
                block.round=round;block.gpuState=await gpuState();blocks.push(block);
                expect(block.state.position).toEqual(camera.position);expect(block.state.quaternion).toEqual(camera.quaternion);
                expect(block.state.cursorDistance.active).toBe(false);expect(block.state.lod).toBe(treatment);
                expect(block.state.shadows.source).toBe('LOD2');expect(block.state.shadows.cached).toBe(true);
            }
            console.log('[Canopy] '+pose+' round '+(round+1)+': '+blocks.filter(b=>b.round===round)
                .map(b=>b.treatment+' '+summarizeBenchmarkTimings(b.gpu).averageMs.toFixed(3)+' ms').join(' / '));
        }
        const results=Object.fromEntries(treatments.map(t=>[t,summarizeBenchmarkTimings(blocks.filter(b=>b.treatment===t).flatMap(b=>b.gpu))]));
        poses[pose]={camera,captures,blocks,results};
        await writeFile(path.join(output,'benchmark.json'),JSON.stringify({metadata,poses,errors},null,2));
    }
    // Save matching screenshots after all timed blocks to avoid disturbing GPU clocks mid-run.
    for (const [pose, result] of Object.entries(poses)) {
        await page.evaluate(p=>window.__canopyBenchmark.prepare(p),pose);
        for (const treatment of treatments) {
            result.captures[treatment]=await page.evaluate(t=>window.__canopyBenchmark.capture(t),treatment);
            await page.screenshot({path:path.join(output,'benchmark_'+pose+'_'+treatment+'.png')});
        }
    }
    await writeFile(path.join(output,'benchmark.json'),JSON.stringify({metadata,poses,errors},null,2));
    expect(errors).toEqual([]);
});
