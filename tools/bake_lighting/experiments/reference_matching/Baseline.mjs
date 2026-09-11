// @ts-check
// Freeze current game/source/package evidence before any calibrated production mutations.
import path from 'node:path';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {writeJson,digest,listFiles} from '../../../baking/Files.mjs';
import {sourceFiles,snapshotFiles,resolvePoses,baselineInputs} from '../lighting_configurations/Inputs.mjs';
import {captureBaselines} from '../lighting_configurations/capture_baselines/CaptureBaselines.mjs';
import {receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {measureGamePerformance} from './Performance.mjs';

export const TARGET='lighting/experiments/reference-matching';
export const TOOL='tools/bake_lighting/experiments/reference_matching';
export const ARTIFACTS='tests/artifacts/screens/ai562_acesfilmic_reference_matching';
export function outputPath(root,input){const base=path.resolve(root,ARTIFACTS),result=path.resolve(root,input),relative=path.relative(base,result);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Use a new named AI562 artifact directory');return result;}
export async function baseline(ctx){
    if(ctx.publish||!ctx.options.output)throw new Error('Baseline requires a new output; no publication');
    const runRoot=outputPath(ctx.root,ctx.options.output);await mkdir(path.dirname(runRoot),{recursive:true});await mkdir(runRoot);
    const read=async file=>JSON.parse(await readFile(path.join(ctx.root,file),'utf8'));
    const config=await read('tools/bake_lighting/experiments/lighting_configurations/config/baseline.json');config.id='000_baseline';config.storage['bus_sim.lighting.v1']={toneMapping:'aces'};config.storage['bus_sim.colorGrading.v1']={preset:'off',intensity:0};
    config.settingsPolicy+=' AI562 initial game, ACESFilmic, grade Off; installed bakes and original bus materials.';
    const source=await snapshotFiles(ctx.root,await sourceFiles(ctx.root)),bakes=await baselineInputs(ctx.root,config);
    const poses=resolvePoses(await read('tools/bake_lighting/experiments/lighting_configurations/config/poses.json'));
    const prepared={schemaVersion:1,experimentId:'ai562',runId:path.basename(runRoot),runRoot,baseline:config,poses,viewport:{width:1920,height:1080},source:{files:source,sha256:digest(source)},bakes,configuration:[],engineRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:ctx.root,encoding:'utf8'}).trim(),startedAt:new Date().toISOString()};
    await writeJson(path.join(runRoot,'prepared.json'),prepared);
    for(const item of [...source,...bakes.files]){const destination=path.join(runRoot,'frozen',item.file);await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.join(ctx.root,item.file),destination);}
    const result=await captureBaselines(ctx,prepared,{collectMetrics:page=>page.evaluate(measureGamePerformance)});
    const manifest=path.join(runRoot,'baseline_receipt.json');return resultFiles(await receipt(manifest,ctx.key,{runRoot},[...result.files,path.join(runRoot,'prepared.json'),...await listFiles(path.join(runRoot,'frozen'))]),manifest);
}
