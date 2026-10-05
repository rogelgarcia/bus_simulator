// Refines and validates mature branch attachments through the shared isolated Blender runner.
// @ts-check
import path from 'node:path';
import {readFile,mkdir,cp,copyFile} from 'node:fs/promises';
import {listFiles,hashFile,writeJson} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {surfacesJob} from '../surfaces/job.mjs';
import {writeGallery} from '../showcase/Gallery.mjs';

export const junctionsJob={
    id:'vegetation/junctions',blender:true,always:true,configurationPaths:['executable','renderDevice'],
    description:'Refine collars, bark ridges and parent shoulders in the saved photographic tree collection',
    defaults:{phase:'all',width:2560,samples:128,views:'all',models:'all'},
    options:{phase:bakeOption.choice(['all','build','render','cameras']),width:surfacesJob.options.width,samples:bakeOption.samples,device:bakeOption.device,views:String,models:String,scene:String},
    async inputs(ctx){
        if(!ctx.options.scene)throw new Error('scene=<validated photographic scene directory> is required');
        return surfacesJob.inputs({...ctx,options:{...ctx.options,phase:'leaves'}});
    },
    async run(ctx){
        if(ctx.publish)throw new Error('Branch-union review cannot publish gameplay assets');
        const original=path.resolve(ctx.root,ctx.options.scene);
        const directory=path.join(ctx.root,'tests/artifacts/screens/ai587_branch_unions',`run-${Date.now()}`);
        await mkdir(directory,{recursive:true});
        const source=ctx.options.phase==='render'?original:directory;
        const catalog=JSON.parse(await readFile(path.join(ctx.root,'tools/bake_vegetation/surfaces/sources.json'),'utf8'));
        for(const entry of Object.values(catalog.sources))for(const map of Object.values(entry.maps)){
            const actual=await hashFile(path.join(ctx.root,map.file));
            if(actual.sha256!==map.sha256||actual.bytes!==map.bytes)throw new Error('Scan authentication failed: '+map.file);
        }
        const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'2',TBB_NUM_THREADS:'4'};
        try{
            if(ctx.options.phase!=='render'){
                await cp(path.join(original,'pbr'),path.join(directory,'pbr'),{recursive:true});
                for(const file of ['sources.json','material-approximations.json'])await copyFile(path.join(original,file),path.join(directory,file));
                if(ctx.options.phase==='cameras')await runHeadlessBake(ctx,'tools/bake_vegetation/junctions/cameras.py',[original,directory]);
                else await runHeadlessBake(ctx,'tools/bake_vegetation/junctions/build.py',[ctx.root,original,directory,ctx.options.models]);
            }
            const manifest=JSON.parse(await readFile(path.join(source,'scene.json'),'utf8'));
            if(manifest.inventory.length!==15||manifest.junctionRevision!=='anatomical-unions-v1'||manifest.foliageUnchanged.before!==manifest.foliageUnchanged.after)throw new Error('Invalid branch-union scene');
            if(ctx.options.phase!=='render'&&ctx.options.models==='all'&&manifest.junctionModels.length!==15)throw new Error('Incomplete branch-union collection');
            for(const id of manifest.junctionModels){
                const model=manifest.inventory.find(row=>row.species+'/'+row.variant===id),detail=model?.woodyDetail;
                if(!detail||!detail.junctionCount||detail.boundaryEdges||detail.nonManifoldEdges||detail.syntheticSurfaceNoise!==false)throw new Error('Invalid refined wood: '+id);
            }
            if(ctx.options.phase==='cameras'&&(!manifest.cameraGeometryUnchanged?.before||manifest.cameraGeometryUnchanged.before!==manifest.cameraGeometryUnchanged.after))throw new Error('Camera revision changed meshes');
            if(!['build','cameras'].includes(ctx.options.phase)){
                const options={...ctx.options,device:ctx.options.device??ctx.config.renderDevice};
                const selected=options.views==='all'?manifest.views.map(v=>v.id):options.views.split(',');
                if(new Set(selected).size!==selected.length||selected.some(id=>!manifest.views.some(v=>v.id===id)))throw new Error('Invalid views');
                const optionsFile=path.join(directory,'render-options.json');await writeJson(optionsFile,options);
                await runHeadlessBake(ctx,'tools/bake_vegetation/showcase/render.py',[source,directory,optionsFile]);
                const report=JSON.parse(await readFile(path.join(directory,'renders.json'),'utf8'));
                if(report.engine!=='CYCLES'||report.renders.length!==selected.length)throw new Error('Incomplete render set');
                const hashes=new Set();
                for(const render of report.renders){
                    const file=path.join(directory,render.file),png=await readFile(file),hash=await hashFile(file);
                    if(png.readUInt32BE(16)!==options.width||png.readUInt32BE(20)!==options.width*9/16||hashes.has(hash.sha256))throw new Error('Invalid render evidence');
                    hashes.add(hash.sha256);
                }
                await writeGallery(directory,source,manifest,report);
            }
        }finally{ctx.env=previous;}
        await ctx.assertInputsStable();
        ctx.log.line(ctx.id,`Branch union scene: ${source}; evidence: ${directory}`);
        return{state:'validated',directory,scene:source,files:await listFiles(directory)};
    }
};
