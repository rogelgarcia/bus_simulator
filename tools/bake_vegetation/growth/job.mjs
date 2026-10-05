// Stages species growth sweeps and scan-calibrated bark relief through the shared Blender runner.
// @ts-check
import path from 'node:path';
import {readFile,mkdir,cp,copyFile} from 'node:fs/promises';
import {listFiles,hashFile,writeJson} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {surfacesJob} from '../surfaces/job.mjs';
import {writeGallery} from '../showcase/Gallery.mjs';

export const growthJob={
    id:'vegetation/growth',blender:true,always:true,configurationPaths:['executable','renderDevice'],
    description:'Species-specific trunk sweeps and calibrated photographic London plane crevices',
    defaults:{phase:'all',width:2560,samples:128,views:'all',models:'all'},
    options:{phase:bakeOption.choice(['all','build','render']),width:surfacesJob.options.width,samples:bakeOption.samples,device:bakeOption.device,views:String,models:String,scene:String},
    inputs:ctx=>surfacesJob.inputs({...ctx,options:{...ctx.options,phase:'leaves'}}),
    async run(ctx){
        if(ctx.publish)throw new Error('Growth review cannot replace gameplay assets');
        const original=path.resolve(ctx.root,ctx.options.scene),directory=path.join(ctx.root,'tests/artifacts/screens/ai588_trunk_growth',`run-${Date.now()}`);
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
                const input=JSON.parse(await readFile(path.join(original,'scene.json'),'utf8'));
                if(input.growthRevision||input.junctionRevision!=='anatomical-unions-v1')throw new Error('Build requires the undeformed anatomical branch-union scene');
                await cp(path.join(original,'pbr'),path.join(directory,'pbr'),{recursive:true});
                for(const file of ['sources.json','material-approximations.json'])await copyFile(path.join(original,file),path.join(directory,file));
                await runHeadlessBake(ctx,'tools/bake_vegetation/growth/build.py',[ctx.root,original,directory,ctx.options.models]);
            }
            const manifest=JSON.parse(await readFile(path.join(source,'scene.json'),'utf8'));
            if(manifest.inventory.length!==15||manifest.growthRevision!=='species-growth-v1'||!manifest.growthModels.length)throw new Error('Invalid growth scene');
            if(ctx.options.phase!=='render'&&ctx.options.models==='all'&&manifest.growthModels.length!==15)throw new Error('Incomplete model collection');
            for(const id of manifest.growthModels){
                const record=manifest.inventory.find(row=>row.species+'/'+row.variant===id),g=record?.growth,d=record?.woodyDetail;
                if(!g?.faceOrientationValidated||!g.rootPlanePinned||g.minimumAxisJacobian<=0||g.canopy.minimumAnchorJacobian<=0
                    ||g.canopy.leafShapeScaleTintBefore!==g.canopy.leafShapeScaleTintAfter||d.boundaryEdges||d.nonManifoldEdges)throw new Error('Growth validation failed: '+id);
            }
            if(ctx.options.phase!=='build'){
                const options={...ctx.options,device:ctx.options.device??ctx.config.renderDevice};
                const ids=options.views==='all'?manifest.views.map(v=>v.id):options.views.split(',');
                if(new Set(ids).size!==ids.length||ids.some(id=>!manifest.views.some(v=>v.id===id)))throw new Error('Invalid view selection');
                const file=path.join(directory,'render-options.json');await writeJson(file,options);
                await runHeadlessBake(ctx,'tools/bake_vegetation/showcase/render.py',[source,directory,file]);
                const report=JSON.parse(await readFile(path.join(directory,'renders.json'),'utf8')),hashes=new Set();
                if(report.engine!=='CYCLES'||report.renders.length!==ids.length)throw new Error('Incomplete render evidence');
                for(const row of report.renders){
                    const image=path.join(directory,row.file),png=await readFile(image),hash=await hashFile(image);
                    if(png.readUInt32BE(16)!==options.width||png.readUInt32BE(20)!==options.width*9/16||hashes.has(hash.sha256))throw new Error('Invalid render image');
                    hashes.add(hash.sha256);
                }
                await writeGallery(directory,source,manifest,report);
            }
        }finally{ctx.env=previous;}
        await ctx.assertInputsStable();ctx.log.line(ctx.id,`Growth scene: ${source}; evidence: ${directory}`);
        return{state:'validated',directory,scene:source,files:await listFiles(directory)};
    }
};
