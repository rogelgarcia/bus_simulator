// A flat connected surface keeps a single affine light field independent of its triangulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canShareReceiverSurface } from '../../../src/app/illumination/receiver_lightmaps/ReceiverSurfaceCharts.js';
import { createRasterReceiverCharts } from '../../../src/app/illumination/receiver_lightmaps/ReceiverRasterCharts.js';

const triangle=(offset,uv)=>({offset,uv,area:Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]))/2});
const world=t=>t.uv.map(([u,v])=>[u,0,v]);

test('Receiver surface: narrow fan triangles share one continuous lightmap',()=>{
    for(const count of [2,20,100]) {
        const triangles=[];
        for(let i=0;i<count;i++)triangles.push(triangle(i*3,[[0,0],[4,4*i/count],[4,4*(i+1)/count]]));
        const chart={id:'flat-fan',triangles};
        const before=structuredClone(chart),continuous=canShareReceiverSurface(chart,world);
        assert.equal(continuous,true);
        const result=createRasterReceiverCharts(chart,.5,continuous);
        assert.equal(result.length,1,'Triangulation must not create independent lighting islands');
        assert.equal(result[0].triangles.length,count);
        assert.deepEqual(result[0].triangles.map(t=>t.uv),triangles.map(t=>t.uv));
        assert.deepEqual(chart,before);
    }
});

test('Receiver surface: disconnected, folded, overlapping and non-affine faces remain separate',()=>{
    const a=triangle(0,[[0,0],[2,0],[0,2]]),b=triangle(3,[[2,0],[2,2],[0,2]]);
    const chart={id:'quad',triangles:[a,b]};
    assert.equal(canShareReceiverSurface(chart,world),true);
    assert.equal(canShareReceiverSurface(chart,t=>world(t).map((p,i)=>t.offset===3&&i===1?[p[0],1,p[2]]:p)),false);
    for(const uv of [[[4,4],[6,4],[4,6]],[[.4,.4],[.5,.4],[.4,.5]],a.uv]) {
        assert.equal(canShareReceiverSurface({...chart,triangles:[a,triangle(3,uv)]},world),false);
    }
    const shifted=structuredClone(chart);shifted.triangles[1].uv[1]=[3,2];
    assert.equal(canShareReceiverSurface(shifted,t=>world(chart.triangles.find(v=>v.offset===t.offset))),false);
});

test('Receiver surface: scaled float32 unwrap coordinates preserve long narrow planar islands',()=>{
    const points=[[[0,0],[200,0],[200,1.875]],[[0,0],[200,1.875],[0,1.875]]];
    const triangles=points.map((p,i)=>triangle(i*3,p));
    const chart={triangles:triangles.map(t=>({...t,uv:t.uv.map(([u,v])=>[
        Math.fround((160+u)/1000)*1000,Math.fround((760+v)/1000)*1000])}))};
    assert.equal(canShareReceiverSurface(chart,t=>world(triangles[t.offset/3])),true);
});
