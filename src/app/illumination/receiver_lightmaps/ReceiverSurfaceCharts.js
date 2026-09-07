// Verifies that an island is one connected, consistently oriented plane with one affine UV projection.
// @ts-check
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/** @param {{triangles:any[]}} chart @param {(triangle:any)=>number[][]} worldTriangle */
export function canShareReceiverSurface(chart,worldTriangle) {
    const triangles=chart.triangles;
    if(triangles.length<2)return false;
    const basis=triangles.reduce((a,b)=>a.area>=b.area?a:b);
    const [origin,b,c]=worldTriangle(basis),u=sub(b,origin),v=sub(c,origin),normal=cross(u,v);
    const magnitude=Math.hypot(...normal),uu=dot(u,u),vv=dot(v,v),uv=dot(u,v),det=uu*vv-uv*uv;
    if(!(magnitude>0&&det>0))return false;
    const reference=basis.uv,du=sub(reference[1],reference[0]),dv=sub(reference[2],reference[0]);
    const parent=triangles.map((_,i)=>i),edges=new Map();
    const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(let i=0;i<triangles.length;i++) {
        const triangle=triangles[i],points=worldTriangle(triangle);
        if(dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),normal)<=0)return false;
        for(let j=0;j<3;j++) {
            const delta=sub(points[j],origin);
            if(Math.abs(dot(delta,normal))/magnitude>1e-5)return false;
            const pu=dot(delta,u),pv=dot(delta,v),s=(pu*vv-pv*uv)/det,t=(pv*uu-pu*uv)/det;
            const uvMagnitude=Math.max(1,...reference.flat().map(Math.abs),...triangle.uv[j].map(Math.abs));
            const roundoff=uvMagnitude*2**-22*(2+2*(Math.abs(s)+Math.abs(t)));
            if(reference[0].some((p,k)=>Math.abs(p+s*du[k]+t*dv[k]-triangle.uv[j][k])>roundoff))return false;
        }
        const keys=points.map(p=>p.map(x=>Math.round(x*1e6)).join(','));
        for(let j=0;j<3;j++) {
            const a=keys[j],b=keys[(j+1)%3],key=a<b?a+'|'+b:b+'|'+a,edge=edges.get(key);
            if(!edge){edges.set(key,{index:i,from:a,count:1});continue;}
            if(++edge.count>2||edge.from===a)return false;
            parent[root(i)]=root(edge.index);
        }
    }
    return triangles.every((_,i)=>root(i)===root(0));
}
