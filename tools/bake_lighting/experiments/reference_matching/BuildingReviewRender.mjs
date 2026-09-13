// Render one corrected full target and a primary-geometric Lambert control from the same scene.
import path from 'node:path';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { reference } from './Reference.mjs';
import { outputPath, TOOL } from './Baseline.mjs';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { writeJson, listFiles } from '../../../baking/Files.mjs';
import { runBlenderStage } from '../../../baking/Blender.mjs';

export async function buildingReviewRender(ctx) {
    if(ctx.publish||!ctx.options.output||!ctx.options.capture||!ctx.options['source-run'])throw new Error('capture, source-run, new output required; diagnostic only');
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(output);
    const full=path.join(output,'full'),control=path.join(output,'geometric_diffuse');
    await reference({...ctx,options:{capture:ctx.options.capture,output:full,'source-run':ctx.options['source-run'],mode:'background',quality:'pilot'}});
    await authenticated(path.join(full,'reference_receipt.json'));
    await mkdir(control);
    for(const file of ['source_city.blend','scene.json'])await copyFile(path.join(full,file),path.join(control,file));
    const request=JSON.parse(await readFile(path.join(full,'request.json'),'utf8'));
    Object.assign(request,{output:control,diagnosticTransport:'primary-geometric-diffuse',skipContributions:true});
    await writeJson(path.join(control,'request.json'),request);
    await runBlenderStage(ctx,TOOL+'/render_reference.py',[control],{background:true});
    const file=path.join(output,'building_reference_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,capture:ctx.options.capture,diagnosticOnly:true},await listFiles(output)),file);
}
