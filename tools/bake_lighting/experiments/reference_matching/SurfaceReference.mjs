// Reuse authenticated resolved surfaces for import validation and Cycles rerenders.
import path from 'node:path';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {outputPath,TOOL} from './Baseline.mjs';

export async function surfaceReference(ctx){
    if(ctx.publish||!ctx.options.input||!ctx.options.output)throw new Error('Authenticated surface reference and new output required');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(input,'reference_receipt.json'));
    const request=JSON.parse(await readFile(path.join(input,'request.json'),'utf8'));
    const exported=await authenticated(request.exportManifest);
    if(!exported.build.nativeSurfaceMaterials?.length)throw new Error('Input lacks native surface export');
    let extraPoses;
    if(ctx.options.capture){
        const capture=outputPath(ctx.root,ctx.options.capture);
        await authenticated(path.join(capture,'material_parity_capture_receipt.json'));
        const prepared=JSON.parse(await readFile(path.join(capture,'prepared.json'),'utf8'));
        extraPoses=prepared.poses.filter(p=>!request.poses.some(existing=>existing.id===p.id));
        if(!extraPoses.length)throw new Error('Capture has no independent additional pose');
    }
    await mkdir(output);await copyFile(path.join(input,'scene.json'),path.join(output,'scene.json'));
    await writeJson(path.join(output,'request.json'),{...request,input,output,device:ctx.config.renderDevice,
        extraPoses,poses:extraPoses??request.poses,
        expectedSurfaces:exported.build.nativeSurfaceMaterials.map(x=>x.object)});
    await runBlenderStage(ctx,TOOL+'/surface_reference.py',[output],{background:true});
    const file=path.join(output,'reference_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,input,exportManifest:request.exportManifest,
        materialPolicy:'Native resolved surfaces; corrected atlas UV basis. Texture AO remains a separate AOV, not physical albedo.'},await listFiles(output)),file);
}
