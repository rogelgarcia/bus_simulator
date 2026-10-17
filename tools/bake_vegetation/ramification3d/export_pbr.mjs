// Repairs Blender's fixed-axis fallback on degenerate cap UVs without changing positions, normals or textures.
import {glbDocument} from '../Validate.mjs';
import {readAccessor} from '../Accessors.mjs';
export function orthogonalizeTangents(bytes){
    const d=glbDocument(bytes);let repaired=0,parallel=0;
    for(const mesh of d.json.meshes)for(const p of mesh.primitives){
        const a=d.json.accessors[p.attributes.TANGENT];if(a.componentType!==5126||a.type!=='VEC4')throw Error('Expected float tangents');
        const v=d.json.bufferViews[a.bufferView],t=readAccessor(d,p.attributes.TANGENT),n=readAccessor(d,p.attributes.NORMAL);
        for(let i=0;i<t.count;i++){
            const normal=[0,1,2].map(k=>n.get(i,k)),tangent=[0,1,2].map(k=>t.get(i,k)),dot=normal.reduce((s,x,k)=>s+x*tangent[k],0);
            if(Math.abs(dot)<1e-5)continue;
            const norm2=normal.reduce((s,x)=>s+x*x,0);let result=tangent.map((x,k)=>x-dot/ norm2*normal[k]);if(Math.hypot(...result)<1e-4){const axis=normal.map(Math.abs).indexOf(Math.min(...normal.map(Math.abs)));result=normal.map((x,k)=>(k===axis?1:0)-normal[axis]/norm2*x);parallel++;}
            const length=Math.hypot(...result);for(let k=0;k<3;k++)d.bin.writeFloatLE(result[k]/length,(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??16)+k*4);repaired++;
        }
    }
    return {repaired,parallel,method:'Gram-Schmidt against exported normal; least-aligned axis only for parallel cap fallback'};
}
