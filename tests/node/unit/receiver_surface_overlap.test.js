import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiverHiddenTexelMasks } from '../../../tools/receiver_lightmaps/ReceiverSurfaceOverlap.mjs';
import { extendReceiverPage, downsampleReceiverPage } from '../../../tools/receiver_lightmaps/ReceiverPagePadding.mjs';

function fixture({ gap = .001, reverse = false, shift = 0, angle = 0 } = {}) {
    const positions = [new Float32Array([0,0,0, 8,0,0, 0,8,0, 8,0,0, 8,8,0, 0,8,0]),
        new Float32Array([4+shift,0,0, 8+shift,0,0, 4+shift,8,0, 8+shift,0,0, 8+shift,8,0, 4+shift,8,0])];
    if(reverse)for(let i=0;i<positions[1].length;i+=9)for(let c=0;c<3;c++) {
        const a=positions[1][i+3+c];positions[1][i+3+c]=positions[1][i+6+c];positions[1][i+6+c]=a;
    }
    const c=Math.cos(angle),s=Math.sin(angle),matrix=z=>[1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,-s*z,c*z,1];
    const parsed = { manifest: {
        geometries:positions.map((_,i)=>({id:'g'+i,attributes:{position:{bufferId:i,componentType:'f32',byteOffset:0,byteStride:12}}})),
        meshInstances:positions.map((_,i)=>({id:'i'+i,geometryId:'g'+i,matrixThreeWorld:matrix(i*gap)}))
    }, getBuffer:i=>new Uint8Array(positions[i].buffer) };
    const charts=positions.map((data,i)=>({id:'c'+i,instanceId:'i'+i,page:0,x:i*16,y:0,width:14,height:14,
        min:[0,0],texelsPerMeter:[1,1],triangles:[0,9].map(offset=>({offset:offset/3,
            uv:[0,3,6].map(n=>[data[offset+n],data[offset+n+1]])}))}));
    return {parsed,charts,profile:{pageSize:32,padding:2}};
}

test('Near-coplanar hidden texels extend exposed radiance without a dark filtering seam',()=>{
    const {parsed,charts,profile}=fixture(), {masks,report}=createReceiverHiddenTexelMasks(parsed,charts,profile);
    const hidden=masks.get(0),at=(x,y)=>(y*32+x)*4;
    assert.equal(hidden[5*32+8],1);assert.equal(hidden[5*32+3],0);
    assert.ok(report.hiddenTexels>0);
    const data=new Float32Array(32*32*4),mask=new Float32Array(data.length);
    for(let y=2;y<=10;y++)for(let x=2;x<=10;x++) {
        const value=x<6?1:0;data.set([value,value,value,1],at(x,y));mask[at(x,y)+3]=1;
    }
    // A real exposed shadow stays dark; it cannot be relabeled as missing data.
    data.set([0,0,0,1],at(2,2));
    const before=data[at(5,5)]*.25+data[at(6,5)]*.75;
    extendReceiverPage(data,mask,mask,0,[charts[0]],profile,hidden);
    assert.equal(before,.25);
    assert.equal(data[at(5,5)]*.25+data[at(6,5)]*.75,1);
    assert.equal(data[at(2,2)],0);
    assert.equal(downsampleReceiverPage(data,32)[(2*16+3)*4],1);
});

test('Overlap selection uses world geometry, including rotated layers, and excludes real gaps and back faces',()=>{
    for(const options of [{gap:.02},{reverse:true},{shift:20}]) {
        const {parsed,charts,profile}=fixture(options);
        assert.equal(createReceiverHiddenTexelMasks(parsed,charts,profile).report.hiddenTexels,0);
    }
    const flat=fixture(),rotated=fixture({angle:.7});
    assert.deepEqual(createReceiverHiddenTexelMasks(flat.parsed,flat.charts,flat.profile).masks,
        createReceiverHiddenTexelMasks(rotated.parsed,rotated.charts,rotated.profile).masks);
});
