// Exercises the structural contracts independently of SVG presentation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,descendants,samplePath,radiusAt,defaults,presets,branchLimit} from '../../../tools/bake_vegetation/branching_study/model.mjs';
import {branchCurve} from '../../../tools/bake_vegetation/branching_study/geometry.mjs';
import {svg} from '../../../tools/bake_vegetation/branching_study/draw.mjs';
import {species} from '../../../tools/bake_vegetation/branching_study/species.mjs';
import {readFile} from 'node:fs/promises';
const counts=n=>Array(8).fill(n);
const controlled={architecture:'leader',countMode:'manual',bendMode:'gradual',depth:2,angleVariation:0,lengthVariation:0,nodeJitter:0,budSurvival:1,bend:0,trunkBend:0,lean:0,tilt:0,minimumDiameter:0,minimumLength:.05};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('roots attach to the trunk or actual parent curve and respect soil and taper',()=>{
    const model=generate({...controlled,rootTaproot:.8,rootSinkers:1}),roots=model.roots;
    assert.ok(roots.paths.length>10);assert.ok(roots.audit.passed&&model.audit.passed);
    assert.ok(roots.paths.some(p=>p.kind==='taproot'));assert.ok(roots.paths.some(p=>p.kind==='sinker'));
    for(const p of roots.paths){
        const parent=p.parent<0?model.paths[0]:roots.paths[p.parent];
        assert.deepEqual(p.points[0],samplePath(parent,p.parentT).point);
        if(p.parent<0)assert.deepEqual(p.host,{domain:'shoot',id:0,t:0});
        else assert.ok(p.span<parent.span&&parent.children.includes(p.id));
        assert.ok(p.baseRadius<=radiusAt(parent,p.parentT));
        assert.ok(p.points.every(([x,y])=>Math.abs(x)<=model.settings.rootReach+1e-9&&y<=1e-9&&y>=-model.settings.rootDepth-1e-9));
        assert.ok(p.radii.every((r,i)=>r>0&&(!i||r<=p.radii[i-1])));
    }
});

test('root changes preserve the canopy, and shoot lean does not rotate roots out of soil',()=>{
    const baseline=generate(controlled),changed=generate({...controlled,rootCount:8,rootBend:50,rootLevels:4,rootReach:9,rootDepth:2.4,rootTaproot:1});
    assert.deepEqual(changed.paths,baseline.paths);
    const leaned=generate({...controlled,lean:20,trunkBend:60,bend:45});
    assert.deepEqual(leaned.roots.paths,baseline.roots.paths);
    assert.notDeepEqual(leaned.roots.collar.points,baseline.roots.collar.points);
    const disabled=generate({...controlled,rootsEnabled:false});
    assert.deepEqual(disabled.paths,baseline.paths);assert.equal(disabled.roots.paths.length,0);assert.equal(disabled.roots.collar,null);
    assert.ok(disabled.audit.passed);
});

test('root spread, depth, levels, sinkers and taproot are independently adjustable',()=>{
    const o={...controlled,rootCount:4,rootRandomness:0,rootSinkers:0,rootTaproot:0,rootDepth:1.8};
    const base=generate(o).roots,wide=generate({...o,rootReach:12}).roots,deep=generate({...o,rootDepth:4}).roots;
    assert.ok(Math.max(...wide.paths.flatMap(p=>p.points.map(q=>q[0])))>Math.max(...base.paths.flatMap(p=>p.points.map(q=>q[0]))));
    assert.ok(Math.min(...deep.paths.flatMap(p=>p.points.map(q=>q[1])))<Math.min(...base.paths.flatMap(p=>p.points.map(q=>q[1]))));
    assert.equal(generate({...o,rootLevels:1}).roots.paths.length,4);
    assert.ok(base.paths.every(p=>!['sinker','taproot'].includes(p.kind)));
    assert.equal(generate({...o,rootSinkers:1}).roots.paths.filter(p=>p.kind==='sinker').length,4);
    const tap=generate({...o,rootTaproot:.75}).roots.paths.find(p=>p.kind==='taproot');
    close(tap.points.at(-1)[1],-o.rootDepth*.75);
});

