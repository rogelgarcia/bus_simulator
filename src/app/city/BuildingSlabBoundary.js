// Reconstructs flush slab runs on exact sidewalk segments after contour sampling.
// @ts-check
const cross = (a,b) => a.x*b.z-a.z*b.x;
const sub = (a,b) => ({x:a.x-b.x,z:a.z-b.z});
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

/**
 * @param {{x:number,z:number}[]} outline
 * @param {{x:number,z:number}[][]} segments
 * @param {number} tolerance Existing flush classification tolerance, in meters.
 * @param {number} contourError Bound on displacement from sampling and simplification.
 * @returns {{x:number,z:number}[]}
 */
export function alignBuildingSlabBoundary(outline,segments,tolerance,contourError) {
    const matches = outline.map(point => {
        let best = null, gap = tolerance;
        for (const [a,b] of segments) {
            const d = sub(b,a), length2=d.x*d.x+d.z*d.z;
            if (length2 < 1e-18) continue;
            const t=Math.max(0,Math.min(1,((point.x-a.x)*d.x+(point.z-a.z)*d.z)/length2));
            const projection={x:a.x+d.x*t,z:a.z+d.z*t}, error=distance(point,projection);
            if (error <= gap) {gap=error;best={a,b,projection};}
        }
        return best;
    });
    const count=outline.length, output=[];
    const append=p=>{if(!output.length||distance(output.at(-1),p)>1e-8)output.push({...p});};
    for(let i=0;i<count;i++) {
        const current=matches[i],next=matches[(i+1)%count],prev=matches[(i+count-1)%count];
        append(current&&(prev||next)?current.projection:outline[i]);
        if(!current||!next)continue;
        const u=sub(current.b,current.a),v=sub(next.b,next.a),den=cross(u,v);
        if(Math.abs(den)<1e-12)continue;
        const delta=sub(next.a,current.a),s=cross(delta,v)/den,t=cross(delta,u)/den;
        if(s < -1e-9||s>1+1e-9||t < -1e-9||t>1+1e-9)continue;
        const intersection={x:current.a.x+u.x*s,z:current.a.z+u.z*s};
        if(distance(intersection,current.projection)<=contourError&&distance(intersection,next.projection)<=contourError)append(intersection);
    }
    if(output.length>1&&distance(output[0],output.at(-1))<1e-8)output.pop();
    return output;
}
