// Extends only unwritten texels from the nearest sample in the same authenticated chart.
import { readFile } from 'node:fs/promises';

export async function readReceiverNpy(file, size) {
    const bytes=await readFile(file);
    if(bytes.subarray(0,6).toString('latin1')!=='\x93NUMPY'||![1,2].includes(bytes[6]))throw new Error('Invalid receiver sample file');
    const prefix=bytes[6]===1?10:12, length=bytes[6]===1?bytes.readUInt16LE(8):bytes.readUInt32LE(8);
    const header=bytes.subarray(prefix,prefix+length).toString('ascii');
    if(!header.includes("'descr': '<f4'")||!header.includes("'fortran_order': False")
        ||!header.includes(`'shape': (${size}, ${size}, 4)`)
        ||bytes.length!==prefix+length+size*size*16)throw new Error('Receiver sample dimensions or format changed');
    return new Float32Array(bytes.buffer,bytes.byteOffset+prefix+length,size*size*4);
}

// Blender's generated margins can differ between passes (including fractional
// alpha). Require identical coverage over the base-level receiver bilinear
// footprint; outer padding and mips are rebuilt from common, authenticated samples.
function validatePassCoverage(sky,bounce,page,charts,profile) {
    const size=profile.pageSize,differences=new Uint8Array(size*size);
    let remaining=0;
    for(let i=0;i<differences.length;i++)if((sky[i*4+3]>.5)!==(bounce[i*4+3]>.5)){differences[i]=1;remaining++;}
    const total=remaining;
    const fail=()=>{throw new Error('Receiver pass raster coverage differs on page '+page);};
    for(const chart of charts) {
        if(!remaining)break;
        if(chart.page!==page)continue;
        const {x:ox,y:oy,width:w,height:h}=chart;
        if(ox<0||oy<0||ox+w>size||oy+h>size)throw new Error('Receiver padding escaped its page');
        let triangles;
        for(let y=oy;y<oy+h;y++)for(let x=ox;x<ox+w;x++) {
            const index=y*size+x;
            if(!differences[index])continue;
            triangles??=chart.triangles.map(t=>t.uv.map(uv=>uv.map((v,c)=>(v-chart.min[c])*chart.texelsPerMeter[c]
                +profile.padding+(chart.pixelOffset?.[c]??.5)+(c?oy:ox))));
            // A bilinear texel influences coordinates up to one texel from its
            // center. SAT tests that support square against each UV triangle.
            for(const p of triangles) {
                const cx=x+.5,cy=y+.5;
                if(cx+1<Math.min(...p.map(v=>v[0]))||cx-1>Math.max(...p.map(v=>v[0]))
                    ||cy+1<Math.min(...p.map(v=>v[1]))||cy-1>Math.max(...p.map(v=>v[1])))continue;
                const sign=Math.sign((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]));
                if(p.every((a,i)=>{const b=p[(i+1)%3],dx=b[0]-a[0],dy=b[1]-a[1];
                    return sign*(dx*(cy-a[1])-dy*(cx-a[0]))>=-Math.abs(dx)-Math.abs(dy);}))fail();
            }
            differences[index]=0;remaining--;
        }
    }
    if(remaining)fail(); // Stray coverage outside every declared chart is invalid.
    return total;
}

// Exact one-dimensional squared Euclidean distance transform. Infinite entries
// have no seed; deterministic ties choose the earlier seed.
function distanceTransform(values,n,distance,nearest,vertices,borders) {
    let count=-1;
    for(let q=0;q<n;q++) {
        if(!Number.isFinite(values[q]))continue;
        let boundary=-Infinity;
        while(count>=0) {
            const p=vertices[count];boundary=(values[q]+q*q-values[p]-p*p)/(2*(q-p));
            if(boundary>borders[count])break;
            count--;
        }
        count++;vertices[count]=q;borders[count]=count?boundary:-Infinity;borders[count+1]=Infinity;
    }
    if(count<0) {for(let q=0;q<n;q++){distance[q]=Infinity;nearest[q]=-1;}return;}
    let k=0;
    for(let q=0;q<n;q++) {
        while(borders[k+1]<q)k++;
        const p=vertices[k];distance[q]=(q-p)*(q-p)+values[p];nearest[q]=p;
    }
}

