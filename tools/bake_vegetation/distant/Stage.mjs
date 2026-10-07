// Compresses reviewed impostor PBR and publishes complete species libraries after independent validation.
import path from 'node:path';
import {readFile, writeFile, mkdir, copyFile, cp, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadEncoder, parseGlb, packGlb, compressImage} from '../lod0/Compress.mjs';
import {decodePng, encodePng, downsample} from '../lod0/Png.mjs';
import {writeJson, hashFile} from '../../baking/Files.mjs';
import {publishBakeDirectory} from '../../baking/Publication.mjs';
import {validateSpecies} from './Validate.mjs';
import {externalizeSharedTextures} from './SharedTextures.mjs';

const json=async file=>JSON.parse(await readFile(file,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const payload=(parsed,image)=>{const v=parsed.doc.bufferViews[image.bufferView];return parsed.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);};

async function mips(images,directory){
    await mkdir(directory,{recursive:true});
    let color=decodePng(images.color),normal=decodePng(images.normal),orm=decodePng(images.orm);
    const cols=4,rows=color.height/(color.width/cols),targets=[];
    const coverage=(image,x,y,size)=>{let count=0;for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++)count+=image.data[((y+dy)*image.width+x+dx)*4+3]>=128;return count/(size*size);};
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)targets.push(coverage(color,x*color.width/cols,y*color.width/cols,color.width/cols));
    for(let level=1;level<=5;level++){
        color=downsample(color,'color');normal=downsample(normal,'normal');orm=downsample(orm,'orm');
        const size=color.width/cols;
        for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
            const target=targets[y*cols+x];let best=1,error=Infinity;
            for(let scale=.5;scale<=3;scale+=.025){let count=0;
                for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++)count+=color.data[((y*size+dy)*color.width+x*size+dx)*4+3]*scale>=128;
                const next=Math.abs(count/(size*size)-target);if(next<error){error=next;best=scale;}
            }
            for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){
                const i=((y*size+dy)*color.width+x*size+dx)*4+3;color.data[i]=Math.min(255,Math.round(color.data[i]*best));
            }
        }
        for(const [channel,image]of Object.entries({color,normal,orm}))await writeFile(path.join(directory,`leaf_${channel}_mip${level}.png`),encodePng(image));
    }
}

async function compress(options){
    const encoder=await loadEncoder(options.root),cache=new Map(),mipDirectories=new Map();
    for(const species of options.species){
        const directory=path.join(options.output,species),manifest=await json(path.join(directory,'index.json'));
        for(const row of manifest.models){
            if(!options.levels.includes(row.level)||!options.variants.includes(row.id.replace('cluster_','mature_')))continue;
            const file=path.join(directory,row.file),source=file.replace('.glb','_source.glb');let bytes=await readFile(file),parsed=parseGlb(bytes);
            if(parsed.doc.extensionsRequired?.includes('KHR_texture_basisu')){bytes=await readFile(source);parsed=parseGlb(bytes);}
            else await writeFile(source,bytes);
            for(const mat of parsed.doc.materials){
                if(!mat.name.includes('geometry')){mat.alphaMode='MASK';mat.alphaCutoff=.5;mat.doubleSided=true;}
                if(mat.name.startsWith('Distant leaves')){
                    mat.extensions={...mat.extensions,KHR_materials_diffuse_transmission:{diffuseTransmissionFactor:.17,diffuseTransmissionColorFactor:[1,1,1]}};
                    parsed.doc.extensionsUsed=[...new Set([...(parsed.doc.extensionsUsed??[]),'KHR_materials_diffuse_transmission'])];
                }
            }
            const dir=path.join(directory,'textures',row.file.replace('.glb','')),atlases={},atlasDirectories={};
            for(const image of parsed.doc.images){
                const prefix=['shared_leaf','wood','distant'].find(p=>image.name.startsWith(p+'_'));
                if(prefix)(atlases[prefix]??={})[['color','normal','orm'].find(c=>image.name.includes(c))]=payload(parsed,image);
            }
            for(const [prefix,atlas]of Object.entries(atlases)){
                const key=hash(atlas.color);let location=mipDirectories.get(key);
                if(!location){location=path.join(dir,prefix);await mips(atlas,location);mipDirectories.set(key,location);}
                atlasDirectories[prefix]=location;
            }
            const packed=[],review=[],reports=[];
            for(const image of parsed.doc.images){
                const channel=['color','normal','orm'].find(c=>image.name.includes(c));if(!channel)throw new Error('Unidentified texture '+image.name);
                const png=payload(parsed,image),key=hash(png),prefix=Object.keys(atlases).find(p=>image.name.startsWith(p+'_')),foliage=!!prefix;
                let result=cache.get(key);if(!result){
                    try{result=await compressImage(encoder,png,channel,prefix?atlasDirectories[prefix]:dir,foliage,true);}
                    catch(error){throw new Error(`${species}/${row.file}/${image.name}: ${error.message}`,{cause:error});}
                    cache.set(key,result);
                }
                packed.push(result.encoded);review.push(result.review);reports.push({...result.report,name:image.name});
            }
            await writeFile(file,await externalizeSharedTextures(packGlb(parsed.doc,parsed.bin,packed,true),reports,directory));
            await writeFile(file.replace('.glb','_review.glb'),packGlb(parsed.doc,parsed.bin,review,false));
            Object.assign(row,await hashFile(file),{compression:reports});
            await writeJson(path.join(directory,'index.json'),manifest);
            console.log(`[Distant] Compressed ${species}/${row.file}`);
        }
        await writeJson(path.join(directory,'index.json'),manifest);
    }
}

