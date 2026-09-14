// Camera-independent planar charts for evaluating authored material inputs.
export function createSurfaceAtlas(positions, materialIndices, {pixelsPerMeter = 32, padding = 4, maximumSize = 8192} = {}) {
    if (positions.length % 9 || materialIndices.length !== positions.length / 9) throw new Error('Surface atlas requires triangle positions and material slots');
    const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
    const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const sub = (a,b) => a.map((x,i)=>x-b[i]);
    const charts = new Map(), triangles = [];
    for (let offset=0; offset<positions.length; offset+=9) {
        const points=[0,3,6].map(i=>Array.from(positions.slice(offset+i,offset+i+3)));
        const n=cross(sub(points[1],points[0]),sub(points[2],points[0])), length=Math.hypot(...n);
        if(length<1e-10) { triangles.push(null); continue; }
        const normal=n.map(x=>x/length), distance=dot(normal,points[0]);
        const slot=materialIndices[offset/9], key=[slot,...normal.map(x=>Math.round(x*1e4)),Math.round(distance*1e4)].join(':');
        let chart=charts.get(key);
        if(!chart) {
            const axis=Math.abs(normal[1])<.9?[0,1,0]:[1,0,0];
            const a=cross(axis,normal),u=a.map(x=>x/Math.hypot(...a)),v=cross(normal,u);
            chart={key,slot,u,v,min:[Infinity,Infinity],max:[-Infinity,-Infinity],triangles:[]};charts.set(key,chart);
        }
        const uv=points.map(p=>[dot(p,chart.u),dot(p,chart.v)]);
        for(const p of uv)for(let c=0;c<2;c++){chart.min[c]=Math.min(chart.min[c],p[c]);chart.max[c]=Math.max(chart.max[c],p[c]);}
        const triangle={chart,uv,area:length/2};
        chart.triangles.push(triangle);triangles.push(triangle);
    }
    // Coplanar trim rings can enclose an entire building while occupying only a
    // few percent of that rectangle. Partition those sparse charts without
    // changing the physical texel density or the source material coordinates.
    function partition(chart) {
        const extent=chart.max.map((x,i)=>x-chart.min[i]);
        const area=chart.triangles.reduce((sum,t)=>sum+t.area,0);
        if(chart.triangles.length<=1||area>=extent[0]*extent[1]*.4)return [chart];
        const axis=extent[0]>=extent[1]?0:1;
        const sorted=[...chart.triangles].sort((a,b)=>a.uv.reduce((s,p)=>s+p[axis],0)-b.uv.reduce((s,p)=>s+p[axis],0));
        const middle=Math.floor(sorted.length/2);
        return [sorted.slice(0,middle),sorted.slice(middle)].flatMap((members,index)=>{
            const child={...chart,key:chart.key+'/'+index,triangles:members,min:[Infinity,Infinity],max:[-Infinity,-Infinity]};
            for(const t of members)for(const p of t.uv)for(let c=0;c<2;c++){
                child.min[c]=Math.min(child.min[c],p[c]);child.max[c]=Math.max(child.max[c],p[c]);
            }
            return partition(child);
        });
    }
    const ordered=[...charts.values()].flatMap(partition);
    if(!ordered.length)throw new Error('No nondegenerate material surface');
    for(const c of ordered){
        // The same world-space lattice on either side of a chart split avoids
        // changing procedural derivatives or shifting texture sampling phase.
        c.min=c.min.map(x=>Math.floor(x*pixelsPerMeter)/pixelsPerMeter);
        for(const triangle of c.triangles)triangle.chart=c;
        c.width=Math.ceil((c.max[0]-c.min[0])*pixelsPerMeter)+2*padding+1;
        c.height=Math.ceil((c.max[1]-c.min[1])*pixelsPerMeter)+2*padding+1;
        c.rotated=c.height>c.width;
        if(c.rotated)[c.width,c.height]=[c.height,c.width];
    }
    ordered.sort((a,b)=>b.height-a.height||a.key.localeCompare(b.key));
    const power=n=>2**Math.ceil(Math.log2(Math.max(1,n)));
    let width=power(Math.max(...ordered.map(c=>c.width),Math.sqrt(ordered.reduce((s,c)=>s+c.width*c.height,0))));
    let height;
    for(;;){
        let x=0,y=0,row=0;
        for(const c of ordered){if(x+c.width>width){x=0;y+=row;row=0;}c.x=x;c.y=y;x+=c.width;row=Math.max(row,c.height);}
        height=power(y+row);
        if(height<=maximumSize||width>=maximumSize)break;
        width*=2;
    }
    if(width>maximumSize||height>maximumSize)throw new Error(`Material surface atlas exceeds ${maximumSize}px at ${pixelsPerMeter}px/m: ${width}x${height}`);
    const uv=new Float32Array(positions.length/3*2);
    triangles.forEach((t,i)=>{if(t) t.uv.forEach((p,j)=>{
        let x=padding+.5+(p[0]-t.chart.min[0])*pixelsPerMeter;
        let y=padding+.5+(p[1]-t.chart.min[1])*pixelsPerMeter;
        if(t.chart.rotated)[x,y]=[t.chart.width-y,x];
        uv[(i*3+j)*2]=(t.chart.x+x)/width;
        uv[(i*3+j)*2+1]=(t.chart.y+y)/height;
    });});
    return {uv,width,height,pixelsPerMeter,padding,charts:ordered.map(({u,v,triangles,...c})=>c),degenerateTriangles:triangles.filter(t=>!t).length};
}
