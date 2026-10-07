// Registers explicit distant-tree bakes with shared configuration, authenticated inputs and gated publication.
// @ts-check
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {listFiles, writeJson, hashFile} from '../../baking/Files.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {SPECIES} from '../lod0_library/Package.mjs';

export const distantJob={
    id:'vegetation/distant',blender:true,always:true,configurationPaths:['executable','browserExecutable'],
    description:'Species-fitted LOD3/4 panels, LOD5 view billboards and ten-tree LOD6 plates',
    defaults:{phase:'build',species:'all',variants:'all',levels:'3,4,5,6',source:'tests/artifacts/screens/ai594_branchlet_canopies/final',
        output:'tests/artifacts/screens/distant_lods/refined',previous:'tests/artifacts/screens/distant_lods/final',scene:'tests/artifacts/screens/ai588_trunk_growth/final',
        device:'CPU',samples:12,tile:512,'billboard-tile':128,'cluster-tile':256,width:1000,reference:'include'},
    options:{phase:bakeOption.choice(['prepare','build','compress','render','gallery','validate','publish','diagnose']),species:String,variants:String,levels:String,
        source:String,output:String,previous:String,scene:String,device:bakeOption.device,samples:bakeOption.samples,tile:Number,'billboard-tile':Number,'cluster-tile':Number,width:Number,reference:bakeOption.choice(['include','omit'])},
    async inputs(ctx){
        const files=await listFiles(path.join(ctx.root,'tools/bake_vegetation/distant'));
        for(const directory of ['lod0','branchlets']) files.push(...(await listFiles(path.join(ctx.root,'tools/bake_vegetation',directory))).filter(f=>/\.(mjs|py)$/.test(f)));
        files.push(path.join(ctx.root,'assets/public/vegetation_lods/index.json'));
        files.push(path.resolve(ctx.root,ctx.options.scene,'mature_tree_arboretum.blend'));
        files.push(path.join(ctx.root,'src/graphics/engine3d/vegetation/DistantTreeBillboard.js'));
        for(const file of ['reference-sources.json','reference-material-approximations.json'])files.push(path.join(ctx.root,'assets/public/vegetation_lods',file));
        const source=path.resolve(ctx.root,ctx.options.source);
        files.push(...(await listFiles(source)).filter(f=>/_lod[01](?:_review)?\.glb$/.test(f)));
        files.push(...(await listFiles(path.resolve(ctx.root,ctx.options.previous))).filter(f=>/index\.json$|distant_color\.png$|\.glb$/.test(f)));
        return files.filter(f=>!f.includes('__pycache__'));
    },
    async run(ctx){
        const options={...ctx.options,root:ctx.root,browserExecutable:ctx.config.browserExecutable};
        for(const key of ['source','output','scene','previous']) options[key]=path.resolve(ctx.root,options[key]);
        const relative=path.relative(path.join(ctx.root,'tests/artifacts/screens'),options.output);
        const inside=(a,b)=>{const r=path.relative(a,b);return !r.startsWith('..')&&!path.isAbsolute(r);};
        if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||inside(options.source,options.output)||inside(options.output,options.source)||inside(options.previous,options.output)||inside(options.output,options.previous)) throw new Error('Use a separate artifact output');
        options.species=options.species==='all'?[...SPECIES]:options.species.split(',');
        options.variants=options.variants==='all'?['mature_01','mature_02','mature_03']:options.variants.split(',');
        options.levels=options.levels.split(',').map(Number);
        if(options.species.some(s=>!SPECIES.includes(s))||options.variants.some(v=>!/^mature_0[123]$/.test(v))||options.levels.some(l=>![3,4,5,6].includes(l))) throw new Error('Invalid species, variant or LOD selection');
        for(const key of ['tile','billboard-tile','cluster-tile']) if(![64,128,256,512].includes(options[key])) throw new Error('Invalid tile resolution');
        if(!Number.isInteger(options.width)||options.width<512||options.width>3840)throw new Error('Invalid render width');
        if(ctx.publish&&options.phase!=='publish') throw new Error('Use the explicit validated publish phase');
        const manifest=JSON.parse(await readFile(path.join(ctx.root,'assets/public/vegetation_lods/index.json'),'utf8'));
        for(const species of options.species) for(const variant of ['mature_01','mature_02','mature_03']) for(const level of [0,1]){
            const row=manifest.models.find(m=>m.id===species+'/'+variant&&m.level===level);
            const hash=await hashFile(path.join(options.source,`lod${level}`,species,variant,`${variant}_lod${level}.glb`));
            if(!row||hash.sha256!==row.sha256) throw new Error('Reviewed source differs from installed branchlet assets');
        }
        const file=path.join(ctx.stage,'distant-options.json');await writeJson(file,options);
        if(['build','render','diagnose'].includes(options.phase)){
            const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1',TBB_NUM_THREADS:'2'};
            try{await runHeadlessBake(ctx,'tools/bake_vegetation/distant/run.py',[file]);}finally{ctx.env=previous;}
        }else{
            const {stage}=await import('./Stage.mjs');await stage(options,ctx);
        }
        await ctx.assertInputsStable();
        return {state:ctx.publish?'published':'validated',directory:options.output,files:await listFiles(options.output)};
    }
};
