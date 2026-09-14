// @ts-check
// Reuse authenticated raw controls; never alter a game or physical reference image.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {outputPath,TOOL} from './Baseline.mjs';

/** Audit AO and test a white-environment reflection normalization on held-out city inputs. */
export async function aoResponseStudy(ctx){
    if(ctx.publish||!['capture','reference','fixture','output'].every(k=>ctx.options[k]))throw new Error('Authenticated capture, reference, fixture and new output required');
    const read=async file=>JSON.parse(await readFile(file,'utf8'));
    const capture=outputPath(ctx.root,ctx.options.capture),reference=outputPath(ctx.root,ctx.options.reference);
    const fixture=outputPath(ctx.root,ctx.options.fixture),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(capture,'material_parity_capture_receipt.json'));
    await authenticated(path.join(reference,'reference_receipt.json'));
    await authenticated(path.join(fixture,'specular_fixture_receipt.json'));
    const request=await read(path.join(capture,'request.json')),resolved=await read(path.join(reference,'request.json'));
    await authenticated(path.join(request.control,'bake_progress_receipt.json'));
    const poses=request.poses.filter(p=>resolved.poses.some(q=>q.id===p.id));
    if(poses.length!==5)throw new Error('All five reference poses required');
    for(const pose of poses)if(JSON.stringify(pose)!==JSON.stringify(resolved.poses.find(q=>q.id===pose.id)))throw new Error('Changed pose '+pose.id);
    await mkdir(output);await writeJson(path.join(output,'request.json'),{capture,reference,fixture,control:request.control,poses});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'ao_response_study.py'),output]);
    const file=path.join(output,'ao_response_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,diagnosticOnly:true},await listFiles(output)),file);
}
