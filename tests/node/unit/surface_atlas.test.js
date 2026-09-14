import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceAtlas} from '../../../tools/bake_lighting/experiments/lighting_configurations/export_city/SurfaceAtlas.js';

const wall=[0,0,0,2,0,0,2,3,0, 0,0,0,2,3,0,0,3,0];
test('Surface charts retain a continuous metric lattice across split wall triangles',()=>{
    const a=createSurfaceAtlas(wall,[0,0],{pixelsPerMeter:32});
    assert.equal(a.charts.length,1);
    assert.equal(a.uv[0],a.uv[6]);assert.equal(a.uv[1],a.uv[7]);
    assert.equal(a.uv[4],a.uv[8]);assert.equal(a.uv[5],a.uv[9]);
    const distance=Math.hypot((a.uv[0]-a.uv[2])*a.width,(a.uv[1]-a.uv[3])*a.height);
    assert.ok(Math.abs(distance-64)<1e-4);
    assert.ok([...a.uv].every(x=>x>0&&x<1));
});
test('Different planes and material slots cannot overlap charts; positions remain camera independent',()=>{
    const shifted=wall.map((x,i)=>i%3===2?x+2:x);
    const a=createSurfaceAtlas([...wall,...shifted],[0,1,0,0]);
    assert.equal(a.charts.length,3);
    for(const c of a.charts)for(const d of a.charts)if(c!==d)
        assert.ok(c.x+c.width<=d.x||d.x+d.width<=c.x||c.y+c.height<=d.y||d.y+d.height<=c.y);
    assert.deepEqual(a,createSurfaceAtlas([...wall,...shifted],[0,1,0,0]));
});
test('Surface exporter fails closed on unsupported or oversized input rather than reducing density',()=>{
    assert.throws(()=>createSurfaceAtlas(wall,[0]),/triangle/);
    assert.throws(()=>createSurfaceAtlas(wall,[0,0],{pixelsPerMeter:10000}),/exceeds/);
    assert.throws(()=>createSurfaceAtlas(new Array(9).fill(0),[0]),/nondegenerate/);
});

test('Sparse trim does not allocate the empty courtyard at wall texel density',()=>{
    const positions=[];
    for(const [x,y,w,h] of [[0,0,50,.2],[0,35,50,.2],[0,.2,.2,34.8],[49.8,.2,.2,34.8]])
        positions.push(x,y,0,x+w,y,0,x+w,y+h,0,x,y,0,x+w,y+h,0,x,y+h,0);
    const atlas=createSurfaceAtlas(positions,new Array(8).fill(0),{pixelsPerMeter:32});
    assert.ok(atlas.width*atlas.height<50*35*32*32/3);
    for(let triangle=0;triangle<8;triangle++){
        const p=triangle*9,u=triangle*6;
        const world=Math.hypot(positions[p+3]-positions[p],positions[p+4]-positions[p+1]);
        const texels=Math.hypot((atlas.uv[u+2]-atlas.uv[u])*atlas.width,(atlas.uv[u+3]-atlas.uv[u+1])*atlas.height);
        assert.ok(Math.abs(texels-world*32)<.001);
        const signedArea=(atlas.uv[u+2]-atlas.uv[u])*(atlas.uv[u+5]-atlas.uv[u+1])-(atlas.uv[u+3]-atlas.uv[u+1])*(atlas.uv[u+4]-atlas.uv[u]);
        assert.ok(signedArea>0,'Packing must preserve front-face shading normals');
    }
});
