// Collapses reversed offset lobes while retaining source-edge correspondence for sidewalk fans.
// An inset can exhaust a rounded corner's radius; retaining that reversed arc folds the walking surface.
// @ts-check

/** @param {{x:number,z:number}[]} source @param {{x:number,z:number}[]} offset @param {number} epsilon */
export function collapseSidewalkOffsetLobes(source,offset,epsilon) {
    const points=offset.map(p=>({...p})),n=points.length;
    for(let i=0;i<n;i++)for(let j=i+2;j<n;j++) {
        if(i===0&&j===n-1)continue;
        const a=points[i],b=points[(i+1)%n],c=points[j],d=points[(j+1)%n];
        if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)
            ||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z))continue;
        const u={x:b.x-a.x,z:b.z-a.z},v={x:d.x-c.x,z:d.z-c.z},denom=u.x*v.z-u.z*v.x;
        if(Math.abs(denom)<=epsilon*epsilon)continue;
        const t=((c.x-a.x)*v.z-(c.z-a.z)*v.x)/denom;
        const s=((c.x-a.x)*u.z-(c.z-a.z)*u.x)/denom;
        if(Math.min(t,1-t)*Math.hypot(u.x,u.z)<=epsilon
            ||Math.min(s,1-s)*Math.hypot(v.x,v.z)<=epsilon)continue;
        const intersection={x:a.x+t*u.x,z:a.z+t*u.z};
        const forward=Array.from({length:j-i},(_,k)=>i+1+k);
        const backward=Array.from({length:n-(j-i)},(_,k)=>(j+1+k)%n);
        const reversed=[forward,backward].filter(chain=>chain.length>2&&chain.slice(1,-1).every(k=>{
            const a=source[(k-1+n)%n],b=source[k],c=source[(k+1)%n];
            return (b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x)<=epsilon*epsilon;
        })&&chain.slice(1,-2).every(k=>{
            const next=(k+1)%n,p=points[k],q=points[next],a=source[k],b=source[next];
            return (q.x-p.x)*(b.x-a.x)+(q.z-p.z)*(b.z-a.z)<=epsilon*epsilon;
        })&&chain.slice(0,-1).some(k=>{
            const next=(k+1)%n,p=points[k],q=points[next],a=source[k],b=source[next];
            return (q.x-p.x)*(b.x-a.x)+(q.z-p.z)*(b.z-a.z)< -epsilon*epsilon;
        }));
        if(reversed.length!==1)throw new Error('Sidewalk offset requires disconnected contours at '+JSON.stringify(intersection));
        for(const k of reversed[0])points[k]={...intersection};
        j=i+1;
    }
    return points;
}
