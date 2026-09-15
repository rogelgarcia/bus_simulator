// Plans the complete city with the same atlas builder used by production baking.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseBakeSourcePackage} from '../../../../src/app/illumination/bake_source/index.js';
import {resolveReceiverTransport} from '../../../../src/app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';
import {createReceiverAtlas} from '../../../../src/app/illumination/receiver_lightmaps/ReceiverAtlas.js';
import {RECEIVER_FACADE_DENSITY} from '../../../../src/app/illumination/receiver_lightmaps/ReceiverFacadeDensity.js';
const [input,layoutFile,output]=process.argv.slice(2), read=async file=>JSON.parse(await readFile(file,'utf8'));
const job=await read(path.join(input,'job.json')), original=await read(path.join(input,'atlas.json'));
const sourceBytes=await readFile(path.join(input,'source.bsib')), layoutBytes=await readFile(layoutFile);
const sha=data=>createHash('sha256').update(data).digest('hex');
if(sha(sourceBytes)!==job.packageSha256||sha(layoutBytes)!==job.layoutSha256)throw new Error('Original source/layout authentication failed');
const source=await parseBakeSourcePackage(sourceBytes), parsed={...source,manifest:resolveReceiverTransport(source.manifest)};
const profile={...original.profile,facadeDensity:RECEIVER_FACADE_DENSITY};
const started=performance.now();
let result;
try {
    const atlas=createReceiverAtlas(parsed,profile,JSON.parse(layoutBytes));
    const pageBytes=Array.from({length:profile.mipLevels},(_,m)=>(profile.pageSize>>m)**2*4).reduce((a,b)=>a+b,0);
    const bytes=pageBytes*atlas.pageCount+atlas.coordinates.byteLength;
    result={accepted:bytes<=1024**3,profile,pages:atlas.pageCount,coordinatesBytes:atlas.coordinates.byteLength,
        atlasBytes:pageBytes*atlas.pageCount,totalBytes:bytes,previousPages:original.pageCount,
        previousAtlasBytes:pageBytes*original.pageCount,coverage:atlas.coverage,statistics:atlas.statistics};
} catch(error) {
    if(error.code!=='receiver_coverage_incomplete')throw error;
    result={accepted:false,profile,previousPages:original.pageCount,coverage:error.coverage};
}
await writeFile(path.join(output,'plan.json'),JSON.stringify({...result,seconds:(performance.now()-started)/1000},null,2));
console.log(JSON.stringify({accepted:result.accepted,pages:result.pages,requiredPages:result.coverage.requiredPages,
    totalMiB:result.totalBytes/1024**2,detail:result.statistics?.facadeDetail}));
