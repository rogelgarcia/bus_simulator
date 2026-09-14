import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMaterialControl} from '../../../tools/bake_lighting/experiments/lighting_configurations/export_city/SourceMaterialControl.js';
import {describeSourceMaterial} from '../../../tools/bake_lighting/experiments/lighting_configurations/export_city/SourceMaterialContract.js';

function material() {
    return {roughness:.85, aoMapIntensity:1, version:4, map:{id:'authored'}, userData:{materialVariationConfig:{
        uniforms:{config0:{x:12,y:19,z:1,w:0},texBlend1:{x:10,y:100,z:.6,w:0},normalMap:{x:1,y:1,z:0,w:0}},
        debugUniforms:{debug1:{x:1,y:1,z:1,w:1},debug2:{x:1,y:0,z:0,w:0}}
    }}};
}
const scene = materials => ({traverse:visit=>materials.forEach(m=>visit({material:m}))});

test('Source material control retains texture factors and restores shared uniforms after repeated use', () => {
    const a=material(), b={...a}, root=scene([a,b,[a,b]]), before=JSON.stringify([a,b]);
    const config=a.userData.materialVariationConfig.uniforms.config0, texture=a.map;
    for(let index=0;index<20;index++) {
        const control=sourceMaterialControl(root);
        assert.equal(config.z,0);
        assert.equal(a.userData.materialVariationConfig.uniforms.texBlend1.w,1);
        assert.equal(a.userData.materialVariationConfig.debugUniforms.debug1.z,1);
        assert.equal(a.roughness,.85);assert.equal(a.aoMapIntensity,1);
        assert.equal(a.map,texture);assert.equal(a.version,4);
        control.restore();control.restore();
        assert.equal(a.userData.materialVariationConfig.uniforms.config0,config);
        assert.equal(JSON.stringify([a,b]),before);
    }
});

test('Source material control restores prior changes when an unsupported material fails', () => {
    const a=material(), b=material();delete b.userData.materialVariationConfig.uniforms.texBlend1;
    const before=JSON.stringify([a,b]);
    assert.throws(()=>sourceMaterialControl(scene([a,b])),/Unsupported material variation uniform/);
    assert.equal(JSON.stringify([a,b]),before);
});

test('Source export preserves omitted procedural inputs and does not certify texture AO as equivalent', () => {
    const source=material();source.isMeshStandardMaterial=true;source.aoMap={id:'occlusion'};
    const contract=describeSourceMaterial(source);
    assert.equal(contract.productionMaterialInputsEquivalent,false);
    assert.ok(contract.omitted.includes('procedural material variation'));
    assert.ok(contract.omitted.includes('authored texture AO on indirect lighting'));
    assert.deepEqual(contract.proceduralSource.uniforms.config0,[12,19,1,0]);
    source.userData.materialVariationConfig.uniforms.config0.z=0;
    assert.equal(contract.proceduralSource.uniforms.config0[2],1);
    assert.equal(describeSourceMaterial({isMeshStandardMaterial:true}).productionMaterialInputsEquivalent,true);
    assert.equal(describeSourceMaterial({isMeshStandardMaterial:true,userData:{asphaltShader:true}}).productionMaterialInputsEquivalent,false);
    assert.throws(()=>describeSourceMaterial({userData:{materialVariationConfig:{uniforms:{bad:{x:NaN}}}}}),/Unserializable/);
});
