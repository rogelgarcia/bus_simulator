// Independently counts exported triangles, checks billboard amortization and authenticates compressed surfaces.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {hashFile} from '../../baking/Files.mjs';
import {glbDocument} from '../Validate.mjs';
import {readAccessor} from '../Accessors.mjs';

export function validateBudget(row,actual){
    const {wood,leaves,mixed}=actual;
    if(row.woodTriangles!==wood||row.leafTriangles!==leaves||row.mixedTriangles!==mixed||![wood,leaves,mixed].every(n=>Number.isInteger(n)&&n>=0))throw new Error('Incorrect triangle accounting');
    if(row.level===3&&(wood>30||leaves>30||mixed!==0))throw new Error('LOD3 triangle budget exceeded');
    if(row.level===4&&(wood>6||leaves>6||mixed!==0))throw new Error('LOD4 triangle budget exceeded');
    if([5,6].includes(row.level)&&(wood!==0||leaves!==0||mixed!==2))throw new Error('A distant billboard must be exactly one two-triangle plate');
    if(row.treeCount!==(row.level===6?10:1)||row.trianglesPerTree!==(wood+leaves+mixed)/row.treeCount)throw new Error('Incorrect cluster amortization');
}

export async function validateSpecies({directory}){
    const manifest=JSON.parse(await readFile(path.join(directory,'index.json'),'utf8'));
    if(manifest.schema!=='bus-sim-vegetation-distant-v1'||manifest.models.length!==12)throw new Error('Expected three mature forms per distant level');
    const expected=new Set([3,4,5,6].flatMap(level=>[1,2,3].map(n=>`${level}/${level===6?'cluster':'mature'}_0${n}`)));
    const sharedHashes=new Map();let sharedModels=0;
    for(const row of manifest.models){
        if(!expected.delete(`${row.level}/${row.id}`)||row.file!==`${row.id}_lod${row.level}.glb`)throw new Error('Invalid distant model identity');
        const file=path.join(directory,row.file),measured=await hashFile(file);
        if(measured.sha256!==row.sha256||measured.bytes!==row.bytes)throw new Error('Model authentication failed');
        const document=glbDocument(await readFile(file)),doc=document.json;
        if(!doc.extensionsRequired?.includes('KHR_texture_basisu')||doc.buffers.some(b=>b.uri))throw new Error('Expected embedded geometry and compressed PBR');
        const actual={wood:0,leaves:0,mixed:0};
        for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
            const mat=doc.materials[primitive.material],role=['wood','leaves','mixed'].find(r=>mat.name.startsWith('Distant '+r));
            if(!role||(primitive.mode??4)!==4)throw new Error('Unknown surface or topology');
            actual[role]+=doc.accessors[primitive.indices].count/3;
            if(!mat.name.includes('geometry')&&(!mat.doubleSided||mat.alphaMode!=='MASK'||mat.alphaCutoff!==.5))throw new Error('Invalid alpha panel');
            for(const key of ['POSITION','NORMAL','TEXCOORD_0','TANGENT']){
                const values=readAccessor(document,primitive.attributes[key]);
                for(let i=0;i<values.count;i++)for(let c=0;c<values.width;c++)if(!Number.isFinite(values.get(i,c)))throw new Error('Non-finite geometry');
            }
        }
        validateBudget(row,actual);
        if(row.level<=4&&row.views.some(v=>!(v.alphaOccupancy>=.002)))throw new Error('Empty or unverified atlas tile');
        if(row.leafCards){
            sharedModels++;
            if(row.leafCards.resolution!==512||row.leafCards.uniquePerSpecies>=row.leafCards.placementsPerSpecies)throw new Error('Expected higher-resolution reused foliage cards');
            const textures=row.compression.filter(r=>r.uri);
            if(textures.length!==3)throw new Error('Expected three shared canopy maps');
            for(const report of textures){
                if(report.size[0]!==2048||report.size[1]%512!==0)throw new Error('Incorrect leaf tile resolution');
                if(sharedHashes.has(report.uri)&&sharedHashes.get(report.uri)!==report.sha256)throw new Error('Mature variants use inconsistent shared foliage');
                sharedHashes.set(report.uri,report.sha256);
            }
            for(const view of row.views.filter(v=>v.role==='leaves'))if(!(view.silhouetteIoU>=(row.level===3?.68:.82)))throw new Error('Reused leaf silhouette exceeds the approximation limit');
        }
        for(const image of doc.images){
            const report=row.compression?.find(r=>r.name===image.name),view=doc.bufferViews[image.bufferView];
            if(image.mimeType!=='image/ktx2'||!report||(!image.uri&&!view))throw new Error('Missing compressed PBR');
            if(image.uri&&(!/^shared_leaf_(color|normal|orm)\.ktx2$/.test(image.uri)||image.uri!==report.uri||row.level>4))throw new Error('Invalid shared PBR reference');
            const bytes=image.uri?await readFile(path.join(directory,image.uri)):document.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
            if(createHash('sha256').update(bytes).digest('hex')!==report.sha256)throw new Error('Texture authentication failed');
            if(!(report.quality.psnr>=28)||!(report.quality.alphaCoverageError<=.015)||!((report.quality.meanNormalAngleDegrees??0)<=6))throw new Error('PBR compression gate failed');
        }
        if(row.level>=5&&(row.views.length!==16||row.views.some(v=>!v.uv.every(Number.isFinite)||v.size.some(s=>!(s>0)))))throw new Error('Incomplete billboard views');
        if(row.level===6&&(row.instances?.length!==10||row.sourceModels?.length!==3))throw new Error('Incomplete ten-tree cluster');
    }
    if(sharedModels&&sharedModels!==6)throw new Error('Rebuild all mature variants when changing the shared foliage bank');
    console.log(`[Distant] Validated ${manifest.species}: 12 models, literal budgets, PBR and cluster amortization`);
    return manifest;
}
