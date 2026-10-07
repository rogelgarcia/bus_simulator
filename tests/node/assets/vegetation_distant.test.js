// Validates literal far-tree budgets, cluster amortization and installed model authentication.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,access} from 'node:fs/promises';
import {validateBudget,validateSpecies} from '../../../tools/bake_vegetation/distant/Validate.mjs';
import {distantJob} from '../../../tools/bake_vegetation/distant/job.mjs';
import {vegetationJobs} from '../../../tools/bake_vegetation/jobs.mjs';
import {SPECIES} from '../../../tools/bake_vegetation/lod0_library/Package.mjs';

test('distant LOD triangle budgets count shared plates once and ten trees honestly',()=>{
    for(const [level,wood,leaves,mixed,treeCount]of [[3,30,30,0,1],[3,6,30,0,1],[4,6,6,0,1],[5,0,0,2,1],[6,0,0,2,10]]){
        const row={level,woodTriangles:wood,leafTriangles:leaves,mixedTriangles:mixed,treeCount,trianglesPerTree:(wood+leaves+mixed)/treeCount};
        validateBudget(row,{wood,leaves,mixed});
        assert.throws(()=>validateBudget({...row,treeCount:treeCount+1},{wood,leaves,mixed}),/amortization/);
    }
    assert.throws(()=>validateBudget({level:3,woodTriangles:32,leafTriangles:30,mixedTriangles:0,treeCount:1,trianglesPerTree:62},{wood:32,leaves:30,mixed:0}),/budget/);
    assert.throws(()=>validateBudget({level:5,woodTriangles:0,leafTriangles:0,mixedTriangles:4,treeCount:1,trianglesPerTree:4},{wood:0,leaves:0,mixed:4}),/two-triangle/);
});

test('distant generation is registered, explicit and cannot write into source or asset directories',async()=>{
    assert.ok(vegetationJobs.includes(distantJob));assert.ok(!vegetationJobs.find(j=>j.id==='vegetation').children.includes(distantJob.id));
    for(const output of ['assets/public/vegetation_distant',distantJob.defaults.source,distantJob.defaults.source+'/child','tests/artifacts/screens']){
        await assert.rejects(distantJob.run({root:path.resolve('.'),config:{},options:{...distantJob.defaults,output}}),/separate artifact/);
    }
});

test('each species agent supplies measured nonuniform centers for all three forms',async()=>{
    for(const species of SPECIES){
        const profile=JSON.parse(await readFile(`tools/bake_vegetation/distant/species/${species}.json`,'utf8'));
        assert.equal(profile.species,species);assert.equal(profile.schema,1);
        for(const variant of ['mature_01','mature_02','mature_03']){
            const centers={...profile,...profile.variants[variant]}.lod3CanopyClusters;
            assert.equal(centers.length,5);assert.ok(centers.flat().every(v=>Number.isFinite(v)&&v>=0&&v<=1));
            assert.equal(new Set(centers.map(v=>JSON.stringify(v))).size,5);
        }
    }
});

test('LOD3/4 doubles foliage texel dimensions and shares a species atlas across all six models',async()=>{
    for(const species of SPECIES){
        const file=`assets/public/vegetation_distant/${species}/index.json`;
        if(!await access(file).then(()=>true,()=>false))continue;
        const manifest=JSON.parse(await readFile(file,'utf8')),rows=manifest.models.filter(r=>r.level<=4),identities=new Set();
        assert.equal(rows.length,6);
        for(const row of rows){
            assert.equal(row.leafCards.resolution,512);assert.ok(row.leafCards.uniquePerSpecies<row.leafCards.placementsPerSpecies);
            const shared=row.compression.filter(t=>t.uri);assert.equal(shared.length,3);
            for(const texture of shared){assert.equal(texture.size[0],2048);assert.equal(texture.size[1]%512,0);identities.add(texture.sha256);}
            for(const view of row.views.filter(v=>v.role==='leaves'))assert.ok(view.silhouetteIoU>=(row.level===3?.68:.82));
        }
        assert.equal(identities.size,3,'All variants and both LODs must reference the same three maps');
    }
});

for(const species of SPECIES){
    const directory=path.resolve('assets/public/vegetation_distant',species);
    const available=await access(path.join(directory,'index.json')).then(()=>true,()=>false);
    test(`installed distant ${species} authenticates 12 exports and PBR`,{skip:!available},()=>validateSpecies({directory}));
}
