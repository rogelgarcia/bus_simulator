// Curved sidewalk insets must collapse exhausted arcs without overlapping or inverted top faces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadSidewalkMeshDataFromRoadEnginePrimitives as build } from '../../../src/app/road_decoration/sidewalks/RoadSidewalkBuilder.js';

function corner(radius, transform = p => p) {
    const points = [{x:0,z:0},{x:20,z:0},{x:20,z:20},{x:10,z:20}];
    for (let i=0;i<=12;i++) {
        const angle=-Math.PI*i/24;
        points.push({x:10-radius+radius*Math.cos(angle),z:10+radius+radius*Math.sin(angle)});
    }
    points.push({x:0,z:10});
    return [{type:'polygon',kind:'asphalt_piece',points:points.map(transform)}];
}

function topTriangles(positions) {
    const triangles=[];
    for(let i=0;i<positions.length;i+=9) {
        const p=[0,1,2].map(j=>Array.from(positions.slice(i+j*3,i+j*3+3)));
        if(p.every(v=>Math.abs(v[1]-.171)<1e-6))triangles.push(p);
    }
    return triangles;
}

test('Sidewalk: an inset wider than a concave corner radius has no reversed walking faces',()=>{
    for(const radius of [.4,1,3])for(const angle of [0,.73]) {
        const c=Math.cos(angle),s=Math.sin(angle);
        const triangles=topTriangles(build(corner(radius,p=>({x:51+c*p.x-s*p.z,z:27+s*p.x+c*p.z}))).positions);
        assert.ok(triangles.length>0);
        for(const [a,b,d] of triangles) {
            const normalY=(b[2]-a[2])*(d[0]-a[0])-(b[0]-a[0])*(d[2]-a[2]);
            assert.ok(normalY>1e-10,`Radius ${radius}, angle ${angle}: reversed/degenerate top face ${JSON.stringify([a,b,d])}`);
        }
    }
});

test('Sidewalk: the exhausted inner arc is covered once across triangle interiors',()=>{
    const triangles=topTriangles(build(corner(1)).positions);
    for(let x=8.201;x<9.2;x+=.113)for(let z=10.807;z<12.2;z+=.127) {
        const count=triangles.filter(t=>{
            const signs=t.map((a,i)=>{const b=t[(i+1)%3];return (b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]);});
            return signs.every(v=>v>1e-8)||signs.every(v=>v< -1e-8);
        }).length;
        assert.equal(count,1,`Expected one surface at ${x},${z}, got ${count}`);
    }
});
