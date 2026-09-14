// Same-pose opaque reflection A/B, with separate fresh-browser performance passes.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { sourceFiles, snapshotFiles, baselineInputs, resolvePoses, assertPoseMatches, assertAppliedBaseline } from '../lighting_configurations/Inputs.mjs';
import { captureBaselines } from '../lighting_configurations/capture_baselines/CaptureBaselines.mjs';
import { withGameBrowser } from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import { readGameEvidence, setGamePose, settleGameFrames } from '../lighting_configurations/capture_baselines/GameEvidence.mjs';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { collectShadowFrameSamples, summarizeShadowFrames, comparableShadowSettings } from '../../shadows/streamed/FrameSamples.mjs';
import { writeJson, digest, listFiles } from '../../../baking/Files.mjs';
import { outputPath } from './Baseline.mjs';
import { rawRadiance } from './RawRadiance.mjs';

async function applyVariant(page, { reflections, ao }) {
    return page.evaluate(async ({ reflections, ao }) => {
        const { applyBuildingSurfaceReflections } = await import('/src/graphics/visuals/buildings/BuildingSurfaceReflections.js');
        const {engine:e,sm}=window.__busSim;
        if(window.__materialResponse)window.__materialResponse.ao=ao;
        return applyBuildingSurfaceReflections(sm.current.city.buildings.group,reflections,e.lightingSettings.ibl.enabled?e.lightingSettings.ibl.envMapIntensity:0);
    },{ reflections, ao });
}

