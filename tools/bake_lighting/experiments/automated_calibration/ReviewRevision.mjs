// @ts-check
// Rebuild presentation in a new directory while keeping authenticated calibration results immutable.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {listFiles,hashFile} from '../../../baking/Files.mjs';
import {outputPath,TOOL} from './Plan.mjs';
export async function reviewRevision(ctx){
    if(ctx.publish||!ctx.options['source-run']||!ctx.options.output)throw new Error('Review revision requires source-run and a new output, without publication');
    const source=outputPath(ctx.root,ctx.options['source-run']),output=outputPath(ctx.root,ctx.options.output);
    for(const name of ['baseline','analyze','review'])await authenticated(path.join(source,name+'_receipt.json'));
    await mkdir(path.dirname(output),{recursive:true});await mkdir(output,{recursive:false});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'review.py'),source,output]);
    const sourceProfile=path.join(source,'profile.json'),profile=JSON.parse(await readFile(sourceProfile,'utf8'));
    const manifest=path.join(output,'review_revision_receipt.json');
    const result=await receipt(manifest,ctx.key,{source,sourceProfile:await hashFile(sourceProfile),publication:profile.publication,policy:'Presentation-only revision. Image bytes and selected calibration parameters are unchanged; production/current-source equivalence is not re-certified.'},await listFiles(output));
    return resultFiles(result,manifest);
}
