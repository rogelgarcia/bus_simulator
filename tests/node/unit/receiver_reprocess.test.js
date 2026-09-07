import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {hashFile} from '../../../tools/baking/Files.mjs';
import {validateUnpublishedReceiverBake} from '../../../tools/bake_lighting/illumination/reprocess/job.mjs';

test('Unpublished recovery requires both complete, unmodified passes from the same atlas and Blender build',async()=>{
    const base=path.resolve('tests/artifacts/screens/ai556_bake_framework/unit');
    await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'recovery-'));
    const save=async(name,data)=>writeFile(path.join(root,name),typeof data==='object'?JSON.stringify(data):data);
    const profile={irradianceRepresentation:'surface-diffuse-v1',samples:896,device:'OPTIX'};
    await save('job.json',{fixture:true});await save('atlas.json',{pageCount:1,profile});
    const receipts={};
    for(const pass of ['bounce','sky']){
        await save(`${pass}.0.npy`,'fixture raw sample');
        const raw=await hashFile(path.join(root,`${pass}.0.npy`));
        receipts[pass]={schema:'bus-sim-independent-receiver-pass-v1',pass,jobSha256:(await hashFile(path.join(root,'job.json'))).sha256,
            atlasSha256:(await hashFile(path.join(root,'atlas.json'))).sha256,chartSha256:null,signature:{build:'same'},
            files:[{file:`${pass}.0.npy`,bytes:raw.bytes,sha256:raw.sha256}]};
        await save(`${pass}.receipt.json`,receipts[pass]);
        if(pass==='bounce')await assert.rejects(validateUnpublishedReceiverBake(root),/ENOENT/);
    }
    assert.deepEqual(await validateUnpublishedReceiverBake(root),profile);
    await save('sky.0.npy','truncated');await assert.rejects(validateUnpublishedReceiverBake(root),/hash mismatch/);
    await save('sky.0.npy','fixture raw sample');
    await save('sky.receipt.json',{...receipts.sky,signature:{build:'different'}});
    await assert.rejects(validateUnpublishedReceiverBake(root),/Different Blender builds/);
    await save('sky.receipt.json',{...receipts.sky,atlasSha256:'changed'});
    await assert.rejects(validateUnpublishedReceiverBake(root),/atlas or settings mismatch/);
});
