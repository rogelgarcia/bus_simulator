// @ts-check
// Compare higher physical sun elevations against an authenticated immutable AI567 finalist.
import path from 'node:path';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {writeJson,listFiles,hashFile} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {outputPath,TOOL} from './Plan.mjs';

export async function afternoon(ctx){
    if(ctx.publish||!ctx.options['source-run']||!ctx.options.output)throw new Error('Afternoon comparison requires source-run and new output; publication is prohibited');
    const start=Date.now(),source=path.resolve(ctx.root,ctx.options['source-run']),output=outputPath(ctx.root,ctx.options.output);
    for(const stage of ['prepare','render','analyze'])await authenticated(path.join(source,stage+'_receipt.json'));
    const read=async name=>JSON.parse(await readFile(path.join(source,name),'utf8'));
    const original=await read('request.json'),profile=await read('profile.json'),finals=await read('final_renders.json');
    const recipe=JSON.parse(await readFile(path.join(ctx.root,TOOL,'afternoon.json'),'utf8'));
    const selected=profile.selected.find(c=>c.id==='D01_'+recipe.material+'_ev+0.5');
    if(!selected||selected.promotion!=='validated-lab-candidate')throw new Error('Require a validated clear-daylight plausible finalist');
    const baseline=finals.filter(c=>c.candidate===selected.id);
    if(baseline.length!==5)throw new Error('Five authenticated baseline poses required');
    const defaults=JSON.parse(await readFile(path.join(original.materialRoot,'request.json'),'utf8')).daylightRequest.defaults;
    if(defaults.sun.elevationDeg!==35||defaults.sun.angularDiameterDeg!==0.53)throw new Error('Expected original 35-degree physical daylight');
    const implementation=[];
    for(const name of ['sky.py','daylight_math.py','fixtures.py','afternoon_render.py','afternoon_report.py'])implementation.push({file:TOOL+'/'+name,...await hashFile(path.join(ctx.root,TOOL,name))});
    for(const identity of original.frozenFiles.filter(v=>v.file.includes('color_management')||v.file.endsWith('city_materials.py')||v.file.endsWith('color_pipeline.py'))){
        if((await hashFile(identity.file)).sha256!==identity.sha256)throw new Error('Material/display implementation differs from validated source');
    }
    await mkdir(path.dirname(output),{recursive:true});await mkdir(output,{recursive:false});
    await copyFile(path.join(source,'calibration_city.blend'),path.join(output,'source_city.blend'));
    const request={schemaVersion:1,source,output,recipe,defaults,implementation,baseline,poses:original.prepared.poses,exposureEv:selected.exposureEv,ocioConfig:original.ocioConfig,tones:original.recipe.tones,device:ctx.config.renderDevice,sourceProfile:await hashFile(path.join(source,'profile.json')),sourceScene:await hashFile(path.join(output,'source_city.blend')),referenceDaylight:original.daylight,publication:'experiment-only'};
    await writeJson(path.join(output,'request.json'),request);
    if(ctx.options.mode!=='background')await ctx.process('powershell.exe',['-NoProfile','-Command',"if (@(Get-Process -Name blender -ErrorAction SilentlyContinue).Count) { Write-Error 'Blender is occupied; use an isolated background process only when resources permit.'; exit 1 }"]);
    await runBlenderStage(ctx,TOOL+'/afternoon_render.py',[output],{background:ctx.options.mode==='background'});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'afternoon_report.py'),output]);
    await copyFile(path.join(ctx.root,TOOL,'afternoon.css'),path.join(output,'report','afternoon.css'));
    await writeJson(path.join(output,'execution.json'),{seconds:(Date.now()-start)/1000,publication:'experiment-only'});
    const manifest=path.join(output,'afternoon_receipt.json');
    return resultFiles(await receipt(manifest,ctx.key,{output,publication:'experiment-only'},await listFiles(output)),manifest);
}
