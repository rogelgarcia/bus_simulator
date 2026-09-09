// Captures only the installed runtime lighting; no exporter, Blender or publication calls.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { writeJson, hashFile } from '../../../../baking/Files.mjs';
import { assertAppliedBaseline, assertPoseMatches, verifyFiles } from '../Inputs.mjs';
import { withGameBrowser } from './GameBrowser.mjs';
import { readGameEvidence, setGamePose, settleGameFrames } from './GameEvidence.mjs';

export async function captureBaselines(ctx, prepared) {
    const started=Date.now(),{runRoot,baseline,viewport,poses}=prepared;
    const output=path.join(runRoot,'runtime',baseline.id,`${viewport.width}x${viewport.height}`);
    await mkdir(output,{recursive:true});
    const manifest={schemaVersion:1,status:'capturing',baseline:baseline.id,preparedRun:prepared.runId,
        engineRevision:prepared.engineRevision,source:prepared.source.sha256,settingsPolicy:baseline.settingsPolicy,
        viewport,installedBakes:prepared.bakes,images:[],diagnostics:[],resourceFiles:[],startedAt:new Date(started).toISOString()};
    const manifestPath=path.join(output,'baseline_manifest.json'),files=[];
    let hashing=Promise.resolve();const seen=new Set(),pending=new Set();
    try {
        await withGameBrowser(ctx,viewport,async(page,url,browserVersion)=>{
            manifest.browserVersion=browserVersion;
            page.on('pageerror',error=>manifest.diagnostics.push({kind:'pageerror',message:error.message}));
            page.on('console',message=>{if(/GL_INVALID_OPERATION|INVALID_OPERATION|too many errors/i.test(message.text()))manifest.diagnostics.push({kind:'gpu-error',message:message.text()});});
            page.on('request',request=>{
                const resource=new URL(request.url());
                if(resource.origin!==url||!resource.pathname.startsWith('/assets/'))return;
                pending.add(request);
                const relative=decodeURIComponent(resource.pathname).slice(1);
                if(seen.has(relative))return;seen.add(relative);
                if(relative.split('/').includes('..'))throw new Error('Unexpected resource path');
                hashing=hashing.then(async()=>{
                    try {manifest.resourceFiles.push({file:relative,...await hashFile(path.join(ctx.root,relative))});}
                    catch(error){manifest.diagnostics.push({kind:error.code==='ENOENT'?'missing-resource':'resource-hash-error',file:relative,message:error.message});}
                });
            });
            page.on('requestfinished',request=>pending.delete(request));
            page.on('requestfailed',request=>{pending.delete(request);manifest.diagnostics.push({kind:'requestfailed',url:request.url(),reason:request.failure()?.errorText});});
            await page.addInitScript(storage=>{for(const [key,value]of Object.entries(storage))localStorage.setItem(key,JSON.stringify(value));},baseline.storage);
            const loadStart=Date.now();
            await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(poses[0].pose))}`,{timeout:baseline.readinessTimeoutSeconds*1000});
            await page.waitForFunction(()=>!!window.__busSim?.sm?.current?.busAnchor,null,{timeout:baseline.readinessTimeoutSeconds*1000});
            await page.evaluate(async()=>{await window.__busSim.sm.current.busModel.userData.readyPromise;});
            const deadline=Date.now()+baseline.readinessTimeoutSeconds*1000;
            while(true) {
                ctx.signal.throwIfAborted();
                const status=await page.evaluate(()=>{const e=window.__busSim.engine,d=e.getBakedLightingDebugInfo();
                    return {ready:d.status.effectiveMode==='baked'&&d.receiverLightmaps.activationBlend===1&&!d.busLighting.transitionState,reason:d.status.reason};});
                if(status.ready&&pending.size===0)break;
                if(Date.now()>deadline)throw new Error(`Baseline did not become ready: ${JSON.stringify(status)}; ${pending.size} resource requests pending`);
                await delay(250,undefined,{signal:ctx.signal});
            }
            manifest.startupSeconds=(Date.now()-loadStart)/1000;
            ctx.log.line(ctx.id,`Game and installed bakes ready after ${manifest.startupSeconds.toFixed(1)}s`);
            await page.evaluate(async()=>{
                const {ensureGlobalPerfBar}=await import('/src/graphics/gui/perf_bar/PerfBar.js');
                ensureGlobalPerfBar().setHidden(true);
                const canvas=window.__busSim.engine.canvas;
                for(const el of document.body.querySelectorAll('*'))if(el!==canvas&&!el.contains(canvas)&&!['SCRIPT','STYLE','LINK'].includes(el.tagName))el.style.visibility='hidden';
                canvas.style.visibility='visible';
            });
            for(const item of poses) {
                const poseStart=Date.now();ctx.signal.throwIfAborted();
                ctx.log.line(ctx.id,`Capturing ${item.id} (${manifest.images.length+1}/${poses.length}); bus ${item.busId}`);
                await page.evaluate(setGamePose,item.pose);
                await page.evaluate(settleGameFrames,baseline.settleFrames);
                const evidence=await page.evaluate(readGameEvidence);
                manifest.lastCaptureEvidence={id:item.id,...evidence};
                await writeJson(manifestPath,manifest);
                assertAppliedBaseline(evidence,baseline.expectedSunProfile);assertPoseMatches(item.pose,evidence.actualPose);
                if(!evidence.placement.completelyInFrame)throw new Error(`${item.id}: bus is clipped by the supplied camera; shared placement requires review`);
                if(!evidence.placement.buildingsChecked)throw new Error('Building collision validation had no building bounds');
                if(evidence.placement.buildingBoundsIntersections.length)throw new Error(`${item.id}: possible building intersection ${evidence.placement.buildingBoundsIntersections.join(', ')}`);
                if(evidence.placement.roadClearance < -.05 || evidence.placement.roadClearance > .35)throw new Error(`${item.id}: unexpected bus ground clearance ${evidence.placement.roadClearance}`);
                if(evidence.viewport.width!==viewport.width||evidence.viewport.height!==viewport.height)throw new Error('Game canvas resolution differs from requested viewport');
                const image=path.join(output,`${item.id}.png`);
                await page.locator('canvas').first().screenshot({path:image});
                const after=await page.evaluate(readGameEvidence);
                assertAppliedBaseline(after,baseline.expectedSunProfile);assertPoseMatches(item.pose,after.actualPose);
                const record={id:item.id,busId:item.busId,requestedPose:item.pose,...evidence,
                    image:path.relative(runRoot,image).replaceAll('\\','/'),...await hashFile(image),seconds:(Date.now()-poseStart)/1000};
                const evidencePath=path.join(output,`${item.id}.json`);
                await writeJson(evidencePath,record);files.push(image,evidencePath);manifest.images.push(record);
                await writeJson(manifestPath,manifest);
            }
            await hashing;
        });
        await verifyFiles(ctx.root,[...prepared.bakes.files,...prepared.source.files,...prepared.configuration,...manifest.resourceFiles]);
        const fatal=manifest.diagnostics.filter(d=>['pageerror','gpu-error','resource-hash-error'].includes(d.kind)
            || d.kind==='missing-resource'&&!d.file.endsWith('/pbr.material.correction.config.js'));
        if(fatal.length)throw new Error(`Baseline resource/render errors: ${JSON.stringify(fatal)}`);
        delete manifest.lastCaptureEvidence;
        manifest.status='validated';manifest.captureSeconds=(Date.now()-started)/1000;
        manifest.totalSeconds=(Date.now()-Date.parse(prepared.startedAt))/1000;manifest.finishedAt=new Date().toISOString();
        await writeJson(manifestPath,manifest);
        await writeJson(path.join(runRoot,'manifest.json'),{...prepared,status:'baseline_complete',livePlacementValidation:'passed all five views',baselineManifest:manifestPath,
            totalSeconds:manifest.totalSeconds,completedStages:['prepare','capture_baselines'],pendingStages:['export_city','render','postprocess','analyze','report']});
        ctx.log.line(ctx.id,`Five baselines validated in ${manifest.totalSeconds.toFixed(1)}s including preparation; ${manifest.captureSeconds.toFixed(1)}s capture stage. ${manifestPath}`,'success');
        return {state:'validated',manifest:manifestPath,files:[...files,manifestPath,path.join(runRoot,'manifest.json')]};
    } catch(error) {
        await hashing.catch(()=>{});manifest.status='failed';manifest.error=error.message;manifest.elapsedSeconds=(Date.now()-started)/1000;
        await writeJson(manifestPath,manifest);throw error;
    }
}
