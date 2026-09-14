// @ts-check
// A small physical relief control, separate from unmeasured source texture depth.
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {outputPath,TOOL} from './Baseline.mjs';

/** Render explicit mortar relief and an erroneous extra-occlusion control. */
export async function aoGeometryFixture(ctx){
    if(ctx.publish||!ctx.options.output)throw new Error('New diagnostic output required');
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(output);
    const recipe={depthMeters:[0,.005,.01,.02],brickWidthMeters:.24,brickHeightMeters:.075,mortarMeters:.01,
        albedo:.18,samples:1024,seed:569,device:ctx.config.renderDevice,
        policy:'Uniform unit white environment, diffuse-only material, explicit geometric brick relief. Color-weighted Direct divided by albedo measures primary environment visibility separately from bounce. Source asset relief depth is not calibrated; this fixture does not certify its AO strength.'};
    await writeJson(path.join(output,'request.json'),recipe);
    await runBlenderStage(ctx,TOOL+'/ao_geometry_fixture.py',[output],{background:true});
    const file=path.join(output,'ao_geometry_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,diagnosticOnly:true},await listFiles(output)),file);
}
