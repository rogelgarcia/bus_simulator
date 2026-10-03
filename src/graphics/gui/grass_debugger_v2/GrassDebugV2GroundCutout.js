// Remove a rectangular canopy footprint from ground triangles while preserving all vertex attributes.
// @ts-check
import * as THREE from 'three';

/** @param {THREE.BufferGeometry} original @param {THREE.Matrix4} transform @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds */
export function cutGrassDebugV2GroundRectangle(original, transform, bounds) {
    const attributes=Object.entries(original.attributes), vertexSize=attributes.reduce((sum,[,a])=>sum+a.itemSize,0);
    const offsets=new Map();let offset=0;
    for(const [name,a] of attributes){offsets.set(name,offset);offset+=a.itemSize;}
    const positionOffset=offsets.get('position'), point=new THREE.Vector3(), result=[];
    const vertex=id=>{
        const values=[];
        for(const [,a] of attributes)for(let k=0;k<a.itemSize;k++)values.push(a.getComponent(id,k));
        point.fromArray(values,positionOffset).applyMatrix4(transform);
        return {values,x:point.x,z:point.z};
    };
    const planes=[['x',bounds.minX,1],['x',bounds.maxX,-1],['z',bounds.minZ,1],['z',bounds.maxZ,-1]];
    const clip=(polygon,axis,edge,sign)=>{
        const inside=[],outside=[];
        for(let i=0;i<polygon.length;i++){
            const a=polygon[i],b=polygon[(i+1)%polygon.length],da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;
            (da>=0?inside:outside).push(a);
            if((da>=0)!==(db>=0)){
                const t=da/(da-db),v={values:a.values.map((value,k)=>value+(b.values[k]-value)*t),x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
                inside.push(v);outside.push(v);
            }
        }
        return {inside,outside};
    };
    const append=polygon=>{
        for(let i=1;i<polygon.length-1;i++)for(const v of [polygon[0],polygon[i],polygon[i+1]])result.push(...v.values);
    };
    const index=original.index;
    for(let i=0;i<index.count;i+=3){
        let polygon=[vertex(index.getX(i)),vertex(index.getX(i+1)),vertex(index.getX(i+2))];
        for(const [axis,edge,sign] of planes){
            if(!polygon.length)break;
            const split=clip(polygon,axis,edge,sign);append(split.outside);polygon=split.inside;
        }
    }
    const geometry=new THREE.BufferGeometry(),count=result.length/vertexSize;
    for(const [name,a] of attributes){
        const values=new Float32Array(count*a.itemSize),start=offsets.get(name);
        for(let i=0;i<count;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=result[i*vertexSize+start+k];
        geometry.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize));
    }
    geometry.setIndex(Array.from({length:count},(_,i)=>i));
    if(count){geometry.computeBoundingBox();geometry.computeBoundingSphere();}
    else {geometry.boundingBox=new THREE.Box3(new THREE.Vector3(),new THREE.Vector3());geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),0);}
    return geometry;
}
