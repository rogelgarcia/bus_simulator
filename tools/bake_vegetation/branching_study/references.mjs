// Authenticates supplied PNG/JPEG references without changing their bytes or extensions.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {hashFile} from '../../baking/Files.mjs';
import {species} from './species.mjs';
export const within=(base,file)=>{const relative=path.relative(base,file);return Boolean(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));};
export async function referenceImage(file){
    const bytes=await readFile(file),extension=path.extname(file).toLowerCase();
    const png=bytes.toString('hex',0,8)==='89504e470d0a1a0a',jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!(png&&extension==='.png'||jpeg&&['.jpg','.jpeg'].includes(extension)))throw Error('Expected a correctly named PNG or JPEG reference: '+file);
    return {extension,...await hashFile(file)};
}
export async function readStudies(root,filename){
    if(!filename)return [];
    const manifest=path.resolve(root,filename),document=JSON.parse(await readFile(manifest,'utf8'));
    const rows=Array.isArray(document)?document.filter(row=>row.style==='photographic'):document.images;
    if(!Array.isArray(rows))throw Error('Invalid supplied reference manifest');
    return Promise.all(Object.keys(species).map(async id=>{
        const matches=rows.filter(row=>row.species===id);
        if(matches.length!==1)throw Error('Expected one supplied study for '+id);
        const row=matches[0],file=path.resolve(path.dirname(manifest),row.file);
        if(!within(path.dirname(manifest),file))throw Error('Reference must stay within its collection');
        const identity=await referenceImage(file);
        if(identity.sha256!==row.sha256)throw Error('Supplied study changed: '+id);
        return {id,file,originalSource:row.source,...identity};
    }));
}
