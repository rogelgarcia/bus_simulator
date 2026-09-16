// Gives overlapping, same-material coplanar faces one owner while preserving their union.
// Every output corner is expressed in the original triangle's barycentric coordinates.
const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area = polygon => Math.abs(polygon.reduce((n, p, i) => {
    const q = polygon[(i+1)%polygon.length], origin = polygon[0].p;
    return n+(p.p[0]-origin[0])*(q.p[1]-origin[1])-(p.p[1]-origin[1])*(q.p[0]-origin[0]);
}, 0))*.5;

function split(polygon, a, b, sign) {
    const inside = [], outside = [];
    for (let i=0; i<polygon.length; i++) {
        const p=polygon[i], q=polygon[(i+1)%polygon.length];
        const dp=cross(a,b,p.p)*sign, dq=cross(a,b,q.p)*sign;
        if (dp>=0) inside.push(p);
        if (dp<=0) outside.push(p);
        if ((dp<0 && dq>0)||(dp>0 && dq<0)) {
            const t=dp/(dp-dq), point={p:p.p.map((v,c)=>v+(q.p[c]-v)*t),w:p.w.map((v,c)=>v+(q.w[c]-v)*t)};
            inside.push(point); outside.push(point);
        }
    }
    return {inside,outside};
}

function subtract(polygon, triangle, tolerance) {
    const pieces=[]; let remaining=polygon;
    const sign=Math.sign(cross(triangle[0],triangle[1],triangle[2]));
    for(let edge=0;edge<3&&remaining.length>=3;edge++) {
        const result=split(remaining,triangle[edge],triangle[(edge+1)%3],sign);
        if(result.outside.length>=3&&area(result.outside)>tolerance)pieces.push(result.outside);
        remaining=result.inside;
    }
    if(remaining.length<3||area(remaining)<=tolerance)return null;
    return pieces;
}

/** Positions are triangle corners in source-reference order; negative groups opt out. */
export function planReceiverCoplanarOwnership(positions, groups) {
    const work = prepareReceiverCoplanarOwnership(positions, groups);
    let result; do { result = work.next(); } while (!result.done);
    return result.value;
}

/** Resumable equivalent; preserves the exact source-order ownership and arithmetic. */
export function* prepareReceiverCoplanarOwnership(positions, groups) {
    if(!(positions instanceof Float32Array)||positions.length!==groups.length*9)throw new Error('Invalid coplanar receiver inventory');
    const planes=new Map(),patches=new Map(); let removedArea=0;
    for(let triangle=0;triangle<groups.length;triangle++) {
        if (triangle % 128 === 0) yield;
        if(groups[triangle]<0)continue;
        const p=[0,1,2].map(c=>Array.from(positions.subarray(triangle*9+c*3,triangle*9+c*3+3)));
        const a=p[1].map((v,c)=>v-p[0][c]),b=p[2].map((v,c)=>v-p[0][c]);
        const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);
        if(length<1e-12)continue;
        for(let c=0;c<3;c++)n[c]/=length;
        const distance=n.reduce((sum,v,c)=>sum+v*p[0][c],0);
        const key=[groups[triangle],...n.map(v=>Math.round(v*1e6)),Math.round(distance*1e5)].join('/');
        const axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
        const points=p.map(v=>v.filter((_,c)=>c!==axis));
        const bounds=[0,1].map(c=>[Math.min(...points.map(v=>v[c])),Math.max(...points.map(v=>v[c]))]);
        const entry={triangle,points,bounds,p,n,distance};
        if(!planes.has(key))planes.set(key,[]); planes.get(key).push(entry);
    }
    for(const entries of planes.values()) {
        if(entries.length<2)continue;
        const bounds=[0,1].map(c=>[Infinity,-Infinity]);
        for(const e of entries)for(let c=0;c<2;c++){bounds[c][0]=Math.min(bounds[c][0],e.bounds[c][0]);bounds[c][1]=Math.max(bounds[c][1],e.bounds[c][1]);}
        const resolution=Math.min(64,Math.ceil(Math.sqrt(entries.length)));
        const step=bounds.map(b=>Math.max(1e-6,(b[1]-b[0])/resolution)),grid=new Map();
        for(const entry of entries) {
            yield;
            const cells=entry.bounds.map((b,c)=>b.map(v=>Math.min(resolution-1,Math.floor((v-bounds[c][0])/step[c]))));
            const candidates=new Set(),keys=[];
            for(let y=cells[1][0];y<=cells[1][1];y++)for(let x=cells[0][0];x<=cells[0][1];x++) {
                const key=y*resolution+x;keys.push(key);for(const other of grid.get(key)??[])candidates.add(other);
            }
            const original=entry.points.map((p,i)=>({p,w:[0,1,2].map(c=>Number(c===i))}));
            const originalArea=area(original),tolerance=Math.max(1e-12,originalArea*1e-10);
            let pieces=[original],changed=false;
            for(const other of [...candidates].sort((a,b)=>a.triangle-b.triangle)) {
                yield;
                if(entry.bounds.some((b,c)=>b[0]>=other.bounds[c][1]||b[1]<=other.bounds[c][0]))continue;
                // Quantized plane buckets only accelerate discovery; actual geometry
                // must agree before a face may take ownership of another's area.
                if(entry.p.some(p=>Math.abs(other.n.reduce((sum,v,c)=>sum+v*p[c],0)-other.distance)>1e-6))continue;
                const remaining=[];
                for(const polygon of pieces) {
                    const difference=subtract(polygon,other.points,tolerance);
                    if(difference===null)remaining.push(polygon);else{remaining.push(...difference);changed=true;}
                }
                pieces=remaining;if(!pieces.length)break;
            }
            if(changed) {
                removedArea+=originalArea-pieces.reduce((sum,p)=>sum+area(p),0);
                const triangles=[];
                for(const polygon of pieces)for(let c=1;c+1<polygon.length;c++) {
                    const tri=[polygon[0],polygon[c],polygon[c+1]];
                    if(area(tri)>tolerance)triangles.push(tri.map(v=>v.w));
                }
                patches.set(entry.triangle,triangles);
            }
            for(const key of keys){if(!grid.has(key))grid.set(key,[]);grid.get(key).push(entry);}
        }
    }
    return {patches,removedArea};
}
