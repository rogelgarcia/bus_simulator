// Exercises canopy-only review isolation, immutable wood, organic attachment graphs and matched final evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,access} from 'node:fs/promises';
import {branchletsJob} from '../../../tools/bake_vegetation/branchlets/job.mjs';
import {vegetationJobs} from '../../../tools/bake_vegetation/jobs.mjs';
import {meshFingerprint} from '../../../tools/bake_vegetation/branchlets/Validate.mjs';
import {glbDocument} from '../../../tools/bake_vegetation/Validate.mjs';
import {hashFile} from '../../../tools/baking/Files.mjs';

const root=path.resolve('.'), output=path.join(root,branchletsJob.defaults.output);
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const ready=await access(path.join(output,'validation.json')).then(()=>true,()=>false);
const manifest=ready ? await json(path.join(root,'assets/public/vegetation_lod0/index.json')) : null;

test('branchlet authoring is isolated from publication and production defaults',async()=>{
    assert.ok(vegetationJobs.includes(branchletsJob));
    assert.ok(!vegetationJobs.find(job=>job.id==='vegetation').children.includes(branchletsJob.id));
    await assert.rejects(branchletsJob.run({publish:true}),/review-only/);
    for(const directory of ['assets/public/vegetation_lod0',branchletsJob.defaults.source0,branchletsJob.defaults.source1+'/child','tests/artifacts/screens']) {
        await assert.rejects(branchletsJob.run({root,publish:false,config:{renderDevice:'CPU'},options:{...branchletsJob.defaults,output:directory}}),/separate review/);
    }
});

test('accepted geometry fingerprints detect a changed tangent as well as changed positions',()=>{
    const bytes=Buffer.alloc(64); bytes.writeFloatLE(1,0); bytes.writeFloatLE(1,12);
    const document={bin:bytes,json:{bufferViews:[{byteOffset:0,byteLength:12},{byteOffset:12,byteLength:16}],accessors:[
        {bufferView:0,componentType:5126,type:'VEC3',count:1},{bufferView:1,componentType:5126,type:'VEC4',count:1},
        {bufferView:0,componentType:5123,type:'SCALAR',count:3}]}};
    const mesh={primitives:[{attributes:{POSITION:0,TANGENT:1},indices:2}]};
    const original=meshFingerprint(document,mesh); bytes.writeFloatLE(.5,12);
    const changed=meshFingerprint(document,mesh);
    assert.notDeepEqual(changed,original); assert.equal(changed[0].POSITION,original[0].POSITION);
});

test('all thirty regenerated forms preserve geometry budgets and pass the canopy gates',{skip:!ready},async()=>{
    const validation=await json(path.join(output,'validation.json'));
    assert.equal(validation.passed,true); assert.equal(validation.models.length,30);
    const totals=[{wood:0,leaves:0},{wood:0,leaves:0}];
    for(const row of validation.models) {
        assert.ok(row.woodAndCoreUnchanged && row.woodTexturesUnchanged);
        assert.ok(row.coverageMinimum>=.95 && row.coverageMaximum<=1.20);
        const layout=await json(path.join(output,`lod${row.level}`,row.id,'layout.json'));
        const previous=await json(path.join(root,branchletsJob.defaults[`source${row.level}`],row.id,'layout.json'));
        assert.deepEqual(layout.planes.slice(0,15),previous.planes.slice(0,15));
        assert.equal(layout.planes.length,previous.planes.length);
        assert.ok(layout.planes.slice(15).every(p=>Number.isInteger(p.referenceSpray)&&p.growthDirection.length===3));
        totals[row.level].wood+=row.woodTriangles; totals[row.level].leaves+=row.leafTriangles;
    }
    assert.deepEqual(totals,[{wood:47548,leaves:50000},{wood:23640,leaves:15366}]);
});

test('installed LOD0 and both accepted wood meshes remain identical',{skip:!ready},async()=>{
    for(const row of manifest.models) {
        assert.equal((await hashFile(path.join(root,'assets/public/vegetation_lod0',row.file))).sha256,row.sha256);
        for(const level of [0,1]) {
            const stem=row.id.split('/')[1]+`_lod${level}.glb`;
            const before=glbDocument(await readFile(path.join(root,branchletsJob.defaults[`source${level}`],row.id,stem)));
            const after=glbDocument(await readFile(path.join(output,`lod${level}`,row.id,stem)));
            for(const mesh of before.json.meshes.filter(m=>!m.name.includes('outer'))) {
                assert.deepEqual(meshFingerprint(after,after.json.meshes.find(m=>m.name===mesh.name)),meshFingerprint(before,mesh));
            }
        }
    }
});

test('exterior leaves attach to connected branching graphs with varied station spacing',{skip:!ready},async()=>{
    for(const species of new Set(manifest.models.map(row=>row.id.split('/')[0]))) for(const level of [0,1]) {
        const atlas=await json(path.join(output,`lod${level}`,species,'canopy/atlas.json'));
        const tiles=atlas.tiles.filter(row=>row.kind==='outer'); assert.equal(tiles.length,3);
        assert.equal(new Set(tiles.map(tile=>tile.seed)).size,3);
        for(const tile of tiles) {
            assert.equal(tile.edges.length,tile.nodes.length-1); assert.equal(tile.attachments.length,tile.leaves);
            const reached=new Set([0]);
            for(let pass=0;pass<tile.nodes.length;pass++) for(const [a,b] of tile.edges) if(reached.has(a)) reached.add(b);
            assert.equal(reached.size,tile.nodes.length);
            const degrees=tile.nodes.map((_,i)=>tile.edges.filter(([a,b])=>a===i||b===i).length);
            assert.ok(degrees.some(degree=>degree>=3));
            const steps=[];
            for(const shoot of new Set(tile.attachments.map(leaf=>leaf.shoot))) {
                const stations=[...new Set(tile.attachments.filter(leaf=>leaf.shoot===shoot).map(leaf=>leaf.station))].sort((a,b)=>a-b);
                for(let i=1;i<stations.length;i++) steps.push(stations[i]-stations[i-1]);
            }
            assert.ok(Math.max(...steps)-Math.min(...steps)>.01);
            for(const leaf of tile.attachments) {
                const distances=tile.edges.map(([a,b])=>{
                    const p=tile.nodes[a],d=tile.nodes[b].map((v,i)=>v-p[i]);
                    const t=Math.max(0,Math.min(1,leaf.position.reduce((s,v,i)=>s+(v-p[i])*d[i],0)/d.reduce((s,v)=>s+v*v,0)));
                    return Math.hypot(...leaf.position.map((v,i)=>v-p[i]-t*d[i]));
                });
                assert.ok(Math.min(...distances)<1e-6);
            }
        }
    }
});

test('all final full-tree comparisons use the same camera and final decoded assets',{skip:!ready},async()=>{
    const report=await json(path.join(output,'comparisons/renders.json'));
    assert.equal(report.renders.length,60);
    for(const row of manifest.models) {
        const renders=report.renders.filter(r=>r.model===row.id); assert.equal(renders.length,4);
        assert.equal(new Set(renders.map(r=>r.representation)).size,4);
        for(const render of renders) {
            assert.equal(render.camera.eyeHeight,2.2); assert.deepEqual(render.camera,renders[0].camera);
            assert.equal(render.samples,renders[0].samples); assert.equal(render.width,renders[0].width);
            assert.equal((await hashFile(render.source)).sha256,render.sourceGlbSha256);
            await access(path.join(output,'comparisons',render.file));
        }
    }
});