test('root curvature is real geometry, deterministic and straight when disabled',()=>{
    const o={...controlled,rootBend:0,rootRandomness:0,rootSinkers:0};
    const straight=generate(o).roots;
    assert.deepEqual(straight,generate({...o,seed:99}).roots);
    for(const p of straight.paths){
        const a=p.points[0],b=p.points.at(-1);
        for(const q of p.points)close((q[0]-a[0])*(b[1]-a[1])-(q[1]-a[1])*(b[0]-a[0]),0);
    }
    const bent=generate({...o,rootBend:45}).roots;
    assert.notDeepEqual(bent.paths[0].points,straight.paths[0].points);
    assert.ok(bent.audit.passed);
    assert.deepEqual(generate({...o,rootRandomness:.5}),generate({...o,rootRandomness:.5}));
});

test('root collar blends into actual trunk radius without changing shoot geometry',()=>{
    const o={...controlled,trunkBend:45,rootFlare:1,rootFlareHeight:1.5},model=generate(o),collar=model.roots.collar;
    assert.deepEqual(collar.points[0],model.paths[0].points[0]);
    close(collar.radii[0],model.paths[0].baseRadius*2);
    const t=collar.span/model.paths[0].span;
    samplePath(model.paths[0],t).point.forEach((value,i)=>close(collar.points.at(-1)[i],value));
    close(collar.radii.at(-1),radiusAt(model.paths[0],t));
    assert.deepEqual(generate({...o,rootFlare:0}).paths,model.paths);
});

test('root graphs export, validate extremes, report caps and reject invalid settings',()=>{
    for(const options of [{rootDepth:.1,rootReach:20,rootBend:50,rootCount:8,rootTaproot:1},{rootDepth:8,rootReach:.2,rootBend:50,rootCount:8},{rootMinimumDiameter:15,baseDiameter:.02},{rootLevels:5,rootChildren:3,rootLengthRatio:.7,rootMinimumDiameter:0,rootThicknessLoss:.2,rootCount:8,rootSinkers:1}]){
        const model=generate({...controlled,...options});
        assert.ok(model.audit.passed,JSON.stringify(model.roots.audit));
        assert.ok(model.roots.paths.length<=model.roots.rootLimit);
        assert.deepEqual(JSON.parse(JSON.stringify(model)).roots,JSON.parse(JSON.stringify(generate(model.settings))).roots);
    }
    for(const options of [{rootDepth:0},{rootBend:NaN},{rootChildren:2.5},{rootLevels:6},{rootsEnabled:'yes'},{rootCount:3.1}])assert.throws(()=>generate(options));
    const empty=generate({...controlled,trunkLength:.2,minimumLength:.8});
    assert.equal(empty.roots.paths.length,0);assert.ok(!svg(empty.paths,{roots:empty.roots,soil:true}).includes('Infinity'));
});

test('SVG includes the actual root graph and distinct selection identifiers',()=>{
    const model=generate(controlled),drawing=svg(model.paths,{roots:model.roots,soil:true});
    assert.equal((drawing.match(/<polygon[^>]+data-root=/g)||[]).length,model.roots.paths.length);
    assert.equal((drawing.match(/<polygon[^>]+data-branch=/g)||[]).length,model.paths.length);
    assert.ok(drawing.includes('root-collar'));assert.ok(!drawing.includes('NaN'));
    assert.ok(!svg(model.paths).includes('data-root='));
});

test('trunk bending is independent, anchored, length-preserving and reversible',()=>{
    const options={...controlled,trunkBend:40,trunkBendVariation:0};
    const right=generate(options),left=generate({...options,trunkBend:-40}),root=right.paths[0];
    assert.ok(root.points.at(-1)[0]>.3);
    assert.deepEqual(root.points[0],[0,0]);
    close(root.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-root.points[i][0],p[1]-root.points[i][1]),0),root.span);
    for(let i=0;i<root.points.length;i++){close(root.points[i][0],-left.paths[0].points[i][0]);close(root.points[i][1],left.paths[0].points[i][1]);}
    assert.deepEqual(generate({...options,bend:65}).paths[0].points,root.points);
    assert.ok(right.audit.passed&&left.audit.passed);
});

test('branches follow the changed trunk position and tangent at real attachment sites',()=>{
    const options={...controlled,trunkBend:45,trunkBendVariation:0,continuationAngle:0,branchCounts:counts(4),trunkClearance:.3};
    const bent=generate(options),straight=generate({...options,trunkBend:0});
    const root=bent.paths[0],children=bent.paths.filter(p=>p.parent===0);
    assert.equal(children.length,4);assert.ok(bent.audit.passed);
    for(const child of children){
        const before=straight.paths.find(p=>p.key===child.key),frame=samplePath(root,child.parentT);
        assert.deepEqual(child.points[0],frame.point);
        close(child.heading-before.heading,frame.heading-Math.PI/2);
        close(child.span,before.span);close(child.baseRadius,before.baseRadius);
    }
    assert.ok(Math.abs(samplePath(root,1).heading-Math.PI/2)>.4);
});

