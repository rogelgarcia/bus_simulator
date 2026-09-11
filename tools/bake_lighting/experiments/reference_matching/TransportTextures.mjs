// Validate the bake compiler's raw image interpretation against known linear values.
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {listFiles} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {TOOL,outputPath} from './Baseline.mjs';
export async function transportTextures(ctx){
    if(ctx.publish||!ctx.options.output)throw new Error('New diagnostic output required; no publication');
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    await runBlenderStage(ctx,TOOL+'/transport_textures.py',[output],{background:true});
    const file=path.join(output,'texture_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output},await listFiles(output)),file);
}