export async function stage(options,ctx){
    if(options.phase==='prepare'){
        for(const species of options.species){
            const source=path.join(options.previous,species),destination=path.join(options.output,species);
            if(await access(path.join(destination,'index.json')).then(()=>true,()=>false))throw new Error('Refusing to overwrite an existing prepared species');
            await validateSpecies({directory:source});await mkdir(destination,{recursive:true});
            const manifest=await json(path.join(source,'index.json'));
            for(const row of manifest.models)for(const suffix of ['','_source','_review'])await copyFile(path.join(source,row.file.replace('.glb',suffix+'.glb')),path.join(destination,row.file.replace('.glb',suffix+'.glb')));
            await writeJson(path.join(destination,'index.json'),manifest);
        }
        await cp(path.join(options.previous,'comparisons'),path.join(options.output,'comparisons'),{recursive:true});return;
    }
    if(options.phase==='compress')return compress(options);
    if(options.phase==='gallery')return (await import('./Gallery.mjs')).gallery(options);
    for(const species of options.species)await validateSpecies({directory:path.join(options.output,species)});
    if(options.phase!=='publish')return;
    if(!ctx.publish)throw new Error('Publication requires --publish');
    await ctx.assertInputsStable();
    for(const species of options.species){
        const source=path.join(options.output,species),manifest=await json(path.join(source,'index.json'));
        const packaged=path.join(ctx.stage,'library',species);await mkdir(packaged,{recursive:true});
        for(const row of manifest.models)await copyFile(path.join(source,row.file),path.join(packaged,row.file));
        for(const uri of new Set(manifest.models.flatMap(row=>(row.compression??[]).filter(r=>r.uri).map(r=>r.uri))))await copyFile(path.join(source,uri),path.join(packaged,uri));
        for(const file of ['reference-sources.json','reference-material-approximations.json'])await copyFile(path.join(options.root,'assets/public/vegetation_lods',file),path.join(packaged,file));
        await writeJson(path.join(packaged,'index.json'),manifest);
        const shared=path.join(source,'shared_leaves/index.json');
        if(await access(shared).then(()=>true,()=>false))await copyFile(shared,path.join(packaged,'shared-leaves.json'));
        await writeFile(path.join(packaged,'README.md'),'# Distant vegetation\n\nLOD3 uses up to 30 wood + 30 leaf triangles. LOD4 uses 6 + 6. LOD5 is one combined two-triangle billboard. Each LOD6 plate represents ten trees with two triangles total (0.2 per represented tree). Counts are maxima, not targets. All files contain original photographic PBR; no sunlight is baked into base color.\n\nLOD5/6 require view selection and camera-facing updates through DistantVegetationLoader. The manifest stores sixteen azimuth/elevation captures per billboard. Cluster instance transforms are fixed, listed in the manifest, and must replace that same group; this does not replace arbitrary unrelated trees.\n\nGenerator: tools/bake_vegetation/distant/. Existing city placements are unchanged. CC0 sources and material approximations are listed in accompanying files.\n');
        await writeFile(path.join(packaged,'README.md'),'\nLOD3/4 use 512px foliage tiles in a shared species atlas. Keep shared_leaf_color.ktx2, shared_leaf_normal.ktx2 and shared_leaf_orm.ktx2 beside the GLBs. Distribute the complete species folder. DistantVegetationLoader shares these textures across variants and levels on the same renderer.\n',{flag:'a'});
        await validateSpecies({directory:packaged});
        await publishBakeDirectory(packaged,path.join(options.root,'assets/public/vegetation_distant',species));
    }
}
