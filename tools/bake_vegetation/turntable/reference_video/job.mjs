// Authenticates enhanced reference specimens for a separate, resumable presentation video.
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {listFiles,hashFile,writeJson,digest} from '../../../baking/Files.mjs';
import {bakeOption} from '../../../baking/Options.mjs';
import {runHeadlessBake} from '../../../baking/Blender.mjs';

const TOOL='tools/bake_vegetation/turntable/reference_video';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const integer=(min,max)=>value=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Expected integer ${min}–${max}`);return n;};
const inside=(base,file)=>{const r=path.relative(base,file);return r&&!r.startsWith('..')&&!path.isAbsolute(r);};
async function sources(ctx){
    if(!ctx.options.source)throw new Error('An enhanced reference summary is required');
    const index=path.resolve(ctx.root,ctx.options.source),manifest=await json(index);
    const models=manifest.models.filter(row=>row.id.startsWith(ctx.options.species+'/'));
    if(models.length!==3||new Set(models.map(r=>r.id)).size!==3)throw new Error('Expected exactly three mature models for the species');
    return {index,manifest,models:models.sort((a,b)=>a.id.localeCompare(b.id))};
}
export const referenceVideoJob={
    id:'vegetation/reference-video',description:'Enhanced mature reference orbits followed by moving trunk and branchlet close-ups',
    blender:true,always:true,configurationPaths:['executable'],codePaths:[TOOL],
    defaults:{phase:'proof',source:'',species:'london_plane',width:1920,fps:24,seconds:8,'detail-seconds':4,samples:16,threads:2,
        output:'tests/artifacts/screens/vegetation_reference_video/review'},
    options:{phase:bakeOption.choice(['prepare','proof','render','assemble']),source:String,species:bakeOption.choice(['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum']),
        width:integer(640,3840),fps:integer(12,60),seconds:integer(4,30),'detail-seconds':integer(3,20),samples:bakeOption.samples,threads:integer(1,8),output:String},
    async inputs(ctx){
        const {index,models}=await sources(ctx);
        const files=(await listFiles(path.join(ctx.root,'tools/bake_vegetation/turntable'))).filter(f=>!f.includes('__pycache__'));
        for(const folder of ['lod0','enhanced_reference'])files.push(...(await listFiles(path.join(ctx.root,'tools/bake_vegetation',folder))).filter(f=>f.endsWith('.py')));
        files.push(index,path.join(ctx.root,'tools/bake_vegetation',ctx.options.species,'recipe.json'));
        for(const row of models){
            const file=path.resolve(path.dirname(index),row.file),dir=path.dirname(file);
            if(!inside(path.dirname(index),file))throw new Error('Model escaped its source collection');
            files.push(file,path.join(dir,'model.json'),path.join(dir,'architecture.json'));
        }
        return files;
    },
    async run(ctx){
        if(ctx.publish)throw new Error('Presentation videos cannot publish game assets');
        const {index,manifest,models}=await sources(ctx),source=path.dirname(index),output=path.resolve(ctx.root,ctx.options.output);
        if(!inside(path.join(ctx.root,'tests/artifacts/screens'),output)||output===source||inside(source,output)||inside(output,source))throw new Error('Use a separate ignored output directory');
        if(ctx.options.width%16)throw new Error('Video width must be divisible by 16');
        const recipe=await json(path.join(ctx.root,'tools/bake_vegetation',ctx.options.species,'recipe.json'));
        const prepared=[];
        for(const row of models){
            const file=path.resolve(source,row.file),metadata=await json(path.join(path.dirname(file),'model.json'));
            if((await hashFile(file)).sha256!==row.sha256||metadata.sha256!==row.sha256||metadata.id!==row.id||metadata.leafCount!==row.leafCount)throw new Error('Model identity mismatch: '+row.id);
            const audit=manifest.geometryAudit?.models.find(r=>r.id===row.id);
            if(metadata.revision!==row.revision||!manifest.geometryAudit?.passed||!audit?.passed||audit.sha256!==row.sha256)throw new Error('Missing matching accepted geometry provenance');
            if(!/-v\d+$/.test(row.revision))throw new Error('Missing enhanced reference revision label');
            prepared.push({...row,file,metadata,species:ctx.options.species,scientific:recipe.species,commonName:recipe.commonName,enhanced:true});
        }
        const code=await Promise.all((await this.inputs(ctx)).map(async file=>({file:path.relative(ctx.root,file),...await hashFile(file)})));
        const settings={...ctx.options};delete settings.phase;delete settings.output;
        const options={...ctx.options,output,models:prepared,representation:'reference',renderIdentity:digest({code,settings})};
        await mkdir(output,{recursive:true});
        const identityFile=path.join(output,'identity.json');
        try{if((await json(identityFile)).renderIdentity!==options.renderIdentity)throw new Error('Output belongs to a different video recipe; use a new directory');}
        catch(error){if(error.code!=='ENOENT')throw error;await writeJson(identityFile,{renderIdentity:options.renderIdentity,settings,models:prepared.map(({id,sha256,leafCount,revision})=>({id,sha256,leafCount,revision}))});}
        const file=path.join(ctx.stage,'reference-video.json');await writeJson(file,options);
        const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:String(options.threads),TBB_NUM_THREADS:String(options.threads),OPENBLAS_NUM_THREADS:'1'};
        try{await runHeadlessBake(ctx,TOOL+'/run.py',[file]);}finally{ctx.env=previous;}
        if(options.phase==='assemble'){
            const video=await json(path.join(output,'video.json'));
            const revisions=[...new Set(prepared.map(r=>r.revision.split('-').at(-1)))].join(', ');
            await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${recipe.commonName} — reference showcase</title><style>body{background:#182c26;color:#edf2e5;font:18px system-ui;margin:32px auto;max-width:1400px;padding:0 24px}video{width:100%;background:#000}a{color:#cedecc}li{margin:8px 0}</style><h1>${recipe.commonName} · three mature references</h1><p>Full rotations, then trunk and branchlet close-ups. Saved ${revisions} geometry and PBR materials. Eevee · ${video.width}×${video.height} · ${video.fps} fps · ${video.durationSeconds} seconds.</p><video controls preload="metadata" poster="mature_01/full/proof_0001.png" src="showcase.mp4"></video><ol>${video.chapters.map(r=>`<li><a href="showcase.mp4#t=${r.startSeconds}">${r.variant.replace('_',' ')} · ${r.shot.replaceAll('_',' ')} · ${r.startSeconds}s</a></li>`).join('')}</ol></html>`);
        }
        await ctx.assertInputsStable();
        return {state:'validated',directory:output,files:await listFiles(output)};
    }
};
