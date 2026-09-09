// Native game display variants retain installed lighting and leave original G00 captures intact.
// @ts-check
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {withGameBrowser} from '../capture_baselines/GameBrowser.mjs';
import {readGameEvidence,setGamePose,settleGameFrames} from '../capture_baselines/GameEvidence.mjs';
import {assertAppliedBaseline,assertPoseMatches,verifyFiles} from '../Inputs.mjs';
import {config,cache,receipt,codeIdentity,resultFiles} from '../StageInputs.mjs';
import {writeJson,digest,hashFile} from '../../../../baking/Files.mjs';

/** @param {object} ctx @param {object} run */
export async function captureDisplayVariants(ctx,run){
    const settings=await config(ctx,run,'baseline_display'),display=settings.value;
    const code=await codeIdentity(ctx.root,['capture_display_variants/CaptureDisplayVariants.mjs','capture_baselines/GameBrowser.mjs','capture_baselines/GameEvidence.mjs']);
    const key=digest({source:run.source.sha256,bakes:run.bakes,poses:run.poses,display,code});
    const output=path.join(run.runRoot,'runtime/G01_display_variants');await mkdir(output,{recursive:true});
    const manifest=path.join(output,'display_manifest.json'),saved=await cache(manifest,key);
    if(saved)return resultFiles(saved,manifest);
    const started=Date.now(),records=[],files=[],diagnostics=[];
    for(const [quality,viewport]of [['pilot',{width:1920,height:1080}],['final',{width:3840,height:2160}]]){
        await withGameBrowser(ctx,viewport,async(page,url,browserVersion)=>{
            const pending=new Set();
            page.on('pageerror',error=>diagnostics.push(error.message));
            page.on('console',message=>{if(/GL_INVALID_OPERATION|too many errors/i.test(message.text()))diagnostics.push(message.text());});
            page.on('request',request=>pending.add(request));
            page.on('requestfinished',request=>pending.delete(request));
            page.on('requestfailed',request=>pending.delete(request));
            await page.addInitScript(storage=>{for(const [name,value]of Object.entries(storage))localStorage.setItem(name,JSON.stringify(value));},run.baseline.storage);
            const timeout=run.baseline.readinessTimeoutSeconds*1000;
            await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(run.poses[0].pose))}`,{timeout});
            await page.waitForFunction(()=>!!window.__busSim?.sm?.current?.busAnchor,null,{timeout});
            await page.evaluate(async()=>{await window.__busSim.sm.current.busModel.userData.readyPromise;});
            await page.waitForFunction(()=>{const d=window.__busSim.engine.getBakedLightingDebugInfo();return d.status.effectiveMode==='baked'&&d.receiverLightmaps.activationBlend===1&&!d.busLighting.transitionState;},null,{timeout});
            const deadline=Date.now()+30000;while(pending.size){ctx.signal.throwIfAborted();if(Date.now()>deadline)throw new Error('Game resources did not finish loading');await delay(100,undefined,{signal:ctx.signal});}
            await page.evaluate(async()=>{const {ensureGlobalPerfBar}=await import('/src/graphics/gui/perf_bar/PerfBar.js');ensureGlobalPerfBar().setHidden(true);const canvas=window.__busSim.engine.canvas;for(const node of document.body.querySelectorAll('*'))if(node!==canvas&&!node.contains(canvas)&&!['SCRIPT','STYLE','LINK'].includes(node.tagName))node.style.visibility='hidden';canvas.style.visibility='visible';});
            for(const tone of display.tones)for(const grade of display.grades){
                ctx.signal.throwIfAborted();
                await page.evaluate(({tone,grade,exposure,intensity})=>{const engine=window.__busSim.engine;engine.setLightingSettings({toneMapping:tone,exposure});engine.setColorGradingSettings({preset:grade,intensity});},{tone,grade,exposure:display.exposure,intensity:display.gradeIntensity});
                await page.waitForFunction(({grade})=>{const d=window.__busSim.engine.getColorGradingDebugInfo();return d.requestedPreset===grade&&(grade==='off'?d.status==='off':d.status==='ready'&&d.enabled);},{grade},{timeout:30000});
                for(const pose of run.poses){
                    const begin=Date.now();await page.evaluate(setGamePose,pose.pose);await page.evaluate(settleGameFrames,run.baseline.settleFrames);
                    const evidence=await page.evaluate(readGameEvidence),grading=await page.evaluate(()=>window.__busSim.engine.getColorGradingDebugInfo());
                    assertAppliedBaseline(evidence,run.baseline.expectedSunProfile);assertPoseMatches(pose.pose,evidence.actualPose);
                    if(evidence.lighting.toneMapping!==tone||evidence.graphics.colorGrading.preset!==grade||Math.abs(evidence.lighting.exposure-display.exposure)>1e-6)throw new Error('Requested native display settings were not applied');
                    if(evidence.viewport.width!==viewport.width||evidence.viewport.height!==viewport.height)throw new Error('Display variant viewport mismatch');
                    const directory=path.join(output,`${viewport.width}x${viewport.height}`);await mkdir(directory,{recursive:true});
                    const id=`${pose.id}_${tone}_${grade}`,file=path.join(directory,`${id}.png`),metadata=file.replace(/\.png$/,'.json');
                    await page.locator('canvas').first().screenshot({path:file});
                    const after=await page.evaluate(readGameEvidence);assertAppliedBaseline(after,run.baseline.expectedSunProfile);assertPoseMatches(pose.pose,after.actualPose);
                    const record={id,pose:pose.id,busId:pose.busId,light:'G01',quality,gameTone:tone,gameGrade:grade,gameExposure:display.exposure,gradeIntensity:display.gradeIntensity,file,...await hashFile(file),width:viewport.width,height:viewport.height,seconds:(Date.now()-begin)/1000,metadata};
                    await writeJson(metadata,{...record,evidence,grading,browserVersion});records.push(record);files.push(file,metadata);
                }
                ctx.log.line(ctx.id,`${quality}: ${tone} / ${grade}; ${records.length}/120 native game references`);
            }
        });
    }
    await verifyFiles(ctx.root,[...run.source.files,...run.bakes.files,...run.configuration]);
    if(diagnostics.length)throw new Error(`Native display capture errors: ${diagnostics.join('; ')}`);
    const result=await receipt(manifest,key,{source:run.source.sha256,settings:display,records,seconds:(Date.now()-started)/1000},files);
    return resultFiles(result,manifest);
}
