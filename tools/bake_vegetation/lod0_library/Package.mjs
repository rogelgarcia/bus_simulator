// Packages accepted LOD0 meshes with shared external KTX2 maps and authenticated catalog manifests.
// @ts-check
import path from 'node:path';
import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {hashFile, writeJson} from '../../baking/Files.mjs';
import {glbDocument} from '../Validate.mjs';
import {readAccessor} from '../Accessors.mjs';

export const SPECIES = Object.freeze(['london_plane', 'silver_linden', 'northern_red_oak', 'american_elm', 'arrowwood_viburnum']);
export const REVISION = 'core-canopy-lod0-v1';
const json = async file => JSON.parse(await readFile(file, 'utf8'));

function pack(doc, bin) {
    const raw = Buffer.from(JSON.stringify(doc)), padded = Buffer.concat([raw, Buffer.alloc((-raw.length)&3, 32)]);
    const head = Buffer.alloc(20), tail = Buffer.alloc(8);
    head.write('glTF'); head.writeUInt32LE(2,4); head.writeUInt32LE(28+padded.length+bin.length,8);
    head.writeUInt32LE(padded.length,12); head.write('JSON',16); tail.writeUInt32LE(bin.length); tail.write('BIN\0',4);
    return Buffer.concat([head,padded,tail,bin]);
}

/** @param {string} source @param {string} destination */
export async function packageLod0Library(source, destination) {
    const review = await json(path.join(source,'revision.json'));
    if (!review.core || review.models.length !== 15 || review.totals.newLeaves !== 50000 || review.totals.wood !== 47548) throw new Error('Expected accepted complete 50K core-canopy review');
    const manifest = {schema:'bus-sim-vegetation-lod0-v1', revision:REVISION, referenceSha256:review.referenceSha256,
        publication:'Opt-in catalog; existing city placements unchanged', models:[], textures:{}, sourceFiles:{}};
    for (const row of review.models) {
        const [species, variant] = row.id.split('/');
        if (!SPECIES.includes(species) || !/^mature_0[123]$/.test(variant)) throw new Error('Unknown reviewed tree');
        const directory = path.join(source,row.id), raw = await readFile(path.join(directory,variant+'_lod0.glb'));
        const document = glbDocument(raw), doc = document.json;
        const compression = await json(path.join(directory,'compression.json'));
        const stats = await json(path.join(directory,'model.json'));
        if (stats.woodTriangles !== row.woodTriangles || stats.canopyTriangles !== row.canopyTriangles || stats.woodTriangles > stats.previousWoodTriangles*.5
            || stats.geometryError.nonManifoldEdges || stats.geometryError.p99Metres > .1 || stats.geometryError.maxMetres > .18) throw new Error('LOD0 geometry review gate failed');
        if (compression.textures.length !== 6 || !doc.extensionsRequired?.includes('KHR_texture_basisu')) throw new Error('Missing validated compressed PBR');
        const imageViews = new Set(doc.images.map(image=>image.bufferView));
        for (const image of doc.images) {
            const record = compression.textures.find(texture=>texture.name===image.name);
            if (!record || record.quality.psnr < 28 || record.quality.alphaCoverageError > .015 || (record.quality.meanNormalAngleDegrees??0)>6) throw new Error('PBR compression gate failed');
            const view = doc.bufferViews[image.bufferView];
            const bytes = document.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
            const relative = `${species}/textures/${record.foliage?'canopy':variant}/${record.foliage?'leaf':'bark'}_${record.channel}.ktx2`;
            const file = path.join(destination,relative); await mkdir(path.dirname(file),{recursive:true});
            await writeFile(file,bytes); const measured=await hashFile(file);
            if (measured.sha256!==record.sha256 || (manifest.textures[relative] && manifest.textures[relative].sha256!==measured.sha256)) throw new Error('Shared texture bytes differ from the accepted bake');
            manifest.textures[relative]={...measured,size:record.size,levels:record.levels,blockGpuBytes:record.blockGpuBytes};
            image.uri=relative.slice(species.length+1); delete image.bufferView;
        }
        const remap=new Map(), views=[], blocks=[]; let offset=0;
        for(const [index,view] of doc.bufferViews.entries()) {
            if(imageViews.has(index)) continue;
            const data=document.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
            remap.set(index,views.length); views.push({...view,byteOffset:offset});
            blocks.push(data,Buffer.alloc((-data.length)&3)); offset+=data.length+((-data.length)&3);
        }
        for(const accessor of doc.accessors) {
            if(accessor.sparse || !remap.has(accessor.bufferView)) throw new Error('Unexpected geometry buffer layout');
            accessor.bufferView=remap.get(accessor.bufferView);
        }
        doc.bufferViews=views; doc.buffers=[{byteLength:offset}];
        for(const material of doc.materials) {
            const leaf=material.name.includes('spray cards'); material.name=leaf?'foliage':'bark';
            if(leaf && (!material.doubleSided || material.alphaMode!=='MASK' || material.alphaCutoff!==.5
                || material.extensions?.KHR_materials_diffuse_transmission?.diffuseTransmissionFactor!==.17)) throw new Error('Leaf material contract differs from accepted review');
        }
        const relative=`${species}/${variant}.glb`, file=path.join(destination,relative);
        await writeFile(file,pack(doc,Buffer.concat(blocks)));
        manifest.models.push({id:row.id,file:relative,...await hashFile(file),woodTriangles:row.woodTriangles,leafTriangles:row.canopyTriangles,
            coreTriangles:row.coreTriangles,outerTriangles:row.outerTriangles,geometryError:row.geometryError,
            sourceGlb:await hashFile(path.join(directory,variant+'_lod0.glb'))});
    }
    for(const file of ['reference-sources.json','reference-material-approximations.json']) {
        await copyFile(path.join(source,file),path.join(destination,file)); manifest.sourceFiles[file]=await hashFile(path.join(destination,file));
    }
    await writeFile(path.join(destination,'PROVENANCE.md'),'# Mature vegetation LOD0\n\nOriginal modeled geometry; photographed material sources are CC0 and listed in reference-sources.json. Material species approximations are recorded separately. Source revision: AI591; reference SHA-256: '+review.referenceSha256+'.\n\nFive species, three mature forms each; 50,000 foliage and 47,548 wood triangles total. Double-sided alpha cards share tissue color across faces. No wind or lower LODs. Source/review masters remain in the AI591 artifact directory.\n');
    await writeJson(path.join(destination,'index.json'),manifest);
    await validateLod0Library({directory:destination});
    return manifest;
}

