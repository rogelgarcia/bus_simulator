// Replay authenticated page extension before the in-place seam solve, preserving source artifacts.
import {readFile,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parseBakeSourcePackage} from '../../../../src/app/illumination/bake_source/index.js';
import {resolveReceiverTransport} from '../../../../src/app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';
import {verifyReceiverAtlasFiles} from '../../../receiver_lightmaps/AtlasFiles.mjs';
import {readReceiverNpy,extendReceiverPage} from '../../../receiver_lightmaps/ReceiverPagePadding.mjs';
import {createReceiverHiddenTexelMasks} from '../../../receiver_lightmaps/ReceiverSurfaceOverlap.mjs';
const output=process.argv[2],r=JSON.parse(await readFile(path.join(output,'request.json'),'utf8'));
const job=JSON.parse(await readFile(path.join(r.bake,'job.json'),'utf8'));
await verifyReceiverAtlasFiles(r.bake,job);
const bytes=await readFile(path.join(r.bake,'source.bsib'));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(sha(bytes)!==job.packageSha256)throw new Error('Bake source hash changed');
const source=await parseBakeSourcePackage(bytes),parsed={...source,manifest:resolveReceiverTransport(source.manifest)};
const charts=[];
for await(const line of createInterface({input:createReadStream(path.join(r.bake,'charts.ndjson')),crlfDelay:Infinity}))if(line)charts.push(JSON.parse(line));
const atlas=JSON.parse(await readFile(path.join(r.bake,'atlas.json'),'utf8')),profile=atlas.profile,page=3;
console.log(JSON.stringify({phase:'charts_authenticated',count:charts.length}));
const overlap=createReceiverHiddenTexelMasks(parsed,charts,profile);
const sky=await readReceiverNpy(path.join(r.bake,`sky.${page}.npy`),profile.pageSize);
const bounce=await readReceiverNpy(path.join(r.bake,`bounce.${page}.npy`),profile.pageSize);
for(const name of ['sky','bounce']) {
    const receipt=JSON.parse(await readFile(path.join(r.bake,name+'.receipt.json'),'utf8'));
    if(receipt.jobSha256!==sha(await readFile(path.join(r.bake,'job.json')))
        ||receipt.files.find(f=>f.file===`${name}.${page}.npy`).sha256!==sha(await readFile(path.join(r.bake,`${name}.${page}.npy`))))throw new Error('Raw pass changed');
}
const reports={hiddenInventory:overlap.report,page,profile};
for(const mode of ['extension','overlap']) {
    const data=new Float32Array(sky.length);
    for(let i=0;i<data.length;i++)data[i]=i%4===3?1:Math.fround(sky[i]+bounce[i])*Math.fround(Math.PI);
    reports[mode]=extendReceiverPage(data,sky,bounce,page,charts,profile,mode==='overlap'?overlap.masks.get(page):null);
    await writeFile(path.join(output,`${mode}.f32`),Buffer.from(data.buffer));
}
const previous=JSON.parse(await readFile(path.join(r.bake,'processed-coverage.json'),'utf8')).pages[page];
for(const [key,value] of Object.entries(reports.overlap))if(typeof value==='number'&&previous[key]!==value)throw new Error('Replay coverage differs: '+key);
await writeFile(path.join(output,'processing.json'),JSON.stringify(reports,null,2));
await writeFile(path.join(output,'page_charts.json'),JSON.stringify(charts.filter(c=>c.page===page)));
console.log(JSON.stringify(reports));
