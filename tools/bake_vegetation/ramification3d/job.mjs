// Stages authenticated shared-grammar graphs, saved meshes and EEVEE reviews without publication.
import path from 'node:path';
import {mkdir,readFile,writeFile,copyFile,stat,cp} from 'node:fs/promises';
import {listFiles,hashFile,writeJson} from '../../baking/Files.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {withBakeBrowser} from '../../baking/Browser.mjs';
import {readStudies,within} from '../branching_study/references.mjs';
import {generate3D,planarFixture,presets} from '../branching_study/model3d.mjs';
import {species} from '../branching_study/species.mjs';
import {createReview} from './review.mjs';
import {preview} from './preview.mjs';
import {orthogonalizeTangents,auditTangentFrames} from './export_pbr.mjs';
import {refreshExports,verifyExportPreservation} from './export_review.mjs';
const TOOL='tools/bake_vegetation/ramification3d',CORE='tools/bake_vegetation/branching_study';
const ARTIFACT='tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification';
const VIEWS=['front','side','oblique','rear_oblique','levels','tier_0','tier_1','tier_3','subtree','subtree_side','major_fork','isolated_fork','roots_full','soil_surface'];
const SURFACE_VIEWS=[...VIEWS,'roots_side','roots_top','root_collar','bark_detail'];
const STEM_VIEWS=['trunk_front','trunk_side','trunk_oblique'];
const COLLAR_VIEWS=['collar_front','collar_side','collar_neutral_front','collar_neutral_side','collar_neutral_oblique'];
const expectedViews=(model,finished)=>[...(finished?SURFACE_VIEWS:VIEWS),...(model.metadata.stemReview?STEM_VIEWS:[]),...(finished&&model.metadata.rootIntegrationReview?COLLAR_VIEWS:[])];
const MATERIAL_FILES=['material.json','basecolor.png','normal_opengl.png','normal_directx.png','roughness.png','ao.png','metallic.png','orm.png','height_16bit.png'];
const json=async file=>JSON.parse(await readFile(file,'utf8'));
export const ramification3DJob={
    id:'vegetation/ramification-3d',description:'Shared branching grammar in 3D with saved-mesh and multi-view leafless review',
    blender:true,always:true,configurationPaths:['executable','browserExecutable'],codePaths:[TOOL,CORE],
    defaults:{phase:'full',source:'',species:'all',seeds:'1,31,92',width:1400,samples:16,output:ARTIFACT+'/review',
        studies:'tests/artifacts/screens/vegetation_branching_study/20261016_photorealistic_references/references/manifest.json',
        'complete-studies':'tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/inputs/complete-studies.json'},
    options:{phase:String,source:String,species:String,seeds:String,width:Number,samples:Number,output:String,studies:String,'complete-studies':String},
    async inputs(ctx){
        const refs=[...await readStudies(ctx.root,ctx.options.studies),...await readStudies(ctx.root,ctx.options['complete-studies'])];
        const code=[];
        code.push(...['Accessors.mjs','Validate.mjs'].map(file=>path.join(ctx.root,'tools/bake_vegetation',file)));
        for(const folder of [TOOL,CORE,'tools/bake_vegetation/enhanced_reference','tools/bake_vegetation/authoring','tools/bake_vegetation/lod0'])code.push(...(await listFiles(path.join(ctx.root,folder))).filter(f=>/\.(py|mjs|json|css)$/.test(f)));
        const source=['review','finish','export'].includes(ctx.options.phase)?path.resolve(ctx.root,ctx.options.source):null;
        if(source&&!within(path.join(ctx.root,ARTIFACT),source))throw Error('Review source must be a prompt-650 revision');
        const materials=['finish','export'].includes(ctx.options.phase)?Object.keys(species).flatMap(id=>MATERIAL_FILES.map(file=>path.join(ctx.root,'assets/public/pbr/tree_ai_'+id+'_bark',file))):[];
        return [...code,...materials,...refs.map(r=>r.file),...['studies','complete-studies'].map(k=>path.resolve(ctx.root,ctx.options[k])),...source?await listFiles(source):[]];
    },
    async run(ctx){
        if(ctx.publish)throw Error('Ramification review cannot publish assets');
        if(!['full','preview','review','finish','export'].includes(ctx.options.phase))throw Error('Use full, preview, review, finish or export phase');
        const finished=ctx.options.phase==='finish';
        const output=path.resolve(ctx.root,ctx.options.output);
        if(!within(path.join(ctx.root,ARTIFACT),output))throw Error('Use a new prompt-650 revision directory');
        if(await stat(output).catch(e=>{if(e.code!=='ENOENT')throw e;return null;}))throw Error('Preserve earlier outputs; choose a new revision directory');
        const ids=ctx.options.species==='all'?Object.keys(species):ctx.options.species.split(','),seeds=ctx.options.seeds.split(',').map(Number);
        if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!species[id])||!seeds.length||new Set(seeds).size!==seeds.length||seeds.some(s=>![1,31,92].includes(s)))throw Error('Use known species and validation seeds 1,31,92');
        if(!Number.isInteger(ctx.options.width)||ctx.options.width<640||ctx.options.width>2400||!Number.isInteger(ctx.options.samples)||ctx.options.samples<8||ctx.options.samples>64)throw Error('Review width 640–2400 and samples 8–64 required');
        let sourceReview=null;
        if(['review','finish','export'].includes(ctx.options.phase)){
            const source=path.resolve(ctx.root,ctx.options.source);
            await ramification3DJob.validate({directory:source});
            const manifest=await json(path.join(source,'manifest.json'));
            if(manifest.format!=='shared-ramification-3d-review')throw Error('Review requires saved 3D models');
            if(finished&&manifest.surfaceFinish)throw Error('Finish requires an original neutral review');
            sourceReview={directory:source,manifestSha256:(await hashFile(path.join(source,'manifest.json'))).sha256};
            if(ctx.options.phase==='export'){
                if(ctx.options.species!=='all'||ctx.options.seeds!=='1,31,92')throw Error('Export repair preserves the whole collection; use default species/seeds');
                return refreshExports(ctx,output,source);
            }
        }
        await mkdir(path.join(output,'references'),{recursive:true});
        const references=[];
        for(const key of ['complete-studies','studies'])for(const row of await readStudies(ctx.root,ctx.options[key])){
            const file=`references/${row.id}-${key}${row.extension}`;await copyFile(row.file,path.join(output,file));
            if((await hashFile(path.join(output,file))).sha256!==row.sha256)throw Error('Reference changed');
            references.push({...row,source:row.file,file,collection:key});
        }
        if(ctx.options.phase==='preview')return preview(ctx,output,ids,seeds,references);
        const materials=[];
        if(finished)for(const id of ids){
            const directory=path.join(output,'materials',id);await mkdir(directory,{recursive:true});
            for(const file of MATERIAL_FILES){
                const source=path.join(ctx.root,'assets/public/pbr/tree_ai_'+id+'_bark',file);await copyFile(source,path.join(directory,file));
                const identity=await hashFile(source);
                if((await hashFile(path.join(directory,file))).sha256!==identity.sha256)throw Error('Material copy changed');
                materials.push({species:id,source,file:`materials/${id}/${file}`,...identity});
            }
        }
        const models=[];const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1',TBB_NUM_THREADS:'2'};
        try{for(const id of ids){
            for(const seed of seeds){
                const folder=path.join(output,id,'seed-'+seed),graph=generate3D({...presets[id],seed});
                if(!graph.audit.passed||graph.stopped.budget||graph.roots.stopped.budget)throw Error('Graph failed or omitted a budget: '+id+'/'+seed);
                await mkdir(folder,{recursive:true});await writeJson(path.join(folder,'graph.json'),graph);
                if(sourceReview){
                    const source=path.join(sourceReview.directory,id,'seed-'+seed);
                    if(JSON.stringify(await json(path.join(source,'graph.json')))!==JSON.stringify(graph))throw Error('Source graph differs; use a full bake');
                    await cp(source,folder,{recursive:true,errorOnExist:false});
                }
                await writeJson(path.join(folder,'configuration.json'),{settings:graph.settings,spatial:graph.spatial});
                if(seed===seeds[0])await writeJson(path.join(output,id,'planar-compatibility.json'),planarFixture({...presets[id],seed}));
                const options=path.join(ctx.stage,'specimen.json');await writeJson(options,{folder,width:ctx.options.width,samples:ctx.options.samples,materials:path.join(output,'materials',id)});
                await runHeadlessBake(ctx,TOOL+(finished?'/finish_saved.py':sourceReview?'/review_saved.py':'/run.py'),[options]);
                const model=await json(path.join(folder,'model.json'));
                if(finished){
                    const file=path.join(folder,'tree.glb'),bytes=await readFile(file);model.surfaceFinish.exportTangents=orthogonalizeTangents(bytes);
                    model.surfaceFinish.exportTangents.frames=auditTangentFrames(bytes);
                    await writeFile(file,bytes);await writeJson(path.join(folder,'model.json'),model);
                }
                if(!model.meshAudit.passed||JSON.stringify(model.views.map(v=>v.view))!==JSON.stringify(expectedViews(model,finished)))throw Error('Incomplete saved geometry review');
                models.push({...model,directory:`${id}/seed-${seed}`});
            }
        }}finally{ctx.env=previous;}
        await copyFile(path.join(ctx.root,TOOL,'review.css'),path.join(output,'review.css'));
        await writeFile(path.join(output,'index.html'),createReview(models,references));
        const browser=await withBakeBrowser(ctx,{width:1920,height:1080},async(page,url,version)=>{
            const errors=[];page.on('pageerror',e=>errors.push(e.message));
            await page.goto(url+'/'+path.relative(ctx.root,output).split(path.sep).join('/')+'/index.html');
            await page.locator('img').evaluateAll(async images=>{for(const img of images)await img.decode();});
            for(const id of ids)await page.locator('#'+id).screenshot({path:path.join(output,id,'comparison.png')});
            for(const id of ids)for(let i=0;i<seeds.length;i++){
                const article=page.locator('#'+id+' article').nth(i),folder=path.join(output,id,'seed-'+seeds[i]);
                await article.locator(':scope > .views').first().screenshot({path:path.join(folder,'views.png')});
                if(finished)await article.locator(':scope > .surfaces').screenshot({path:path.join(folder,'surfaces.png')});
                if(models.find(m=>m.species===id&&m.seed===seeds[i]).metadata.stemReview)await article.locator(':scope > .stems').screenshot({path:path.join(folder,'stems.png')});
                if(models.find(m=>m.species===id&&m.seed===seeds[i]).metadata.rootIntegrationReview)await article.locator(':scope > .collars').screenshot({path:path.join(folder,'collars.png')});
                await article.locator('details').evaluate(element=>element.open=true);
                await article.locator('details').screenshot({path:path.join(folder,'diagnostics.png')});
                await article.locator('details').evaluate(element=>element.open=false);
            }
            if(errors.length)throw Error(errors.join('; '));return {version,errors};
        });
        const files=[];for(const file of await listFiles(output))files.push({file:path.relative(output,file).split(path.sep).join('/'),...await hashFile(file)});
        await writeJson(path.join(output,'manifest.json'),{format:'shared-ramification-3d-review',version:1,codeIdentity:ctx.key,complete:ids.length===5&&seeds.length===3,
            references,models,browser,files,sourceReview,surfaceFinish:finished,materials,limitations:['Artistic architecture, not measured botanical statistics','Interpenetrating fine twig tubes are not a globally watertight union','Root extent is a geometric estimate, not an excavation reconstruction','Retained AI-authored PBR data maps are inferred, not measured']});
        await ctx.assertInputsStable();return {state:'validated',directory:output,files:await listFiles(output)};
    },
    async validate(result){
        const manifest=await json(path.join(result.directory,'manifest.json'));
        for(const model of manifest.models){
            if(manifest.format==='shared-ramification-3d-preview'){if(!model.audit.passed||model.stopped.budget)throw Error('Invalid spatial preview');continue;}
            if(!model.graphAudit.passed||!model.meshAudit.passed||JSON.stringify(model.views.map(v=>v.view))!==JSON.stringify(expectedViews(model,manifest.surfaceFinish)))throw Error('Invalid specimen review');
            if(model.metadata.stemReview&&model.views.filter(v=>STEM_VIEWS.includes(v.view)).some(v=>!v.neutralStem))throw Error('Stem inspection must use neutral material');
            if(model.metadata.rootIntegrationReview&&model.views.filter(v=>v.view.startsWith('collar_neutral_')).some(v=>!v.neutralCollar))throw Error('Collar inspection must use neutral material');
            if(manifest.sourceReview&&!manifest.surfaceFinish){
                if(!model.diagnosticRefresh?.visibleGeometryUnchanged||JSON.stringify(model.diagnosticRefresh.rerenderedViews)!==JSON.stringify(['major_fork','isolated_fork']))throw Error('Invalid diagnostic refresh');
                for(const file of ['tree.glb',...expectedViews(model,false).filter(v=>!['major_fork','isolated_fork'].includes(v)).map(v=>v+'.png')]){
                    const original=await hashFile(path.join(manifest.sourceReview.directory,model.directory,file));
                    if((await hashFile(path.join(result.directory,model.directory,file))).sha256!==original.sha256)throw Error('Refresh changed preserved output: '+file);
                }
            }
            if((await hashFile(path.join(result.directory,model.directory,'tree.blend'))).sha256!==model.sourceSha256)throw Error('Saved model changed');
            for(const view of model.views){
                const data=await readFile(path.join(result.directory,model.directory,view.file));
                if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||data.readUInt32BE(16)!==view.width||data.readUInt32BE(20)!==view.height||view.engine!=='BLENDER_EEVEE'||!view.intentionalCrop&&view.maximumFrameFraction>=.99)throw Error('Invalid rendered view: '+view.file);
            }
            const glb=await readFile(path.join(result.directory,model.directory,'tree.glb'));
            if(glb.toString('utf8',0,4)!=='glTF'||glb.readUInt32LE(4)!==2||glb.readUInt32LE(8)!==glb.length)throw Error('Invalid GLB');
            const scene=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
            if(scene.meshes.length!==3||scene.nodes.some(n=>n.name?.startsWith('Diagnostic')))throw Error('GLB must contain only wood and roots');
            if(manifest.surfaceFinish){
                if(!model.surfaceFinish?.shootGeometryUnchanged||!model.meshAudit.materials?.passed||!model.meshAudit.roots?.passed)throw Error('Invalid root/PBR finish');
                if((await hashFile(path.join(manifest.sourceReview.directory,model.directory,'graph.json'))).sha256!==(await hashFile(path.join(result.directory,model.directory,'graph.json'))).sha256)throw Error('Finish changed shared graph');
                if(scene.meshes.some(mesh=>mesh.primitives.some(p=>p.attributes.TEXCOORD_0===undefined||p.attributes.TANGENT===undefined)))throw Error('GLB lacks UVs or tangents');
                if(model.surfaceFinish.exportTangents?.frames)auditTangentFrames(glb);
                if(!scene.images?.length||scene.images.some(i=>i.bufferView===undefined||i.uri))throw Error('GLB textures must be embedded');
                for(const material of scene.materials){
                    const pbr=material.pbrMetallicRoughness;
                    if(!pbr?.baseColorTexture||!pbr.metallicRoughnessTexture||!material.normalTexture||!material.occlusionTexture)throw Error('GLB lost a PBR channel');
                }
            }
        }
        if(manifest.exportSourceReview)await verifyExportPreservation(result.directory,manifest);
        for(const row of manifest.files)if((await hashFile(path.join(result.directory,row.file))).sha256!==row.sha256)throw Error('Review output changed: '+row.file);
    }
};
