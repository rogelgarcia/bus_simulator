// Repairs the enhanced private geometry; source geometry and legacy rendering stay intact.
import * as THREE from 'three';
import { prepareReceiverCoplanarOwnership } from '../../../app/illumination/receiver_lightmaps/ReceiverCoplanarOwnership.js';

const plans = new WeakMap();
const corners = [[1,0,0],[0,1,0],[0,0,1]];

export function repairEnhancedReceiverCoplanarGeometry(geometry, original, mapping) {
    const work = prepareEnhancedReceiverCoplanarGeometry(geometry, original, mapping);
    let result; do { result = work.next(); } while (!result.done);
    return result.value;
}

/** Incremental construction never replaces the live source geometry before completion. */
export function* prepareEnhancedReceiverCoplanarGeometry(geometry, original, mapping, cityInputs = null) {
    const count=(geometry.index?.count??geometry.attributes.position.count)/3;
    const materialIndices=new Int32Array(count), eligible=new Int32Array(count).fill(-1);
    for(const group of geometry.groups)materialIndices.fill(group.materialIndex,group.start/3,Math.min(count,(group.start+group.count)/3));
    const vertex=i=>geometry.index?geometry.index.getX(i):i;
    const coordinate=geometry.attributes.receiverAtlasCoordinate;
    const first=(geometry.drawRange.start??0)/3,end=Math.min(count,((geometry.drawRange.start??0)+(geometry.drawRange.count??Infinity))/3);
    for(let i=first;i<end;i++) {
        if (i % 128 === 0) yield;
        if([0,1,2].every(c=>coordinate.getW(vertex(i*3+c))>.5))eligible[i]=materialIndices[i];
    }
    let cache=plans.get(mapping);if(!cache){cache=new WeakMap();plans.set(mapping,cache);}
    let plan=cache.get(original);
    if(!plan) {
        const positions=new Float32Array(count*9),source=geometry.attributes.position;
        for(let i=0;i<count*3;i++){
            if (i % 384 === 0) yield;
            const v=vertex(i);positions.set([source.getX(v),source.getY(v),source.getZ(v)],i*3);
        }
        const saved = cityInputs ? yield cityInputs.coplanar(positions, eligible) : null;
        plan = saved?.plan ?? (yield* prepareReceiverCoplanarOwnership(positions, eligible));
        if (saved) cityInputs.recordCoplanar(saved.key, plan);
        cache.set(original,plan);
    }
    if(!plan.patches.size)return {geometry,overlappingTriangles:0,removedArea:0};
    const attributes=Object.entries(geometry.attributes),values=Object.fromEntries(attributes.map(([name])=>[name,[]]));
    const result=new THREE.BufferGeometry();let output=0,drawStart=0,drawEnd=0,lastGroup=null;
    for(let triangle=0;triangle<count;triangle++) {
        if (triangle % 128 === 0) yield;
        if(triangle===first)drawStart=output;
        const pieces=plan.patches.get(triangle)??[corners];
        for(const piece of pieces)for(const weights of piece) {
            for(const [name,attribute] of attributes)for(let c=0;c<attribute.itemSize;c++) {
                let value=0;for(let corner=0;corner<3;corner++)value+=weights[corner]*attribute.getComponent(vertex(triangle*3+corner),c);
                values[name].push(value);
            }
            if(!lastGroup||lastGroup.materialIndex!==materialIndices[triangle]){
                lastGroup={start:output,count:0,materialIndex:materialIndices[triangle]};result.groups.push(lastGroup);
            }
            lastGroup.count++;output++;
        }
        if(triangle+1===end)drawEnd=output;
    }
    for(const [name] of attributes)result.setAttribute(name,new THREE.Float32BufferAttribute(values[name],geometry.attributes[name].itemSize));
    result.name=geometry.name;result.userData={...geometry.userData};
    result.setDrawRange(drawStart,drawEnd-drawStart);result.computeBoundingBox();result.computeBoundingSphere();
    geometry.dispose();
    return {geometry:result,overlappingTriangles:plan.patches.size,removedArea:plan.removedArea};
}
