import test from 'node:test';
import assert from 'node:assert/strict';
import { extendReceiverPage, downsampleReceiverPage } from '../../../tools/receiver_lightmaps/ReceiverPagePadding.mjs';

test('Chart extension preserves dark samples and cannot borrow a neighboring chart color',()=>{
    const size=16,data=new Float32Array(size*size*4),mask=new Float32Array(data.length);
    const seed=(x,y,color)=>{const i=(y*size+x)*4;data.set([...color,1],i);mask[i+3]=1;};
    seed(3,3,[0,0,0]);seed(6,3,[3,0,0]);seed(11,3,[0,0,10]);
    const chart=(id,x)=>({id,page:0,x,y:0,width:8,height:8,min:[0,0],texelsPerMeter:[1,1],triangles:[{uv:[[0,0],[2,0],[0,2]]}]});
    const report=extendReceiverPage(data,mask,mask,0,[chart('dark',0),chart('blue',8)],{pageSize:size,padding:2});
    const rgb=(x,y)=>[...data.slice((y*size+x)*4,(y*size+x)*4+3)];
    assert.deepEqual(rgb(3,3),[0,0,0]);assert.deepEqual(rgb(6,3),[3,0,0]);
    assert.deepEqual(rgb(0,0),[0,0,0]);assert.deepEqual(rgb(7,7),[3,0,0]);assert.deepEqual(rgb(8,7),[0,0,10]);
    assert.equal(report.charts,2);assert.equal(report.triangles,2);assert.equal(report.extendedPixels,125);
    assert.equal(downsampleReceiverPage(data,size).length,8*8*4);
    assert.throws(()=>extendReceiverPage(new Float32Array(data.length),new Float32Array(data.length),mask,0,[chart('empty',0)],{pageSize:size,padding:2}),/no actual baked samples/);
});