test('trunk recovery and seeded variation work without branch bending',()=>{
    const options={...controlled,trunkBend:50,trunkBendCenter:.4,trunkBendSpread:.6,trunkBendRecovery:1,trunkBendVariation:0};
    const model=generate(options),root=model.paths[0];
    assert.ok(root.points.at(-1)[0]>.25);
    assert.ok(Math.abs(samplePath(root,1).heading-Math.PI/2)<.02);
    assert.deepEqual(generate({...options,seed:32}).paths[0].points,root.points);
    const varied=generate({...options,trunkBendVariation:.8});
    assert.notDeepEqual(generate({...options,trunkBendVariation:.8,seed:32}).paths[0].points,varied.paths[0].points);
    assert.ok(Math.abs(varied.paths[0].bend)<=50);assert.ok(varied.audit.passed);
    for(const change of [{trunkBend:91},{trunkBendCenter:0},{trunkBendSpread:0},{trunkBendRecovery:2},{trunkBendVariation:NaN}])assert.throws(()=>generate(change));
});

test('crossing suppression defaults off and seeded geometry reproduces',()=>{
    assert.equal(defaults.competition,false);
    assert.ok(Object.values(presets).every(p=>p.competition===false));
    assert.deepEqual(generate(),generate());
    assert.notDeepEqual(generate({seed:32}).paths,generate().paths);
});
test('curved attachments are connected, tapering and shorter than their parent',()=>{
    const model=generate();assert.ok(model.paths.length>100);assert.ok(model.audit.passed);
    for(const p of model.paths){
        assert.ok(p.children.length<=p.proposedChildren);
        if(p.parent<0)continue;
        const parent=model.paths[p.parent],point=samplePath(parent,p.parentT).point;
        close(point[0],p.points[0][0]);close(point[1],p.points[0][1]);
        assert.ok(p.span<parent.span);assert.ok(p.baseRadius<=radiusAt(parent,p.parentT));
    }
});
test('two, three and four tip forks and per-level counts produce requested topology',()=>{
    for(const n of [2,3,4]){
        const model=generate({...controlled,architecture:'fork',forkAngle:15,branchCounts:counts(n)});
        assert.equal(model.paths.length,1+n+n*n);
        assert.ok(model.paths.filter(p=>p.parent>=0).every(p=>p.parentT===1));
    }
    assert.equal(generate({...controlled,architecture:'fork',forkAngle:15,branchCounts:[2,4,2,2,2,2,2,2]}).paths.length,11);
});
test('leader survives while side shoots spread along an axis or group at one node',()=>{
    const scattered=generate({...controlled,branchCounts:counts(4),stagger:1});
    const children=scattered.paths.filter(p=>p.level===1),side=children.filter(p=>p.kind==='lateral');
    assert.equal(children.length,4);assert.equal(children.filter(p=>p.kind==='continuation').length,1);
    assert.equal(new Set(side.map(p=>p.parentT)).size,3);
    assert.ok(side.every(p=>p.parentT<1));
    const grouped=generate({...controlled,branchCounts:counts(4),stagger:0});
    assert.equal(new Set(grouped.paths.filter(p=>p.level===1&&p.kind==='lateral').map(p=>p.parentT)).size,1);
});
test('paired shoots share a node while alternate shoots use distinct nodes',()=>{
    const model=generate({...controlled,branchCounts:counts(4),arrangement:'paired'});
    const sides=model.paths.filter(p=>p.level===1&&p.kind==='lateral');
    assert.equal(new Set(sides.map(p=>p.parentT)).size,2);
});
test('children inherit the local tangent of a bent parent',()=>{
    const model=generate({...controlled,bend:55,continuationAngle:0});
    for(const p of model.paths.filter(p=>p.kind==='continuation'))close(p.heading,samplePath(model.paths[p.parent],1).heading);
    assert.ok(model.audit.maximumBowFraction>.02);
});
test('zero bending is straight and curved branches have no oscillating turn',()=>{
    assert.ok(generate({...controlled,bend:0}).audit.maximumBowFraction<1e-12);
    for(const seed of [1,31,92])for(const bendProfile of [.4,3]){
        const model=generate({seed,bend:60,bendProfile,bendMode:'gradual',trunkBend:0});assert.ok(model.audit.passed);
        for(const p of model.paths){
            const turns=[];
            for(let i=2;i<p.points.length;i++){
                const a=p.points[i-2],b=p.points[i-1],c=p.points[i];
                turns.push((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]));
            }
            assert.ok(turns.every(t=>t>=-1e-10)||turns.every(t=>t<=1e-10));
        }
    }
});
test('thickness uses local parent radius, with distinct continuation and fork losses',()=>{
    const model=generate({...controlled,baseDiameter:.8,taper:.4,radiusLoss:.5,leaderLoss:.1,taperProfile:2});
    close(model.paths[0].baseRadius,.4);
    for(const p of model.paths.filter(p=>p.parent>=0)){
        const parent=model.paths[p.parent],loss=p.kind==='continuation'?.1:.5;
        close(p.baseRadius,radiusAt(parent,p.parentT)*(1-loss));
        close(p.radii[(p.radii.length-1)/2],radiusAt(p,.5));
    }
    const thin=generate({...controlled,baseDiameter:.2}),thick=generate({...controlled,baseDiameter:.4});
    assert.equal(thin.paths.length,thick.paths.length);
    for(const p of thin.paths){assert.deepEqual(p.points,thick.paths[p.id].points);close(thick.paths[p.id].baseRadius,2*p.baseRadius);}
});
test('bud survival does not reshuffle surviving axes',()=>{
    const full=generate({budSurvival:1}),sparse=generate({budSurvival:.5}),byKey=new Map(full.paths.map(p=>[p.key,p]));
    assert.ok(sparse.paths.length<full.paths.length);
    for(const p of sparse.paths)assert.deepEqual(p.points,byKey.get(p.key).points);
});
test('optional competition suppresses crossings without steering retained wood',()=>{
    const free=generate(),spaced=generate({competition:true}),byKey=new Map(free.paths.map(p=>[p.key,p]));
    assert.ok(free.audit.intersections>0);assert.equal(spaced.audit.intersections,0);assert.ok(spaced.audit.passed);
    assert.ok(spaced.stopped.crossings>0);
    for(const p of spaced.paths)assert.deepEqual(p.points,byKey.get(p.key).points);
});
test('detail traversal, zero randomness and rigid lean preserve structure',()=>{
    const model=generate(),selected=descendants(model,2),ids=new Set(selected.map(p=>p.id));
    assert.ok(selected.length>2);assert.ok(selected.slice(1).every(p=>ids.has(p.parent)));
    assert.deepEqual(generate({...presets.straight,seed:1}).paths,generate({...presets.straight,seed:92}).paths);
    const upright=generate({lean:0}),leaning=generate({lean:12}),angle=-12*Math.PI/180;
    for(const p of upright.paths){const q=leaning.paths[p.id];assert.equal(p.parent,q.parent);
        for(let i=0;i<p.points.length;i++){const [x,y]=p.points[i];close(q.points[i][0],Math.cos(angle)*x-Math.sin(angle)*y);close(q.points[i][1],Math.sin(angle)*x+Math.cos(angle)*y);}}
});
test('large configurations report the preview cap rather than hanging or silently trimming',()=>{
    const model=generate({...controlled,depth:8,branchCounts:counts(4),lateralRatio:.9,mainRatio:.9});
    assert.equal(model.paths.length,branchLimit);assert.ok(model.stopped.budget>0);assert.ok(model.audit.passed);
});
test('invalid geometry settings fail at the boundary',()=>{
    for(const options of [{depth:20},{bend:NaN},{seed:1.5},{mainRatio:1.2},{competition:'yes'},{baseDiameter:0},
        {branchCounts:[2,3]},{branchCounts:counts(5)},{branchStart:.8,branchEnd:.4},{radiusLoss:1},{architecture:'unknown'},
        {bendMode:'zigzag'},{bendRecovery:2},{bendCenter:0},{bendSpread:0},{countMode:'unknown'},{minChildren:3,maxChildren:2},{minChildren:1.5},{maxChildren:5}])assert.throws(()=>generate(options));
});

