// Reproduces stepped stem support and checks seeded curvature without weakening the shared structural constraints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generate3D,presets} from '../../../tools/bake_vegetation/branching_study/model3d.mjs';
const ids=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];
for(const id of ids)test(`${id}: stem widths decrease continuously through supported attachments`,()=>{
    for(const seed of [1,31,92]){
        const model=generate3D({...presets[id],seed});assert.ok(model.audit.passed);
        for(const stem of model.paths.filter(p=>p.order===0)){
            assert.ok(stem.radii.every((r,i)=>r>=stem.supportMinimumRadii[i]-1e-10),'Support was thinned');
            const drops=stem.radii.slice(1).map((r,i)=>stem.radii[i]-r);
            assert.ok(drops.every(d=>d>1e-10),`${stem.key}: cylindrical shelves remain`);
            assert.ok(Math.max(...drops.slice(0,Math.floor(drops.length*.85)))<(stem.baseRadius-stem.tipRadius)*.15,`${stem.key}: concentrated width step`);
        }
    }
});
test('arrowwood retains its established outward cane curves and complete branch centerlines',t=>{
    const folder='tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r18_roots_pbr_final/arrowwood_viburnum';
    if(!fs.existsSync(folder)){t.skip('Preserved arrowwood source unavailable');return;}
    for(const seed of [1,31,92]){
        const previous=JSON.parse(fs.readFileSync(`${folder}/seed-${seed}/graph.json`)),current=generate3D({...presets.arrowwood_viburnum,seed});
        assert.equal(current.paths.length,previous.paths.length);
        assert.deepEqual(current.base.anchors.map(a=>a.point),previous.base.anchors.map(a=>a.point));
        for(const p of current.paths)for(const field of ['key','parent','parentT','points','children'])assert.deepEqual(p[field],previous.paths[p.id][field]);
    }
});
test('tree trunks have bounded bow in a seed-dependent spatial plane',()=>{
    for(const id of ids.slice(0,4)){
        const bearings=[];
        for(const seed of [1,31,92]){
            const model=generate3D({...presets[id],seed,lean:0}),p=model.paths[0],tip=p.points.at(-1),norm=Math.hypot(...tip),axis=tip.map(v=>v/norm);
            const bow=Math.max(...p.points.map(q=>{const d=q.reduce((sum,v,k)=>sum+v*axis[k],0);return Math.hypot(...q.map((v,k)=>v-axis[k]*d));}))/p.span;
            assert.ok(bow>.018&&bow<.09,`${id}/${seed}: trunk bow ${bow}`);
            bearings.push(Math.atan2(tip[2],tip[0]));
        }
        assert.ok(Math.max(...bearings)-Math.min(...bearings)>.2,`${id}: all seeds bend in the same plane`);
    }
});
