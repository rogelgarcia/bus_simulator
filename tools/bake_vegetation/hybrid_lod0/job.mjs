// Stages authenticated three-zone LOD0 canopies from the revised natural references.
import path from 'node:path';
import {readFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {listFiles,hashFile,writeJson,digest} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';

const TOOL='tools/bake_vegetation/hybrid_lod0';
const SPECIES=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];
const ids=SPECIES.flatMap(s=>[1,2,3].map(n=>`${s}/mature_0${n}`));
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const within=(a,b)=>{const r=path.relative(a,b);return r!== '..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};

export const hybridLod0Job={
    id:'vegetation/hybrid-lod0',description:'Detailed silhouette leaves, simple volume leaves and flat interior branchlet cards',
    blender:true,always:true,configurationPaths:['executable','renderDevice','browserExecutable'],codePaths:[TOOL],
    defaults:{phase:'atlas',models:'all',width:1280,samples:16,'card-scale':1.04,'atlas-source':'',
        reference:'tests/artifacts/screens/vegetation_natural_foliage/coverage_20261011/summary.json',
        wood:'tests/artifacts/screens/ai591_core_canopies/final',
        output:'tests/artifacts/screens/vegetation_hybrid_lod0/review'},
    options:{phase:bakeOption.choice(['atlas','build','compress','render','variants','gallery','validate']),models:String,width:Number,samples:bakeOption.samples,reference:String,wood:String,output:String,'card-scale':Number,'atlas-source':String},
    async inputs(ctx){
        const index=path.resolve(ctx.root,ctx.options.reference), manifest=await json(index);
        const selected=ctx.options.models==='all'?ids:ctx.options.models.split(',');
        const files=[index,...(await listFiles(path.join(ctx.root,TOOL))).filter(f=>!f.includes('__pycache__'))];
        for(const folder of ['lod0','natural_foliage','branchlets','authoring','turntable'])files.push(...(await listFiles(path.join(ctx.root,'tools/bake_vegetation',folder))).filter(f=>/\.(py|mjs)$/.test(f)));
        for(const s of SPECIES)files.push(path.join(ctx.root,'tools/bake_vegetation',s,'recipe.json'));
        files.push(path.resolve(ctx.root,ctx.options.wood,'reference.json'),path.join(ctx.root,'assets/public/vegetation_lod0/index.json'));
        for(const id of selected){
            const row=manifest.models.find(r=>r.id===id);if(!row)throw new Error('Unknown reference '+id);
            const file=path.resolve(path.dirname(index),row.file);files.push(file,path.join(path.dirname(file),'shoots.json'));
            for(const name of ['wood.blend','wood.json','model.json','bark_color.png','bark_normal.png','bark_orm.png',id.split('/')[1]+'_lod0.glb'])files.push(path.resolve(ctx.root,ctx.options.wood,id,name));
        }
        if(ctx.options.phase==='compress')for(const file of ['libktx.js','libktx.wasm'])files.push(path.join(ctx.root,'downloads/tools/ktx-4.4.2',file));
        if(ctx.options['atlas-source'])for(const s of new Set(selected.map(id=>id.split('/')[0])))files.push(...(await listFiles(path.resolve(ctx.root,ctx.options['atlas-source'],s,'canopy'))).filter(f=>/\.(png|json|blend)$/.test(f)));
        return files;
    },
    async run(ctx){
        if(ctx.publish)throw new Error('Hybrid LOD0 is a staged review, not a publication job');
        const o={...ctx.options,root:ctx.root,device:'CPU',browserExecutable:ctx.config.browserExecutable};
        for(const key of ['reference','wood','output'])o[key]=path.resolve(ctx.root,o[key]);
        const artifact=path.join(ctx.root,'tests/artifacts/screens');
        if(o.output===artifact||!within(artifact,o.output)||[o.wood,path.dirname(o.reference)].some(p=>within(p,o.output)||within(o.output,p)))throw new Error('Use a separate ignored artifact directory');
        o.models=o.models==='all'?ids:o.models.split(',');
        if(!o.models.length||new Set(o.models).size!==o.models.length||o.models.some(id=>!ids.includes(id)))throw new Error('Invalid model selection');
        if(!Number.isInteger(o.width)||o.width<640||o.width>2560||o.width%4)throw new Error('Invalid review width');
        if(!Number.isFinite(o['card-scale'])||o['card-scale']<.8||o['card-scale']>1.25)throw new Error('Invalid interior card scale');
        const manifest=await json(o.reference), woodReceipt=await json(path.join(o.wood,'reference.json'));
        const installed=await json(path.join(ctx.root,'assets/public/vegetation_lod0/index.json'));
        if(manifest.models.length!==15||manifest.sourceSha256!==woodReceipt.sha256)throw new Error('Reference and wood authorities differ');
        o.sources=[];
        for(const id of o.models){
            const r=manifest.models.find(r=>r.id===id),file=path.resolve(path.dirname(o.reference),r.file);
            if(!r.woodPreserved||!r.leafShellsPreserved||(await hashFile(file)).sha256!==r.sha256)throw new Error('Reference authentication failed: '+id);
            const woodGlb=path.join(o.wood,id,id.split('/')[1]+'_lod0.glb'), accepted=installed.models.find(r=>r.id===id);
            if((await hashFile(woodGlb)).sha256!==accepted.sourceGlb.sha256)throw new Error('Accepted wood package changed: '+id);
            o.sources.push({...r,file,shootFile:path.join(path.dirname(file),'shoots.json')});
        }
        const code=(await listFiles(path.join(ctx.root,TOOL))).filter(f=>/\.(py|mjs)$/.test(f));
        o.codeIdentity=digest(await Promise.all(code.map(async f=>({file:path.basename(f),...await hashFile(f)}))));
        if(o['atlas-source']&&o.phase==='build'){
            const from=path.resolve(ctx.root,o['atlas-source']);
            if(!within(artifact,from)||within(from,o.output)||within(o.output,from))throw new Error('Atlas reuse requires separate artifact directories');
            const copies=[];
            for(const s of new Set(o.models.map(id=>id.split('/')[0]))){
                const base=path.join(from,s,'canopy'),atlas=await json(path.join(base,'atlas.json'));
                if(!atlas.flatAttachments||atlas.tiles.length!==16||!manifest.models.some(r=>r.id.startsWith(s+'/')&&r.sha256===atlas.sourceSha256))throw new Error('Invalid flat atlas authority '+s);
                const to=path.join(o.output,s,'canopy');await mkdir(to,{recursive:true});
                for(const file of (await listFiles(base)).filter(f=>/\.(png|json|blend)$/.test(f))){
                    const target=path.join(to,path.basename(file)),identity=await hashFile(file);
                    if(await stat(target).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;})){
                        if((await hashFile(target)).sha256!==identity.sha256)throw new Error('Existing atlas differs; preserve it');
                    }else await copyFile(file,target);
                    copies.push({species:s,file:path.basename(file),...identity});
                }
            }
            await writeJson(path.join(o.output,'reused-atlases.json'),{source:from,files:copies});
        }
        await mkdir(o.output,{recursive:true});const options=path.join(ctx.stage,'hybrid-options.json');await writeJson(options,o);
        if(o.phase==='compress'){
            const {compressModels}=await import('../lod0/Compress.mjs');await compressModels({...o,placement:'hybrid'});
        }else if(['gallery','validate'].includes(o.phase)){
            const {validate,gallery}=await import('./review.mjs');await validate(o);if(o.phase==='gallery')await gallery(o);
        }else{
            const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'1',TBB_NUM_THREADS:'4'};
            try{await runHeadlessBake(ctx,TOOL+'/run.py',[options]);}finally{ctx.env=previous;}
        }
        await ctx.assertInputsStable();return {state:'validated',directory:o.output,files:await listFiles(o.output)};
    }
};
