// Checks world-space layer assignment and source-bound configuration exchange.
import test from 'node:test';
import assert from 'node:assert/strict';
import {project,moveInView,projectedRadii,classify,counts,createExport,parseExport,clone} from '../../../tools/bake_vegetation/layer_study/model.js';

const config={center:[1,2,8],layers:['inner','middle','outer'].map((id,i)=>({id,radii:[i+1,i+2,i+3],strategy:null}))};
const model={id:'test/mature_01',source:{sha256:'identity',revision:'v1'},preset:config};
const study={models:[model]};
const views=[[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]].map(right=>({right,up:[0,0,1],target:[0,0,5],span:20}));
test('cardinal drags preserve hidden depth and reverse correctly behind the tree',()=>{
    for(const view of views){
        const moved=moveInView(config.center,[.08,-.03],view),before=project(config.center,view),after=project(moved,view);
        assert.ok(Math.abs(after[0]-before[0]-.08)<1e-12);assert.ok(Math.abs(after[1]-before[1]+.03)<1e-12);
        assert.equal(moved[view.right[0]===0?0:1],config.center[view.right[0]===0?0:1]);
    }
    assert.ok(moveInView(config.center,[.1,0],views[2])[0]<config.center[0]);
    assert.deepEqual(projectedRadii([4,2,6],views[1]),[.1,.3]);
});
test('nested layers are disjoint in 3D and outside foliage stays explicit',()=>{
    const points=[[1,2,8],[2.5,2,8],[3.5,2,8],[1,7,8]];
    assert.deepEqual(points.map(p=>classify(p,config)),[0,1,2,-1]);
    assert.deepEqual(counts(new Float32Array(points.flat()),config),[1,1,1,1]);
});
test('exports round trip all models and reject changed source, missing models and inverted boundaries',()=>{
    const exported=createExport(study,{[model.id]:config},{[model.id]:true});
    assert.deepEqual(parseExport(JSON.stringify(exported),study),{configs:{[model.id]:config},reviewed:{[model.id]:true}});
    for(const mutate of [d=>d.models[0].source.sha256='other',d=>d.models=[],d=>d.models[0].layers[1].radii[0]=.5,d=>d.models[0].layers[1].radii[0]=1.001,d=>d.models[0].center[0]=null]){
        const invalid=clone(exported);mutate(invalid);assert.throws(()=>parseExport(JSON.stringify(invalid),study));
    }
});
