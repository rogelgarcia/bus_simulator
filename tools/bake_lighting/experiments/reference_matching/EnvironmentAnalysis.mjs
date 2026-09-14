// Authenticate native controls before measuring a diagnostic reflection replacement.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {outputPath,TOOL} from './Baseline.mjs';

export async function environmentAnalysis(ctx){
    const keys=['capture','original','reference','closeup','output'];
    if(ctx.publish||keys.some(k=>!ctx.options[k]))throw new Error('Capture, original raw controls, reference, closeup and new output required');
    const r=Object.fromEntries(keys.map(k=>[k,outputPath(ctx.root,ctx.options[k])]));
    const read=async p=>JSON.parse(await readFile(p,'utf8'));
    for(const k of ['capture','original'])await authenticated(path.join(r[k],'material_parity_capture_receipt.json'));
    for(const k of ['reference','closeup'])await authenticated(path.join(r[k],'reference_receipt.json'));
    const request=await read(path.join(r.capture,'request.json')),original=await read(path.join(r.original,'request.json'));
    if(JSON.stringify(request.poses)!==JSON.stringify(original.poses)||request.control!==original.control)throw new Error('Changed poses or fixed masks');
    const references=[...(await read(path.join(r.reference,'request.json'))).poses,...(await read(path.join(r.closeup,'request.json'))).poses];
    for(const pose of request.poses){
        if(JSON.stringify(references.find(p=>p.id===pose.id))!==JSON.stringify(pose))throw new Error('Changed Cycles pose');
        const a=await read(path.join(r.capture,pose.id,'evidence.json')),b=await read(path.join(r.original,pose.id,'evidence.json'));
        const comparable=value=>JSON.stringify(value).replace(/http:\/\/127\.0\.0\.1:\d+/g,'http://localhost');
        for(const key of ['lighting','atmosphere','graphics','viewport','actualPose','projectionMatrix','sourceHashes']){
            if(comparable(a.before[key])!==comparable(a.after[key])||comparable(a.before[key])!==comparable(b.before[key]))throw new Error('Changed '+pose.id+' '+key);
        }
    }
    await authenticated(path.join(request.control,'bake_progress_receipt.json'));
    await mkdir(r.output);await writeJson(path.join(r.output,'request.json'),{...r,poses:request.poses,control:request.control});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'environment_analysis.py'),r.output]);
    const file=path.join(r.output,'environment_analysis_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output:r.output,diagnosticOnly:true},await listFiles(r.output)),file);
}
