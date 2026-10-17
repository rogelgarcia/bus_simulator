// Exercises tangent fallback repair while preserving every unrelated GLB byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import {orthogonalizeTangents} from '../../../tools/bake_vegetation/ramification3d/export_pbr.mjs';
import {glbDocument} from '../../../tools/bake_vegetation/Validate.mjs';
import {readAccessor} from '../../../tools/bake_vegetation/Accessors.mjs';
function fixture(tangents){
    const normals=[[1,0,0],[0,0,1],[0,1,0]],binary=Buffer.alloc(84);
    normals.flat().forEach((v,i)=>binary.writeFloatLE(v,i*4));tangents.flat().forEach((v,i)=>binary.writeFloatLE(v,36+i*4));
    const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},buffers:[{byteLength:84}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:48}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:3},{bufferView:1,componentType:5126,type:'VEC4',count:3}],meshes:[{primitives:[{attributes:{NORMAL:0,TANGENT:1}}]}]}));
    const padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
    header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);header.writeUInt32LE(padded.length,12);header.write('JSON',16);
    binHeader.writeUInt32LE(binary.length);binHeader.write('BIN\0',4);return Buffer.concat([header,padded,binHeader,binary]);
}
test('degenerate cap tangents become orthogonal without touching normals, headers or handedness',()=>{
    const bytes=fixture([[1,0,0,-1],[.6,0,.8,1],[1,0,0,1]]),before=Buffer.from(bytes);const result=orthogonalizeTangents(bytes),d=glbDocument(bytes);
    assert.equal(result.repaired,2);assert.equal(result.parallel,1);assert.deepEqual(bytes.subarray(0,bytes.length-48),before.subarray(0,before.length-48));
    const t=readAccessor(d,1),n=readAccessor(d,0);
    for(let i=0;i<3;i++){assert.ok(Math.abs(Math.hypot(...[0,1,2].map(k=>t.get(i,k)))-1)<1e-6);assert.ok(Math.abs([0,1,2].reduce((s,k)=>s+t.get(i,k)*n.get(i,k),0))<1e-6);assert.equal(t.get(i,3),i===0?-1:1);}
});
test('tangent repair is byte-idempotent and leaves valid frames unchanged',()=>{
    const bytes=fixture([[0,1,0,1],[1,0,0,-1],[1,0,0,1]]),before=Buffer.from(bytes);
    assert.equal(orthogonalizeTangents(bytes).repaired,0);assert.deepEqual(bytes,before);
    const fallback=fixture([[1,0,0,-1],[.6,0,.8,1],[1,0,0,1]]);orthogonalizeTangents(fallback);const corrected=Buffer.from(fallback);
    assert.equal(orthogonalizeTangents(fallback).repaired,0);assert.deepEqual(fallback,corrected);
});
