import test from 'node:test';
import assert from 'node:assert/strict';
import {receiverFacadeTexelSize} from '../../../src/app/illumination/receiver_lightmaps/ReceiverFacadeDensity.js';
const wall=[[[0,0,0],[1,0,0],[0,10,0]]], roof=[[[0,0,0],[1,0,0],[0,0,10]]];
const mapping={category:'buildings'}, material={alpha:{mode:'opaque'},roughness:.85,metalness:0,transmission:0,customShaderTags:[],customSemantics:{materialVariationConfig:{normalized:{root:'wall'}}}};
test('Fine facade allocation preserves both axes independently of pose, color and identity',()=>{
    assert.equal(receiverFacadeTexelSize(mapping,material,wall,.33),.0825);
    assert.equal(receiverFacadeTexelSize({...mapping,id:'different'},{...material,colorLinearSrgb:[.01,.01,.01]},wall,.33),.0825);
    assert.equal(receiverFacadeTexelSize(mapping,material,wall,.04),.04);
});
test('Roof, ground, glass and metal retain their existing allocation',()=>{
    assert.equal(receiverFacadeTexelSize(mapping,material,roof,.33),.33);
    assert.equal(receiverFacadeTexelSize({...mapping,category:'roads'},material,wall,.33),.33);
    for(const change of [{customSemantics:{}},{roughness:.2},{metalness:1},{transmission:.5},{alpha:{mode:'cutout'}},{customShaderTags:['windowInterior']}])
        assert.equal(receiverFacadeTexelSize(mapping,{...material,...change},wall,.33),.33);
    assert.equal(receiverFacadeTexelSize(mapping,material,[...wall,...roof],.33),.33);
});