test('curved zones preserve length, concentrate bending, and allow one recovery turn',()=>{
    for(const center of [.15,.5,.85])for(const spread of [.05,1])for(const recovery of [0,.5,1]){
        const points=branchCurve([0,0],0,3,90,1.2,'localized',center,spread,recovery),headings=[];
        let length=0;
        for(let i=1;i<points.length;i++){
            const dx=points[i][0]-points[i-1][0],dy=points[i][1]-points[i-1][1];
            length+=Math.hypot(dx,dy);headings.push(Math.atan2(dy,dx));
        }
        close(length,3);assert.ok(headings.every(h=>h>=-1e-10&&h<=Math.PI/2+1e-10));
        const signs=headings.slice(1).map((h,i)=>h-headings[i]).filter(d=>Math.abs(d)>1e-9).map(Math.sign);
        const reversals=signs.slice(1).filter((s,i)=>s!==signs[i]).length;
        assert.equal(reversals,recovery>0?1:0);
        if(recovery===1)assert.ok(Math.abs(headings.at(-1))<.02);
    }
    const broad=branchCurve([0,0],0,1,70,1,'localized',.5,.8),narrow=branchCurve([0,0],0,1,70,1,'localized',.5,.2);
    assert.ok(Math.abs(samplePath({points:narrow},.25).point[1])<1e-10);
    assert.ok(samplePath({points:broad},.25).point[1]>.005);
    const early=branchCurve([0,0],0,1,70,1,'localized',.2,.2),late=branchCurve([0,0],0,1,70,1,'localized',.8,.2);
    assert.ok(early.at(-1)[1]>late.at(-1)[1]+.3);
});
test('curved zone and recovery retain attachments and seeded branch identity',()=>{
    for(const bendRecovery of [0,.3,1]){
        const options={bendMode:'localized',bend:65,bendCenter:.6,bendSpread:.3,bendRecovery};
        const model=generate(options),sparse=generate({...options,budSurvival:.5});
        assert.ok(model.audit.passed);assert.ok(sparse.audit.passed);
        const keyed=new Map(model.paths.map(p=>[p.key,p]));
        for(const p of sparse.paths)assert.deepEqual(p.points,keyed.get(p.key).points);
    }
});
test('automatic ranges select per parent, preserve settings, and allow exact counts',()=>{
    const model=generate({...controlled,countMode:'range',minChildren:2,maxChildren:4,depth:4,forkAngle:15});
    assert.deepEqual(new Set(model.paths.filter(p=>p.proposedChildren).map(p=>p.proposedChildren)),new Set([2,3,4]));
    for(const p of model.paths)assert.ok(p.children.length<=p.proposedChildren);
    const same=generate({...controlled,countMode:'range',minChildren:3,maxChildren:3,architecture:'fork',forkAngle:15});
    assert.equal(same.paths.length,13);
    const manual=generate({...controlled,countMode:'manual',branchCounts:counts(2),architecture:'fork',forkAngle:15,minChildren:4,maxChildren:4});
    assert.equal(manual.paths.length,7);
});
test('dense curved graphs can be drawn without exceeding the argument stack',()=>{
    const model=generate({...controlled,bendMode:'localized',bend:0,bendSpread:.1,depth:8,branchCounts:counts(4),lateralRatio:.9,mainRatio:.9});
    assert.equal(model.paths.length,branchLimit);assert.ok(svg(model.paths).startsWith('<svg'));
});

