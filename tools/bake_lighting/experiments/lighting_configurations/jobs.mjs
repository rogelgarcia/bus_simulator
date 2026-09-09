// Diagnostic preparation and game capture are deliberately outside production baking.
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeJson, digest } from '../../../baking/Files.mjs';
import { EXPERIMENT, TOOL, ARTIFACTS, readJson, resolvePoses, snapshotFiles, baselineInputs, sourceFiles, verifyFiles } from './Inputs.mjs';
import { loadRun,stageOptions } from './StageInputs.mjs';
import { exportCity } from './export_city/ExportCity.mjs';
import { renderComparisons } from './render/Render.mjs';
import { processStage } from './Processing.mjs';
import { bakeOption } from '../../../baking/Options.mjs';
import { captureOrReuse } from './Workflow.mjs';
import { reportComparisons } from './report/Report.mjs';
import {verifyScene} from './verify_scene/VerifyScene.mjs';
import {captureDisplayVariants} from './capture_display_variants/CaptureDisplayVariants.mjs';

const configFiles=['source_poses.json','poses.json','baseline.json'];
const prepare={
    id:`${EXPERIMENT}/prepare`,always:true,configurationPaths:[],
    description:'Validate tracked poses and snapshot existing bake identities; no browser or Blender',
    outputs:['illumination_560/prepared'],
    defaults:{resolution:'1080p'},options:{run:String,resolution:value=>{if(!['1080p','4k'].includes(value))throw new Error('resolution must be 1080p or 4k');return value;}},
    inputs:ctx=>configFiles.map(file=>path.join(ctx.root,TOOL,'config',file)),
    async run(ctx) {
        if(ctx.publish) throw new Error('Lighting experiments never publish; remove --publish');
        if(ctx.options.run){const saved=await loadRun(ctx);const prepared=path.join(saved.runRoot,'inputs/prepared.json');return {state:'validated',prepared,files:[prepared]};}
        const started=Date.now(),runId=`run-${started}-${randomUUID().slice(0,8)}`;
        const runRoot=path.join(ctx.root,ARTIFACTS,'runs',runId);
        const inputs=await readJson(path.join(ctx.root,TOOL,'config/poses.json'));
        const baseline=await readJson(path.join(ctx.root,TOOL,'config/baseline.json'));
        const poses=resolvePoses(inputs),viewport=ctx.options.resolution==='4k'?inputs.finalViewport:inputs.comparisonViewport;
        const bakes=await baselineInputs(ctx.root,baseline);
        const source=await snapshotFiles(ctx.root,await sourceFiles(ctx.root));
        const configuration=await snapshotFiles(ctx.root,configFiles.map(file=>path.join(ctx.root,TOOL,'config',file)));
        const manifest={schemaVersion:1,experimentId:'illumination_560',runId,runRoot,
            status:'prepared',startedAt:new Date(started).toISOString(),engineRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:ctx.root,encoding:'utf8'}).trim(),
            scope:'AI 560 comparison experiment; immutable source and poses, independent diagnostic stages',baseline,viewport,poses,sharedBusReason:inputs.sharedBusReason,
            bakes,source:{sha256:digest(source),files:source},configuration,
            livePlacementValidation:'pending capture',preparationSeconds:(Date.now()-started)/1000};
        const prepared=path.join(runRoot,'inputs/prepared.json');
        await writeJson(prepared,manifest);
        await writeJson(path.join(runRoot,'inputs/poses.json'),inputs);
        await writeJson(path.join(runRoot,'inputs/baseline.json'),baseline);
        await writeJson(path.join(runRoot,'manifest.json'),manifest);
        ctx.log.line(ctx.id,`Prepared five cameras and four bus placements: ${prepared}`);
        return {state:'validated',prepared,files:[prepared,path.join(runRoot,'inputs/poses.json'),path.join(runRoot,'inputs/baseline.json')]};
    }
};
const capture={
    id:`${EXPERIMENT}/capture-baselines`,dependencies:[prepare.id],always:true,configurationPaths:['browserExecutable'],
    description:'Capture five G00 game images using installed baked data, record actual poses and timing',
    outputs:['illumination_560/baselines'],
    options:{quality:stageOptions.quality},
    async run(ctx) {
        const prepared=await readJson(ctx.result(prepare.id).prepared);
        await verifyFiles(ctx.root,[...prepared.bakes.files,...prepared.configuration]);
        return captureOrReuse(ctx,prepared,ctx.options.quality??(prepared.viewport.width===3840?'final':'pilot'));
    }
};
const exporter={id:`${EXPERIMENT}/export-city`,always:true,blender:true,configurationPaths:['executable','browserExecutable'],
    codePaths:[`${TOOL}/export_city`,`${TOOL}/Inputs.mjs`,`${TOOL}/StageInputs.mjs`,`${TOOL}/capture_baselines`],
    description:'Export the actual city and four stored bus placements to a reusable Blender project',
    options:{run:String,source:String},async run(ctx){
        if(ctx.publish)throw new Error('Experiments never publish');
        let run;
        if(ctx.options.run)run=await loadRun(ctx);
        else {const result=await prepare.run({...ctx,options:{resolution:'1080p'}});run=await readJson(result.prepared);}
        return exportCity(ctx,run);
    }};
