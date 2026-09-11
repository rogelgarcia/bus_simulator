// @ts-check
// Authenticated, resumable stages; production publication and hidden input changes fail closed.
import path from 'node:path';
import {readFile,mkdir,copyFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {writeJson,listFiles,hashFile,digest} from '../../../baking/Files.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {verifyFiles,baselineInputs,resolvePoses} from '../lighting_configurations/Inputs.mjs';
import {captureBaselines} from '../lighting_configurations/capture_baselines/CaptureBaselines.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {TOOL,TARGET,ARTIFACTS,outputPath,validateRecipe,assertPromotion} from './Plan.mjs';
import {monitor} from './Monitor.mjs';
import {preserveBaselineAttempt} from './BaselineHistory.mjs';
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const exists=async file=>access(file).then(()=>true,()=>false);
const required={baseline:'validate',prepare:'baseline',calibrate:'prepare',search:'calibrate',render:'search',analyze:'render',review:'analyze'};
async function python(ctx,script,args){await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,script),...args]);}
async function frozen(ctx,request){
    await verifyFiles(ctx.root,request.frozenFiles);
    await verifyFiles(ctx.root,request.prepared.source.files);
    await verifyFiles(ctx.root,request.bakes.files);
}
async function validate(ctx,output){
    if(!ctx.options['material-run'])throw new Error('Specify the accepted AI566 material-run');
    const materialRoot=path.resolve(ctx.root,ctx.options['material-run']);
    for(const stage of ['audit','prepare','capture','render','analyze'])await authenticated(path.join(materialRoot,stage+'_receipt.json'));
    const materialRequest=await read(path.join(materialRoot,'request.json')),materialSummary=await read(path.join(materialRoot,'report/summary.json'));
    const daylightRoot=materialRequest.daylightRoot,daylightRequest=await read(path.join(daylightRoot,'request.json'));
    for(const stage of ['prepare','render','analyze'])await authenticated(path.join(daylightRoot,stage+'_receipt.json'));
    const calibrationRoot=daylightRequest.identity.calibration;
    await authenticated(path.join(calibrationRoot,'analyze_receipt.json'));
    await verifyFiles(ctx.root,materialRequest.prepared.source.files);
    const changes=execFileSync('git',['diff','--name-only',materialRequest.prepared.engineRevision,'--','assets'],{cwd:ctx.root,encoding:'utf8'}).trim();
    if(changes)throw new Error('Re-export changed assets: '+changes);
    if(materialSummary.failed||!materialSummary.passed)throw new Error('Material reference failed');
    const recipe=await read(path.join(ctx.root,TOOL,'defaults.json'));validateRecipe(recipe);
    const poseFile='tools/bake_lighting/experiments/lighting_configurations/config/poses.json';
    const poses=resolvePoses(await read(path.join(ctx.root,poseFile)));
    if(digest(poses)!==digest(materialRequest.prepared.poses))throw new Error('Canonical poses changed; export again');
    const baseline=await read(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/baseline.json'));
    baseline.id='AI567_fresh_installed_bake';baseline.settingsPolicy+=' Display: ACESFilmic, grading Off, exposure retained from repository default.';
    baseline.storage['bus_sim.lighting.v1']={...(baseline.storage['bus_sim.lighting.v1']??{}),toneMapping:'aces'};
    baseline.storage['bus_sim.colorGrading.v1']={preset:'off',intensity:0};
    const bakes=await baselineInputs(ctx.root,baseline);
    const identityFiles=[...await listFiles(path.join(ctx.root,TOOL)),path.join(ctx.root,poseFile),...['blender.py','city_materials.py','profiles.json','export_contract.json'].map(f=>path.join(ctx.root,'tools/bake_lighting/experiments/material_calibration',f)),path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/postprocess/color_pipeline.py'),path.join(ctx.root,'tools/bake_lighting/experiments/physical_calibration/analyze.py'),path.join(materialRoot,'experiment.json'),path.join(materialRoot,'material_city.blend'),path.join(materialRoot,'renders.json'),path.join(daylightRoot,'daylight.json'),daylightRequest.identity.ocioConfig];
    for(const r of daylightRequest.identity.ocioFiles)identityFiles.push(r.file);
    const frozenFiles=await Promise.all([...new Set(identityFiles)].filter(f=>!f.includes('__pycache__')).map(async file=>({file,...await hashFile(file)})));
    const request={schemaVersion:1,output,materialRoot,daylightRoot,calibrationRoot,recipe,baseline,bakes,device:ctx.config.renderDevice,prepared:materialRequest.prepared,sourceScene:materialRequest.sourceScene,daylight:await read(path.join(daylightRoot,'daylight.json')),ocioConfig:daylightRequest.identity.ocioConfig,materialSummary,frozenFiles,startedAt:new Date().toISOString()};
    await writeJson(path.join(output,'request.json'),request);
    await python(ctx,'tools/bake_lighting/experiments/physical_calibration/analyze.py',[calibrationRoot,path.join(output,'checks/physical')]);
    const physical=await read(path.join(output,'checks/physical/summary.json')),contract=await read(path.join(output,'checks/physical/contract.json')),daylight=await read(path.join(daylightRoot,'report/summary.json'));
    if(!contract.analyticalReferenceValid||!contract.displayContractValid||physical.failed||!Object.values(physical.mutationChecks).every(Boolean)||daylight.failed)throw new Error('Independent physical/display/daylight checks failed');
    await writeJson(path.join(output,'validation.json'),{referenceValid:true,identitiesMatch:true,physical:{passed:physical.passed,input:physical.inputChecks,display:physical.displayChecks,negative:physical.mutationChecks},daylight:{passed:daylight.passed,failed:daylight.failed},material:{passed:materialSummary.passed,review:materialSummary.fixtureReviewCount},limitations:contract.limitations,method:'Re-executed independent AI564 equations/input/display checks on authenticated raw native and Cycles data; unchanged transport reused. Does not claim a new measured dataset.'});
    return [path.join(output,'request.json'),path.join(output,'validation.json'),...await listFiles(path.join(output,'checks'))];
}
async function baseline(ctx,output,r){
    await preserveBaselineAttempt(ctx.root,output);
    const prepared={...r.prepared,runRoot:output,runId:path.basename(output),baseline:r.baseline,bakes:r.bakes,viewport:{width:r.recipe.width,height:r.recipe.height},configuration:[],startedAt:new Date().toISOString()};
    const result=await captureBaselines(ctx,prepared);await writeJson(path.join(output,'baseline.json'),{file:result.manifest,...await hashFile(result.manifest)});
    const captured=await read(result.manifest);
    for(const image of captured.images)if(image.lighting.toneMapping!=='aces'||image.graphics.colorGrading.preset!=='off')throw new Error('Fresh baseline display is not ACESFilmic/Off');
    return [...result.files,path.join(output,'baseline.json')];
}
async function blender(ctx,output,stage){
    if(ctx.options.mode!=='background')await ctx.process('powershell.exe',['-NoProfile','-Command',"if (@(Get-Process -Name blender -ErrorAction SilentlyContinue).Count) { Write-Error 'Blender occupied; preserve it and select isolated background mode when safe.'; exit 1 }"]);
    await runBlenderStage(ctx,TOOL+'/blender.py',[output,stage],{background:ctx.options.mode==='background'});
}
async function prepare(ctx,output,r){
    await copyFile(path.join(r.materialRoot,'material_city.blend'),path.join(output,'calibration_city.blend'));
    await blender(ctx,output,'prepare');
    return [path.join(output,'calibration_city.blend'),path.join(output,'scene.json')];
}
async function calibrate(ctx,output,r){
    const records=(await read(path.join(r.materialRoot,'renders.json'))).filter(x=>x.kind==='city');
    const ids=new Set();for(const item of records){
        if(ids.has(item.id)||(await hashFile(item.file)).sha256!==item.sha256)throw new Error('Duplicate/changed candidate radiance');ids.add(item.id);
        const sig=item.signature;
        if(sig.cityScene!==(await hashFile(path.join(output,'calibration_city.blend'))).sha256)throw new Error('Cached material transport scene mismatch');
    }
    if(records.length!==30)throw new Error('Require 3 daylights × 2 materials × all 5 poses');
    await writeJson(path.join(output,'radiance.json'),{records,reuse:'Exact authenticated full Cycles renders with frozen geometry/material/daylight. No light-group recombination performed.',source:await hashFile(path.join(output,'calibration_city.blend'))});
    await python(ctx,TOOL+'/evaluate.py',[output,'calibrate']);
    return [path.join(output,'radiance.json'),path.join(output,'calibration_checks.json')];
}
async function search(ctx,output){await python(ctx,TOOL+'/evaluate.py',[output,'search']);return [path.join(output,'search.json'),...await listFiles(path.join(output,'iterations'))];}
async function render(ctx,output){await blender(ctx,output,'render');return [path.join(output,'final_renders.json'),...await listFiles(path.join(output,'final_renders'))];}
async function analyze(ctx,output){
    await python(ctx,TOOL+'/evaluate.py',[output,'analyze']);
    const profile=await read(path.join(output,'profile.json'));
    for(const c of profile.selected)if(c.promotion==='validated-lab-candidate')assertPromotion(c.evidence);
    return [path.join(output,'profile.json'),path.join(output,'final_checks.json'),...await listFiles(path.join(output,'final_images'))];
}
async function review(ctx,output){await python(ctx,TOOL+'/review.py',[output]);return await listFiles(path.join(output,'report'));}
const actions={validate,baseline,prepare,calibrate,search,render,analyze,review};
export async function stage(ctx,name){
    if(ctx.publish)throw new Error('Calibration never publishes production assets');
    const output=outputPath(ctx.root,ctx.options.output??`${ARTIFACTS}/runs/${Date.now()}`);await mkdir(output,{recursive:true});
    const file=path.join(output,name+'_receipt.json');
    let request=null;
    if(await exists(path.join(output,'request.json'))){request=await read(path.join(output,'request.json'));await frozen(ctx,request);}
    if(await exists(file)){const old=await authenticated(file);ctx.log.line(ctx.id,'Authenticated completed '+name+' reused');return {...resultFiles(old,file),output};}
    if(required[name])await authenticated(path.join(output,required[name]+'_receipt.json'));
    if(name==='validate'&&request)throw new Error('Interrupted prerequisite acquisition: preserve this run and choose another output');
    const started=Date.now(),stop=await monitor();let state='failed',message=null,files;
    try{files=await actions[name](ctx,output,request);state='validated';}
    catch(e){message=e.message;throw e;}
    finally{
        const resources=await stop(),attempt=path.join(output,'attempts',name+'-'+started+'.json');
        await writeJson(attempt,{stage:name,state,message,seconds:(Date.now()-started)/1000,resources});
        if(state==='validated'){files.push(attempt);const rec=await receipt(file,ctx.key,{output,stage:name},files);ctx.log.line(ctx.id,name+' completed in '+((Date.now()-started)/1000).toFixed(1)+'s');}
    }
    const result=await authenticated(file);return {...resultFiles(result,file),output};
}
export async function execute(ctx){
    const output=outputPath(ctx.root,ctx.options.output??`${ARTIFACTS}/runs/${Date.now()}`),start=Date.now();let result;
    for(const name of Object.keys(actions))result=await stage({...ctx,options:{...ctx.options,output}},name);
    await writeJson(path.join(output,'execution.json'),{seconds:(Date.now()-start)/1000,completedAt:new Date().toISOString(),publication:'experiment-only'});
    return result;
}
