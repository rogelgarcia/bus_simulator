// Authenticates reviewed trees and prepares calibrated orthographic canopy-layer studies.
import path from 'node:path';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {listFiles,hashFile,writeJson,digest} from '../../baking/Files.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {bakeOption} from '../../baking/Options.mjs';

const TOOL='tools/bake_vegetation/layer_study';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const within=(base,file)=>{const rel=path.relative(base,file);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
async function sources(root){
    const collection=await json(path.join(root,TOOL,'sources.json')),models=[],inputs=[];
    const profiles=await json(path.join(root,'tools/bake_vegetation/enhanced_reference/profiles.json'));
    for(const [species,folder] of Object.entries(collection)){
        const summary=path.join(root,'tests/artifacts/screens/vegetation_enhanced_reference',folder,'summary.json');
        const manifest=await json(summary);inputs.push(summary);
        const rows=manifest.models.filter(row=>row.id.startsWith(species+'/'));
        if(rows.length!==3||!manifest.geometryAudit?.passed)throw Error('Missing accepted species audit: '+species);
        for(const row of rows){
            const file=path.resolve(path.dirname(summary),row.file),meta=path.join(path.dirname(file),'model.json');
            const audit=manifest.geometryAudit.models.find(item=>item.id===row.id);
            if(!within(path.dirname(summary),file)||!audit?.passed||audit.sha256!==row.sha256)throw Error('Invalid source provenance: '+row.id);
            models.push({...row,file,summary:path.relative(root,summary).replaceAll('\\','/'),name:profiles[species].name,botanical:profiles[species].botanical});
            inputs.push(file,meta);
        }
    }
    if(models.length!==15||new Set(models.map(row=>row.id)).size!==15)throw Error('Expected fifteen unique reviewed models');
    return {models,inputs};
}
export const layerStudyJob={
    id:'vegetation/layer-study',description:'Calibrated four-view editor for three canopy layers on all enhanced references',
    blender:true,always:true,configurationPaths:['executable'],codePaths:[TOOL],
    defaults:{phase:'render',models:'all',width:896,samples:16,output:'tests/artifacts/screens/vegetation_layer_study/20261016_layers_v1'},
    options:{phase:bakeOption.choice(['render','page']),models:String,width:Number,samples:bakeOption.samples,output:String},
    async inputs(ctx){
        const {inputs}=await sources(ctx.root);
        const code=[];
        for(const folder of [TOOL,'tools/bake_vegetation/enhanced_reference','tools/bake_vegetation/lod0'])code.push(...(await listFiles(path.join(ctx.root,folder))).filter(f=>/\.(py|mjs|js|json|css|html)$/.test(f)));
        return [...inputs,...code];
    },
    async run(ctx){
        if(ctx.publish)throw Error('Layer studies cannot publish game assets');
        const output=path.resolve(ctx.root,ctx.options.output);
        if(!within(path.join(ctx.root,'tests/artifacts/screens/vegetation_layer_study'),output))throw Error('Use separate layer-study staging');
        if(!Number.isInteger(ctx.options.width)||ctx.options.width<512||ctx.options.width>1600)throw Error('Study width must be 512–1600');
        const {models}=await sources(ctx.root);
        const selected=ctx.options.models==='all'?models:models.filter(m=>ctx.options.models.split(',').includes(m.id));
        if(!selected.length||ctx.options.models!=='all'&&selected.length!==ctx.options.models.split(',').length)throw Error('Unknown model selection');
        for(const model of models)if((await hashFile(model.file)).sha256!==model.sha256)throw Error('Reviewed model changed: '+model.id);
        const renderCode=await hashFile(path.join(ctx.root,TOOL,'render.py'));
        const identity=digest({sources:models.map(({id,sha256})=>({id,sha256})),width:ctx.options.width,samples:ctx.options.samples,renderCode});
        await mkdir(output,{recursive:true});
        try{if((await json(path.join(output,'identity.json'))).identity!==identity)throw Error('Preserve prior study; choose a new output directory');}
        catch(error){if(error.code!=='ENOENT')throw error;await writeJson(path.join(output,'identity.json'),{identity});}
        if(ctx.options.phase==='render'){
            const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'2',TBB_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1'};
            try{for(const [index,model] of selected.entries()){
                const options=path.join(ctx.stage,`model-${index}.json`);
                await writeJson(options,{...ctx.options,root:ctx.root,output,model,identity,engine:'eevee',device:'CPU',threads:2});
                await runHeadlessBake(ctx,TOOL+'/render.py',[options]);
            }}finally{ctx.env=previous;}
        }
        const records=[];
        for(const model of models){
            const file=path.join(output,model.id,'study.json');
            let record;try{record=await json(file);}catch(error){if(error.code==='ENOENT'&&ctx.options.models!=='all')continue;throw error;}
            if(record.source.sha256!==model.sha256||record.identity!==identity||record.views.length!==4)throw Error('Invalid study record: '+model.id);
            for(const frame of record.views){
                const png=path.join(output,frame.file),bytes=await readFile(png);
                if((await hashFile(png)).sha256!==frame.sha256||bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==ctx.options.width||bytes.readUInt32BE(20)!==ctx.options.width)throw Error('Invalid calibrated frame');
            }
            if((await hashFile(path.join(output,record.leafCenters.file))).sha256!==record.leafCenters.sha256)throw Error('Leaf samples changed');
            records.push(record);
        }
        await writeJson(path.join(output,'study.json'),{schemaVersion:1,identity,coordinateSystem:'model-local-z-up',units:'metres',models:records});
        for(const file of ['index.html','study.css','app.js','model.js','views.js'])await copyFile(path.join(ctx.root,TOOL,file),path.join(output,file));
        await ctx.assertInputsStable();
        return {state:'validated',directory:output,files:await listFiles(output)};
    }
};
