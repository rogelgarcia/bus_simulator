// Checks reference format/provenance gates without requiring user-supplied images.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {referenceImage,readStudies} from '../../../tools/bake_vegetation/branching_study/references.mjs';
import {hashFile} from '../../../tools/baking/Files.mjs';
import {species} from '../../../tools/bake_vegetation/branching_study/species.mjs';

test('PNG/JPEG imports preserve extension and reject mislabeled bytes, hash changes and escaped paths',async()=>{
    const parent=path.resolve('tests/artifacts/node/vegetation_reference_inputs');await mkdir(parent,{recursive:true});
    const root=await mkdtemp(path.join(parent,'case-')),images=[];
    for(const [i,id] of Object.keys(species).entries()){
        const extension=i%2?'.png':'.jpg',file=id+extension;
        const bytes=Buffer.from(i%2?'89504e470d0a1a0a':'ffd8ffe00010','hex');await writeFile(path.join(root,file),bytes);
        images.push({species:id,file,source:'supplied-'+id,...await hashFile(path.join(root,file))});
    }
    const manifest=path.join(root,'manifest.json');await writeFile(manifest,JSON.stringify({images}));
    const imported=await readStudies(root,manifest);assert.equal(imported.length,5);
    assert.equal(imported[0].extension,'.jpg');assert.equal(imported[1].extension,'.png');
    assert.ok(imported.every((row,i)=>row.sha256===images[i].sha256));
    await writeFile(path.join(root,'wrong.png'),await readFile(imported[0].file));
    await assert.rejects(referenceImage(path.join(root,'wrong.png')),/correctly named/);
    await writeFile(imported[0].file,Buffer.from('ffd8ffe00020','hex'));
    await assert.rejects(readStudies(root,manifest),/changed/);
    const escaped=structuredClone(images);escaped[0].file='../outside.jpg';await writeFile(manifest,JSON.stringify({images:escaped}));
    await assert.rejects(readStudies(root,manifest),/within/);
    await writeFile(manifest,JSON.stringify({images:images.slice(1)}));await assert.rejects(readStudies(root,manifest),/Expected one/);
});
