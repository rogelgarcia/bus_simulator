// Renders authenticated reference or LOD0 species orbits in isolated headless Eevee.
// @ts-check
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {listFiles,hashFile,writeJson,digest} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {closeupGallery} from './closeups.mjs';
import {showroomGallery} from './Gallery.mjs';

const TOOL='tools/bake_vegetation/turntable';
const SPECIES=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];
const integer=(min,max)=>value=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Expected integer ${min}–${max}`);return n;};

export const turntableJob={
    id:'vegetation/turntable',description:'Labeled full-orbit Eevee showroom video for the five mature tree species',
    blender:true,always:true,configurationPaths:['executable','browserExecutable'],codePaths:[TOOL],
    defaults:{phase:'proof',species:'all',variant:'mature_01',width:1920,fps:24,seconds:12,samples:32,representation:'lod0',threads:2,
        reference:'tests/artifacts/screens/ai588_trunk_growth/final',
        'reference-receipt':'tests/artifacts/screens/ai591_core_canopies/final/reference.json','reference-index':'',
        source:'tests/artifacts/screens/ai594_branchlet_canopies/final',output:'tests/artifacts/screens/vegetation_turntable/final'},
    options:{phase:bakeOption.choice(['inspect','proof','render','assemble','closeups']),species:String,variant:bakeOption.choice(['mature_01','mature_02','mature_03']),
        width:integer(640,3840),fps:integer(12,60),seconds:integer(4,60),samples:bakeOption.samples,source:String,output:String,threads:integer(1,8),
        representation:bakeOption.choice(['lod0','reference']),reference:String,'reference-receipt':String,'reference-index':String},
    async inputs(ctx){
        const files=(await listFiles(path.join(ctx.root,TOOL))).filter(file=>!file.includes('__pycache__'));
        files.push(path.join(ctx.root,'tools/bake_vegetation/lod0/comparison.py'));
        files.push(path.join(ctx.root,'tools/bake_vegetation/lod0/common.py'));
        if(ctx.options.representation==='reference'||ctx.options.phase==='closeups'){
            files.push(path.resolve(ctx.root,ctx.options.reference,'mature_tree_arboretum.blend'),
                path.resolve(ctx.root,ctx.options.reference,'scene.json'),path.resolve(ctx.root,ctx.options['reference-receipt']));
        }
        if(ctx.options['reference-index']){
            const index=path.resolve(ctx.root,ctx.options['reference-index']);files.push(index);
            const manifest=JSON.parse(await readFile(index,'utf8'));
            for(const row of manifest.models)files.push(path.resolve(path.dirname(index),row.file));
        }
        if(ctx.options.representation==='lod0'||ctx.options.phase==='closeups')files.push(path.join(ctx.root,'assets/public/vegetation_lods/index.json'));
        for(const species of SPECIES){
            files.push(path.join(ctx.root,'tools/bake_vegetation',species,'recipe.json'));
            if(ctx.options.representation==='lod0'||ctx.options.phase==='closeups'){
                const base=path.resolve(ctx.root,ctx.options.source,'lod0',species,ctx.options.variant,ctx.options.variant+'_lod0');
                files.push(base+'.glb',base+'_review.glb');
            }
        }
        return files;
    },
    async run(ctx){
        if(ctx.publish)throw new Error('Showroom videos are review artifacts and cannot publish game assets');
        const options={...ctx.options,root:ctx.root};
        for(const key of ['source','output','reference','reference-receipt'])options[key]=path.resolve(ctx.root,options[key]);
        const relative=path.relative(path.join(ctx.root,'tests/artifacts/screens'),options.output);
        if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||options.output===options.source)throw new Error('Use a dedicated screenshots artifact output');
        const nested=value=>value!== '..'&&!value.startsWith('..'+path.sep)&&!path.isAbsolute(value);
        if([path.relative(options.reference,options.output),path.relative(options.output,options.reference)].some(nested))throw new Error('Reference and output must not overlap');
        if(options.representation==='reference'&&options.output===path.resolve(ctx.root,this.defaults.output))throw new Error('Reference video requires a separate output directory');
        if(options.width%16)throw new Error('Video width must be divisible by 16');
        options.species=options.species==='all'?SPECIES:options.species.split(',');
        if(new Set(options.species).size!==options.species.length||options.species.some(s=>!SPECIES.includes(s)))throw new Error('Invalid species selection');
        const closeups=options.phase==='closeups';
        if(options['reference-index']&&(closeups||options.representation!=='reference'))throw new Error('A revised reference index is supported only for reference showroom phases');
        if(closeups&&options.output===path.resolve(ctx.root,this.defaults.output))throw new Error('Close-ups require a separate output directory');
        const isReference=options.representation==='reference'||closeups;
        const manifest=JSON.parse(await readFile(isReference?path.join(options.reference,'scene.json'):path.join(ctx.root,'assets/public/vegetation_lods/index.json'),'utf8'));
        const lodManifest=closeups?JSON.parse(await readFile(path.join(ctx.root,'assets/public/vegetation_lods/index.json'),'utf8')):manifest;
        let fingerprint;
        if(isReference){
            const accepted=JSON.parse(await readFile(options['reference-receipt'],'utf8'));
            fingerprint=await hashFile(path.join(options.reference,'mature_tree_arboretum.blend'));
            if(fingerprint.sha256!==accepted.sha256||fingerprint.bytes!==accepted.bytes||manifest.growthRevision!=='species-growth-v1'||manifest.inventory.length!==15)throw new Error('High-detail reference does not match the accepted bake source');
        }
        let revised;
        if(options['reference-index']){
            options['reference-index']=path.resolve(ctx.root,options['reference-index']);
            revised=JSON.parse(await readFile(options['reference-index'],'utf8'));
            if(revised.sourceSha256!==fingerprint.sha256||revised.models.length!==15||new Set(revised.models.map(row=>row.id)).size!==15)throw new Error('Revised reference index is incomplete or has different provenance');
            for(const row of revised.models){
                const file=path.resolve(path.dirname(options['reference-index']),row.file);
                if((await hashFile(file)).sha256!==row.sha256)throw new Error('Revised reference changed: '+row.id);
            }
        }
        options.models=[];
        for(const species of SPECIES){
            const recipe=JSON.parse(await readFile(path.join(ctx.root,'tools/bake_vegetation',species,'recipe.json'),'utf8'));
            if(isReference){
                const id=species+'/'+options.variant;
                if(!manifest.inventory.some(row=>row.species+'/'+row.variant===id))throw new Error('Missing mature reference: '+id);
                if(revised){
                    const row=revised.models.find(row=>row.id===id);
                    if(!row||!row.woodPreserved||!row.leafShellsPreserved)throw new Error('Revised reference failed geometry preservation: '+id);
                    options.models.push({species,id,file:path.resolve(path.dirname(options['reference-index']),row.file),scientific:recipe.species,sha256:row.sha256,natural:true,leafCount:row.leafCount,revision:row.revision});
                }else options.models.push({species,id,file:path.join(options.reference,'mature_tree_arboretum.blend'),scientific:recipe.species,...fingerprint});
            }
            if(!isReference||closeups){
                const base=path.join(options.source,'lod0',species,options.variant,options.variant+'_lod0');
                const expected=lodManifest.models.find(r=>r.id===species+'/'+options.variant&&r.level===0);
                if(!expected||(await hashFile(base+'.glb')).sha256!==expected.sha256)throw new Error('Video source differs from installed LOD0: '+species);
                const lod={species,file:base+'_review.glb',scientific:recipe.species,...await hashFile(base+'_review.glb')};
                if(closeups)options.models.at(-1).lod0=lod;
                else options.models.push(lod);
            }
        }
        const code=await Promise.all((await this.inputs(ctx)).map(async file=>({file:path.relative(ctx.root,file),...await hashFile(file)})));
        options.renderIdentity=digest({code,width:options.width,fps:options.fps,seconds:options.seconds,samples:options.samples,variant:options.variant,representation:options.representation,threads:options.threads});
        await mkdir(options.output,{recursive:true});
        const file=path.join(ctx.stage,'turntable-options.json');await writeJson(file,options);
        const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:String(options.threads),OPENBLAS_NUM_THREADS:'1',TBB_NUM_THREADS:String(options.threads)};
        try{await runHeadlessBake(ctx,TOOL+'/run.py',[file]);}finally{ctx.env=previous;}
        if(closeups)await closeupGallery({...options,browserExecutable:ctx.config.browserExecutable});
        if(options.phase==='assemble'&&options['reference-index'])await showroomGallery({...options,browserExecutable:ctx.config.browserExecutable});
        await ctx.assertInputsStable();
        ctx.log.line(ctx.id,'Video artifacts: '+options.output);
        return {state:'validated',directory:options.output,files:await listFiles(options.output)};
    }
};