/** @param {{directory:string}} result */
export async function validateLod0Library({directory}) {
    const manifest=await json(path.join(directory,'index.json'));
    if(manifest.schema!=='bus-sim-vegetation-lod0-v1' || manifest.revision!==REVISION || manifest.models.length!==15 || Object.keys(manifest.textures).length!==60) throw new Error('Incomplete LOD0 library');
    const ids=new Set(); let wood=0,leaves=0;
    for(const row of manifest.models) {
        if(ids.has(row.id) || !SPECIES.some(species=>new RegExp('^'+species+'/mature_0[123]$').test(row.id)) || row.file!==row.id+'.glb') throw new Error('Invalid library model identity');
        ids.add(row.id); const file=path.join(directory,row.file), hash=await hashFile(file);
        if(hash.sha256!==row.sha256 || hash.bytes!==row.bytes) throw new Error('Model authentication failed');
        const document=glbDocument(await readFile(file)),doc=document.json;
        if(doc.materials.length!==2 || doc.images.length!==6 || !doc.extensionsRequired.includes('KHR_texture_basisu')) throw new Error('Incomplete library PBR');
        let actualWood=0,actualLeaves=0;
        for(const mesh of doc.meshes) for(const primitive of mesh.primitives) {
            const material=doc.materials[primitive.material], count=doc.accessors[primitive.indices].count/3;
            if((primitive.mode??4)!==4 || !Number.isInteger(count)) throw new Error('Non-triangle library geometry');
            if(material.name==='foliage') {
                if(!material.doubleSided || material.alphaMode!=='MASK' || material.alphaCutoff!==.5) throw new Error('Invalid leaf coverage');
                actualLeaves+=count;
            } else if(material.name==='bark') actualWood+=count; else throw new Error('Unknown surface');
            for(const field of ['POSITION','NORMAL','TEXCOORD_0','TANGENT']) {
                const values=readAccessor(document,primitive.attributes[field]);
                for(let i=0;i<values.count;i++) for(let c=0;c<values.width;c++) if(!Number.isFinite(values.get(i,c))) throw new Error('Invalid geometry attribute');
            }
        }
        if(actualWood!==row.woodTriangles || actualLeaves!==row.leafTriangles || row.coreTriangles!==30) throw new Error('Triangle count mismatch');
        wood+=actualWood; leaves+=actualLeaves;
        for(const image of doc.images) {
            if(!/^textures\/(canopy|mature_0[123])\/(leaf|bark)_(color|normal|orm)\.ktx2$/.test(image.uri) || image.bufferView!==undefined) throw new Error('Unsafe or embedded library texture');
            if(!manifest.textures[row.id.split('/')[0]+'/'+image.uri]) throw new Error('Unlisted library texture');
        }
    }
    if(wood!==47548 || leaves!==50000) throw new Error('Combined library budget failed');
    for(const [file,expected] of Object.entries({...manifest.textures,...manifest.sourceFiles})) {
        if(file.includes('..') || path.isAbsolute(file)) throw new Error('Unsafe library file');
        const measured=await hashFile(path.join(directory,file));
        if(measured.sha256!==expected.sha256 || measured.bytes!==expected.bytes) throw new Error('Library texture/provenance authentication failed');
    }
}
