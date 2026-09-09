// Workflow-only coordination; standalone stage implementations remain reusable.
import path from 'node:path';
import { readJson, verifyFiles } from './Inputs.mjs';
import { hashFile } from '../../../baking/Files.mjs';

export async function captureOrReuse(ctx,run,quality='pilot') {
    const viewport=quality==='final'?{width:3840,height:2160}:{width:1920,height:1080};
    const directory=path.join(run.runRoot,'runtime',run.baseline.id,`${viewport.width}x${viewport.height}`),file=path.join(directory,'baseline_manifest.json');
    let saved;
    try{saved=await readJson(file);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(saved?.status==='validated'&&saved.source===run.source.sha256&&saved.images.length===run.poses.length) {
        let valid=true;const files=[];
        for(const image of saved.images){const target=path.join(run.runRoot,image.image),evidence=path.join(directory,`${image.id}.json`);try{if((await hashFile(target)).sha256!==image.sha256||JSON.stringify(await readJson(evidence))!==JSON.stringify(image))valid=false;}catch{valid=false;}files.push(target,evidence);}
        if(valid)await verifyFiles(ctx.root,saved.resourceFiles??[]);
        if(valid){ctx.log.line(ctx.id,`Reusing ${saved.images.length} authenticated ${viewport.width}×${viewport.height} G00 baselines`);return {state:'validated',manifest:file,files:[file,...files]};}
    }
    const {captureBaselines}=await import('./capture_baselines/CaptureBaselines.mjs');
    return captureBaselines(ctx,{...run,viewport});
}
