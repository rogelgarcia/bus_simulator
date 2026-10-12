// Rebuilds reference shoots in isolated, authenticated review artifacts.
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {listFiles,hashFile,writeJson,digest} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {gallery} from './Gallery.mjs';
import {candidateSelection,consolidate} from './Consolidate.mjs';

const TOOL='tools/bake_vegetation/natural_foliage';
export const naturalFoliageJob={
    id:'vegetation/natural-foliage',description:'Curved reference shoots, species phyllotaxis and crowding-aware leaf placement',
    blender:true,always:true,configurationPaths:['executable','browserExecutable'],codePaths:[TOOL],
    defaults:{phase:'all',models:'all',views:'all',width:1600,samples:48,retain:.76,retention:'',candidates:'',gain:1.10,
        baseline:'tests/artifacts/screens/vegetation_natural_foliage/final_review_v2_20261011',
        source:'tests/artifacts/screens/ai588_trunk_growth/final',
        receipt:'tests/artifacts/screens/ai591_core_canopies/final/reference.json',
        cameras:'tests/artifacts/screens/vegetation_leaf_closeups/20261011_final/closeups.json',
        output:'tests/artifacts/screens/vegetation_natural_foliage/review'},
    options:{phase:bakeOption.choice(['study','build','render','all','consolidate','coverage']),models:String,views:bakeOption.choice(['all','detail']),width:Number,samples:bakeOption.samples,retain:Number,retention:String,candidates:String,baseline:String,gain:Number,source:String,receipt:String,cameras:String,output:String},
    async inputs(ctx){
        return [...(await listFiles(path.join(ctx.root,TOOL))).filter(file=>!file.includes('__pycache__')),
            path.resolve(ctx.root,ctx.options.source,'mature_tree_arboretum.blend'),path.resolve(ctx.root,ctx.options.source,'scene.json'),
            path.resolve(ctx.root,ctx.options.receipt),path.resolve(ctx.root,ctx.options.cameras),
            path.join(ctx.root,'assets/trees/Textures/T_Leaf_Realistic9.TGA'),path.join(ctx.root,'assets/trees/Models/Mobile/SM_M_Tree_1.FBX'),
            path.join(ctx.root,'tools/bake_vegetation/lod0/common.py'),path.join(ctx.root,'tools/bake_vegetation/authoring/leaf_geometry.py'),
            ...['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'].map(s=>path.join(ctx.root,'tools/bake_vegetation',s,'recipe.json')),
            ...(ctx.options.phase==='consolidate'?(await candidateSelection(ctx.root,ctx.options.candidates)).inputs:[]),
            ...(ctx.options.phase==='coverage'?(await candidateSelection(ctx.root,ctx.options.baseline)).inputs:[])];
    },
    async run(ctx){
        if(ctx.publish)throw new Error('Reference foliage is review-only; publication is forbidden');
        const options={...ctx.options,root:ctx.root};
        for(const key of ['source','receipt','cameras','output','baseline'])options[key]=path.resolve(ctx.root,options[key]);
        const relative=path.relative(path.join(ctx.root,'tests/artifacts/screens/vegetation_natural_foliage'),options.output);
        if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Choose a dedicated natural-foliage artifact subdirectory');
        if(!Number.isInteger(options.width)||options.width<640||options.width>3840||!Number.isFinite(options.retain)||options.retain<.5||options.retain>1)throw new Error('Invalid reference render settings');
        const accepted=JSON.parse(await readFile(options.receipt,'utf8'));
        const hash=await hashFile(path.join(options.source,'mature_tree_arboretum.blend'));
        if(hash.sha256!==accepted.sha256||hash.bytes!==accepted.bytes)throw new Error('Accepted reference fingerprint differs');
        const source=JSON.parse(await readFile(path.join(options.source,'scene.json'),'utf8'));
        const known=source.inventory.map(row=>row.species+'/'+row.variant);
        const overrides=options.retention?options.retention.split(',').map(entry=>entry.split('=')):[];
        if(new Set(overrides.map(row=>row[0])).size!==overrides.length||overrides.some(([species,value,...extra])=>extra.length||!known.some(id=>id.startsWith(species+'/'))||!Number.isFinite(Number(value))||Number(value)<.5||Number(value)>1))throw new Error('Invalid species retention override');
        options.retainBySpecies=Object.fromEntries(overrides.map(([species,value])=>[species,Number(value)]));
        options.models=options.models==='all'?known:options.models.split(',');
        if(new Set(options.models).size!==options.models.length||options.models.some(id=>!known.includes(id)))throw new Error('Unknown reference model');
        options.sourceSha256=hash.sha256;
        if(options.phase==='coverage'){
            if(!Number.isFinite(options.gain)||options.gain<1.01||options.gain>1.30)throw new Error('Coverage gain must be between 1.01 and 1.30');
            const baseline=JSON.parse(await readFile(path.join(options.baseline,'summary.json'),'utf8'));
            if(baseline.sourceSha256!==hash.sha256||baseline.models.length!==15||known.some(id=>!baseline.models.some(row=>row.id===id)))throw new Error('Coverage requires the complete authenticated reference collection');
            if(options.output===options.baseline)throw new Error('Coverage must preserve the baseline');
            const code=(await listFiles(path.join(ctx.root,TOOL))).filter(file=>/\.(py|mjs)$/.test(file));
            options.coverageCodeIdentity=digest({gain:options.gain,code:await Promise.all(code.map(async file=>({file:path.relative(ctx.root,file),...await hashFile(file)})))});
        }
        await mkdir(options.output,{recursive:true});
        const file=path.join(ctx.stage,'natural-foliage-options.json');await writeJson(file,options);
        if(options.phase==='consolidate')await consolidate(options);
        else{
            const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1',TBB_NUM_THREADS:'2'};
            try{await runHeadlessBake(ctx,TOOL+'/run.py',[file]);}finally{ctx.env=previous;}
        }
        if(['all','render','consolidate'].includes(options.phase)&&options.views==='all')await gallery({...options,minimumCoverage:options.phase==='consolidate'?.95:.90,browserExecutable:ctx.config.browserExecutable});
        await ctx.assertInputsStable();
        return {state:'validated',directory:options.output,files:await listFiles(options.output)};
    }
};
