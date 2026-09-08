// Optional fixed-pose visual/performance evidence for all shipped bus material families.
import test, { expect } from '@playwright/test';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { BUS_CATALOG } from '../../../src/app/vehicle/buses/BusCatalog.js';
const config = await readFile('tools/baking/blender.local.json', 'utf8').then(JSON.parse).catch(() => ({}));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video: 'off', trace: 'off' });
const inputs = JSON.parse(await readFile('tests/fixtures/lighting/ai550_camera_poses.json', 'utf8'));
const root = 'tests/artifacts/screens/ai550_bus_diffuse_probes/comparison-final';
const warm = async (page, count = 60) => page.evaluate(count => new Promise(resolve => {
    let n = 0; function frame() { if (++n > count) resolve(); else requestAnimationFrame(frame); } frame();
}), count);

test('AI550: compare bus families, supplied views and moving coverage under identical lighting', async ({ page }) => {
    test.skip(process.env.AI550_CAPTURE_COMPARISONS !== '1', 'Explicit production visual/performance capture');
    test.setTimeout(2700_000); await mkdir(root, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    const models=(process.env.AI550_MODELS??BUS_CATALOG.map(bus=>bus.id).join(',')).split(',');
    for(const model of models)expect(BUS_CATALOG.map(bus=>bus.id)).toContain(model);
    const previous=await readFile(`${root}/measurements.json`,'utf8').then(JSON.parse).catch(()=>({records:[]}));
    const errors = [], records = process.env.AI550_MODELS ? previous.records.filter(r=>!models.includes(r.model)) : []; let groundDelta = 0;
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ mode: 'auto',
        shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { indirect: true }, bus: { enabled: false } })));
    async function write() { await writeFile(`${root}/measurements.json`, JSON.stringify({ records, errors }, null, 2)); }
    async function applyLighting(value) {
        await page.evaluate(async value=>{
            const {OptionsState}=await import('/src/states/OptionsState.js');
            const {engine,sm}=window.__busSim;new OptionsState(engine,sm)._applyDraft({lighting:value});
        },value);
    }
    async function feature(mode) {
        if (mode.startsWith('off')) mode = 'off';
        await page.evaluate(async mode => {
            const e = window.__busSim.engine;
            await e.setBakedLightingSettings({ ...e.bakedLightingSettings, bus: { enabled: mode !== 'off',
                materials: mode !== 'probes', probes: mode === 'probes' || mode === 'combined' } });
        }, mode);
        await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().status.effectiveMode), { timeout: 240_000 }).toBe('baked');
        await warm(page);
    }
    async function pose(value) {
        value = structuredClone(value); value.bus.transform.position.y += groundDelta;
        await page.evaluate(value => {
            const s = window.__busSim.sm.current; s._gameplayPose = value;
            s._applyGameplayPoseVehicleTransform(); s._configureGameplayPoseCamera();
        }, value); await warm(page);
    }
    async function measure(model, id, mode) {
        const measurement = await page.evaluate(async () => {
            const { engine: e, sm } = window.__busSim, frames = [], gpu = [];
            let previous = performance.now();
            await new Promise(resolve => {
                function frame(now) { frames.push(now-previous); previous=now;
                    const ms=e._gpuFrameTimer?.getLastMs(); if (Number.isFinite(ms)) gpu.push(ms);
                    if(frames.length>=120)resolve();else requestAnimationFrame(frame);
                } requestAnimationFrame(frame);
            });
            const stats = values => { const sorted=values.slice(5).sort((a,b)=>a-b);return sorted.length ? { median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],samples:sorted.length } : null; };
            const materials = new Map();
            sm.current.busModel.traverse(o => { if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]) materials.set(m.uuid,{name:m.name,type:m.type,color:m.color?.toArray(),roughness:m.roughness,metalness:m.metalness,environment:!!m.envMap}); });
            const d=e.getBakedLightingDebugInfo();
            return { frames:stats(frames),gpu:stats(gpu),cpuLighting:'not measured: no separate lighting CPU timer',
                renderer:{memory:{...e.renderer.info.memory},render:{...e.renderer.info.render},programs:e.renderer.info.programs.length},
                graphics:{shadows:e.shadowSettings,ao:e.ambientOcclusionSettings,aa:e.antiAliasingSettings,bloom:e.bloomSettings,colorGrading:e.colorGradingSettings},
                lighting:e.lightingSettings,baked:{status:d.status,settings:d.settings,busLighting:d.busLighting??{active:false,probeCount:0,residentCpuBytes:0,residentGpuBytes:0},
                    receiverLightmaps:{state:d.receiverLightmaps.state,residentCpuBytes:d.receiverLightmaps.residentCpuBytes,residentGpuBytes:d.receiverLightmaps.residentGpuBytes}},materials:[...materials.values()],
                workload:{dynamicObjects:e.getDynamicIlluminationObjects().length,viewport:[e.canvas.width,e.canvas.height],pixelRatio:e.renderer.getPixelRatio()},
                rendererName:e.renderer.getContext().getParameter(e.renderer.getContext().getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? e.renderer.getContext().RENDERER) };
        });
        records.push({ model, id, mode, ...measurement }); await write();
        await page.locator('canvas').first().screenshot({ path: `${root}/${model}-${id}-${mode}.png` });
        expect(measurement.baked.status.effectiveMode).toBe('baked');
        if(mode === 'combined' || mode === 'probes')expect(measurement.baked.busLighting.active).toBe(true);
        if(model==='city'&&(mode==='materials'||mode==='combined'))expect(measurement.materials.find(m=>m.name==='paint')?.type).toBe('MeshPhysicalMaterial');
        console.log(`[AI550] ${model} ${id} ${mode}: GPU ${measurement.gpu?.median.toFixed(2)} ms`);
    }
    // The pre-change coordinator remains a measurable baseline, not an assumed saving.
    const referenceRoot='tests/artifacts/screens/ai550_bus_diffuse_probes/comparison';
    const reference=await readFile(`${referenceRoot}/measurements.json`,'utf8').then(JSON.parse).then(v=>v.records.find(r=>r.mode==='original-baseline')).catch(()=>null);
    if(reference) {
        if(!records.some(r=>r.mode==='original-baseline'))records.push({...reference,retainedFrom:`${referenceRoot}/measurements.json`});await write();
        await copyFile(`${referenceRoot}/city-pose_01-original-baseline.png`,`${root}/city-pose_01-original-baseline.png`);
    } else {
        const originalRuntime=execFileSync('git',['show','HEAD:src/graphics/illumination/baked_lighting/BakedLightingRuntime.js'],{encoding:'utf8'});
        const runtimeRoute='**/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js';
        await page.route(runtimeRoute,r=>r.fulfill({contentType:'text/javascript',body:originalRuntime}));
        await page.goto('/?coreTests=0&gameplayPose='+encodeURIComponent(JSON.stringify(inputs.poses[0].pose)));
        await page.waitForFunction(()=>window.__busSim?.sm?.current?.busAnchor,null,{timeout:120_000});
        await expect.poll(()=>page.evaluate(()=>window.__busSim.engine.getBakedLightingDebugInfo().status.effectiveMode),{timeout:240_000}).toBe('baked');
        await warm(page);await measure('city',inputs.poses[0].id,'original-baseline');
        await page.unroute(runtimeRoute);
    }
    for (const model of models) {
        const initial = structuredClone(inputs.poses[0].pose); initial.bus.modelId = model;
        await page.goto('/?coreTests=0&gameplayPose=' + encodeURIComponent(JSON.stringify(initial)));
        await page.waitForFunction(() => window.__busSim?.sm?.current?.busAnchor, null, { timeout: 120_000 });
        await page.evaluate(async () => { await window.__busSim.sm.current.busModel.userData.readyPromise; });
        groundDelta = model === 'city' ? 0 : await page.evaluate(async () => {
            const THREE=await import('three');const root=window.__busSim.sm.current.busAnchor;
            root.updateMatrixWorld(true);return .02-new THREE.Box3().setFromObject(root).min.y;
        });
        await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().status.effectiveMode), { timeout: 240_000 }).toBe('baked');
        const cameras = model === 'city' ? inputs.poses : [inputs.poses[0], inputs.poses[4]];
        // Group by mode so repeated cameras do not repeatedly rebuild shadow ownership.
        for (const mode of model === 'city' ? ['off-cold','materials','combined','off-restored'] : ['off-cold','materials','probes','combined','off-restored']) {
            await feature(mode);
            for (const camera of cameras) {
                const value=structuredClone(camera.pose);value.bus.modelId=model;await pose(value);
                await measure(model,camera.id,mode);
            }
        }
        await feature('combined'); await pose(initial);
        const motion = await page.evaluate(async () => {
            const {engine:e,sm}=window.__busSim,s=sm.current,base=s.busAnchor.position.clone(),result=[];
            for(let i=0;i<=24;i++) {
                s.busAnchor.position.set(base.x+i*.5,base.y,base.z);s.busAnchor.updateMatrixWorld(true);
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                const d=e.getBakedLightingDebugInfo();result.push({x:s.busAnchor.position.x,active:d.busLighting.active,mode:d.status.effectiveMode});
            }
            s.busAnchor.position.copy(base);s.busAnchor.updateMatrixWorld(true);return result;
        });
        records.push({model,motion}); await write(); expect(motion.every(v=>v.active&&v.mode==='baked')).toBe(true);
        if (model === 'city') {
            for (const offset of [0,3,6,9,12]) {
                const moving=structuredClone(initial);moving.bus.transform.position.x+=offset;moving.camera.position.x+=offset;
                await pose(moving);
                await page.locator('canvas').first().screenshot({path:`${root}/city-motion-${offset}.png`});
            }
            const outside=structuredClone(initial);outside.bus.transform.position.x+=300;outside.camera.position.x+=300;
            await pose(outside);await measure(model,'outside-coverage','combined');await pose(initial);
        }
        if (model===models[0]&&!records.some(record=>record.interactions?.length===3&&record.displayChangesPreservedProbes)) {
            const saved=await page.evaluate(()=>structuredClone(window.__busSim.engine.lightingSettings));
            await applyLighting({...saved,exposure:1.3,toneMapping:'agx'});
            await warm(page);
            expect(await page.evaluate(()=>window.__busSim.engine.getBakedLightingDebugInfo().busLighting.active)).toBe(true);
            const interactions=[];
            for (const field of ['sunIntensity','hemiIntensity','ibl']) {
                // Validate source transactions while rendering is stopped. The live
                // fallback's unrelated cold shader compilation is not this assertion.
                await page.evaluate(()=>window.__busSim.engine.stop());
                await applyLighting({...saved,[field]:field==='ibl'?{...saved.ibl,envMapIntensity:saved.ibl.envMapIntensity+.1}:saved[field]+.2});
                await page.evaluate(()=>window.__busSim.engine.refreshBakedLighting());
                const fallback=await page.evaluate(()=>{const d=window.__busSim.engine.getBakedLightingDebugInfo();return{status:d.status,bus:d.busLighting};});
                expect(fallback.bus.active).toBe(false);expect(fallback.bus.activeMaterials).toBeGreaterThan(0);
                expect(fallback.status.causeState).toBe('stale');
                await applyLighting(saved);
                await page.evaluate(async()=>{const e=window.__busSim.engine;await e.refreshBakedLighting();e.start();});
                await expect.poll(()=>page.evaluate(()=>window.__busSim.engine.getBakedLightingDebugInfo().busLighting.active),{timeout:240_000}).toBe(true);
                interactions.push({field,fallback,restored:true});console.log(`[AI550] ${field}: rejected mismatch and restored compatible probes`);
            }
            records.push({model,interactions,displayChangesPreservedProbes:true});await write();
        }
    }
    expect(errors).toEqual([]);
});
