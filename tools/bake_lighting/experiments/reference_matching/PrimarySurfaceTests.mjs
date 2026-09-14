// Authenticated camera-only surface controls and pose 04 irradiance delivery audit.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {outputPath,TOOL} from './Baseline.mjs';
const read=async f=>JSON.parse(await readFile(f,'utf8'));

export async function primarySurfaceReference(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.control||!ctx.options.output)throw new Error('input, control and new output required; no publication');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    const control=outputPath(ctx.root,ctx.options.control);
    await authenticated(path.join(control,'bake_progress_receipt.json'));
    await authenticated(path.join(input,'reference_receipt.json'));
    const source=await read(path.join(input,'request.json'));
    await mkdir(output);
    await writeJson(path.join(output,'request.json'),{...source,input,output,control,device:ctx.config.renderDevice,
        poses:source.poses.filter(p=>['pose_02','pose_04'].includes(p.id)),
        variants:['native','geometric','geometric_constant','normal_constant','lambert'],roughness:.85,
        regionPolicy:'Frozen shaded wall bounding box plus 24 pixels; full camera dimensions and full secondary-ray scene retained'});
    const started=Date.now();
    await runBlenderStage(ctx,TOOL+'/primary_surface_reference.py',[output],{background:true});
    const file=path.join(output,'primary_surface_reference_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{input,output,seconds:(Date.now()-started)/1000,diagnosticOnly:true},await listFiles(output)),file);
}

export async function primarySurfaceAnalysis(ctx) {
    if(ctx.publish||!['capture','reference','bake-dir','output'].every(k=>ctx.options[k]))throw new Error('capture, reference, bake-dir, new output required');
    const capture=outputPath(ctx.root,ctx.options.capture),reference=outputPath(ctx.root,ctx.options.reference),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(capture,'material_parity_capture_receipt.json'));
    const ref=await authenticated(path.join(reference,'primary_surface_reference_receipt.json'));
    const request=await read(path.join(capture,'request.json'));
    await authenticated(path.join(request.control,'bake_progress_receipt.json'));
    await authenticated(path.join(ref.input,'reference_receipt.json'));
    const actual=await read(path.join(reference,'request.json')),original=await read(path.join(request.reference,'request.json'));
    for(const key of ['defaults','exposureEv','width','height'])
        if(JSON.stringify(actual[key])!==JSON.stringify(original[key]))throw new Error('Changed reference control: '+key);
    for(const p of actual.poses)if(JSON.stringify(p)!==JSON.stringify(request.poses.find(v=>v.id===p.id)))throw new Error('Changed pose '+p.id);
    const bake=path.resolve(ctx.root,ctx.options['bake-dir']);
    const installed=await read(path.join(ctx.root,'assets/baked_lighting/receivers/enhanced/package_index.json'));
    const offline=await read(path.join(bake,'package_index.json'));
    if(installed.sourceHash!==offline.sourceHash||JSON.stringify(installed.mapping)!==JSON.stringify(offline.mapping)
        ||installed.channels.indirect_irradiance.aggregateSha256!==offline.channels.indirect_irradiance.aggregateSha256)throw new Error('Offline bake differs from installed receiver');
    await mkdir(output);
    await writeJson(path.join(output,'request.json'),{...request,capture,reference,nativeReference:ref.input,bake});
    const started=Date.now();
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'primary_surface_analysis.py'),output]);
    const file=path.join(output,'primary_surface_analysis_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,seconds:(Date.now()-started)/1000,diagnosticOnly:true},await listFiles(output)),file);
}
