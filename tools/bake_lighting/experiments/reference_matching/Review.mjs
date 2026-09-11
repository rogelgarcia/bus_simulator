// Authenticate immutable iterations and build one pose-grouped history without modifying captures.
import path from 'node:path';
import {mkdir,readFile,access} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles,hashFile} from '../../../baking/Files.mjs';
import {outputPath,TOOL} from './Baseline.mjs';

const read=async file=>JSON.parse(await readFile(file,'utf8'));
export async function review(ctx){
    if(ctx.publish||!ctx.options.output||!ctx.options.iterations||!ctx.options.reference)throw new Error('New output, comma-separated iterations and reference required');
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    const reference=outputPath(ctx.root,ctx.options.reference);await authenticated(path.join(reference,'reference_receipt.json'));
    const referenceHistory=[];
    for(const item of (ctx.options.references??'').split(',').filter(Boolean)){
        const root=outputPath(ctx.root,item);await authenticated(path.join(root,'reference_receipt.json'));
        referenceHistory.push({id:path.basename(root),renders:await read(path.join(root,'renders.json'))});
    }
    const sources=[];
    for(const item of ctx.options.iterations.split(',')){
        const root=outputPath(ctx.root,item);
        const base=await access(path.join(root,'baseline_receipt.json')).then(()=>true,()=>false);
        await authenticated(path.join(root,base?'baseline_receipt.json':'capture_receipt.json'));
        const run=await read(path.join(root,'manifest.json')),manifest=await read(run.baselineManifest);
        sources.push({root,id:run.runId,prepared:await read(path.join(root,'prepared.json')),manifest});
    }
    for(const item of (ctx.options.rejected??'').split(',').filter(Boolean)){
        const root=outputPath(ctx.root,item),prepared=await read(path.join(root,'prepared.json'));
        const manifest=await read(path.join(root,'runtime',prepared.baseline.id,`${prepared.viewport.width}x${prepared.viewport.height}`,'baseline_manifest.json'));
        // Rejected/incomplete runs have no acceptance receipt. Authenticate only
        // their captured bytes, mark them as context, and exclude error scoring.
        for(const record of manifest.images){
            const image=path.resolve(root,record.image);
            if(!image.startsWith(root+path.sep)||(await hashFile(image)).sha256!==record.sha256)throw new Error('Rejected image provenance changed');
        }
        sources.push({root,id:prepared.runId,prepared,manifest,reviewOnly:true});
    }
    sources.sort((a,b)=>a.id.localeCompare(b.id));
    const configPath=path.join(ctx.root,TOOL,'review.json'),config=await read(configPath);
    const request={output,reference,referenceRequest:await read(path.join(reference,'request.json')),renders:await read(path.join(reference,'renders.json')),sources,config,configIdentity:await hashFile(configPath),historical:path.join(ctx.root,'tests/artifacts/screens/ai562_acesfilmic_reference_matching/references')};
    request.referenceHistory=referenceHistory;
    await writeJson(path.join(output,'request.json'),request);
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'review.py'),output]);
    const file=path.join(output,'review_receipt.json');return resultFiles(await receipt(file,ctx.key,{output},await listFiles(output)),file);
}
