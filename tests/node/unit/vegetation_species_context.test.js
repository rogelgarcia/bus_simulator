// Verifies species architecture, support and ownership independently of visual acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,presets,audit,samplePath,radiusAt} from '../../../tools/bake_vegetation/branching_study/model.mjs';
import {childDimensions} from '../../../tools/bake_vegetation/branching_study/architecture.mjs';
import {svg} from '../../../tools/bake_vegetation/branching_study/draw.mjs';
const seeds=[1,31,92],ids=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];

test('all species retain connected finite tapered wood and supported reach across three seeds',()=>{
    for(const id of ids)for(const seed of seeds){
        const model=generate({...presets[id],seed});
        assert.ok(model.audit.passed,`${id}/${seed}: ${JSON.stringify(model.audit)}`);
        assert.equal(model.stopped.budget,0);assert.equal(model.roots.stopped.budget,0);
        assert.ok(model.audit.maximumSupportedSlenderness<=model.settings.supportedSlenderness+1e-8);
        assert.ok(model.paths.filter(p=>p.role==='terminal').length>0);
        assert.equal(model.version,9);assert.equal(model.presetVersion,5);
        assert.equal(JSON.stringify(model),JSON.stringify(generate(JSON.parse(JSON.stringify(model.settings)))));
    }
});

test('arrowwood owns distinct ground anchors and a shared crown even when leaning',()=>{
    for(const seed of seeds)for(const lean of [-20,20]){
        const model=generate({...presets.arrowwood_viburnum,seed,lean}),base=model.base;
        assert.equal(base.kind,'root-crown');assert.equal(base.anchors.length,11);
        assert.equal(new Set(base.anchors.map(a=>a.point[0])).size,11);
        assert.ok(base.anchors.every(a=>a.point[1]===0));
        assert.equal(model.paths.filter(p=>p.kind==='trunk').length,0);
        assert.ok(new Set(base.anchors.map(a=>model.paths[a.shoot].span)).size>5);
        assert.equal(model.roots.collars.length,11);
        assert.deepEqual(new Set(model.roots.crown.anchors),new Set(base.anchors.map(a=>a.id)));
        for(const root of model.roots.paths.filter(p=>p.parent<0)){
            assert.equal(root.host.domain,'base');assert.equal(root.host.id,base.id);
            assert.deepEqual(root.points[0],base.anchors.find(a=>a.id===root.host.anchor).point);
        }
        assert.ok(model.audit.passed);
    }
});

test('crown height changes linden lateral length and insertion while order shortens distal shoots',()=>{
    const o=presets.silver_linden,random=()=>()=>.5;
    const parent=y=>({points:[[0,y],[0,y+2]],span:2,order:0,role:'leader',key:'test',baseRadius:.2,tipRadius:.15,taperProfile:1});
    const site={kind:'lateral',t:.5,turn:60,slot:1,allocation:1};
    const lower=childDimensions(parent(3),site,o,random),upper=childDimensions(parent(15),site,o,random);
    assert.ok(lower.span>upper.span*1.8);assert.ok(Math.abs(upper.heading-Math.PI/2)<Math.abs(lower.heading-Math.PI/2));
    const distal=childDimensions({...parent(3),order:3,role:'lateral'},site,o,random);
    assert.equal(distal.role,'terminal');assert.ok(distal.span<lower.span*.8);
});

test('spacing limits candidate counts by usable length and paired nodes remain paired',()=>{
    const options={...presets.arrowwood_viburnum,basalCount:1,trunkLength:.4,depth:3,budSurvival:1,nodeSpacing:1};
    const sparse=generate(options),dense=generate({...options,nodeSpacing:0});
    assert.ok(sparse.paths.length<dense.paths.length);assert.ok(sparse.stopped.spacing>0);
    for(const p of dense.paths){
        const sides=p.children.map(id=>dense.paths[id]).filter(p=>p.kind==='lateral');
        if(sides.length===2)assert.equal(sides[0].parentT,sides[1].parentT);
    }
});

test('unequal forks coexist with side branches and continuations without oversizing the attachment',()=>{
    const model=generate({...presets.northern_red_oak,depth:4,ramificationLevels:0,forkChance:.8,seed:92});
    const mixed=model.paths.filter(p=>{
        const children=p.children.map(id=>model.paths[id]);return ['continuation','lateral','fork'].every(kind=>children.some(p=>p.kind===kind));
    });assert.ok(mixed.length>0);
    for(const parent of mixed){
        const tips=parent.children.map(id=>model.paths[id]).filter(p=>p.parentT===1);
        assert.ok(new Set(tips.map(p=>p.span)).size>1);
        assert.ok(tips.reduce((sum,p)=>sum+p.baseRadius**2,0)<=radiusAt(parent,1)**2+1e-9);
    }
});

test('junctions inherit the parent tangent and exposure remains a view-only operation',()=>{
    const model=generate({...presets.silver_linden,trunkBend:0,lean:0}),before=JSON.stringify(model);
    for(const p of model.paths.filter(p=>p.parent>=0)){
        const frame=samplePath(model.paths[p.parent],p.parentT),a=p.points[0],b=p.points[1];
        assert.deepEqual(a,frame.point);
        assert.ok(Math.abs(Math.atan2(b[1]-a[1],b[0]-a[0])-frame.heading)<1e-8);
    }
    const section=svg(model.paths,{roots:model.roots,soil:true}),exposed=svg(model.paths,{roots:model.roots,exposure:.04});
    assert.notEqual(section,exposed);assert.equal(before,JSON.stringify(model));
});

test('independent audit detects root ownership, attachment, taper and support corruption',()=>{
    const source=generate(presets.arrowwood_viburnum);
    for(const damage of [m=>{m.roots.paths[0].host.anchor=999;},m=>{m.paths[20].points[0][0]+=.1;},m=>{m.paths[20].radii[1]=-1;},m=>{m.paths[20].radii[0]*=.001;}]){
        const model=structuredClone(source);damage(model);assert.equal(audit(model).passed,false);
    }
});