export function extendReceiverPage(data,sky,bounce,page,charts,profile,hidden=null) {
    const size=profile.pageSize;
    if([data,sky,bounce].some(a=>!(a instanceof Float32Array)||a.length!==size*size*4))throw new Error('Invalid receiver padding input');
    if(hidden && (!(hidden instanceof Uint8Array)||hidden.length!==size*size))throw new Error('Invalid hidden receiver mask');
    const passMarginDifferences=validatePassCoverage(sky,bounce,page,charts,profile);
    const length=size+1, f=new Float64Array(length),d=new Float64Array(length),nearest=new Int32Array(length),v=new Int32Array(length),z=new Float64Array(length+1);
    let rows=new Float64Array(0),xs=new Int32Array(0),seedMask=new Uint8Array(0);
    const report={page,charts:0,triangles:0,passMarginDifferences,extendedPixels:0,hiddenSamples:0,fullyHiddenCharts:0,rawMissingCenters:0,rawMissingBoundarySamples:0,maximumReceiverExtensionTexels:0};
    for(const chart of charts) {
        if(chart.page!==page)continue;
        const {width:w,height:h,x:ox,y:oy}=chart,count=w*h;
        if(ox<0||oy<0||ox+w>size||oy+h>size)throw new Error('Receiver padding escaped its page');
        if(rows.length<count){rows=new Float64Array(count);xs=new Int32Array(count);seedMask=new Uint8Array(count);}
        let exposed=0;
        if(hidden)for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
            const pixel=(oy+y)*size+ox+x;
            if(sky[pixel*4+3]>.5&&!hidden[pixel])exposed++;
        }
        // A wholly covered chart has no exposed boundary to filter. Preserve it;
        // partial charts extend only their own exposed, actually baked samples.
        const excludeHidden=hidden&&exposed>0;
        if(hidden&&!exposed)report.fullyHiddenCharts++;
        let seeds=0;
        for(let y=0;y<h;y++) {
            for(let x=0;x<w;x++) {
                const index=((oy+y)*size+ox+x)*4;
                const masked=excludeHidden&&hidden[index/4];
                const valid=sky[index+3]>.5&&bounce[index+3]>.5&&!masked;
                if(masked&&sky[index+3]>.5)report.hiddenSamples++;
                seedMask[y*w+x]=Number(valid);seeds+=Number(valid);f[x]=valid?0:Infinity;
            }
            distanceTransform(f,w,d,nearest,v,z);
            for(let x=0;x<w;x++){rows[y*w+x]=d[x];xs[y*w+x]=nearest[x];}
        }
        if(!seeds)throw new Error('Receiver chart has no actual baked samples: '+chart.id);
        const receiverSamples=new Map();
        for(const triangle of chart.triangles) {
            const uv=triangle.uv;
            const points=[...uv,...uv.map((p,i)=>p.map((a,c)=>(a+uv[(i+1)%3][c])*.5)),[0,1].map(c=>(uv[0][c]+uv[1][c]+uv[2][c])/3)];
            for(let sample=0;sample<points.length;sample++) {
                const cell=points[sample].map((p,c)=>Math.floor((p-chart.min[c])*chart.texelsPerMeter[c]+profile.padding+(chart.pixelOffset?.[c]??.5)));
                if(cell[0]<0||cell[0]>=w||cell[1]<0||cell[1]>=h)throw new Error('Receiver sample escaped its chart');
                const index=cell[1]*w+cell[0];
                if(!seedMask[index]){
                    report[sample===6?'rawMissingCenters':'rawMissingBoundarySamples']++;
                    receiverSamples.set(index,true);
                }
            }
        }
        for(let x=0;x<w;x++) {
            for(let y=0;y<h;y++)f[y]=rows[y*w+x];
            distanceTransform(f,h,d,nearest,v,z);
            for(let y=0;y<h;y++) {
                const index=y*w+x;
                if(seedMask[index])continue;
                const sy=nearest[y],sx=xs[sy*w+x],from=((oy+sy)*size+ox+sx)*4,to=((oy+y)*size+ox+x)*4;
                for(let c=0;c<3;c++)data[to+c]=data[from+c];
                data[to+3]=1;report.extendedPixels++;
                if(receiverSamples.has(index))report.maximumReceiverExtensionTexels=Math.max(report.maximumReceiverExtensionTexels,Math.sqrt(d[y]));
            }
        }
        report.charts++;report.triangles+=chart.triangles.length;
    }
    return report;
}

export function downsampleReceiverPage(data,size) {
    const half=size/2,result=new Float32Array(half*half*4);
    for(let y=0;y<half;y++)for(let x=0;x<half;x++)for(let c=0;c<4;c++) {
        const i=(y*2*size+x*2)*4+c;
        result[(y*half+x)*4+c]=(data[i]+data[i+4]+data[i+size*4]+data[i+size*4+4])*.25;
    }
    return result;
}
