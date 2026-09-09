// Image stages use the configured Python runtime, without launching Blender or the game.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { TOOL, readJson } from './Inputs.mjs';
import { config, authenticated, codeIdentity, receipt, resultFiles } from './StageInputs.mjs';
import { writeJson, digest, listFiles } from '../../../baking/Files.mjs';
import {loadImageHandoff} from './ImageHandoff.mjs';

export async function processStage(ctx,run,stage) {
    if(ctx.publish)throw new Error('Experiments never publish');
    const quality=ctx.options.quality??'pilot',output=path.join(run.runRoot,stage==='analyze'?'analysis':stage,quality);
    await mkdir(output,{recursive:true});
    const handoff=await loadImageHandoff(ctx,run,stage);
    const settings=await config(ctx,run,stage==='postprocess'?'color_management':'analysis');
    const code=await codeIdentity(ctx.root,[`${stage}/${stage==='postprocess'?'process':'analyze'}.py`,'postprocess/color_pipeline.py','Processing.mjs','ImageHandoff.mjs']);
    const request=path.join(output,'request.json');
    await writeJson(request,{renders:handoff.renderFile,processed:handoff.processedFile,config:settings.value,output,code,runRoot:run.runRoot});
    const started=Date.now();
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,stage,stage==='postprocess'?'process.py':'analyze.py'),request]);
    const data=await readJson(path.join(output,stage==='postprocess'?'processed.json':'analysis.json'));
    const file=path.join(output,stage==='postprocess'?'postprocess_manifest.json':'analysis_manifest.json');
    const outputs=stage==='postprocess'?data.records.flatMap(item=>[item.file,item.file.replace(/\.png$/,'.json')]):[path.join(output,'analysis.json'),path.join(output,'metrics.csv'),...await listFiles(path.join(output,'crops'))];
    const result=await receipt(file,digest({renders:handoff.renders.key,processed:handoff.processed?.key,settings:settings.hash,code}),{...data,quality,stageSeconds:(Date.now()-started)/1000},outputs);
    ctx.log.line(ctx.id,`${stage}: ${data.records?.length??data.images?.length??0} images; ${((Date.now()-started)/1000).toFixed(1)}s`);
    return resultFiles(result,file);
}
