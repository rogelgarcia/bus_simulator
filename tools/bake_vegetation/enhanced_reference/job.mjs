// Builds a separate botanical reference collection and imports authenticated AI materials.
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {listFiles,hashFile,writeJson,digest} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {stageMaterials,publishMaterials} from './materials.mjs';

const TOOL='tools/bake_vegetation/enhanced_reference';
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const within=(base,file)=>{const r=path.relative(base,file);return r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
export const enhancedReferenceJob={
    id:'vegetation/enhanced-reference',description:'New botanical references from supplied studies and AI PBR, preserving the current collection',
    blender:true,always:true,configurationPaths:['executable','browserExecutable'],codePaths:[TOOL],
    defaults:{phase:'materials',source:'',models:'all',views:'all','structure-surface':'pbr','wood-study':'','foliage-study':'','foliage-layout':'branchlet',width:1440,samples:24,previous:'',candidate:'',
        baseline:'tests/artifacts/screens/vegetation_natural_foliage/coverage_20261011/summary.json',
        output:'tests/artifacts/screens/vegetation_enhanced_reference/review'},
    options:{phase:bakeOption.choice(['materials','structure','build','refine','foliage','posture','inspect','render','gallery','validate']),source:String,models:String,views:bakeOption.choice(['all','full','trunk','leaves','shoot','canopy','poses']),'structure-surface':bakeOption.choice(['pbr','clay']),'wood-study':String,'foliage-study':String,'foliage-layout':bakeOption.choice(['branchlet','spatial','dome','organic']),width:Number,samples:bakeOption.samples,baseline:String,output:String,previous:String,candidate:String},
    async inputs(ctx){
        if(!ctx.options.source)throw Error('Supply the reference image/PBR source directory');
        const index=path.resolve(ctx.root,ctx.options.baseline),manifest=await json(index);
        const prior=ctx.options.previous?path.resolve(ctx.root,ctx.options.previous):null,previous=prior?await json(prior):null;
        if(['refine','foliage','posture','inspect'].includes(ctx.options.phase)&&!ctx.options.candidate)throw Error('Candidate phase requires a preserved candidate directory');
        const candidates=['refine','foliage','posture','inspect'].includes(ctx.options.phase)?await listFiles(path.resolve(ctx.root,ctx.options.candidate)):[];
        return [...(ctx.options['foliage-study']?[path.resolve(ctx.root,ctx.options['foliage-study'])]:[]),...(ctx.options['wood-study']?[path.resolve(ctx.root,ctx.options['wood-study'])]:[]),...candidates.filter(f=>/\.(blend|json)$/.test(f)),...(prior?[prior,...previous.models.map(r=>path.resolve(path.dirname(prior),r.file))]:[]),index,...manifest.models.map(r=>path.resolve(path.dirname(index),r.file)),
            ...(await listFiles(path.resolve(ctx.root,ctx.options.source))).filter(f=>!f.endsWith('.zip')),
            ...(await listFiles(path.join(ctx.root,TOOL))).filter(f=>!f.includes('__pycache__')),
            path.join(ctx.root,'tools/bake_vegetation/lod0/common.py'),path.join(ctx.root,'tools/bake_vegetation/hybrid_lod0/source.py')];
    },
    async run(ctx){
        const o={...ctx.options,root:ctx.root,device:'CPU',browserExecutable:ctx.config.browserExecutable};
        for(const k of ['source','baseline','output'])o[k]=path.resolve(ctx.root,o[k]);
        if(o['foliage-study'])o['foliage-study']=path.resolve(ctx.root,o['foliage-study']);
        if(o.phase==='foliage'&&!o['foliage-study'])throw Error('Foliage phase requires the supplied branchlet study');
        if(o['wood-study'])o['wood-study']=path.resolve(ctx.root,o['wood-study']);
        if(!within(path.join(ctx.root,'tests/artifacts/screens/vegetation_enhanced_reference'),o.output)||within(o.output,o.source)||within(o.source,o.output)||within(o.output,o.baseline))throw Error('Use an isolated enhanced-reference output');
        if(ctx.publish&&o.phase!=='materials')throw Error('Only new PBR materials may publish; reference models remain staged');
        if(!Number.isInteger(o.width)||o.width<640||o.width>3840)throw Error('Invalid render width');
        o.profiles=await json(path.join(ctx.root,TOOL,'profiles.json'));
        const manifest=await json(o.baseline),ids=Object.keys(o.profiles).flatMap(s=>[1,2,3].map(n=>`${s}/mature_0${n}`));
        if(manifest.models.length!==15||ids.some(id=>!manifest.models.some(r=>r.id===id)))throw Error('Incomplete baseline');
        o.models=o.models==='all'?ids:o.models.split(',');
        if(new Set(o.models).size!==o.models.length||o.models.some(id=>!ids.includes(id)))throw Error('Invalid model selection');
        if(['refine','foliage','posture','inspect'].includes(o.phase)){
            o.candidate=path.resolve(ctx.root,o.candidate);
            if(!within(path.join(ctx.root,'tests/artifacts/screens/vegetation_enhanced_reference'),o.candidate)||o.candidate===o.output||within(o.output,o.candidate)||within(o.candidate,o.output))throw Error('Refinement requires separate preserved staging directories');
        }
        o.sources=[];
        for(const r of manifest.models){const file=path.resolve(path.dirname(o.baseline),r.file);if((await hashFile(file)).sha256!==r.sha256)throw Error('Baseline changed: '+r.id);o.sources.push({...r,file});}
        o.previousSources=[];
        if(o.previous){const prior=path.resolve(ctx.root,o.previous);for(const r of (await json(prior)).models){const file=path.resolve(path.dirname(prior),r.file);if((await hashFile(file)).sha256!==r.sha256)throw Error('Previous enhanced reference changed: '+r.id);o.previousSources.push({...r,file});}if(o.models.some(id=>!o.previousSources.some(r=>r.id===id)))throw Error('Missing previous enhanced model');}
        o.pack=path.join(o.source,'trees_pbr_pack/trees_pbr_pack');
        o.codeIdentity=digest(await Promise.all((await listFiles(path.join(ctx.root,TOOL))).filter(f=>/\.(py|mjs|json)$/.test(f)).map(async f=>({file:path.basename(f),...await hashFile(f)}))));
        await mkdir(o.output,{recursive:true});
        await writeJson(path.join(o.output,'baseline-preservation.json'),{index:o.baseline,models:o.sources.map(r=>({id:r.id,file:r.file,sha256:r.sha256}))});
        if(o.phase==='materials')await stageMaterials(o);
        if(['materials','structure','build','refine','foliage','posture','inspect','render'].includes(o.phase)){
            const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'1',TBB_NUM_THREADS:'4'};
            const tasks=['build','foliage','posture'].includes(o.phase)?o.models.map(model=>({...o,models:[model]})):[o];
            try{for(const [index,task] of tasks.entries()){const file=path.join(ctx.stage,`enhanced-options-${index}.json`);await writeJson(file,task);await runHeadlessBake(ctx,TOOL+'/run.py',[file]);}}finally{ctx.env=previous;}
        }else{
            const audit=path.join(ctx.stage,'mesh-audit');await mkdir(audit,{recursive:true});const file=path.join(ctx.stage,'mesh-audit-options.json');
            await writeJson(file,{...o,phase:'inspect',candidate:o.output,output:audit});
            const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'1',TBB_NUM_THREADS:'4'};
            try{await runHeadlessBake(ctx,TOOL+'/run.py',[file]);}finally{ctx.env=previous;}
            o.geometryAudit=await json(path.join(audit,'mesh-audit.json'));
            const {validate,gallery}=await import('./review.mjs');await validate(o);if(o.phase==='gallery')await gallery(o);
        }
        await ctx.assertInputsStable();
        if(ctx.publish)await publishMaterials(o);
        return {state:ctx.publish?'published':'validated',directory:o.output,files:await listFiles(o.output)};
    }
};
