// Refreshes only GLB tangent directions in an authenticated finished review.
import path from 'node:path';
import {cp,readFile,writeFile} from 'node:fs/promises';
import {listFiles,hashFile,writeJson} from '../../baking/Files.mjs';
import {orthogonalizeTangents,auditTangentFrames,assertOnlyTangentDirectionsChanged} from './export_pbr.mjs';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const modelFile=file=>/\/seed-(1|31|92)\/model\.json$/.test(file);
const glbFile=file=>/\/seed-(1|31|92)\/tree\.glb$/.test(file);

export async function verifyExportPreservation(directory,manifest){
    const source=manifest.exportSourceReview.directory;
    if((await hashFile(path.join(source,'manifest.json'))).sha256!==manifest.exportSourceReview.manifestSha256)throw Error('Export source manifest changed');
    const previous=await json(path.join(source,'manifest.json'));
    for(const row of previous.files){
        const original=path.join(source,row.file),current=path.join(directory,row.file);
        if(glbFile(row.file))assertOnlyTangentDirectionsChanged(await readFile(original),await readFile(current));
        else if(modelFile(row.file)){
            const before=await json(original),after=await json(current);
            before.surfaceFinish.exportTangents=after.surfaceFinish.exportTangents;before.exportRepair=after.exportRepair;
            if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Export repair changed unrelated model receipt');
        }else if((await hashFile(current)).sha256!==row.sha256)throw Error('Export repair changed preserved file: '+row.file);
    }
}

export async function refreshExports(ctx,output,source){
    const manifest=await json(path.join(source,'manifest.json'));
    if(!manifest.surfaceFinish||!manifest.complete)throw Error('Export repair requires a complete finished review');
    await cp(source,output,{recursive:true,errorOnExist:true,force:false});
    for(const row of manifest.models){
        const folder=path.join(output,row.directory),file=path.join(folder,'tree.glb'),bytes=await readFile(file),before=Buffer.from(bytes);
        const repair=orthogonalizeTangents(bytes);assertOnlyTangentDirectionsChanged(before,bytes);
        repair.frames=auditTangentFrames(bytes);
        const model=await json(path.join(folder,'model.json'));
        model.surfaceFinish.exportTangents=repair;
        model.exportRepair={sourceGlbSha256:(await hashFile(path.join(source,row.directory,'tree.glb'))).sha256,onlyTangentDirectionsChanged:true};
        row.surfaceFinish=model.surfaceFinish;row.exportRepair=model.exportRepair;
        await writeFile(file,bytes);await writeJson(path.join(folder,'model.json'),model);
    }
    manifest.exportSourceReview={directory:source,manifestSha256:(await hashFile(path.join(source,'manifest.json'))).sha256};
    manifest.codeIdentity=ctx.key;await verifyExportPreservation(output,manifest);
    manifest.files=[];
    for(const file of await listFiles(output))if(file!==path.join(output,'manifest.json'))manifest.files.push({file:path.relative(output,file).split(path.sep).join('/'),...await hashFile(file)});
    await writeJson(path.join(output,'manifest.json'),manifest);await ctx.assertInputsStable();
    return {state:'validated',directory:output,files:await listFiles(output)};
}
