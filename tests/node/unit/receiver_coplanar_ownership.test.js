import test from 'node:test';
import assert from 'node:assert/strict';
import { planReceiverCoplanarOwnership, prepareReceiverCoplanarOwnership } from '../../../src/app/illumination/receiver_lightmaps/ReceiverCoplanarOwnership.js';

test('Coplanar ownership removes only overlap and retains source interpolation, material boundaries and raised faces',()=>{
    const triangle=[0,0,0, 2,0,0, 0,0,2];
    const positions=new Float32Array([...triangle, ...triangle.map((v,i)=>i%3===0?v+1:v),
        ...triangle, ...triangle.map((v,i)=>i%3===1?v+.01:v)]);
    const before=positions.slice(), result=planReceiverCoplanarOwnership(positions,new Int32Array([0,0,1,0]));
    assert.deepEqual([...result.patches.keys()],[1]);
    assert.ok(Math.abs(result.removedArea-.5)<1e-9);
    let area=0;
    for(const triangle of result.patches.get(1)) {
        const p=triangle.map(w=>[0,2].map(c=>w.reduce((n,v,i)=>n+v*positions[9+i*3+c],0)));
        area+=Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[2][0]-p[0][0])*(p[1][1]-p[0][1]))*.5;
        for(const w of triangle){assert.ok(Math.abs(w.reduce((a,b)=>a+b)-1)<1e-9);assert.ok(w.every(v=>v>=0&&v<=1));}
    }
    assert.ok(Math.abs(area-1.5)<1e-9);assert.deepEqual(positions,before);
    assert.deepEqual([...planReceiverCoplanarOwnership(new Float32Array([...triangle,...triangle]),new Int32Array([0,0])).patches],[[1,[]]]);
    assert.equal(planReceiverCoplanarOwnership(new Float32Array([...triangle,...triangle]),new Int32Array([0,-1])).patches.size,0);
});

test('Large coplanar work can pause and cancel without mutating source coordinates',()=>{
    const positions = new Float32Array(Array.from({length:600},(_,i)=>{
        const x=Math.floor(i/2)*3;return [x,0,0,x+2,0,0,x,0,2];
    }).flat());
    const original=positions.slice(),materials=new Int32Array(600);
    const work=prepareReceiverCoplanarOwnership(positions,materials);
    for(let i=0;i<8;i++)assert.equal(work.next().done,false);
    work.return();assert.deepEqual(positions,original);
    const resumed=prepareReceiverCoplanarOwnership(positions,materials);let result,pauses=0;
    do{result=resumed.next();pauses++;}while(!result.done);
    assert.ok(pauses>600);assert.equal(result.value.patches.size,300);
    assert.ok(Math.abs(result.value.removedArea-600)<1e-9);assert.deepEqual(positions,original);
});

test('Overlapping triangle subtraction preserves the covered region without double coverage',()=>{
    const triangles=[[[0,0],[3,0],[0,3]],[[1,0],[4,0],[1,3]],[[.5,1],[3.5,1],[.5,4]],
        [[-1,.5],[2,.5],[-1,3.5]],[[1,-1],[4,2],[1,2]]];
    const positions=new Float32Array(triangles.flatMap(t=>t.flatMap(p=>[p[0],0,p[1]])));
    const result=planReceiverCoplanarOwnership(positions,new Int32Array(triangles.length));
    const output=triangles.flatMap((t,index)=>(result.patches.get(index)??[[[1,0,0],[0,1,0],[0,0,1]]])
        .map(piece=>piece.map(w=>[0,1].map(c=>w.reduce((sum,v,i)=>sum+v*t[i][c],0)))));
    const contains=(triangle,p)=>triangle.every((a,i)=>{
        const b=triangle[(i+1)%3];return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>1e-9;
    });
    for(let y=-1;y<4;y+=.0973)for(let x=-1;x<4;x+=.0931) {
        const p=[x+.013,y+.019],before=triangles.some(t=>contains(t,p)),after=output.filter(t=>contains(t,p)).length;
        assert.equal(after,Number(before),'Coverage changed at '+p);
    }
});
