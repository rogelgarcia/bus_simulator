// Exact flush joins must close sampling gaps without rounding sidewalk intersections.
import test from 'node:test';
import assert from 'node:assert/strict';
import {alignBuildingSlabBoundary} from '../../../src/app/city/BuildingSlabBoundary.js';

test('Slab corner meets intersecting sidewalk strips exactly, at any location or rotation',()=>{
    for(const angle of [0,.37,Math.PI/2])for(const scale of [1,3]){
        const transform=([x,z])=>({x:123+scale*(x*Math.cos(angle)-z*Math.sin(angle)),z:-37+scale*(x*Math.sin(angle)+z*Math.cos(angle))});
        const outline=[[0,0],[2,0],[2,1.521],[1.944,1.791581],[1.694,1.992979],[0,2]].map(transform);
        const segments=[[[2,-2],[2,4]],[[-2,2],[4,2]]].map(s=>s.map(transform));
        const result=alignBuildingSlabBoundary(outline,segments,.06*scale,.384*scale),corner=transform([2,2]);
        assert.ok(result.some(p=>Math.hypot(p.x-corner.x,p.z-corner.z)<1e-9),'The actual segment intersection must be a slab vertex');
        assert.deepEqual(result[0],outline[0]);
        assert.equal(result.length,7);
        assert.deepEqual(alignBuildingSlabBoundary(outline,segments.toReversed(),.06*scale,.384*scale),result,
            'Sidewalk inventory order must not change the reconstructed boundary');
    }
});

test('Separated sidewalk ends are not extended into a made-up intersection',()=>{
    const outline=[{x:0,z:0},{x:2,z:0},{x:2,z:1},{x:1,z:2},{x:0,z:2}];
    const segments=[[{x:2,z:-1},{x:2,z:1}],[{x:-1,z:2},{x:1,z:2}]];
    assert.deepEqual(alignBuildingSlabBoundary(outline,segments,.06,2),outline);
});
