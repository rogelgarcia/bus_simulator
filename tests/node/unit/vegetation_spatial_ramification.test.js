// Exercises the shared three-dimensional grammar and the retained planar compatibility contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generate3D,audit3D,planarFixture,presets,sampleSpatialPath} from '../../../tools/bake_vegetation/branching_study/model3d.mjs';
import {generate,radiusAt,presets as planarPresets} from '../../../tools/bake_vegetation/branching_study/model.mjs';
import {acceptSpatialDirection} from '../../../tools/bake_vegetation/branching_study/spatial.mjs';
const ids=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
for(const id of ids)test(`${id}: three deterministic volumetric seeds retain hierarchy, attachments, support and both daughter families`,()=>{
    for(const seed of [1,31,92]){
        const m=generate3D({...presets[id],seed});assert.ok(m.audit.passed,JSON.stringify(m.audit));
        assert.equal(JSON.stringify(m),JSON.stringify(generate3D(m.settings,m.spatial)));
        assert.equal(m.stopped.budget,0);assert.equal(m.roots.stopped.budget,0);
        assert.equal(Math.max(...m.paths.map(p=>p.ramificationLevel)),m.settings.ramificationLevels);
        const points=m.paths.flatMap(p=>p.points),extent=k=>points.reduce((v,p)=>Math.max(v,p[k]),-Infinity)-points.reduce((v,p)=>Math.min(v,p[k]),Infinity);
        assert.ok(Math.min(extent(0),extent(2))/Math.max(extent(0),extent(2))>.4);
        assert.ok(m.audit.maximumTortuosity<1.3);
        for(const p of m.paths.filter(p=>p.parent>=0)){
            const parent=m.paths[p.parent],frame=sampleSpatialPath(parent,p.parentT);
            assert.ok(distance(frame.point,p.points[0])<1e-9);
            const first=p.points[1].map((v,i)=>v-p.points[0][i]),norm=Math.hypot(...first);
            assert.ok(distance(first.map(v=>v/norm),frame.direction)<1e-9);
            assert.ok(p.baseRadius<=radiusAt(parent,p.parentT)+1e-9);
        }
        const repeated=m.paths.filter(p=>p.phase==='ramification'&&p.children.filter(i=>m.paths[i].kind==='ramification-fork').length===2);
        assert.ok(repeated.length>10);
    }
});
test('planar compatibility lift preserves all centerlines, ancestry, radius and attachment coordinates',()=>{
    for(const id of ids){
        const original=generate(presets[id]),lifted=planarFixture(presets[id]);
        for(const p of lifted.paths){
            assert.deepEqual(p.points.map(q=>q.slice(0,2)),original.paths[p.id].points);
            assert.ok(p.points.every(q=>q[2]===0));
            for(const field of ['key','parent','parentT','radii','children','phase','ramificationLevel','kind','role','order'])assert.deepEqual(p[field],original.paths[p.id][field]);
            if(p.parent>=0)assert.ok(distance(p.points[0],sampleSpatialPath(lifted.paths[p.parent],p.parentT).point)<1e-9);
        }
    }
});
test('current 2D generation still matches the preserved page-10 fixtures exactly',t=>{
    const folder='tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/review_v4/comparisons';
    if(!fs.existsSync(folder)){t.skip('Preserved page-10 review fixtures are unavailable in this checkout');return;}
    for(const id of ids)for(const seed of [1,31,92]){
        const old=JSON.parse(fs.readFileSync(`${folder}/${id}-seed-${seed}.json`));
        const actual=generate({...planarPresets[id],seed});assert.deepEqual(actual.paths,old.paths);assert.deepEqual(actual.roots,old.roots);
    }
});
test('adding a daughter tier preserves all existing spatial axes and random streams',()=>{
    const a=generate3D({...presets.london_plane,ramificationLevels:3}),b=generate3D({...presets.london_plane,ramificationLevels:4});
    for(const p of a.paths){const q=b.paths.find(q=>q.key===p.key);assert.deepEqual(q.points,p.points);assert.deepEqual(q.direction,p.direction);}
});
test('terminal classification does not stop either daughter from bifurcating again',()=>{
    const m=generate3D({...presets.london_plane,ramificationLevels:5,ramificationSideBuds:0});
    const parents=m.paths.filter(p=>p.role==='terminal'&&p.ramificationLevel===3);
    assert.ok(parents.length>10);
    for(const p of parents){assert.equal(p.children.length,2);for(const id of p.children)assert.equal(m.paths[id].children.length,2);}
});
test('radial arrowwood anchors stay grounded under lean and independent root edits',()=>{
    const a=generate3D(presets.arrowwood_viburnum),b=generate3D({...presets.arrowwood_viburnum,lean:17,rootReach:2.4,rootLevels:3});
    assert.equal(a.base.anchors.length,11);assert.equal(new Set(a.base.anchors.map(p=>JSON.stringify(p.point))).size,11);
    assert.deepEqual(a.base.anchors.map(p=>p.point),b.base.anchors.map(p=>p.point));
    const c=generate3D({...presets.arrowwood_viburnum,rootReach:2.4,rootLevels:3});assert.deepEqual(a.paths,c.paths);
    assert.ok(a.roots.paths.filter(p=>p.parent<0).every(p=>p.host.domain==='base'));
    for(const p of a.roots.paths.filter(p=>p.parent<0))assert.deepEqual(p.points[0],a.base.anchors.find(a=>a.id===p.host.anchor).point);
});
test('direction limits are invariant to azimuth including descending leftward forks',()=>{
    for(const y of [-.999,-.8,-.5,0,.5,1])for(const lower of [-85,-35]){
        const expected=acceptSpatialDirection([Math.sqrt(1-y*y),y,0],lower);
        for(let i=0;i<16;i++){const a=i*Math.PI/8;assert.equal(acceptSpatialDirection([Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)],lower),expected);}
    }
});
test('rotating the entire crown preserves descendant identities and three-dimensional shape',()=>{
    const options={...presets.london_plane,lean:0,trunkBend:0,ramificationLevels:3};
    const a=generate3D(options),b=generate3D(options,{azimuthOffset:180});
    assert.equal(a.paths.length,b.paths.length);
    for(const p of a.paths){const q=b.paths.find(q=>q.key===p.key);for(let i=0;i<p.points.length;i++)assert.ok(distance(p.points[i],[-q.points[i][0],q.points[i][1],-q.points[i][2]])<1e-9);}
});
test('independent leader lateral budget preserves continuation and ordinary subordinate counts',()=>{
    const m=generate3D({...presets.silver_linden,budSurvival:1,depth:2,ramificationLevels:0});
    const trunk=m.paths[0],children=trunk.children.map(i=>m.paths[i]);
    assert.equal(children.length,5);assert.equal(children.filter(p=>p.kind==='continuation').length,1);
    assert.equal(new Set(children.map(p=>p.parentT)).size,5);
    for(const p of children.filter(p=>p.order>0))assert.ok(p.proposedChildren<=4);
    assert.throws(()=>generate3D({...presets.silver_linden,leaderLaterals:4.5}));
});
test('mixed-crown apical scaling shortens only the initial top family',()=>{
    const options={...presets.northern_red_oak,ramificationLevels:2,primaryApicalScale:1};
    const a=generate3D(options),b=generate3D({...options,primaryApicalScale:.65});
    const apex=a.paths.find(p=>p.parent===0&&p.parentT===1),short=b.paths.find(p=>p.key===apex.key);
    assert.ok(short.span<apex.span*.8);
    for(const p of a.paths.filter(p=>p.parent===0&&p.parentT<1))assert.deepEqual(p.points,b.paths.find(q=>q.key===p.key).points);
    assert.ok(b.audit.passed);
});
test('spatial audit rejects detached axes, wrong hierarchy, taper and fork-area corruption',()=>{
    for(const corrupt of [m=>m.paths[1].points[0][2]+=.1,m=>m.paths[1].level++,m=>m.paths[1].radii[2]=999,m=>m.paths[1].baseRadius=999]){
        const m=generate3D({...presets.london_plane,ramificationLevels:2});corrupt(m);assert.equal(audit3D(m).passed,false);
    }
});
test('bud budgets report omissions and projected crossings are never used to prune 3D',()=>{
    const m=generate3D({...presets.london_plane,primaryLimbs:8,ramificationLevels:6,ramificationSideBuds:1,ramificationRatio:.8,minimumDiameter:0,minimumLength:.05,maximumSlenderness:0});
    assert.equal(m.paths.length,m.branchLimit);assert.ok(m.stopped.budget>0);
    assert.throws(()=>generate3D({...presets.london_plane,competition:true}),/Projected/);
});
