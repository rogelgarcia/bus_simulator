// Rotating strip volumes assign every root once and keep original geometry outside covered cells.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassDebugV2BillboardLayout } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BillboardLayout.js';

test('billboard strip coverage respects depth, both widths and field edges through a full turn', () => {
    const bounds={minX:-1,maxX:1,minZ:-1,maxZ:1},roots=[];
    for(let z=-1;z<=1.0001;z+=.025)for(let x=-1;x<=1.0001;x+=.025)roots.push({x,z});
    let small=0,large=0;
    for(let i=0;i<72;i++){
        const p=createGrassDebugV2BillboardLayout({bounds,roots,yaw:i*Math.PI/36});
        const seen=new Set();
        for(const plate of p.plates){
            assert([.15,.3].includes(plate.width));assert(plate.leafIds.length>=2);
            if(plate.small)small++;else large++;
            for(const u of [plate.left,plate.left+plate.width])for(const d of [plate.front,plate.front-.05]){
                const x=p.cosine*u+p.sine*d,z=-p.sine*u+p.cosine*d;
                assert(x>=p.inner.minX-1e-7&&x<=p.inner.maxX+1e-7);assert(z>=p.inner.minZ-1e-7&&z<=p.inner.maxZ+1e-7);
            }
            for(const id of plate.leafIds){
                assert(!seen.has(id));seen.add(id);assert.equal(p.assignments[id],plate.id);
                const root=roots[id],u=p.cosine*root.x-p.sine*root.z,d=p.sine*root.x+p.cosine*root.z;
                assert(u>=plate.left-1e-7&&u<=plate.left+plate.width+1e-7);
                assert(d<=plate.front+1e-7&&d>=plate.front-.05-1e-7);
            }
        }
        for(const id of p.fallback){assert(!seen.has(id));seen.add(id);assert.equal(p.assignments[id],-1);}
        assert.equal(seen.size,roots.length);assert(p.fallback.length>0);
    }
    assert(small>0&&large>0);
});

test('isolated leaves retain LOD2 instead of allocating empty or one-leaf cards',()=>{
    const p=createGrassDebugV2BillboardLayout({bounds:{minX:-1,maxX:1,minZ:-1,maxZ:1},roots:[{x:0,z:0},{x:.6,z:.6}],yaw:0});
    assert.equal(p.plates.length,0);assert.deepEqual(p.fallback,[0,1]);
});
