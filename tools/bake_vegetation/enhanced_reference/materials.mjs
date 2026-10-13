// Preserves source PBR bytes and publishes only new validated material folders.
import path from 'node:path';
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {hashFile,listFiles,writeJson} from '../../baking/Files.mjs';
import {publishBakeFile} from '../../baking/Publication.mjs';

const json=async f=>JSON.parse(await readFile(f,'utf8'));
const exists=async f=>stat(f).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
export async function stageMaterials(o){
    const sums=new Map((await readFile(path.join(o.pack,'SHA256SUMS.txt'),'utf8')).trim().split(/\r?\n/).map(line=>[line.slice(66).replaceAll('\\','/'),line.slice(0,64)]));
    const records=[];
    for(const [species,p] of Object.entries(o.profiles))for(const role of ['bark','leaf_front','leaf_back']){
        const slug=`tree_ai_${species}_${role}`,directory=path.join(o.output,'materials',slug),source=path.join(o.pack,species,role);
        await mkdir(directory,{recursive:true});const meta=await json(path.join(source,'material.json')),files=[];
        for(const file of await listFiles(source)){
            const identity=await hashFile(file),relative=path.relative(o.pack,file).replaceAll('\\','/');
            if(sums.get(relative)!==identity.sha256)throw Error('Source checksum differs: '+relative);
            const to=path.join(directory,path.basename(file));
            if(await exists(to)){if((await hashFile(to)).sha256!==identity.sha256)throw Error('Preserve differing staged material '+to);}else await copyFile(file,to);
            files.push({file:path.basename(file),source:relative,...identity});
        }
        const config={materialId:'pbr.'+slug,label:`${p.name} — ${role.replaceAll('_',' ')}`,classId:role==='bark'?'bark':'foliage',root:'surface',buildingEligible:false,groundEligible:false,
            tileMeters:meta.physical_size_m.width,preferredVariant:'1k',variants:['1k'],
            mapFiles:{baseColor:'basecolor.png',normal:'normal_opengl.png',orm:'orm.png',displacement:'height_16bit.png'},
            auxiliaryMapFiles:role==='bark'?{}:{opacity:'opacity.png',translucency:'translucency.png'},
            allMapFiles:{baseColor:`assets/public/pbr/${slug}/basecolor.png`,normal:`assets/public/pbr/${slug}/normal_opengl.png`,orm:`assets/public/pbr/${slug}/orm.png`,variants:Object.fromEntries(files.filter(f=>f.file.endsWith('.png')).map(f=>[f.file.slice(0,-4),`assets/public/pbr/${slug}/${f.file}`]))},
            normalization:{notes:'AI generated; supplied registered PNGs preserved exactly. Data maps are inferred artistic proxies, not measured scans.',albedoNotes:'sRGB source appearance; no additional baked showroom lighting.',roughnessIntent:'Source roughness, ORM green channel.'},
            provenance:{schema:'bus-simulator.pbr-material-provenance',version:1,source:{type:'AI generated',asset:`${p.name} ${role}`,url:null,license:'Unspecified; user-supplied AI generated material',archive:'trees_pbr_pack.zip'},
                generation:{tool:'AI generated (user-supplied pack)',recipe:'tools/bake_vegetation/enhanced_reference/materials.mjs',seed:null,lightingInBaseColor:null},
                importedOn:new Date().toISOString().slice(0,10),species:p.botanical,role,physicalMeasurement:false,physicalSize:meta.physical_size_m,displacement:meta.displacement,
                leafUv:meta.leaf_uv??null,recommendedMaterial:meta.recommended_material,sourceFiles:files}};
        await writeFile(path.join(directory,'pbr.material.config.js'),'// AI-generated botanical PBR; exact source hashes and scale assumptions are retained.\nexport default Object.freeze('+JSON.stringify(config,null,4)+');\n');
        records.push({species,role,slug,directory,files});
    }
    await writeJson(path.join(o.output,'material-staging.json'),{source:'AI generated',materials:records});
}

export async function publishMaterials(o){
    const receipt=await json(path.join(o.output,'material-validation.json')),staged=await json(path.join(o.output,'material-staging.json'));
    if(!receipt.validated||receipt.materials.length!==15)throw Error('All fifteen material sets must validate before publication');
    const catalog=path.join(o.root,'assets/public/pbr/_catalog_index.js'),before=await readFile(catalog,'utf8');
    let next=before;const installed=[];
    for(let i=0;i<staged.materials.length;i++){
        const r=staged.materials[i],proof=receipt.materials.find(m=>m.slug===r.slug),destination=path.join(o.root,'assets/public/pbr',r.slug);
        for(const file of await listFiles(r.directory)){
            const identity=await hashFile(file),name=path.basename(file),expected=proof.files.find(f=>f.file===name);
            if(!expected||expected.sha256!==identity.sha256)throw Error('Staged PBR changed after validation '+file);
            const target=path.join(destination,name);
            if(await exists(target)){if((await hashFile(target)).sha256!==identity.sha256)throw Error('Preserve existing different PBR '+target);}
        }
        const variable=`enhancedTreeMaterial${i}`,line=`import ${variable} from './${r.slug}/pbr.material.config.js';`;
        if(!next.includes(`'./${r.slug}/pbr.material.config.js'`)){
            next=line+'\n'+next;
            if(!next.includes('export const PBR_MATERIAL_CATALOG = Object.freeze(['))throw Error('Unrecognized PBR catalog format');
            next=next.replace('export const PBR_MATERIAL_CATALOG = Object.freeze([','export const PBR_MATERIAL_CATALOG = Object.freeze([\n    '+variable+',');
        }
        installed.push({slug:r.slug,destination,files:proof.files});
    }
    await mkdir(path.join(o.output,'backups'),{recursive:true});
    const backup=path.join(o.output,'backups','pbr_catalog_before.js');if(!await exists(backup))await writeFile(backup,before);
    for(const r of staged.materials){const target=path.join(o.root,'assets/public/pbr',r.slug);for(const file of await listFiles(r.directory))if(!await exists(path.join(target,path.basename(file))))await publishBakeFile(file,path.join(target,path.basename(file)));}
    if(await readFile(catalog,'utf8')!==before)throw Error('Concurrent catalog change: leave staged imports intact and retry');
    const candidate=path.join(o.output,'pbr_catalog_after.js');await writeFile(candidate,next);await publishBakeFile(candidate,catalog);
    await writeJson(path.join(o.output,'material-publication.json'),{source:'AI generated',catalogSha256:(await hashFile(catalog)).sha256,installed});
}
