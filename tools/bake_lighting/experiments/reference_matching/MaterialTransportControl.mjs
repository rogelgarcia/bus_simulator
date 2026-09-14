// Reuse the authenticated reference for causal local-reflection and normal controls.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { writeJson, listFiles } from '../../../baking/Files.mjs';
import { runBlenderStage } from '../../../baking/Blender.mjs';
import { outputPath, TOOL } from './Baseline.mjs';

export async function materialTransportControl(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output)throw new Error('Authenticated input and new output required; diagnostic only');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(input,'reference_receipt.json'));
    const request=JSON.parse(await readFile(path.join(input,'request.json'),'utf8'));
    let capture;
    if(ctx.options.phase==='matched-roughness') {
        if(!ctx.options.capture)throw new Error('Matched roughness needs an authenticated game capture');
        capture=outputPath(ctx.root,ctx.options.capture);
        await authenticated(path.join(capture,'material_parity_capture_receipt.json'));
        const source=JSON.parse(await readFile(path.join(capture,'request.json'),'utf8'));
        if(path.resolve(source.reference)!==input)throw new Error('Game capture/reference mismatch');
    }
    await mkdir(output);
    await writeJson(path.join(output,'request.json'),{...request,input,output,capture,device:ctx.config.renderDevice,
        poses:request.poses.filter(p=>ctx.options.phase==='global-only'||['pose_02','pose_03'].includes(p.id)),
        variants:ctx.options.phase==='global-only' ? [{id:'global_glossy',globalGlossy:true,flat:false}]
            : ctx.options.phase==='matched-roughness' ? [{id:'matched_roughness',globalGlossy:false,flat:false}]
            : ctx.options.phase==='inputs' ? [{id:'inputs',globalGlossy:false,flat:false}]
            : [{id:'global_glossy',globalGlossy:true,flat:false},{id:'local_flat',globalGlossy:false,flat:true},{id:'global_flat',globalGlossy:true,flat:true}]});
    await runBlenderStage(ctx,TOOL+'/material_transport_control.py',[output],{background:true});
    const file=path.join(output,'material_transport_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,input,diagnosticOnly:true},await listFiles(output)),file);
}
