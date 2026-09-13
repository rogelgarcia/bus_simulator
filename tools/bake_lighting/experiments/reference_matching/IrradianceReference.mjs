// Separate source-world and source-scene differences after validating receiver delivery.
import path from 'node:path';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { runBlenderStage } from '../../../baking/Blender.mjs';
import { writeJson, listFiles, hashFile } from '../../../baking/Files.mjs';
import { outputPath, TOOL } from './Baseline.mjs';

export async function irradianceReference(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output)throw new Error('Validated irradiance analysis and new output required');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    const accepted=await authenticated(path.join(input,'irradiance_analysis_receipt.json'));
    const trace=JSON.parse(await readFile(path.join(accepted.input,'request.json'),'utf8'));
    const reference=path.join(trace.reference,'full'),job=JSON.parse(await readFile(path.join(trace.bake,'job.json'),'utf8'));
    const sourcePackage={file:path.join(trace.bake,'source.bsib'),sha256:job.packageSha256};
    if((await hashFile(sourcePackage.file)).sha256!==sourcePackage.sha256)throw new Error('Original bake source package changed');
    await mkdir(output);
    await writeJson(path.join(output,'request.json'),{trace:accepted.input,reference:trace.reference,input,sourcePackage,diagnosticOnly:true});
    for(const reconstructSource of [false,true]) {
        const folder=path.join(output,reconstructSource?'source_scene':'source_lighting');await mkdir(folder);
        for(const file of ['source_city.blend','scene.json'])await copyFile(path.join(reference,file),path.join(folder,file));
        const request=JSON.parse(await readFile(path.join(reference,'request.json'),'utf8'));
        Object.assign(request,{output:folder,poses:request.poses.filter(p=>p.id==='pose_custom'),sourcePackage,reconstructSource,
            diagnosticTransport:'primary-geometric-diffuse',skipContributions:true,samples:256});
        await writeJson(path.join(folder,'request.json'),request);
        await runBlenderStage(ctx,TOOL+'/render_reference.py',[folder],{background:true});
    }
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'irradiance_reference_analysis.py'),output]);
    const file=path.join(output,'irradiance_reference_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,input,diagnosticOnly:true},await listFiles(output)),file);
}

export async function irradianceFixture(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output)throw new Error('Source control and new output required');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(input,'irradiance_reference_receipt.json'));
    await mkdir(output);
    await writeJson(path.join(output,'request.json'),{input,device:ctx.config.renderDevice,sampleClamp:ctx.options['sample-clamp']??'native'});
    await runBlenderStage(ctx,TOOL+'/irradiance_fixture.py',[output],{background:true});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'irradiance_fixture_analysis.py'),output]);
    const file=path.join(output,'fixture_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{input,output,diagnosticOnly:true},await listFiles(output)),file);
}

export async function irradianceWall(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output)throw new Error('Source control and new output required');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(input,'irradiance_reference_receipt.json'));
    await mkdir(output);
    await writeJson(path.join(output,'request.json'),{input,device:ctx.config.renderDevice});
    const analysis=path.join(ctx.root,TOOL,'irradiance_wall_analysis.py');
    const replay=ctx.options.replay?outputPath(ctx.root,ctx.options.replay):null;
    if(replay){
        const accepted=await authenticated(path.join(replay,'wall_receipt.json'));
        if(accepted.input!==input)throw new Error('Replay source control differs');
        for(const file of ['selection.json','chart.json','clamp10_sky.npy','clamp10_bounce.npy','clamp0_sky.npy','clamp0_bounce.npy'])
            await copyFile(path.join(replay,file),path.join(output,file));
    }else{
        await ctx.process(ctx.config.pythonExecutable,[analysis,output,'prepare']);
        await runBlenderStage(ctx,TOOL+'/irradiance_wall.py',[output],{background:true});
    }
    await ctx.process(ctx.config.pythonExecutable,[analysis,output,'analyze']);
    const file=path.join(output,'wall_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{input,output,replay,diagnosticOnly:true},await listFiles(output)),file);
}
