// @ts-check
// Explicit, authenticated stage entry points; no production publication or personal browser state.
import path from 'node:path';
import {readFile,mkdir,stat,copyFile} from 'node:fs/promises';
import {writeJson,listFiles,hashFile} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {receipt,resultFiles,authenticated} from '../lighting_configurations/StageInputs.mjs';
import {TOOL,ARTIFACTS,outputPath,validateDefaults} from './Plan.mjs';
import {freezeInputs} from './Inputs.mjs';
import {preserveLegacy} from './Legacy.mjs';
import {captureReview} from './Review.mjs';

async function finish(ctx,output,stage,files){
    const file=path.join(output,stage+'_receipt.json');const value=await receipt(file,ctx.key,{output,stage},files);
    return {...resultFiles(value,file),output};
}
async function load(ctx,required){
    if(!ctx.options.output)throw new Error('Standalone stage requires output from prepare');
    const output=outputPath(ctx.root,ctx.options.output);await authenticated(path.join(output,required+'_receipt.json'));
    return {output,request:JSON.parse(await readFile(path.join(output,'request.json'),'utf8'))};
}
async function blender(ctx,request,stage){
    if(request.blenderScripts)for(const entry of request.blenderScripts){
        if((await hashFile(path.join(ctx.root,entry.file))).sha256!==entry.sha256)throw new Error('Prepared Blender implementation changed; create a new run');
    }
    const file=path.join(request.output,stage+'_request.json');await writeJson(file,{...request,stage});
    if(ctx.options.mode!=='background')await ctx.process('powershell.exe',['-NoProfile','-Command',"if (@(Get-Process -Name blender -ErrorAction SilentlyContinue).Count) { Write-Error 'Blender is occupied; use mode background for an isolated process.'; exit 1 }"]);
    await runBlenderStage(ctx,TOOL+'/blender.py',[file],{background:ctx.options.mode==='background'});
}
/** @param {any} ctx */
export async function prepare(ctx){
    if(ctx.publish)throw new Error('Daylight experiments cannot publish');
    const output=outputPath(ctx.root,ctx.options.output??`${ARTIFACTS}/runs/${ctx.key.slice(0,16)}-${Date.now()}`);
    if(await stat(path.join(output,'request.json')).catch(e=>{if(e.code!=='ENOENT')throw e;return null;}))throw new Error('Preserve existing run; choose a new output for preparation');
    await mkdir(output,{recursive:true});
    const defaults=JSON.parse(await readFile(path.join(ctx.root,TOOL,'defaults.json'),'utf8'));
    if(ctx.options.samples)defaults.samples=ctx.options.samples;validateDefaults(defaults);
    const identity=await freezeInputs(ctx,output);
    const blenderScripts=await Promise.all(['blender.py','sky.py','fixtures.py','daylight_math.py'].map(async name=>({file:TOOL+'/'+name,...await hashFile(path.join(ctx.root,TOOL,name))})));
    const request={schemaVersion:1,output,defaults,identity,blenderScripts,device:ctx.options.device??ctx.config.renderDevice,startedAt:new Date().toISOString()};
    await writeJson(path.join(output,'request.json'),request);await blender(ctx,request,'prepare');
    return finish(ctx,output,'prepare',[path.join(output,'request.json'),path.join(output,'daylight.json'),path.join(output,'daylight_fixtures.blend'),path.join(output,'daylight_city.blend'),...await listFiles(path.join(output,'inputs')),...await listFiles(path.join(output,'baselines')),...await listFiles(path.join(output,'environments'))]);
}
/** @param {any} ctx */
export async function render(ctx){
    const {output,request}=await load(ctx,'prepare');await blender(ctx,request,'render');
    return finish(ctx,output,'render',[path.join(output,'renders.json'),...await listFiles(path.join(output,'city')),...await listFiles(path.join(output,'fixtures'))]);
}
/** @param {any} ctx */
export async function capture(ctx){
    const {output,request}=await load(ctx,'prepare');const {captureGame}=await import('./Capture.mjs');await captureGame(ctx,output,request);
    return finish(ctx,output,'capture',[path.join(output,'game.json'),...await listFiles(path.join(output,'game'))]);
}
/** @param {any} ctx */
export async function fixtures(ctx){
    const {output,request}=await load(ctx,'prepare');
    for(const entry of request.blenderScripts??[]){
        if(['sky.py','daylight_math.py'].includes(path.basename(entry.file))&&(await hashFile(path.join(ctx.root,entry.file))).sha256!==entry.sha256)throw new Error('Atmospheric model changed; prepare a new city experiment instead of revising fixtures');
    }
    const directory=path.join(output,'fixture_revisions',ctx.key.slice(0,16)+'-'+Date.now());await mkdir(directory,{recursive:true});
    // This stage intentionally permits a new fixture implementation. Atmospheric inputs remain frozen.
    await blender(ctx,{...request,blenderScripts:undefined,output:directory},'fixtures');
    await writeJson(path.join(output,'fixture_revision.json'),{directory,records:path.join(directory,'records.json'),reason:'Independent fixture revision; original city/atmosphere and earlier measurements retained.'});
    return finish(ctx,output,'fixtures',[path.join(output,'fixture_revision.json'),...await listFiles(directory)]);
}
/** @param {any} ctx */
export async function analyze(ctx){
    const {output}=await load(ctx,'render');await authenticated(path.join(output,'capture_receipt.json'));
    if(await stat(path.join(output,'fixture_revision.json')).catch(e=>{if(e.code!=='ENOENT')throw e;return null;}))await authenticated(path.join(output,'fixtures_receipt.json'));
    await preserveLegacy(ctx,output);
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'analyze.py'),output]);
    for(const file of ['report.css','report.js'])await copyFile(path.join(ctx.root,TOOL,file),path.join(output,'report',file));
    await captureReview(ctx,output);
    return finish(ctx,output,'analyze',await listFiles(path.join(output,'report')));
}
/** @param {any} ctx */
export async function execute(ctx){
    const prepared=await prepare(ctx);const staged={...ctx,options:{...ctx.options,output:prepared.output}};
    await render(staged);await capture(staged);const result=await analyze(staged);
    const request=JSON.parse(await readFile(path.join(result.output,'request.json'),'utf8'));
    await writeJson(path.join(result.output,'execution.json'),{seconds:(Date.now()-Date.parse(request.startedAt))/1000,completedAt:new Date().toISOString()});
    return result;
}
