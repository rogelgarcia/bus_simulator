// Repairs degenerate export tangent frames without changing positions, normals, UVs or textures.
import {glbDocument} from '../Validate.mjs';
import {readAccessor} from '../Accessors.mjs';
export function orthogonalizeTangents(bytes){
    const d=glbDocument(bytes);let repaired=0,parallel=0,zero=0;
    for(const mesh of d.json.meshes)for(const p of mesh.primitives){
        const a=d.json.accessors[p.attributes.TANGENT];if(a.componentType!==5126||a.type!=='VEC4')throw Error('Expected float tangents');
        const v=d.json.bufferViews[a.bufferView],t=readAccessor(d,p.attributes.TANGENT),n=readAccessor(d,p.attributes.NORMAL);
        for(let i=0;i<t.count;i++){
            const normal=[0,1,2].map(k=>n.get(i,k)),tangent=[0,1,2].map(k=>t.get(i,k)),dot=normal.reduce((s,x,k)=>s+x*tangent[k],0);
            const magnitude=Math.hypot(...tangent);
            if(!Number.isFinite(dot)||!Number.isFinite(magnitude))throw Error('Non-finite exported tangent frame');
            if(Math.abs(dot)<1e-5&&Math.abs(magnitude-1)<1e-5)continue;
            if(magnitude<1e-5)zero++;
            const norm2=normal.reduce((s,x)=>s+x*x,0);let result=tangent.map((x,k)=>x-dot/ norm2*normal[k]);if(Math.hypot(...result)<1e-4){const axis=normal.map(Math.abs).indexOf(Math.min(...normal.map(Math.abs)));result=normal.map((x,k)=>(k===axis?1:0)-normal[axis]/norm2*x);parallel++;}
            const length=Math.hypot(...result);for(let k=0;k<3;k++)d.bin.writeFloatLE(result[k]/length,(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??16)+k*4);repaired++;
        }
    }
    return {repaired,parallel,zero,method:'Gram-Schmidt and unit normalization; least-aligned axis for parallel or zero fallback'};
}

export function auditTangentFrames(bytes){
    const d=glbDocument(bytes);let vertices=0,maximumLengthError=0,maximumDot=0;
    for(const mesh of d.json.meshes)for(const p of mesh.primitives){
        const t=readAccessor(d,p.attributes.TANGENT),n=readAccessor(d,p.attributes.NORMAL);
        for(let i=0;i<t.count;i++){
            const tangent=[0,1,2].map(k=>t.get(i,k)),normal=[0,1,2].map(k=>n.get(i,k));
            const error=Math.abs(Math.hypot(...tangent)-1),dot=Math.abs(normal.reduce((s,x,k)=>s+x*tangent[k],0));
            if(!Number.isFinite(error)||error>.002||!Number.isFinite(dot)||dot>.003||Math.abs(t.get(i,3))!==1)throw Error('Invalid exported tangent frame');
            vertices++;maximumLengthError=Math.max(maximumLengthError,error);maximumDot=Math.max(maximumDot,dot);
        }
    }
    return {vertices,maximumLengthError,maximumDot,passed:true};
}

export function assertOnlyTangentDirectionsChanged(before,after){
    if(before.length!==after.length)throw Error('Tangent repair changed GLB length');
    const d=glbDocument(before),offset=before.length-d.bin.length,ranges=[];
    for(const mesh of d.json.meshes)for(const p of mesh.primitives){
        const a=d.json.accessors[p.attributes.TANGENT],v=d.json.bufferViews[a.bufferView];
        ranges.push({start:offset+(v.byteOffset??0)+(a.byteOffset??0),stride:v.byteStride??16,count:a.count});
    }
    let previous=0;
    const unchanged=(start,end)=>{if(!before.subarray(start,end).equals(after.subarray(start,end)))throw Error('Tangent repair changed unrelated GLB bytes');};
    for(const {start,stride,count} of ranges.sort((a,b)=>a.start-b.start)){
        if(start<previous)throw Error('Overlapping tangent ranges');
        unchanged(previous,start);
        for(let i=0;i<count-1;i++)unchanged(start+i*stride+12,start+(i+1)*stride);
        previous=start+(count-1)*stride+12;
    }
    unchanged(previous,before.length);
}
