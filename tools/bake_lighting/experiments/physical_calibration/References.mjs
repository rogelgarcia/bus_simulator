// Acquires original reference data; missing measurements remain explicitly unavailable.
// @ts-check
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {hashFile,writeJson,digest} from '../../../baking/Files.mjs';

export const CORNELL_URL='https://bowers.cornell.edu/computer-graphics/data';
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();

/** @param {string} html */
export function parseCornell(html){
    const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)].map(t=>[...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r=>[...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c=>text(c[1]))));
    const spectrum=tables.find(t=>t[0]?.join(' ').includes('Wavelength white green red'));
    const light=tables.find(t=>t[0]?.join(' ').includes('Wavelength light'));
    const camera=tables.find(t=>t[0]?.[0]==='Position');
    const quads=[...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].flatMap(m=>{const numbers=text(m[1]).split(/\s+/).map(Number);return Array.from({length:numbers.length/12},(_,i)=>Array.from({length:4},(_,j)=>numbers.slice(i*12+j*3,i*12+j*3+3)));});
    if(spectrum?.length!==77||light?.length!==5||quads.length!==19||camera?.length!==5||quads.some(q=>q.length!==4||q.flat().some(v=>!Number.isFinite(v))))throw new Error('Cornell source structure changed; review the parser');
    const surfaces=[['floor','white',0],['light','light',3],['ceiling','white',4],['back','white',6],['right','green',7],['left','red',8],...Array.from({length:5},(_,i)=>['short_'+i,'white',i+9]),...Array.from({length:5},(_,i)=>['tall_'+i,'white',i+14])];
    return {schemaVersion:1,units:'millimetres; camera focal length and sensor in metres',camera:Object.fromEntries(camera.map(([k,v])=>[k,v.split(/\s+/).map(Number)])),reflectance:spectrum.slice(1).map(r=>r.map(Number)),emission:light.slice(1).map(r=>r.map(Number)),surfaces:surfaces.map(([id,material,i])=>({id,material,vertices:quads[i]})),ceilingAperture:quads[5],sourceReflectance:0.78};
}

async function acquire(url,file,kind,signal){
    const started=Date.now();
    try{
        const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.length>25000000)throw new Error('Reference exceeds 25 MB bound');
        if(kind==='zip'&&bytes.readUInt16LE(0)!==0x4b50)throw new Error('Response is not a ZIP dataset');
        if(kind==='mat'&&(bytes.length<128||bytes.subarray(0,128).toString().includes('<html')))throw new Error('Response is not MAT data');
        await writeFile(file,bytes);
        return {status:'available',url,resolvedUrl:response.url,file,...await hashFile(file),seconds:(Date.now()-started)/1000};
    }catch(error){signal.throwIfAborted();return {status:'unavailable',url,reason:error.message,seconds:(Date.now()-started)/1000};}
}

/** @param {any} ctx @param {string} output */
export async function acquireReferences(ctx,output){
    const definitions=JSON.parse(await readFile(new URL('./reference_manifest.json',import.meta.url),'utf8'));
    const directory=path.join(output,'references');await mkdir(directory,{recursive:true});
    const htmlFile=path.join(directory,'cornell.html');
    const source=await acquire(CORNELL_URL,htmlFile,'html',ctx.signal);
    if(source.status!=='available')throw new Error('Cornell source unavailable: '+source.reason);
    const html=await readFile(htmlFile,'utf8'),cornell=parseCornell(html);
    if(digest(cornell)!==definitions.cornell.parsedDataSha256)throw new Error('Cornell physical definitions changed; review the versioned reference manifest');
    await writeJson(path.join(directory,'cornell.json'),cornell);
    const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
    const downloads=await Promise.all(definitions.cornell.assets.map(async({id,suffix,kind,sha256})=>{
        const linkedUrl=links.find(url=>url.endsWith('/'+suffix));
        if(!linkedUrl)return {id,status:'unavailable',reason:'Missing link in original source page'};
        const url=linkedUrl.replace(/\/web\/(\d+)\//,'/web/$1id_/').replaceAll('%3A',':');
        const result=await acquire(url,path.join(directory,id+'.'+kind),kind,ctx.signal);
        if(result.status==='available' && result.sha256!==sha256)throw new Error('Reference content changed: '+id);
        return {id,linkedUrl,...result};
    }));
    const manifest={schemaVersion:1,acquiredAt:new Date().toISOString(),source,dataSha256:digest(cornell),downloads,definitions,license:definitions.cornell.license,role:definitions.cornell.role,normalization:definitions.cornell.normalization,measurementComparison:definitions.cornell.pairedMeasurementEligibility};
    await writeJson(path.join(directory,'manifest.json'),manifest);
    return manifest;
}
