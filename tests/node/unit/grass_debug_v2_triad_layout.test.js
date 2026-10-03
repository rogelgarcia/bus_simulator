// Check immutable triad placement, unique root ownership and bounded continuous rotation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassDebugV2TriadLayout, getGrassTriadTurns } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2TriadLayout.js';

test('triads retain root ownership and fit both widths through their full rotation range',()=>{
    const bounds={minX:-1,maxX:1,minZ:-1,maxZ:1},roots=[];
    for(let z=-1;z<=1.0001;z+=.025)for(let x=-1;x<=1.0001;x+=.025)roots.push({x,z,nx:Math.sin(x*37+z*29),nz:Math.cos(x*37+z*29)});
    const p=createGrassDebugV2TriadLayout({bounds,roots}),seen=new Set(),groups=new Map();
    for(const card of p.plates){
        assert([.1,.2].includes(card.width));assert(card.leafIds.length>=2);assert(card.axis>=0&&card.axis<=2);
        const axes=groups.get(card.groupId)??new Set();assert(!axes.has(card.axis));axes.add(card.axis);groups.set(card.groupId,axes);
        for(const leaf of card.leafIds){assert(!seen.has(leaf));seen.add(leaf);assert.equal(p.assignments[leaf],card.id);
            const dx=roots[leaf].x-card.x,dz=roots[leaf].z-card.z;
            assert(Math.abs(Math.cos(card.angle)*dx-Math.sin(card.angle)*dz)<=card.width/2+1e-7);
            assert(Math.abs(Math.sin(card.angle)*dx+Math.cos(card.angle)*dz)<=.05+1e-7);
        }
        for(let degrees=-5;degrees<=5;degrees+=.5)for(const end of [-1,1]){
            const angle=card.angle+degrees*Math.PI/180,x=card.x+end*Math.cos(angle)*card.width/2,z=card.z-end*Math.sin(angle)*card.width/2;
            assert(x>=bounds.minX-1e-7&&x<=bounds.maxX+1e-7&&z>=bounds.minZ-1e-7&&z<=bounds.maxZ+1e-7);
        }
    }
    for(const leaf of p.fallback){assert(!seen.has(leaf));seen.add(leaf);assert.equal(p.assignments[leaf],-1);}
    assert.equal(seen.size,roots.length);assert(p.fallback.length>0);assert(p.plates.some(c=>c.small));assert(p.plates.some(c=>!c.small));
    assert.equal(p.triads,groups.size);
});

test('triad turns are continuous across front/back changes and never exceed five degrees',()=>{
    const limit=5*Math.PI/180;
    for(let i=-3600;i<3600;i++){
        const yaw=i*Math.PI/1800,a=getGrassTriadTurns(yaw),b=getGrassTriadTurns(yaw+.0001);
        for(let axis=0;axis<3;axis++){assert(Math.abs(a[axis])<=limit+1e-10);assert(Math.abs(a[axis]-b[axis])<.00002);}
        assert(a.every((x,axis)=>Math.abs(x-getGrassTriadTurns(yaw+Math.PI)[axis])<1e-10));
    }
});
