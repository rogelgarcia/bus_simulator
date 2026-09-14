// Prevent invalid independent fixtures from becoming apparently valid render corrections.
import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceWhiteEnergy} from '../../../tools/bake_lighting/experiments/reference_matching/EnvironmentFixture.mjs';

const fixture=()=>[1,.9,.75,.6,.45,.3,.15,.05].flatMap(noV=>[.05,.2,.4,.6,.78,.85,1].map(roughness=>({noV,roughness,cycles:[.04,.04,.04]})));
test('White energy contract is order-independent and preserves neutral radiance',()=>{
    const a=referenceWhiteEnergy(fixture()),b=referenceWhiteEnergy(fixture().reverse());
    assert.deepEqual(a,b);assert.equal(a.pixels.byteLength,896);assert.equal(a.noV[0],.05);
    for(let i=0;i<56;i++)assert.ok(Math.abs(a.pixels[i*4]-.04)<1e-8);
});
test('Reject duplicated or missing axes, invalid energy and a colored white control',()=>{
    const samples=fixture();samples[0]=samples[1];assert.throws(()=>referenceWhiteEnergy(samples),/duplicate/);
    const changed=fixture();changed[0].roughness=.1;assert.throws(()=>referenceWhiteEnergy(changed),/Missing/);
    for(const invalid of [[NaN,.04,.04],[0,0,0],[2,2,2],[.04,.03,.04],[.04]]){
        const cells=fixture();cells[0].cycles=invalid;
        assert.throws(()=>referenceWhiteEnergy(cells),/energy|neutral/);
    }
    assert.throws(()=>referenceWhiteEnergy(fixture().slice(1)),/56/);
});
