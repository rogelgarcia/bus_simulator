// Export actual revised game materials, then build an independently reusable Cycles reference.
import path from 'node:path';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {exportCity} from '../lighting_configurations/export_city/ExportCity.mjs';
import {sourceFiles,snapshotFiles} from '../lighting_configurations/Inputs.mjs';
import {listFiles,digest,writeJson} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {TOOL,outputPath} from './Baseline.mjs';

export async function reference(ctx){
    if(ctx.publish||!ctx.options.capture||!ctx.options['source-run']||!ctx.options.output)throw new Error('capture, source-run and new output required; no publication');
    const capture=outputPath(ctx.root,ctx.options.capture);await authenticated(path.join(capture,'capture_receipt.json'));
    const run=JSON.parse(await readFile(path.join(capture,'prepared.json'),'utf8'));
    const source=path.resolve(ctx.root,ctx.options['source-run']);await authenticated(path.join(source,'afternoon_receipt.json'));
    const input=JSON.parse(await readFile(path.join(source,'request.json'),'utf8'));
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    run.runRoot=output;run.source.files=await snapshotFiles(ctx.root,await sourceFiles(ctx.root));run.source.sha256=digest(run.source.files);
    const exported=await exportCity(ctx,run),scene=await authenticated(exported.manifest);
    await copyFile(scene.scene,path.join(output,'source_city.blend'));
    const request={output,source,poses:run.poses,exportManifest:exported.manifest,defaults:input.defaults,exposureEv:input.exposureEv,ocioConfig:input.ocioConfig,device:ctx.config.renderDevice,width:ctx.options.quality==='final'?3840:1920,height:ctx.options.quality==='final'?2160:1080,samples:ctx.options.quality==='final'?256:128};
    request.defaults.sun.elevationDeg=55;
    await writeJson(path.join(output,'request.json'),request);
    if(ctx.options.mode!=='background')await ctx.process('powershell.exe',['-NoProfile','-Command',"if (@(Get-Process -Name blender -ErrorAction SilentlyContinue).Count) { Write-Error 'Blender is occupied'; exit 1 }"]);
    await runBlenderStage(ctx,TOOL+'/render_reference.py',[output],{background:ctx.options.mode==='background'});
    const manifest=path.join(output,'reference_receipt.json');return resultFiles(await receipt(manifest,ctx.key,{output,exportManifest:exported.manifest},await listFiles(output)),manifest);
}
