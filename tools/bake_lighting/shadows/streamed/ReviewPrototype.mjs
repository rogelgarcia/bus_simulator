// Actual-game comparison, repeated warm passes and a second fresh browser.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withGameBrowser} from '../../experiments/lighting_configurations/capture_baselines/GameBrowser.mjs';
import {setGamePose,settleGameFrames,readGameEvidence} from '../../experiments/lighting_configurations/capture_baselines/GameEvidence.mjs';
import {measureGamePerformance} from '../../experiments/reference_matching/Performance.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {decodeFrameRecording} from '../../../../src/app/gameplay/recording/FrameRecording.js';
import {measureStreamedRoute} from './RouteReview.mjs';
import {shadowReviewShaderIdentity} from './ReviewIdentity.mjs';

export async function reviewStreamedPrototype(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output||!ctx.options.pose)throw new Error('input, output and pose required; diagnostic only');
    const output=path.resolve(ctx.root,ctx.options.output),input=path.resolve(ctx.root,ctx.options.input);
    const base=path.join(ctx.root,'tests/artifacts/screens/illumination_547')+path.sep;
    if(!output.startsWith(base)||!input.startsWith(base))throw new Error('Prototype artifacts must stay under illumination_547');
    await mkdir(output);
    const pose=JSON.parse(await readFile(path.resolve(ctx.root,ctx.options.pose),'utf8'));
    const index=await readFile(path.join(input,'streaming_index.json'),'utf8');
    let routeFrames=null;
    if(ctx.options.recording){
        const recording=await decodeFrameRecording(await readFile(path.resolve(ctx.root,ctx.options.recording),'utf8')),c=recording.columns;
        routeFrames=Array.from({length:recording.count},(_,i)=>i).filter(i=>c.frame[i]>=0xa80&&c.frame[i]<=0xe20).map(i=>({frame:c.frame[i],
            bus:[c.busX[i],c.busY[i],c.busZ[i],c.busQx[i],c.busQy[i],c.busQz[i],c.busQw[i]],
            camera:[c.cameraX[i],c.cameraY[i],c.cameraZ[i],c.cameraQx[i],c.cameraQy[i],c.cameraQz[i],c.cameraQw[i]],
            projection:[c.fov[i],c.zoom[i],c.near[i],c.far[i]]}));
        if(!routeFrames.length)throw new Error('Recording has no A80–E20 frames');
    }
    const report={status:'running',shaderIdentity:await shadowReviewShaderIdentity(ctx.root),manifestSha256:createHash('sha256').update(await readFile(path.join(input,'manifest.json'))).digest('hex'),
        conditions:{viewport:[1920,1080],coldBrowsers:ctx.options['capture-only']?1:2,warmPasses:ctx.options['capture-only']?1:3,pose},passes:[],diagnostics:[]};
    const reportFile=path.join(output,'review.json');
    try {
        for(let cold=0;cold<(ctx.options['capture-only']?1:2);cold++)await withGameBrowser(ctx,{width:1920,height:1080},async(page,url,browser)=>{
            report.browser=browser;const errors=[];page.on('pageerror',e=>errors.push(e.stack??e.message));
            await page.route(url+'/assets/baked_lighting/shadows/streaming_index.json',route=>route.fulfill({body:index,contentType:'application/json'}));
            await page.goto(`${url}/?coreTests=0&streamedShadowPrototype=1&gameplayPose=${encodeURIComponent(JSON.stringify({...pose,hud:{visible:false}}))}`);
            await page.waitForFunction(()=>window.__busSim?.engine?.getBakedLightingDebugInfo()?.status.effectiveMode==='baked',null,{timeout:240000});
            await page.waitForFunction(()=>{const d=window.__busSim.engine.getBakedLightingDebugInfo();return d.receiverLightmaps.activationBlend===1&&d.view?.ready!==false&&!d.busLighting.transitionState;},null,{timeout:240000});
            await page.evaluate(async()=>{
                const {ensureGlobalPerfBar}=await import('/src/graphics/gui/perf_bar/PerfBar.js');ensureGlobalPerfBar().setHidden(true);
                const canvas=window.__busSim.engine.canvas;
                for(const el of document.body.querySelectorAll('*'))if(el!==canvas&&!el.contains(canvas)&&!['SCRIPT','STYLE','LINK'].includes(el.tagName))el.style.visibility='hidden';
                canvas.style.visibility='visible';
            });
            await page.evaluate(setGamePose,pose);
            for(let round=0;round<(ctx.options['capture-only']?1:3);round++)for(const enabled of round%2?[true,false]:[false,true]){
                await page.evaluate(async enabled=>{
                    const e=window.__busSim.engine,s=e.bakedLightingSettings;
                    await e.setBakedLightingSettings({...s,shadows:{...s.shadows,streamedDetail:enabled}});
                },enabled);
                if(enabled) {
                    await page.waitForFunction(()=>{
                        const d=window.__busSim.engine._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows;
                        return d.state==='parent fallback'||d.state==='ready'&&d.resident>0&&d.pending===0&&d.queued===0;
                    },null,{timeout:90000});
                    const d=await page.evaluate(()=>window.__busSim.engine._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows);
                    if(d.state!=='ready')throw new Error('Detail activation failed: '+JSON.stringify(d));
                }
                await page.evaluate(settleGameFrames,60);
                if(cold===0&&round===0)await page.locator('canvas').first().screenshot({path:path.join(output,enabled?'streamed.png':'parent.png')});
                const performance=ctx.options['capture-only']?{}:await page.evaluate(measureGamePerformance);
                const state=await page.evaluate(()=>{
                    const e=window.__busSim.engine,d=e.getBakedLightingDebugInfo();return {mode:d.status.effectiveMode,
                        indirect:d.receiverLightmaps.effective.indirect,streaming:e._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows};
                });
                if(state.mode!=='baked'||!state.indirect)throw new Error('Streaming changed the baked illumination path');
                if(!enabled&&(state.streaming.resident||state.streaming.pending||state.streaming.gpuBytes))throw new Error('Disabled detail retained resources');
                report.passes.push({cold,round,enabled,performance,state});await writeJson(reportFile,report);
                ctx.log.line(ctx.id,`Fresh browser ${cold+1}/2; pass ${round+1}/3; detail ${enabled?'on':'off'}; GPU ${performance.gpuMs?.median?.toFixed(2)} ms`);
            }
            if(routeFrames){
                report.routes??=[];
                for(let lap=0;lap<3;lap++)for(const enabled of lap%2?[true,false]:[false,true]){
                    await page.evaluate(enabled=>{const e=window.__busSim.engine;return e.setBakedLightingSettings({...e.bakedLightingSettings,
                        shadows:{...e.bakedLightingSettings.shadows,streamedDetail:enabled}});},enabled);
                    await page.evaluate(settleGameFrames,90);
                    const result=await page.evaluate(measureStreamedRoute,routeFrames);
                    const file=`route-${cold}-${lap}-${enabled?'streamed':'parent'}.json`;
                    await writeJson(path.join(output,file),result);
                    report.routes.push({cold,lap,enabled,file,gpu:result.gpu,cpu:result.cpu,frameMs:result.frameMs,regions:result.regions});
                    await writeJson(reportFile,report);
                    ctx.log.line(ctx.id,`Route browser ${cold+1}; lap ${lap+1}; detail ${enabled?'on':'off'}; GPU ${result.gpu.median.toFixed(2)} ms`);
                }
                await page.evaluate(setGamePose,pose);await page.evaluate(settleGameFrames,90);
            }
            if(ctx.options['capture-only']) {
                report.receiverInspection=await page.evaluate(async()=>{
                    const THREE=await import('three'),e=window.__busSim.engine;
                    const camera=e.camera,scene=e.scene,rays=new THREE.Raycaster(),out=[];
                    for(const pixel of [[1800,425],[1800,450],[1800,480]]) {
                        rays.setFromCamera(new THREE.Vector2(pixel[0]/1920*2-1,1-pixel[1]/1080*2),camera);
                        const hit=rays.intersectObjects(scene.children,true)[0]; if(!hit)continue;
                        const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
                        const direction=e._bakedLighting.shadows._pipeline._active.binding.uniforms.staticSunDepthPointDirectionWorld.value;
                        rays.set(hit.point.clone().addScaledVector(normal,.025),direction);
                        out.push({pixel,point:hit.point.toArray(),normal:normal.toArray(),mesh:hit.object.name,
                            sunHits:rays.intersectObjects(scene.children,true).slice(0,3).map(v=>({name:v.object.name,distance:v.distance,point:v.point.toArray()}))});
                    }return {rays:out,residentPages:[...e._bakedLighting.shadows._pipeline._active.binding.streamedDetail.residency.entries.keys()]};
                });
                await page.evaluate(()=>{
                    const u=window.__busSim.engine._bakedLighting.shadows._pipeline._active.binding.uniforms.dynamicSunShadowEnabled;
                    Object.defineProperty(u,'value',{configurable:true,get:()=>0,set:()=>{}});
                });
                await page.evaluate(settleGameFrames,20);
                await page.locator('canvas').first().screenshot({path:path.join(output,'static-only.png')});
            }
            if(cold===0 && !ctx.options['capture-only']){
                report.evidence=await page.evaluate(readGameEvidence);
                // Deliberately corrupted pages must stay on the authenticated parent.
                await page.evaluate(async()=>{const e=window.__busSim.engine;await e.setBakedLightingSettings({...e.bakedLightingSettings,shadows:{...e.bakedLightingSettings.shadows,streamedDetail:false}});});
                await page.route('**/pages/*.rg8.gz',route=>route.fulfill({body:Buffer.from([1,2,3]),contentType:'application/octet-stream'}));
                await page.evaluate(async()=>{const e=window.__busSim.engine;await e.setBakedLightingSettings({...e.bakedLightingSettings,shadows:{...e.bakedLightingSettings.shadows,streamedDetail:true}});});
                await page.waitForFunction(()=>window.__busSim.engine._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows.failures>0);
                report.corruptFallback=await page.evaluate(()=>{const e=window.__busSim.engine;return {mode:e.getBakedLightingDebugInfo().status.effectiveMode,detail:e._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows};});
                if(report.corruptFallback.mode!=='baked'||report.corruptFallback.detail.resident!==0)throw new Error('Corrupt detail displaced parent shadows');
                await page.evaluate(settleGameFrames,60);
                await page.locator('canvas').first().screenshot({path:path.join(output,'corrupt-parent-fallback.png')});
            }
            if(errors.length)throw new Error(errors.join('\n'));
        });
        report.status='validated';report.productionEligible=false;
        report.pending=['far-parent residency reduction','dynamic cluster benchmark','additional sun profiles'];
    }catch(error){report.status='failed';report.error=error.message;throw error;}
    finally{await writeJson(reportFile,report);}
    return {state:'validated',output,files:await listFiles(output)};
}
