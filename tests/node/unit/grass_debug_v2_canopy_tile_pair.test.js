// Compatible tile variants must preserve the common boundary, projected shadows and leaf shapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassCanopyInteriorConstraint, varyGrassCanopyInterior, validateGrassCanopyPairBoundaries } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyTilePair.js';
import { createGrassCanopyLayoutAsset, createGrassCanopyLayoutPair, applyGrassCanopyLayoutAsset } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyLayoutAsset.js';

function fixture() {
    const roots = [[.97, 0, .12], [-.5, .2, .8], [-.4,-.3,.15], [0,-.3,.15], [.4,-.3,.15], [-.4,.3,.15], [0,.3,.15], [.4,.3,.15]];
    const values = [], ranges = [], shootIds = [];
    for (const [shoot, [x,z,height]] of roots.entries()) for (const sign of [-1,1]) {
        const center = x + sign * .015;
        values.push(center-.008,0,z, center+.008,0,z, center,height,z+.025);
        ranges.push({ start: shootIds.length * 3, count: 3 }); shootIds.push(shoot);
    }
    const array = new Float32Array(values);
    const position = { array, count: array.length / 3, getX: i => array[i*3], getY: i => array[i*3+1], getZ: i => array[i*3+2],
        setXYZ(i,x,y,z) { array[i*3]=x; array[i*3+1]=y; array[i*3+2]=z; } };
    const normals = new Float32Array(array.length).fill(.5), uv = new Float32Array(array.length / 3 * 2).fill(.25);
    const index = { array: Uint16Array.from({length:position.count}, (_,i)=>i), getX: i => i };
    const mesh = { geometry: { attributes: { position, normal: {array:normals}, uv: {array:uv} }, index,
        computeBoundingBox() {}, computeBoundingSphere() {} }, userData: { grassLeafRanges: ranges } };
    const options = { shootIds, periodMeters:2, sun:[1,1,.5], boundaryBandMeters:.08 };
    return { mesh, options };
}

test('LOD4 fixes crossing geometry and interior casters whose shadows cross the common boundary', () => {
    const {mesh,options}=fixture(), constraint=createGrassCanopyInteriorConstraint(mesh,options);
    assert.equal(constraint.fixedShoots,2); assert.equal(constraint.movableShoots,6);
    assert.equal(constraint.canMove({id:0},-.2,0),false);
    assert.equal(constraint.canMove({id:1},.2,0),false);
    assert.equal(constraint.canMove({id:2},.15,.1),true);
    assert.equal(constraint.canMove({id:2},-1,0),false);
});

test('LOD4 interior variation preserves fixed shoots, paired geometry, attributes and determinism', () => {
    const a=fixture(), b=fixture(), repeat=fixture();
    const before=Array.from(b.mesh.geometry.attributes.position.array), normal=b.mesh.geometry.attributes.normal, uv=b.mesh.geometry.attributes.uv, index=b.mesh.geometry.index;
    const report=varyGrassCanopyInterior(b.mesh,b.options); varyGrassCanopyInterior(repeat.mesh,repeat.options);
    assert.ok(report.swaps>0); assert.equal(report.fixedShoots,2);
    const after=Array.from(b.mesh.geometry.attributes.position.array);
    assert.deepEqual(after.slice(0,36),before.slice(0,36)); assert.notDeepEqual(after.slice(36),before.slice(36));
    assert.deepEqual(after,Array.from(repeat.mesh.geometry.attributes.position.array));
    assert.equal(b.mesh.geometry.attributes.normal,normal); assert.equal(b.mesh.geometry.attributes.uv,uv); assert.equal(b.mesh.geometry.index,index);
    for(let shoot=0;shoot<8;shoot++) {
        const first=shoot*18, dx=after[first]-before[first], dz=after[first+2]-before[first+2];
        for(let vertex=first;vertex<first+18;vertex+=3) {
            assert.ok(Math.abs(after[vertex]-before[vertex]-dx)<1e-6);
            assert.equal(after[vertex+1],before[vertex+1]);
            assert.ok(Math.abs(after[vertex+2]-before[vertex+2]-dz)<1e-6);
        }
    }
    assert.equal(validateGrassCanopyPairBoundaries([a.mesh,b.mesh],a.options).shadowsProtected,true);
});

test('LOD4 compatibility rejects changed edge/shadow shoots and identical interiors', () => {
    const a=fixture(), b=fixture();
    assert.throws(()=>validateGrassCanopyPairBoundaries([a.mesh,b.mesh],a.options),/identical interiors/);
    varyGrassCanopyInterior(b.mesh,b.options);
    for(const shoot of [0,1]) {
        const vertex=shoot*6, p=b.mesh.geometry.attributes.position, original=p.getX(vertex);
        p.setXYZ(vertex,original+.001,p.getY(vertex),p.getZ(vertex));
        assert.throws(()=>validateGrassCanopyPairBoundaries([a.mesh,b.mesh],a.options),/boundary geometry or its shadow/);
        p.setXYZ(vertex,original,p.getY(vertex),p.getZ(vertex));
    }
});

test('LOD4 serialized pair applies each variation without reshaping source leaves', () => {
    const a=fixture(), b=fixture(); varyGrassCanopyInterior(b.mesh,b.options);
    const source={hash:'b'.repeat(64),periodMeters:2,feedbackProfile:'hdr-display-v1',vertices:a.mesh.geometry.attributes.position.count,leaves:a.options.shootIds.length};
    const views=Array.from({length:48},()=>({sampleCount:1024,clippedFraction:0,blackFraction:0,minimum:35,maximum:190,mean:100}));
    const reports={placement:{algorithm:'compatible-interior-swaps'},optimization:{algorithm:'material-feedback',initialLoss:1,finalLoss:.9,initialCoverage:.5,finalCoverage:.5},
        renderedOptimization:{algorithm:'rendered-feedback',published:false,verificationResolution:4096,verificationShadowResolution:8192,
            renderPipeline:{profile:'hdr-display-v1',hdrFormat:'RGBA16F',displayTransform:'scene-color-grading-output',exposure:1,toneMapping:4},
            views,finalViews:views,verification:{initial:views,candidate:views}}};
    const pair=createGrassCanopyLayoutPair(source,[a,b].map(({mesh})=>createGrassCanopyLayoutAsset(mesh,source,reports)),validateGrassCanopyPairBoundaries([a.mesh,b.mesh],a.options));
    const restored=JSON.parse(JSON.stringify(pair));
    for(let i=0;i<2;i++) {
        const target=fixture().mesh, normal=target.geometry.attributes.normal, uv=target.geometry.attributes.uv, index=target.geometry.index;
        applyGrassCanopyLayoutAsset(target,restored.variants[i],source);
        assert.deepEqual(Array.from(target.geometry.attributes.position.array),restored.variants[i].positions);
        assert.equal(target.geometry.attributes.normal,normal); assert.equal(target.geometry.attributes.uv,uv); assert.equal(target.geometry.index,index);
    }
    const broken=structuredClone(restored.variants[1]);broken.positions[7]+=.03;
    assert.throws(()=>applyGrassCanopyLayoutAsset(fixture().mesh,broken,source),/shape/);
    const clipped=structuredClone(restored.variants[1]);clipped.renderedOptimization.verification.candidate[0].clippedFraction=.2;
    assert.throws(()=>applyGrassCanopyLayoutAsset(fixture().mesh,clipped,source),/clipped or degenerate/);
    const stale=structuredClone(restored.variants[1]);delete stale.renderedOptimization.renderPipeline;
    assert.throws(()=>applyGrassCanopyLayoutAsset(fixture().mesh,stale,source),/HDR display validation/);
});
