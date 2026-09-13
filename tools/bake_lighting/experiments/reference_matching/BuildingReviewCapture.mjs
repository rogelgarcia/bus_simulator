// Same-pose opaque reflection A/B, with separate fresh-browser performance passes.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { sourceFiles, snapshotFiles, baselineInputs, resolvePoses, assertPoseMatches, assertAppliedBaseline } from '../lighting_configurations/Inputs.mjs';
import { captureBaselines } from '../lighting_configurations/capture_baselines/CaptureBaselines.mjs';
import { withGameBrowser } from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import { readGameEvidence, setGamePose, settleGameFrames } from '../lighting_configurations/capture_baselines/GameEvidence.mjs';
import { receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { collectShadowFrameSamples, summarizeShadowFrames, comparableShadowSettings } from '../../shadows/streamed/FrameSamples.mjs';
import { writeJson, digest, listFiles } from '../../../baking/Files.mjs';
import { outputPath } from './Baseline.mjs';
import { rawRadiance } from './RawRadiance.mjs';

async function applyVariant(page, enabled) {
    return page.evaluate(async enabled => {
        const { applyBuildingSurfaceReflections } = await import('/src/graphics/visuals/buildings/BuildingSurfaceReflections.js');
        const {engine:e,sm}=window.__busSim;
        return applyBuildingSurfaceReflections(sm.current.city.buildings.group,enabled,e.lightingSettings.ibl.enabled?e.lightingSettings.ibl.envMapIntensity:0);
    },enabled);
}

export async function buildingReviewCapture(ctx) {
    if(ctx.publish||!ctx.options.output)throw new Error('New output required; diagnostic only');
    const output=outputPath(ctx.root,ctx.options.output),started=Date.now();
    await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    const poses=resolvePoses(JSON.parse(await readFile(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/poses.json'),'utf8')));
    if(ctx.options.pose) poses.push({id:'pose_custom',busId:'bus_custom',pose:JSON.parse(await readFile(path.resolve(ctx.root,ctx.options.pose),'utf8'))});
    const baseline={id:'defaults',expectedMode:'baked',expectedSunProfile:'ai527.sun.az045.el55',readinessTimeoutSeconds:240,settleFrames:120,storage:{},
        settingsPolicy:'Repository defaults, ACESFilmic, identical exposure/AO/textures/roughness. Only opaque building environment intensity toggled. No publication.'};
    const source=await snapshotFiles(ctx.root,await sourceFiles(ctx.root));
    const prepared={schemaVersion:1,experimentId:'building-reflection-review',runId:path.basename(output),runRoot:output,baseline,poses,
        viewport:{width:1920,height:1080},source:{files:source,sha256:digest(source)},bakes:await baselineInputs(ctx.root,baseline),configuration:[],
        engineRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:ctx.root,encoding:'utf8'}).trim(),startedAt:new Date(started).toISOString()};
    const report={schemaVersion:1,poses,runs:[],conditions:'Two fresh sequential browsers; two balanced passes per variant/browser; 60 warmup and 240 measured frames. Completed GPU queries joined by submission ID. Shader compilation and streaming settle before timing.',
        memoryPolicy:'No new textures, geometry or render targets; reuses the resident global PMREM. Counts and shader programs measured after warmup; driver allocation is not measured.'};
    let common=null,identity=null;
    async function measure(page,item,cold) {
        const before=await page.evaluate(readGameEvidence);
        const settings=comparableShadowSettings(before),hashes=JSON.stringify(before.sourceHashes);
        if(common&&common!==settings)throw new Error('Lighting/AO/exposure drift between runs');common=settings;
        if(identity&&identity!==hashes)throw new Error('Bake identity changed between runs');identity=hashes;
        const modelBefore=await page.evaluate(()=>{
            const found=new Set();window.__busSim.sm.current.city.buildings.group.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)found.add(m);});
            return [...found].map(m=>[m.uuid,m.version,m.color?.toArray(),m.roughness,m.metalness,m.aoMapIntensity,m.normalScale?.toArray(),m.map?.uuid]);
        });
        for(let pass=0;pass<2;pass++)for(const enabled of ((pass+cold)%2?[true,false]:[false,true])) {
            const applied=await applyVariant(page,enabled);
            if(!applied.materials)throw new Error('No eligible building surfaces');
            await page.evaluate(settleGameFrames,60);
            const samples=await page.evaluate(collectShadowFrameSamples,{sampleFrames:240,warmupFrames:60});
            const evidence=await page.evaluate(readGameEvidence);
            assertAppliedBaseline(evidence,baseline.expectedSunProfile);assertPoseMatches(item.pose,evidence.actualPose);
            if(comparableShadowSettings(evidence)!==common||JSON.stringify(evidence.sourceHashes)!==identity)throw new Error('Toggle changed lighting/source identity');
            const summary=summarizeShadowFrames(samples.frames),variant=enabled?'reflections':'original';
            if(cold===0&&pass===0)await page.locator('canvas').first().screenshot({path:path.join(output,`${item.id}-${variant}.png`)});
            report.runs.push({pose:item.id,cold,pass,variant,applied,summary,samples,evidence});
            await writeJson(path.join(output,'review.json'),report);
            ctx.log.line(ctx.id,`${item.id} ${variant}, browser ${cold+1} pass ${pass+1}: GPU ${summary.gpuMs.median.toFixed(2)} ms`);
        }
        await applyVariant(page,false);
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
    report.summary=poses.flatMap(pose=>['original','reflections'].map(variant=>{
        const runs=report.runs.filter(r=>r.pose===pose.id&&r.variant===variant);
        return {pose:pose.id,variant,passes:runs.length,...summarizeShadowFrames(runs.flatMap(r=>r.samples.frames))};
    }));
    report.seconds=(Date.now()-started)/1000;await writeJson(path.join(output,'review.json'),report);
    const file=path.join(output,'capture_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,diagnosticOnly:true,seconds:report.seconds},await listFiles(output)),file);
}
