// Authenticate payloads again and compare independently rendered shared guards.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function validateShadowPageGuards(root,manifest) {
    const inventory=new Map(manifest.pages.map(p=>[p.id,p])),cache=new Map();
    const size=manifest.interiorTexels+manifest.guardTexels*2,edge=manifest.interiorTexels,overlap=manifest.guardTexels*2;
    const load=async id=>{
        if(cache.has(id))return cache.get(id);
        const page=inventory.get(id);let raw;
        if(page.empty)raw=new Uint8Array(page.byteLength).fill(255);
        else {
            const compressed=await readFile(path.join(root,page.path));
            if(compressed.length!==page.compressedBytes||hash(compressed)!==page.compressedSha256)throw new Error('Compressed page changed after capture');
            raw=gunzipSync(compressed,{maxOutputLength:page.byteLength});
        }
        if(raw.length!==page.byteLength||hash(raw)!==page.sha256)throw new Error('Page changed after capture');
        if(cache.size>=3)cache.delete(cache.keys().next().value);cache.set(id,raw);return raw;
    };
    const report={pairs:0,samples:0,roundingDifferences:0,discontinuityPixels:0,maximumCodeError:0};
    for(const page of manifest.pages)for(const axis of [0,1]){
        if(axis===0&&page.id%manifest.tileCount[0]===manifest.tileCount[0]-1)continue;
        const next=page.id+(axis===0?1:manifest.tileCount[0]);if(!inventory.has(next))continue;
        const a=await load(page.id),b=await load(next);report.pairs++;
        for(let i=0;i<size;i++)for(let j=0;j<overlap;j++){
            const ai=(axis===0?i*size+edge+j:(edge+j)*size+i)*2;
            const bi=(axis===0?i*size+j:j*size+i)*2;
            const error=Math.abs((a[ai]*256+a[ai+1])-(b[bi]*256+b[bi+1]));
            report.samples++;report.maximumCodeError=Math.max(report.maximumCodeError,error);
            if(error>0&&error<=1)report.roundingDifferences++;
            if(error>1)report.discontinuityPixels++;
        }
    }
    report.passed=report.pairs>0&&report.discontinuityPixels===0;
    return report;
}
