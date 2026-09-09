// Standalone reference, scene, native capture, render and analysis stages with authenticated handoffs.
// @ts-check
import path from 'node:path';
import {mkdir,readFile,copyFile,stat} from 'node:fs/promises';
import {writeJson,listFiles,hashFile} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {receipt,resultFiles,authenticated} from '../lighting_configurations/StageInputs.mjs';
import {acquireReferences} from './References.mjs';
import {captureGame} from './Capture.mjs';
import {TARGET,TOOL,ARTIFACTS,outputPath,validateDefaults} from './Plan.mjs';

async function finish(ctx,output,data,files){
    const file=path.join(output,ctx.id.split('/').at(-1)+'_receipt.json');
    const value=await receipt(file,ctx.key,{output,...data},files);
    return {...resultFiles(value,file),output};
}

async function upstream(ctx,id){
    const result=ctx.result(TARGET+'/'+id);
    await authenticated(result.manifest);
    return result.output;
}

async function request(output){return JSON.parse(await readFile(path.join(output,'request.json'),'utf8'));}

/** @param {any} ctx */
export async function references(ctx){
    if(ctx.publish)throw new Error('Calibration experiments never publish production data');
    const startedAt=new Date().toISOString();
    const output=outputPath(ctx.root,ctx.options.output??`${ARTIFACTS}/runs/${ctx.key.slice(0,16)}-${Date.now()}`);
    const defaults=JSON.parse(await readFile(path.join(ctx.root,TOOL,'defaults.json'),'utf8'));
    if(ctx.options.samples)defaults.samples=ctx.options.samples;
    validateDefaults(defaults);
    const existing=await stat(path.join(output,'request.json')).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
    if(existing)throw new Error('Output already contains a prepared calibration run; choose a new named output to preserve its evidence');
    await mkdir(output,{recursive:true});
    const manifest=await acquireReferences(ctx,output);
    await writeJson(path.join(output,'request.json'),{schemaVersion:1,experimentKey:ctx.key,output,defaults,device:ctx.options.device??ctx.config.renderDevice,startedAt});
    return finish(ctx,output,{referenceData:manifest.dataSha256},[path.join(output,'request.json'),...await listFiles(path.join(output,'references'))]);
}

async function blender(ctx,output,stage){
    const input={...await request(output),stage};
    const file=path.join(output,stage+'_request.json');await writeJson(file,input);
    if(ctx.options.mode!=='background')await ctx.process('powershell.exe',['-NoProfile','-Command',"if (@(Get-Process -Name blender -ErrorAction SilentlyContinue).Count) { Write-Error 'Blender is occupied. Preserve that session; use the explicit background stage mode for an isolated render.'; exit 1 }"]);
    await runBlenderStage(ctx,TOOL+'/blender.py',[file],{background:ctx.options.mode==='background'});
}

/** @param {any} ctx */
export async function prepare(ctx){
    const output=await upstream(ctx,'references');
    await blender(ctx,output,'prepare');
    return finish(ctx,output,{},['calibration.blend','scene.json','prepare_request.json'].map(f=>path.join(output,f)));
}

/** @param {any} ctx */
export async function capture(ctx){
    const output=await upstream(ctx,'references');
    await captureGame(ctx,output,(await request(output)).defaults);
    return finish(ctx,output,{},[path.join(output,'game.json'),...await listFiles(path.join(output,'game'))]);
}

/** @param {any} ctx */
export async function render(ctx){
    const output=await upstream(ctx,'prepare');
    await blender(ctx,output,'render');
    return finish(ctx,output,{},[path.join(output,'cycles.json'),path.join(output,'render_request.json'),...await listFiles(path.join(output,'cycles'))]);
}

/** @param {any} ctx */
export async function analyze(ctx){
    const output=await upstream(ctx,'render');
    if(await upstream(ctx,'capture')!==output)throw new Error('Mismatched calibration stages');
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'analyze.py'),output]);
    await copyFile(path.join(ctx.root,TOOL,'report.css'),path.join(output,'report/report.css'));
    return finish(ctx,output,{},await listFiles(path.join(output,'report')));
}

/** @param {any} ctx */
export async function complete(ctx){
    const output=await upstream(ctx,'analyze');
    const record=await request(output);
    const report=JSON.parse(await readFile(path.join(output,'report/summary.json'),'utf8'));
    await writeJson(path.join(output,'execution.json'),{completedAt:new Date().toISOString(),secondsFromAcquisition:(Date.now()-Date.parse(record.startedAt))/1000,report:path.join(output,'report/index.html'),checks:{passed:report.passed,failed:report.failed},scene:await hashFile(path.join(output,'calibration.blend'))});
    ctx.log.line(ctx.id,`${report.passed} passes, ${report.failed} renderer mismatches; report: ${path.join(output,'report/index.html')}`);
    return finish(ctx,output,{},[path.join(output,'execution.json')]);
}