test('species catalog covers the enhanced collection with sourced numeric presets',async()=>{
    const profiles=JSON.parse(await readFile(new URL('../../../tools/bake_vegetation/enhanced_reference/profiles.json',import.meta.url),'utf8'));
    assert.deepEqual(Object.keys(species).sort(),Object.keys(profiles).sort());
    for(const [id,p] of Object.entries(species)){
        assert.equal(presets[id].species,id);assert.equal(presets[id].competition,false);
        assert.ok(p.sources.length>0&&p.sources.every(s=>s.url.startsWith('https://')));
        assert.ok(p.limitation&&p.mapping);
        assert.ok(Object.values(p.parameters).every(v=>typeof v==='number'||typeof v==='string'));
    }
    assert.equal(presets.silver_linden.architecture,'leader');
    assert.equal(presets.arrowwood_viburnum.arrangement,'paired');
    assert.ok(presets.arrowwood_viburnum.basalCount>5);
    assert.throws(()=>generate({species:'unknown'}));
});

test('species starting points reproduce, round-trip and stay within geometry budgets',()=>{
    const silhouettes=new Set();
    for(const id of Object.keys(species)){
        for(const seed of [1,31,92]){
            const model=generate({...presets[id],seed});
            assert.equal(model.settings.species,id);assert.ok(model.audit.passed,id);
            assert.equal(model.stopped.budget,0,id);assert.ok(model.paths.length>10,id);
            assert.deepEqual(generate(JSON.parse(JSON.stringify(model.settings))),model);
        }
        silhouettes.add(JSON.stringify(generate(presets[id]).paths));
    }
    assert.equal(silhouettes.size,Object.keys(species).length);
});
