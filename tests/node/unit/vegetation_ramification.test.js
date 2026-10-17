// Checks genuine subdivision tiers, stable framework geometry and explicit termination.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,presets,audit,radiusAt} from '../../../tools/bake_vegetation/branching_study/model.mjs';
const binary={...presets.straight,architecture:'fork',depth:1,trunkLength:4,mainRatio:.8,
    branchCounts:Array(8).fill(2),forkAngle:12,ramificationLevels:4,ramificationRatio:.7,ramificationAngle:12,
    ramificationSideBuds:0,forkAsymmetry:0,minimumLength:.05,minimumDiameter:0,maximumSlenderness:0,supportedSlenderness:90};

test('four daughter tiers are real binary forks including descendants classified terminal',()=>{
    const m=generate(binary);
    assert.equal(m.growthLevels,5);assert.ok(m.audit.passed);
    assert.deepEqual(Array.from({length:6},(_,level)=>m.paths.filter(p=>p.level===level).length),[1,2,4,8,16,32]);
    for(const p of m.paths.filter(p=>p.level>0&&p.level<5)){
        const children=p.children.map(id=>m.paths[id]);assert.equal(children.length,2);
        assert.ok(children.every(c=>c.kind==='ramification-fork'&&c.parentT===1&&c.order===p.order+1));
        assert.ok(children.reduce((sum,c)=>sum+c.baseRadius**2,0)<=radiusAt(p,1)**2+1e-10);
        assert.ok(children.every(c=>c.span<p.span));
    }
    assert.ok(m.paths.some(p=>p.role==='terminal'&&p.children.length===2));
});

test('adding a tier preserves every existing axis identity, position and insertion angle',()=>{
    const options={...presets.london_plane,ramificationLevels:2};
    const before=generate(options),after=generate({...options,ramificationLevels:3});
    for(const p of before.paths){const q=after.paths.find(q=>q.key===p.key);assert.ok(q);assert.deepEqual(q.points,p.points);assert.equal(q.heading,p.heading);}
    assert.ok(after.paths.length>before.paths.length);
    const framework=generate({...options,ramificationLevels:0});
    for(const p of framework.paths)assert.deepEqual(p.points,before.paths.find(q=>q.key===p.key).points);
});

test('intermediate side forks add separate attachment nodes and remain deterministic',()=>{
    const m=generate({...binary,ramificationLevels:2,ramificationSideBuds:1});
    for(const p of m.paths.filter(p=>p.level>0&&p.level<m.growthLevels)){
        const children=p.children.map(id=>m.paths[id]);assert.equal(children.length,3);
        const side=children.find(c=>c.kind==='ramification-lateral');assert.ok(side.parentT>0&&side.parentT<1);
        assert.equal(children.filter(c=>c.kind==='ramification-fork').length,2);
    }
    assert.equal(JSON.stringify(m),JSON.stringify(generate(m.settings)));
});

test('all species reach the requested tiers across seeds without truncating their budget',()=>{
    for(const id of ['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'])for(const seed of [1,31,92]){
        const m=generate({...presets[id],seed});assert.ok(m.audit.passed,`${id}/${seed}`);
        assert.equal(m.stopped.budget,0);assert.equal(m.roots.stopped.budget,0);
        assert.equal(Math.max(...m.paths.map(p=>p.ramificationLevel)),m.settings.ramificationLevels);
        assert.ok(m.paths.filter(p=>p.kind==='ramification-fork').length>30);
    }
});

test('invalid tier counts and corrupt hierarchy metadata fail validation',()=>{
    for(const ramificationLevels of [-1,.5,7])assert.throws(()=>generate({...binary,ramificationLevels}));
    const m=generate(binary);m.paths.at(-1).ramificationLevel=99;assert.equal(audit(m).passed,false);
});

test('primary limbs have independent counts and distinct attachments without changing later fork arity',()=>{
    const m=generate({...binary,architecture:'mixed',primaryLimbs:7,contextStrength:1,ramificationLevels:2});
    const trunk=m.paths[0],primary=trunk.children.map(id=>m.paths[id]);
    assert.equal(primary.length,7);assert.equal(new Set(primary.map(p=>p.parentT)).size,7);
    assert.equal(primary.filter(p=>p.parentT===1).length,1);assert.ok(m.audit.passed);
    assert.ok(primary.reduce((sum,p)=>sum+p.baseRadius**2,0)<=trunk.baseRadius**2+1e-10,'trunk must support all distributed primary limbs');
    for(const p of primary)assert.equal(p.children.length,2);
    const legacy=generate({...binary,architecture:'mixed',primaryLimbs:0});
    assert.equal(legacy.paths[0].children.length,2);
    for(const primaryLimbs of [-1,1.5,9])assert.throws(()=>generate({...binary,primaryLimbs}));
});

test('outward preference keeps later forks directed away from the crown base',()=>{
    const m=generate({...binary,ramificationLevels:5,ramificationAngle:50,ramificationOutward:.6});
    for(const p of m.paths.filter(p=>p.phase==='ramification')){
        const dx=p.points[0][0]-p.origin[0],dy=p.points[0][1]-m.settings.trunkLength;
        assert.ok(Math.cos(p.heading)*dx+Math.sin(p.heading)*dy>0,`inward growth at ${p.key}`);
    }
    assert.ok(m.paths.some(p=>p.ramificationLevel===5));assert.ok(m.audit.passed);
});

test('descending left-hand forks retain descendants across the atan2 angle wrap',()=>{
    const m=generate({...binary,forkAngle:70,ramificationAngle:50,ramificationLevels:4});
    const descending=m.paths.filter(p=>p.level<m.growthLevels&&p.points.at(-1)[0]<p.points[0][0]&&p.points.at(-1)[1]<p.points[0][1]);
    assert.ok(descending.length>0);
    for(const p of descending)assert.ok(p.children.length>0,`lost descending descendants at ${p.key}`);
    assert.ok(m.audit.passed);
});
