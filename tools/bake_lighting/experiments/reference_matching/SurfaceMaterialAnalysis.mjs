// Authenticate production game snapshots and resolved Cycles material comparisons.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import {outputPath,TOOL} from './Baseline.mjs';

export async function surfaceMaterialAnalysis(ctx){
    if(ctx.publish||!['capture','reference','output'].every(k=>ctx.options[k]))throw new Error('capture, reference, new output required');
    const capture=outputPath(ctx.root,ctx.options.capture),reference=outputPath(ctx.root,ctx.options.reference),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(capture,'material_parity_capture_receipt.json'));await authenticated(path.join(reference,'reference_receipt.json'));
    const request=JSON.parse(await readFile(path.join(capture,'request.json'),'utf8'));
    await authenticated(path.join(request.control,'bake_progress_receipt.json'));await authenticated(path.join(request.reference,'reference_receipt.json'));
    const actual=JSON.parse(await readFile(path.join(reference,'request.json'),'utf8'));
    const original=JSON.parse(await readFile(path.join(request.reference,'request.json'),'utf8'));
    const poses=request.poses.filter(p=>actual.poses.some(a=>a.id===p.id));
    if(!poses.length)throw new Error('No matching captured reference poses');
    for(const pose of poses)for(const candidate of [actual,original])
        if(JSON.stringify(candidate.poses.find(p=>p.id===pose.id))!==JSON.stringify(pose))throw new Error('Changed selected pose '+pose.id);
    for(const key of ['defaults','exposureEv','width','height'])
        if(JSON.stringify(actual[key])!==JSON.stringify(original[key]))throw new Error('Reference changed control '+key);
    let previousReference;
    if(ctx.options.previous){
        previousReference=outputPath(ctx.root,ctx.options.previous);
        await authenticated(path.join(previousReference,'reference_receipt.json'));
        const previous=JSON.parse(await readFile(path.join(previousReference,'request.json'),'utf8'));
        for(const key of ['defaults','exposureEv','width','height'])if(JSON.stringify(previous[key])!==JSON.stringify(actual[key]))throw new Error('Density control changed '+key);
        for(const pose of poses)if(JSON.stringify(previous.poses.find(p=>p.id===pose.id))!==JSON.stringify(pose))throw new Error('Density control changed pose '+pose.id);
    }
    let transport;
    if(ctx.options.transport){
        transport=outputPath(ctx.root,ctx.options.transport);
        const receipt=await authenticated(path.join(transport,'material_transport_receipt.json'));
        if(path.resolve(receipt.input)!==reference)throw new Error('Glossy control uses another material reference');
    }
    await mkdir(output);await writeJson(path.join(output,'request.json'),{...request,poses,capture,originalReference:request.reference,reference,previousReference,transport,
        excludedCapturePoses:request.poses.filter(p=>!poses.includes(p)).map(p=>p.id)});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'resolved_surface_analysis.py'),output]);
    await withGameBrowser(ctx,{width:1920,height:588},async page=>{
        for(const sheet of JSON.parse(await readFile(path.join(output,'sheets.json'),'utf8'))){
            const panels=await Promise.all(sheet.panels.map(async p=>({...p,data:(await readFile(p.file)).toString('base64')})));
            await page.setContent('<body style="margin:0;display:flex;background:#15212b;color:#d9e1e7;font:18px Arial">'+panels.map(p=>`<section style="width:960px"><div style="height:48px;box-sizing:border-box;padding:12px">${p.label}</div><img style="width:960px;height:540px;object-fit:contain;display:block" src="data:image/png;base64,${p.data}"></section>`).join(''));
            await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:sheet.file});
        }
    });
    const file=path.join(output,'surface_analysis_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,reference,capture},await listFiles(output)),file);
}
