// Moves identical species foliage atlases out of GLB payloads without changing geometry or materials.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseGlb} from '../lod0/Compress.mjs';

export async function externalizeSharedTextures(bytes,reports,directory){
    const {doc,bin}=parseGlb(bytes),removed=new Set();
    for(const image of doc.images){
        if(!image.name.startsWith('shared_leaf_'))continue;
        const report=reports.find(r=>r.name===image.name),view=doc.bufferViews[image.bufferView];
        const uri=`shared_leaf_${report.channel}.ktx2`;
        await writeFile(path.join(directory,uri),bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength));
        removed.add(image.bufferView);delete image.bufferView;image.uri=uri;report.uri=uri;
    }
    if(!removed.size)return bytes;
    const remap=new Map(),views=[],blocks=[];let offset=0;
    for(const [index,view]of doc.bufferViews.entries()){
        if(removed.has(index))continue;
        const data=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
        remap.set(index,views.length);views.push({...view,byteOffset:offset});blocks.push(data,Buffer.alloc((-data.length)&3));offset+=data.length+((-data.length)&3);
    }
    for(const image of doc.images)if(image.bufferView!==undefined)image.bufferView=remap.get(image.bufferView);
    for(const accessor of doc.accessors){
        if(accessor.bufferView!==undefined)accessor.bufferView=remap.get(accessor.bufferView);
        for(const item of Object.values(accessor.sparse??{}))if(item?.bufferView!==undefined)item.bufferView=remap.get(item.bufferView);
    }
    doc.bufferViews=views;doc.buffers[0].byteLength=offset;
    const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([raw,Buffer.alloc((-raw.length)&3,32)]);
    const header=Buffer.alloc(20),binary=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+offset,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);
    binary.writeUInt32LE(offset);binary.write('BIN\0',4);return Buffer.concat([header,json,binary,...blocks]);
}
