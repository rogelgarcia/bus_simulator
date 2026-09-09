// A display manifest must describe exactly the EXRs selected for this analysis.
// @ts-check
import path from 'node:path';
import { artifactPath, authenticated } from './StageInputs.mjs';

/** @param {any} renders @param {any} processed @param {{quality:string,source:string}} expected */
export function validateImageHandoff(renders,processed,{quality,source}) {
    if(renders.quality!==quality||renders.source!==source)throw new Error('Render quality/source differs from the prepared run');
    const byFile=new Map(renders.records.map(record=>[path.resolve(record.file),record]));
    if(byFile.size!==renders.records.length)throw new Error('Duplicate EXR in render manifest');
    if(!processed)return;
    if(processed.quality!==quality)throw new Error('Display quality differs from requested analysis');
    for(const display of processed.records){
        const raw=byFile.get(path.resolve(display.sourceExr));
        if(!raw||raw.sha256!==display.sourceSha256||raw.pose!==display.pose||raw.light!==display.light)
            throw new Error(`Display ${display.id} does not match the selected EXR/camera/light`);
        if(display.width!==raw.profile.width||display.height!==raw.profile.height)
            throw new Error(`Display ${display.id} has different dimensions from its EXR`);
    }
}

/** @param {any} ctx @param {any} run @param {'postprocess'|'analyze'} stage */
export async function loadImageHandoff(ctx,run,stage) {
    const quality=ctx.options.quality??'pilot';
    const renderFile=artifactPath(ctx.root,ctx.options.renders??path.join(run.runRoot,'linear',quality,'render_manifest.json'));
    const renders=await authenticated(renderFile);
    const processedFile=stage==='analyze'?artifactPath(ctx.root,ctx.options.processed??path.join(run.runRoot,'postprocess',quality,'postprocess_manifest.json')):undefined;
    const processed=processedFile?await authenticated(processedFile):undefined;
    validateImageHandoff(renders,processed,{quality,source:run.source.sha256});
    return {renderFile,renders,processedFile,processed,quality};
}
