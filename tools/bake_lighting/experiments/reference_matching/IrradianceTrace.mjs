// Trace authenticated offline receiver pixels through the actual game's GPU and diffuse composition.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { withGameBrowser } from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import { readGameEvidence, settleGameFrames } from '../lighting_configurations/capture_baselines/GameEvidence.mjs';
import { assertPoseMatches } from '../lighting_configurations/Inputs.mjs';
import { writeJson, listFiles, hashFile } from '../../../baking/Files.mjs';
import { outputPath, TOOL } from './Baseline.mjs';
import { rawRadiance } from './RawRadiance.mjs';

export async function irradianceTrace(ctx) {
    if (ctx.publish || !ctx.options.capture || !ctx.options.reference || !ctx.options['bake-dir'] || !ctx.options.output)
        throw new Error('capture, reference, bake-dir and new output required; diagnostic only');
    const capture=outputPath(ctx.root,ctx.options.capture),reference=outputPath(ctx.root,ctx.options.reference);
    await authenticated(path.join(capture,'capture_receipt.json'));
    await authenticated(path.join(reference,'building_reference_receipt.json'));
    const bake=path.resolve(ctx.root,ctx.options['bake-dir']),output=outputPath(ctx.root,ctx.options.output);
    const installed=path.join(ctx.root,'assets/baked_lighting/receivers/enhanced/package_index.json');
    const index=JSON.parse(await readFile(installed,'utf8'));
    const original=JSON.parse(await readFile(path.join(bake,'package_index.json'),'utf8'));
    if (index.sourceHash!==original.sourceHash || JSON.stringify(index.mapping)!==JSON.stringify(original.mapping)
        || index.channels.indirect_irradiance.aggregateSha256!==original.channels.indirect_irradiance.aggregateSha256)
        throw new Error('Installed receiver differs from the specified offline bake');
    const review=JSON.parse(await readFile(path.join(capture,'review.json'),'utf8'));
    const pose=review.poses.find(item=>item.id==='pose_custom')?.pose;
    if (!pose) throw new Error('Capture must include the custom building pose');
    await mkdir(output);
    const request={capture,reference,bake,pose,sourceHash:index.sourceHash,profile:index.mapping.profile,
        indexIdentity:await hashFile(installed),packageIdentity:index.channels.indirect_irradiance,
        diagnosticOnly:true};
    await writeJson(path.join(output,'request.json'),request);
    const started=Date.now(),errors=[];
    await withGameBrowser(ctx,{width:1920,height:1080},async(page,url)=>{
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
        await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(pose))}`);
        await page.waitForFunction(()=>{
            const d=window.__busSim?.engine?.getBakedLightingDebugInfo();
            return d?.status.effectiveMode==='baked'&&d.receiverLightmaps.effective.indirect
                &&d.receiverLightmaps.activationBlend===1&&d.view?.ready!==false;
        });
        await page.evaluate(async()=>{
            const {ensureGlobalPerfBar}=await import('/src/graphics/gui/perf_bar/PerfBar.js');
            ensureGlobalPerfBar().setHidden(true);
            const c=window.__busSim.engine.canvas;
            for(const el of document.body.querySelectorAll('*'))if(el!==c&&!el.contains(c)&&!['SCRIPT','STYLE','LINK'].includes(el.tagName))el.style.visibility='hidden';
            c.style.visibility='visible';
        });
        await page.evaluate(settleGameFrames,60);
        const before=await page.evaluate(readGameEvidence);
        assertPoseMatches(pose,before.actualPose);
        if(before.viewport.width!==1920||before.viewport.height!==1080)throw new Error('Unexpected canvas size');
        await writeJson(path.join(output,'game_before.json'),before);
        await page.locator('canvas').first().screenshot({path:path.join(output,'game.png')});
        await rawRadiance(page,path.join(output,'raw'),{materialDiagnostics:true,receiverTrace:true});
        await page.evaluate(settleGameFrames,12);
        const after=await page.evaluate(readGameEvidence);
        for(const key of ['actualPose','lighting','atmosphere','graphics','savedSettings','sourceHashes'])
            if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw new Error('Trace changed '+key);
        if(after.baked.status.effectiveMode!=='baked'||after.baked.receiverLightmaps.activationBlend!==1)throw new Error('Trace disabled the bake');
        await writeJson(path.join(output,'game_after.json'),after);
        await writeJson(path.join(output,'browser_errors.json'),errors);
        if(errors.length)throw new Error(errors.join('\n'));
    });
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'irradiance_trace_analysis.py'),output]);
    const file=path.join(output,'irradiance_trace_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,seconds:(Date.now()-started)/1000,diagnosticOnly:true},await listFiles(output)),file);
}

export async function irradianceAnalysis(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output)throw new Error('input and new output required; diagnostic only');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    const read=async name=>JSON.parse(await readFile(path.join(input,name),'utf8'));
    const before=await read('game_before.json'),after=await read('game_after.json');
    if((await read('browser_errors.json')).length)throw new Error('Capture has browser errors');
    for(const key of ['actualPose','lighting','atmosphere','graphics','savedSettings','sourceHashes'])
        if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw new Error('Trace changed '+key);
    for(const state of [before,after])if(state.baked.status.effectiveMode!=='baked'||state.baked.receiverLightmaps.activationBlend!==1)
        throw new Error('Trace captured an inactive bake');
    const control=ctx.options.control?outputPath(ctx.root,ctx.options.control):null;
    if(control)await authenticated(path.join(control,'irradiance_reference_receipt.json'));
    await mkdir(output);
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'irradiance_trace_analysis.py'),input,output,...(control?[control]:[])]);
    const file=path.join(output,'irradiance_analysis_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{input,output,control,diagnosticOnly:true},[...await listFiles(input),...(control?await listFiles(control):[]),...await listFiles(output)]),file);
}
