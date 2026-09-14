// Extend only authenticated small-chart samples, without introducing seam constraints.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {readReceiverNpy,extendReceiverPage} from '../../../receiver_lightmaps/ReceiverPagePadding.mjs';
import {parseBakeSourcePackage} from '../../../../src/app/illumination/bake_source/index.js';
import {resolveReceiverTransport} from '../../../../src/app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';
import {receiverChartSeams,stitchReceiverPageFiles} from '../../../receiver_lightmaps/ReceiverSeamStitching.mjs';
const output=process.argv[2];
const request=JSON.parse(await readFile(path.join(output,'request.json'),'utf8'));
let parsed;
if(request.phase==='refined') {
    const source=await parseBakeSourcePackage(await readFile(path.join(request.bake,'source.bsib')));
    parsed={...source,manifest:resolveReceiverTransport(source.manifest)};
}
const records=JSON.parse(await readFile(path.join(output,'renders.json'),'utf8'));
for(const variant of new Set(records.map(r=>r.variant))) {
    const directory=path.join(output,variant),atlas=JSON.parse(await readFile(path.join(directory,'atlas.json'),'utf8'));
    const sky=await readReceiverNpy(path.join(directory,'sky.npy'),atlas.profile.pageSize),bounce=await readReceiverNpy(path.join(directory,'bounce.npy'),atlas.profile.pageSize);
    const data=new Float32Array(sky.length);
    for(let i=0;i<data.length;i++)data[i]=i%4===3?1:Math.fround(sky[i]+bounce[i])*Math.fround(Math.PI);
    const report=extendReceiverPage(data,sky,bounce,0,atlas.charts,atlas.profile);
    await writeFile(path.join(directory,'extended.f32'),Buffer.from(data.buffer));
    await writeFile(path.join(directory,'extension.json'),JSON.stringify(report,null,2));
    if(parsed) {
        const seams=receiverChartSeams(parsed,atlas.charts,atlas.profile);
        await writeFile(path.join(directory,'seam-input.0.mip0.f32'),Buffer.from(data.buffer));
        const report=await stitchReceiverPageFiles(directory,seams,{...atlas.profile,mipLevels:1},1);
        await writeFile(path.join(directory,'seams.json'),JSON.stringify(report,null,2));
    }
}
