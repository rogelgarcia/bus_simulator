// Independently checks unchanged accepted geometry and actual revised exterior cutout contracts.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {glbDocument} from '../Validate.mjs';
import {readAccessor} from '../Accessors.mjs';
import {decodePng} from '../lod0/Png.mjs';
import {writeJson} from '../../baking/Files.mjs';

const json = async file => JSON.parse(await readFile(file,'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
export function meshFingerprint(document, mesh) {
    return mesh.primitives.map(primitive => Object.fromEntries([...Object.entries(primitive.attributes),['indices',primitive.indices]].map(([name,index]) => {
        const values = readAccessor(document,index), bytes = Buffer.alloc(values.count*values.width*8);
        for (let i=0;i<values.count;i++) for (let c=0;c<values.width;c++) bytes.writeDoubleLE(values.get(i,c),(i*values.width+c)*8);
        return [name,hash(bytes)];
    })));
}
export async function validate(options) {
    const results=[], checked=new Set();
    for (const level of options.levels) for (const id of options.models) {
        const [species,variant]=id.split('/'), stem=`${variant}_lod${level}`;
        const root=path.join(options.output,`lod${level}`), directory=path.join(root,id), source=path.join(options[`source${level}`],id);
        const current=glbDocument(await readFile(path.join(directory,stem+'.glb'))), previous=glbDocument(await readFile(path.join(source,stem+'.glb')));
        const stats=await json(path.join(directory,'model.json')), oldStats=await json(path.join(source,'model.json'));
        let wood=0,leaves=0;
        for (const mesh of current.json.meshes) {
            if (!mesh.name.includes('outer')) {
                const oldMesh=previous.json.meshes.find(m=>m.name===mesh.name);
                if (!oldMesh || JSON.stringify(meshFingerprint(current,mesh))!==JSON.stringify(meshFingerprint(previous,oldMesh))) throw new Error('Accepted geometry changed: '+mesh.name);
            }
            for (const primitive of mesh.primitives) {
                const mat=current.json.materials[primitive.material], count=current.json.accessors[primitive.indices].count/3;
                if (mat.name.includes('spray cards')) {
                    leaves+=count;
                    if (!mat.doubleSided || mat.alphaMode!=='MASK' || mat.alphaCutoff!==.5 || mat.extensions?.KHR_materials_diffuse_transmission?.diffuseTransmissionFactor!==.17) throw new Error('Invalid branchlet material');
                } else wood+=count;
                for (const key of ['POSITION','NORMAL','TEXCOORD_0','TANGENT']) {
                    const values=readAccessor(current,primitive.attributes[key]);
                    for(let i=0;i<values.count;i++) for(let c=0;c<values.width;c++) if(!Number.isFinite(values.get(i,c))) throw new Error('Non-finite exported attribute');
                }
            }
        }
        if (wood!==oldStats.woodTriangles || leaves!==oldStats.canopyTriangles || wood!==stats.woodTriangles || leaves!==stats.canopyTriangles) throw new Error('Triangle budget changed: '+id);
        if (JSON.stringify(current.json.materials)!==JSON.stringify(previous.json.materials)) throw new Error('Accepted material settings changed: '+id);
        const layout=await json(path.join(directory,'layout.json'));
        const currentAtlas=await json(path.join(root,species,'canopy/atlas.json'));
        for (const plane of layout.planes.filter(p=>p.kind==='outer')) {
            const tile=currentAtlas.tiles.find(t=>t.tile===plane.tile);
            if(Math.abs(plane.size[0]/plane.size[1]-tile.physicalAspect)>1e-6) throw new Error('Branchlet proportions are stretched: '+id);
        }
        for (const [index,image] of current.json.images.entries()) if (!image.name.startsWith('leaf_')) {
            const extract=(d,im)=>{const v=d.json.bufferViews[im.bufferView];return d.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);};
            if (!extract(current,image).equals(extract(previous,previous.json.images[index]))) throw new Error('Accepted wood texture changed');
        }
        const coverage=await json(path.join(directory,'coverage.json'));
        if (coverage.views.length!==24 || coverage.views.some(r=>r.coverageRatio<.95 || r.coverageRatio>1.20 || r.outsideLod0EnvelopeFraction>.10)) throw new Error('Canopy coverage gate failed: '+id);
        const atlasKey=level+':'+species;
        if (!checked.has(atlasKey)) {
            checked.add(atlasKey);
            for (const channel of ['color','normal','orm']) {
                const a=decodePng(await readFile(path.join(options[`source${level}`],species,'canopy',`leaf_${channel}.png`)));
                const b=decodePng(await readFile(path.join(root,species,'canopy',`leaf_${channel}.png`)));
                if (a.width!==b.width || a.height!==b.height) throw new Error('Atlas dimensions changed');
                const tile=a.width/8;
                for (let y=0;y<a.height;y++) for(let x=0;x<a.width;x++) if (!(y<tile && x>=5*tile)) {
                    const i=(y*a.width+x)*4;
                    for(let c=0;c<4;c++) if(a.data[i+c]!==b.data[i+c]) throw new Error(`Interior ${channel} pixels changed at ${x},${y}`);
                }
            }
            const atlas=await json(path.join(root,species,'canopy/atlas.json'));
            for (const tile of atlas.tiles.filter(row=>row.kind==='outer')) {
                if (tile.edges.length!==tile.nodes.length-1 || tile.attachments.length!==tile.leaves || tile.twigEdges<4) throw new Error('Disconnected branchlet graph');
                for(const leaf of tile.attachments) {
                    const p=leaf.position;
                    const nearest=Math.min(...tile.edges.map(([a,b])=>{
                        const start=tile.nodes[a],delta=tile.nodes[b].map((v,i)=>v-start[i]);
                        const t=Math.max(0,Math.min(1,p.reduce((sum,v,i)=>sum+(v-start[i])*delta[i],0)/delta.reduce((sum,v)=>sum+v*v,0)));
                        return Math.hypot(...p.map((v,i)=>v-start[i]-t*delta[i]));
                    }));
                    if(nearest>1e-6) throw new Error('Leaf petiole is detached from its twig');
                }
            }
        }
        results.push({id,level,woodTriangles:wood,leafTriangles:leaves,woodAndCoreUnchanged:true,woodTexturesUnchanged:true,
            coverageMinimum:Math.min(...coverage.views.map(r=>r.coverageRatio)),coverageMaximum:Math.max(...coverage.views.map(r=>r.coverageRatio))});
    }
    await writeJson(path.join(options.output,'validation.json'),{models:results,passed:true});
    console.log(`[Branchlets] Validated ${results.length} models: unchanged wood/core, connected foliage and canopy coverage`);
    return results;
}