export async function buildingReviewCapture(ctx) {
    if(ctx.publish||!ctx.options.output)throw new Error('New output required; diagnostic only');
    if(ctx.id.endsWith('/material-response-capture')&&!ctx.options.capture)throw new Error('Authenticated capture required for material response study');
    const output=outputPath(ctx.root,ctx.options.output),started=Date.now();
    await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    const materialStudy=!!ctx.options.capture,validation=ctx.options.phase==='validation';
    let sourcePrepared=null;
    if(materialStudy){
        const input=outputPath(ctx.root,ctx.options.capture);
        await authenticated(path.join(input,'capture_receipt.json'));
        sourcePrepared=JSON.parse(await readFile(path.join(input,'prepared.json'),'utf8'));
    }
    const poses=materialStudy?sourcePrepared.poses.filter(p=>validation||['pose_02','pose_03'].includes(p.id))
        :resolvePoses(JSON.parse(await readFile(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/poses.json'),'utf8')));
    if(ctx.options.pose) poses.push({id:'pose_custom',busId:'bus_custom',pose:JSON.parse(await readFile(path.resolve(ctx.root,ctx.options.pose),'utf8'))});
    const baseline=materialStudy?structuredClone(sourcePrepared.baseline):{id:'defaults',expectedMode:'baked',expectedSunProfile:'ai527.sun.az045.el55',readinessTimeoutSeconds:240,settleFrames:120,storage:{},
        settingsPolicy:'Repository lighting defaults, opaque reflections Off control, ACESFilmic, identical exposure/AO/textures/roughness. No publication.'};
    if(materialStudy){
        baseline.id=path.basename(output);baseline.expectedMode='baked';
        baseline.settingsPolicy='Authenticated fixed bake/display controls; opaque building reflections x material AO. AO bypass is synchronous per render and restored before the next engine update.';
        if(validation)delete baseline.storage['bus_sim.buildingWindowVisuals.v1'];
        else baseline.storage['bus_sim.buildingWindowVisuals.v1']={...baseline.storage['bus_sim.buildingWindowVisuals.v1'],surfaces:{reflections:false}};
    }else baseline.storage['bus_sim.buildingWindowVisuals.v1']={surfaces:{reflections:false}};
    const variants=[{id:'original',reflections:false,ao:true},{id:'reflections',reflections:true,ao:true}];
    if(materialStudy&&!validation)variants.push({id:'no_ao',reflections:false,ao:false},{id:'reflections_no_ao',reflections:true,ao:false});
    const source=await snapshotFiles(ctx.root,await sourceFiles(ctx.root));
    const prepared={schemaVersion:1,experimentId:'building-reflection-review',runId:path.basename(output),runRoot:output,baseline,poses,
        viewport:{width:1920,height:1080},source:{files:source,sha256:digest(source)},bakes:await baselineInputs(ctx.root,baseline),configuration:[],
        engineRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:ctx.root,encoding:'utf8'}).trim(),startedAt:new Date(started).toISOString()};
    const report={schemaVersion:1,poses,variants,materialStudy,validation,runs:[],conditions:'Two fresh sequential browsers; two balanced passes per variant/browser; 60 warmup and 240 measured frames. Completed GPU queries joined by submission ID. Shader compilation and streaming settle before timing.',
        memoryPolicy:'No new textures, geometry or render targets; reuses the resident global PMREM. Counts and shader programs measured after warmup; driver allocation is not measured.'};
    let common=null,identity=null;
    async function measure(page,item,cold) {
        if(validation)await page.evaluate(async()=>{
            const {getResolvedBuildingWindowVisualsSettings}=await import('/src/graphics/visuals/buildings/BuildingWindowVisualsSettings.js');
            if(!getResolvedBuildingWindowVisualsSettings().surfaces.reflections)throw new Error('Corrected default is not active');
        });
        if(materialStudy&&!validation)await page.evaluate(()=>{
            const {engine:e,sm}=window.__busSim,materials=new Map();
            sm.current.city.buildings.group.traverse(o=>{
                if(!o.isMesh)return;
                for(let p=o;p;p=p.parent)if(p.name==='windows')return;
                for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.isMeshStandardMaterial&&m.aoMap
                    &&!m.transparent&&!m.transmission&&!m.userData?.buildingWindowGlass&&!m.userData?.windowInterior
                    &&m.userData?.iblNoAutoEnvMapIntensity===true)materials.set(m,m.aoMapIntensity);
            });
            if(!materials.size)throw new Error('No opaque building AO textures');
            const renderer=e.renderer,original=renderer.render,state={ao:true,materials,original};
            window.__materialResponse=state;
            renderer.render=function(...args){
                if(state.ao)return original.apply(this,args);
                try{for(const m of materials.keys())m.aoMapIntensity=0;return original.apply(this,args);}
                finally{for(const [m,intensity]of materials)m.aoMapIntensity=intensity;}
            };
        });
        const before=await page.evaluate(readGameEvidence);
        const settings=comparableShadowSettings(before),hashes=JSON.stringify(before.sourceHashes);
        if(common&&common!==settings)throw new Error('Lighting/AO/exposure drift between runs');common=settings;
        if(identity&&identity!==hashes)throw new Error('Bake identity changed between runs');identity=hashes;
        const modelBefore=await page.evaluate(()=>{
            const found=new Set();window.__busSim.sm.current.city.buildings.group.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)found.add(m);});
            return [...found].map(m=>[m.uuid,m.version,m.color?.toArray(),m.roughness,m.metalness,m.aoMapIntensity,m.normalScale?.toArray(),m.map?.uuid]);
        });
        for(let pass=0;pass<2;pass++)for(const variant of ((pass+cold)%2?[...variants].reverse():variants)) {
            const applied=await applyVariant(page,variant);
            if(!applied.materials)throw new Error('No eligible building surfaces');
            await page.evaluate(settleGameFrames,60);
            const samples=await page.evaluate(collectShadowFrameSamples,{sampleFrames:240,warmupFrames:60});
            const evidence=await page.evaluate(readGameEvidence);
            assertAppliedBaseline(evidence,baseline.expectedSunProfile);assertPoseMatches(item.pose,evidence.actualPose);
            if(comparableShadowSettings(evidence)!==common||JSON.stringify(evidence.sourceHashes)!==identity)throw new Error('Toggle changed lighting/source identity');
            const summary=summarizeShadowFrames(samples.frames);
            if(cold===0&&pass===0)await page.locator('canvas').first().screenshot({path:path.join(output,`${item.id}-${variant.id}.png`)});
            report.runs.push({pose:item.id,cold,pass,variant:variant.id,applied,summary,samples,evidence});
            await writeJson(path.join(output,'review.json'),report);
            ctx.log.line(ctx.id,`${item.id} ${variant.id}, browser ${cold+1} pass ${pass+1}: GPU ${summary.gpuMs.median.toFixed(2)} ms`);
        }
        await applyVariant(page,{reflections:validation,ao:true});
        if(materialStudy&&!validation)await page.evaluate(()=>{
            const state=window.__materialResponse;
            window.__busSim.engine.renderer.render=state.original;
            for(const [m,intensity]of state.materials)if(m.aoMapIntensity!==intensity)throw new Error('AO diagnostic failed to restore authored intensity');
            delete window.__materialResponse;
        });
        const modelAfter=await page.evaluate(()=>{
            const found=new Set();window.__busSim.sm.current.city.buildings.group.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)found.add(m);});
            return [...found].map(m=>[m.uuid,m.version,m.color?.toArray(),m.roughness,m.metalness,m.aoMapIntensity,m.normalScale?.toArray(),m.map?.uuid]);
        });
        if(JSON.stringify(modelBefore)!==JSON.stringify(modelAfter))throw new Error('Material identity, shader version or authored inputs changed');
        if(cold===0&&item.id==='pose_custom')await rawRadiance(page,path.join(output,'custom_raw'),{materialDiagnostics:true});
        return {benchmark:true};
    }
    await writeJson(path.join(output,'prepared.json'),prepared);
    await captureBaselines(ctx,prepared,{collectMetrics:(page,item)=>measure(page,item,0)});
    await withGameBrowser(ctx,prepared.viewport,async(page,url)=>{
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        const ordered=[...poses].filter(p=>p.id!=='pose_custom').reverse();
        await page.addInitScript(storage=>{for(const [key,value]of Object.entries(storage))localStorage.setItem(key,JSON.stringify(value));},baseline.storage);
        await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(ordered[0].pose))}`);
        await page.waitForFunction(()=>{const d=window.__busSim?.engine?.getBakedLightingDebugInfo();return d?.status.effectiveMode==='baked'&&d.receiverLightmaps.activationBlend===1&&d.view?.ready!==false;});
        await page.evaluate(async()=>{
            const {ensureGlobalPerfBar}=await import('/src/graphics/gui/perf_bar/PerfBar.js');ensureGlobalPerfBar().setHidden(true);
            const canvas=window.__busSim.engine.canvas;
            for(const el of document.body.querySelectorAll('*'))if(el!==canvas&&!el.contains(canvas)&&!['SCRIPT','STYLE','LINK'].includes(el.tagName))el.style.visibility='hidden';canvas.style.visibility='visible';
        });
        for(const item of ordered){await page.evaluate(setGamePose,item.pose);await page.evaluate(settleGameFrames,120);await measure(page,item,1);}
        if(errors.length)throw new Error(errors.join('\n'));
    });
    report.summary=poses.flatMap(pose=>variants.map(({id:variant})=>{
        const runs=report.runs.filter(r=>r.pose===pose.id&&r.variant===variant);
        return {pose:pose.id,variant,passes:runs.length,...summarizeShadowFrames(runs.flatMap(r=>r.samples.frames))};
    }));
    report.seconds=(Date.now()-started)/1000;await writeJson(path.join(output,'review.json'),report);
    const file=path.join(output,'capture_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,diagnosticOnly:true,seconds:report.seconds},await listFiles(output)),file);
}
