// Reuse an authenticated export to isolate the receiver bake's primary diffuse model.
import path from 'node:path';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {TOOL,outputPath} from './Baseline.mjs';
import {candidateInputs} from './CandidateInputs.mjs';

export async function transportReference(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.capture||!ctx.options.output)
        throw new Error('Diagnostic requires an authenticated reference, capture and new output; no publication');
    const input=outputPath(ctx.root,ctx.options.input),capture=outputPath(ctx.root,ctx.options.capture);
    await authenticated(path.join(input,'reference_receipt.json'));
    await authenticated(path.join(capture,'capture_receipt.json'));
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    const request=JSON.parse(await readFile(path.join(input,'request.json'),'utf8'));
    Object.assign(request,{output,capture,referenceInput:input,width:1920,height:1080,samples:128,diagnosticTransport:'primary-geometric-diffuse',
        poses:request.poses.filter(pose=>['pose_02','pose_03'].includes(pose.id))});
    if(ctx.options['candidate-run']) {
        const candidate=await candidateInputs(ctx,ctx.options['candidate-run']);
        const folder=path.dirname(candidate.receiverIndex),job=JSON.parse(await readFile(path.join(folder,'job.json'),'utf8'));
        request.sourcePackage={file:path.join(folder,'source.bsib'),sha256:job.packageSha256};
        request.reconstructSource=ctx.options['reconstruct-source']==='true';
    }
    await copyFile(path.join(input,'source_city.blend'),path.join(output,'source_city.blend'));
    await copyFile(path.join(input,'scene.json'),path.join(output,'scene.json'));
    await writeJson(path.join(output,'request.json'),request);
    await runBlenderStage(ctx,TOOL+'/render_reference.py',[output],{background:true});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'transport_analysis.py'),output]);
    const file=path.join(output,'transport_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,input,capture,diagnosticOnly:true},await listFiles(output)),file);
}
