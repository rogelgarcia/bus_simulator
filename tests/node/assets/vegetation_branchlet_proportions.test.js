// Prevents connected sprays from inheriting the narrow aspect ratio of the old six-leaf grids.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,access} from 'node:fs/promises';
import {branchletsJob} from '../../../tools/bake_vegetation/branchlets/job.mjs';

const output=path.resolve(branchletsJob.defaults.output);
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const available=await access(path.join(output,'lod0/northern_red_oak/mature_01/layout.json')).then(()=>true,()=>false);

test('oak and elm exterior cards retain the authored branchlet proportions at both LODs',{skip:!available},async()=>{
    for(const species of ['northern_red_oak','american_elm']) for(const level of [0,1]) {
        const directory=path.join(output,`lod${level}`,species);
        const atlas=await json(path.join(directory,'canopy/atlas.json'));
        const ratios=new Map(atlas.tiles.filter(t=>t.kind==='outer').map(t=>[t.tile,t.physicalAspect]));
        for(const variant of ['mature_01','mature_02','mature_03']) {
            const layout=await json(path.join(directory,variant,'layout.json'));
            for(const plane of layout.planes.filter(p=>p.kind==='outer')) {
                assert.ok(Math.abs(plane.size[0]/plane.size[1]-ratios.get(plane.tile))<1e-6,
                    `${species}/${variant}/LOD${level}: authored ${ratios.get(plane.tile)} vs card ${plane.size[0]/plane.size[1]}`);
            }
        }
    }
});
