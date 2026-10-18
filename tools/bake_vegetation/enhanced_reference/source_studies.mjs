// Authenticates species-specific supplied showroom images against their metadata and byte identities.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {hashFile} from '../../baking/Files.mjs';

/**
 * @param {{asset_id:string,species:{scientific_name:string},image_path:string,image:{sha256:string}}} meta
 * @param {string} species
 * @param {string} botanical
 * @param {number} variant
 * @param {string} sha256
 */
export function validateStudyRecord(meta,species,botanical,variant,sha256){
    const id=`${species}_0${variant}`;
    if(meta.asset_id!==id||meta.species.scientific_name!==botanical||meta.image_path!==`${species}/${id}.png`)throw Error('Wrong species study: '+id);
    if(meta.image.sha256!==sha256)throw Error('Study image differs from its metadata: '+id);
}

/** @param {string} source @param {Record<string,{botanical:string}>} profiles */
export async function photographicStudies(source,profiles){
    const base=path.join(source,'mature_trees_showroom/mature_trees_showroom'),records=[],identities=new Set();
    for(const [species,p] of Object.entries(profiles))for(const variant of [1,2]){
        const id=`${species}_0${variant}`,file=path.join(base,species,id+'.png'),metadata=path.join(base,species,id+'.json');
        const meta=JSON.parse(await readFile(metadata,'utf8')),hash=await hashFile(file);
        validateStudyRecord(meta,species,p.botanical,variant,hash.sha256);
        if(identities.has(hash.sha256))throw Error('Reused species study image: '+id);
        identities.add(hash.sha256);records.push({species,style:'photographic',variant,source:file,metadata,metadataSha256:(await hashFile(metadata)).sha256,botanical:meta.species.scientific_name,...hash});
    }
    return records;
}
