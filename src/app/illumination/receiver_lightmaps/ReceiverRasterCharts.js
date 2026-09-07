// Reserves real bake samples for narrow faces without excluding geometry or borrowing unrelated chart texels.
// @ts-check

function bounds(chart, texelSize) {
    const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    for (const triangle of chart.triangles) for (const uv of triangle.uv) for (let c=0;c<2;c++) {
        min[c]=Math.min(min[c],uv[c]); max[c]=Math.max(max[c],uv[c]);
    }
    return { ...chart, min, max, texelsPerMeter:max.map((value,c)=>Math.max(2,(value-min[c])/texelSize)/(value-min[c])) };
}

function rasterCoverage(chart) {
    return chart.triangles.map(triangle => {
        const p=triangle.uv.map(uv=>uv.map((v,c)=>(v-chart.min[c])*chart.texelsPerMeter[c]));
        const [x,y]=p[0].map((_,c)=>Math.floor((p[0][c]+p[1][c]+p[2][c])/3+.5));
        const sign=Math.sign((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]));
        for (let c=0;c<3;c++) {
            const a=p[c],b=p[(c+1)%3];
            // Each face needs its own interior sample: a neighbor may be split
            // away. The subpixel guard exceeds float32 UV roundoff on a 4K page.
            const guard=Math.hypot(b[0]-a[0],b[1]-a[1])/256;
            if (((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]))*sign<=guard) return false;
        }
        return true;
    });
}

function faceChart(chart, triangle, texelSize) {
    const points=triangle.uv;
    let longest=0, start=0;
    for (let i=0;i<3;i++) {
        const length=Math.hypot(points[(i+1)%3][0]-points[i][0],points[(i+1)%3][1]-points[i][1]);
        if (length>longest) { longest=length;start=i; }
    }
    const a=points[start],b=points[(start+1)%3],direction=[(b[0]-a[0])/longest,(b[1]-a[1])/longest];
    const uv=points.map(p=>[(p[0]-a[0])*direction[0]+(p[1]-a[1])*direction[1],
        -(p[0]-a[0])*direction[1]+(p[1]-a[1])*direction[0]]);
    const result=bounds({...chart,id:chart.id+'/face/'+triangle.offset,triangles:[{...triangle,uv}],area:triangle.area},texelSize);
    // Put the triangle centroid exactly at a pixel center. Even a subtexel tip
    // then has an independently sampled value and isolated filtering padding.
    result.pixelOffset=[0,1].map(c=>{
        const centroid=uv.reduce((sum,p)=>sum+(p[c]-result.min[c])*result.texelsPerMeter[c],0)/3;
        return 1.5-(centroid-Math.floor(centroid));
    });
    return result;
}

export function createRasterReceiverCharts(chart, texelSize, continuousSurface = false) {
    const initial=bounds(chart,texelSize), broad=[],narrow=[];
    const covered=rasterCoverage(initial);
    if(continuousSurface) {
        if(!covered.some(Boolean))initial.pixelOffset=[0,1].map(c=>{
            const centroid=initial.triangles[0].uv.reduce((sum,p)=>sum+(p[c]-initial.min[c])*initial.texelsPerMeter[c],0)/3;
            return 1.5-(centroid-Math.floor(centroid));
        });
        return [initial];
    }
    for (let index=0;index<chart.triangles.length;index++) {
        const triangle=chart.triangles[index];
        if (!covered[index]) narrow.push(faceChart(chart,triangle,texelSize));
        else broad.push(triangle);
    }
    if (broad.length) {
        const kept=bounds({...initial,triangles:broad},texelSize);
        // Crop empty space in whole pixels so the surviving faces keep the
        // already validated raster phase and density.
        kept.min=kept.min.map((v,c)=>initial.min[c]+Math.floor((v-initial.min[c])*initial.texelsPerMeter[c])/initial.texelsPerMeter[c]);
        kept.texelsPerMeter=initial.texelsPerMeter;
        kept.area=broad.reduce((sum,t)=>sum+t.area,0);
        narrow.unshift(kept);
    }
    return narrow;
}