const render={id:`${EXPERIMENT}/render`,always:true,blender:true,configurationPaths:['executable'],
    codePaths:[`${TOOL}/render`,`${TOOL}/Inputs.mjs`,`${TOOL}/StageInputs.mjs`],
    options:{...stageOptions,scene:String,samples:bakeOption.samples,device:bakeOption.device,resolution:String,diagnostic:String,'time-limit':Number},
    description:'Render Cycles comparisons from an existing saved city; resume authenticated images',
    async run(ctx){return renderComparisons(ctx,await loadRun(ctx));}};
const processing=['postprocess','analyze'].map(stage=>({id:`${EXPERIMENT}/${stage}`,always:true,configurationPaths:['pythonExecutable'],
    codePaths:[`${TOOL}/${stage}`,`${TOOL}/postprocess`,`${TOOL}/Processing.mjs`,`${TOOL}/ImageHandoff.mjs`,`${TOOL}/StageInputs.mjs`],
    options:{run:String,quality:stageOptions.quality,renders:String,...(stage==='analyze'?{processed:String}:{})},description:`${stage} saved comparisons without starting the game or Blender`,
    async run(ctx){return processStage(ctx,await loadRun(ctx),stage);}}));
const report={id:`${EXPERIMENT}/report`,always:true,configurationPaths:['browserExecutable'],options:{run:String},
    codePaths:[`${TOOL}/report`,`${TOOL}/StageInputs.mjs`],description:'Group saved images by pose in contact sheets and an offline comparison gallery',
    async run(ctx){return reportComparisons(ctx,await loadRun(ctx));}};
const verification={id:`${EXPERIMENT}/verify-scene`,always:true,blender:true,configurationPaths:['executable'],options:{run:String},
    codePaths:[`${TOOL}/verify_scene`,`${TOOL}/StageInputs.mjs`],description:'Verify evaluated camera and bus transforms in each saved view layer',async run(ctx){return verifyScene(ctx,await loadRun(ctx));}};
const displayCapture={id:`${EXPERIMENT}/capture-display-variants`,always:true,configurationPaths:['browserExecutable'],options:{run:String},
    codePaths:[`${TOOL}/capture_display_variants`,`${TOOL}/capture_baselines`,`${TOOL}/StageInputs.mjs`],description:'Capture native game tone-mapping and grading variants with installed bakes',async run(ctx){return captureDisplayVariants(ctx,await loadRun(ctx));}};
const workflow=[];
function step(name,base,action){const id=`${EXPERIMENT}/workflow/${name}`,dependency=workflow.at(-1)?.id??capture.id;
    workflow.push({...base,id,dependencies:[dependency],children:undefined,outputs:undefined,async run(ctx){const run=await readJson(ctx.result(prepare.id).prepared);return action(ctx,run);}});}
step('export-city',exporter,exportCity);
step('verify-scene',verification,verifyScene);
step('render-pilot',render,(ctx,run)=>renderComparisons({...ctx,options:{...ctx.options,quality:'pilot',diagnostic:'true'}},run));
step('postprocess-pilot',processing[0],(ctx,run)=>processStage({...ctx,options:{...ctx.options,quality:'pilot'}},run,'postprocess'));
step('analyze-pilot',processing[1],(ctx,run)=>processStage({...ctx,options:{...ctx.options,quality:'pilot'}},run,'analyze'));
step('capture-final',capture,(ctx,run)=>captureOrReuse(ctx,run,'final'));
step('render-final',render,(ctx,run)=>renderComparisons({...ctx,options:{...ctx.options,quality:'final'}},run));
step('postprocess-final',processing[0],(ctx,run)=>processStage({...ctx,options:{...ctx.options,quality:'final'}},run,'postprocess'));
step('analyze-final',processing[1],(ctx,run)=>processStage({...ctx,options:{...ctx.options,quality:'final'}},run,'analyze'));
step('capture-display-variants',displayCapture,captureDisplayVariants);
step('report',report,reportComparisons);
const reviewSteps=[];
for(const [name,base,action]of [['verify-scene',verification,verifyScene],['capture-display-variants',displayCapture,captureDisplayVariants],
    ...['pilot','final'].map(quality=>[`postprocess-${quality}`,processing[0],(ctx,run)=>processStage({...ctx,options:{...ctx.options,quality}},run,'postprocess')]),
    ...['pilot','final'].map(quality=>[`analyze-${quality}`,processing[1],(ctx,run)=>processStage({...ctx,options:{...ctx.options,quality}},run,'analyze')]),['report',report,reportComparisons]]){
    reviewSteps.push({...base,id:`${EXPERIMENT}/review/${name}`,dependencies:reviewSteps.length?[reviewSteps.at(-1).id]:[],async run(ctx){return action(ctx,await loadRun(ctx));}});
}
export const lightingExperimentJobs=[prepare,capture,exporter,render,...processing,report,verification,displayCapture,...workflow,...reviewSteps,{
    id:`${EXPERIMENT}/review`,children:[reviewSteps.at(-1).id],configurationPaths:[],description:'Refresh native references, display variants and comparison pages from completed EXRs; no ray tracing'
},{
    id:EXPERIMENT,children:[workflow.at(-1).id],configurationPaths:[],
    description:'AI 560: game baselines, city export, six-light pilots, display variants, analysis, 4K shortlist and pose-first gallery'
}];
