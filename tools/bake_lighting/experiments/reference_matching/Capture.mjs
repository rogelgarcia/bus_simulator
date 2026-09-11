// Independent immutable capture iterations; optionally replay original source and bakes.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {writeJson,digest,listFiles} from '../../../baking/Files.mjs';
import {sourceFiles,snapshotFiles,resolvePoses} from '../lighting_configurations/Inputs.mjs';
import {captureBaselines} from '../lighting_configurations/capture_baselines/CaptureBaselines.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {measureGamePerformance} from './Performance.mjs';
import {outputPath} from './Baseline.mjs';
import {candidateInputs} from './CandidateInputs.mjs';
import {lightingTransitions} from './Transitions.mjs';
import {rawRadiance} from './RawRadiance.mjs';
import {uncalibrated55Baseline,assertUncalibrated55} from './Uncalibrated55.mjs';

export async function capture(ctx){
    if(ctx.publish||!ctx.options.output)throw new Error('New capture output required; no publication');
    const runRoot=outputPath(ctx.root,ctx.options.output);await mkdir(path.dirname(runRoot),{recursive:true});await mkdir(runRoot);
    const read=async file=>JSON.parse(await readFile(file,'utf8'));
    let baseline=await read(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/baseline.json'));
    baseline.id=path.basename(runRoot);baseline.expectedSunProfile='ai527.sun.az045.el55';baseline.expectedMode=ctx.options.mode??'current';
    baseline.storage['bus_sim.bakedLighting.v1'].mode=baseline.expectedMode;
    baseline.storage['bus_sim.colorGrading.v1']={preset:'off',intensity:0};
    baseline.storage['bus_sim.sunBloom.v1']={enabled:false};
    baseline.settingsPolicy='AI562 calibrated daylight; one global exposure, ACESFilmic, grade Off; actual applied state asserted.';
    let comparison = null;
    if(ctx.options['uncalibrated-from']) {
        if(ctx.options.replay||ctx.options['candidate-run']||ctx.validatedCandidate||baseline.expectedMode!=='current')
            throw new Error('Uncalibrated 55-degree control requires Current mode and no candidate/replay');
        const original=outputPath(ctx.root,ctx.options['uncalibrated-from']);
        await authenticated(path.join(original,'baseline_receipt.json'));
        const manifest=await read((await read(path.join(original,'manifest.json'))).baselineManifest);
        baseline=uncalibrated55Baseline(baseline,manifest.images[0]);
        comparison={role:'uncalibrated_game_55',original,policy:baseline.settingsPolicy};
    }
    let configurePage=null,resourceOverrides={},source=await snapshotFiles(ctx.root,await sourceFiles(ctx.root)),bakes={files:[]},replay=null;
    if(ctx.options['candidate-run'] || ctx.validatedCandidate){
        if(ctx.options.replay||baseline.expectedMode==='current')throw new Error('Candidate requires Baked/Auto without original-source replay');
        const candidate=ctx.validatedCandidate ?? await candidateInputs(ctx,ctx.options['candidate-run']);configurePage=candidate.configurePage;
        resourceOverrides=candidate.resourceOverrides;
        bakes={files:candidate.files,shadowIndex:candidate.shadowIndex,receiverIndex:candidate.receiverIndex,installation:'isolated index routing; original installed indexes retained'};
    }
    if(ctx.options.replay){
        const directory=outputPath(ctx.root,ctx.options.replay);await authenticated(path.join(directory,'baseline_receipt.json'));
        const original=await read(path.join(directory,'prepared.json'));Object.assign(baseline,original.baseline,{id:path.basename(runRoot),expectedMode:'baked'});
        const frozen=path.join(directory,'frozen'),entries=[...original.source.files,...original.bakes.files],known=new Map(entries.map(v=>[v.file,path.join(frozen,v.file)]));
        configurePage=async(page,origin)=>page.route('**/*',async route=>{
            const url=new URL(route.request().url()),name=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
            if(url.origin===origin&&known.has(name)) {
                const file=path.relative(ctx.root,known.get(name)).replaceAll('\\','/');
                return route.continue({url:new URL('/'+file,origin).href});
            }
            return route.continue();
        });
        replay={original:directory,servedSourceSha256:original.source.sha256,files:entries};
    }
    const prepared={schemaVersion:1,experimentId:'ai562',runId:path.basename(runRoot),runRoot,baseline,
        poses:resolvePoses(await read(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/poses.json'))),
        viewport:ctx.options.quality==='final'?{width:3840,height:2160}:{width:1920,height:1080},
        source:{files:source,sha256:digest(source)},bakes,configuration:[],replay,comparison,
        engineRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:ctx.root,encoding:'utf8'}).trim(),startedAt:new Date().toISOString()};
    await writeJson(path.join(runRoot,'prepared.json'),prepared);
    await captureBaselines(ctx,prepared,{configurePage,resourceOverrides,
        validateEvidence:comparison?record=>assertUncalibrated55(record,baseline):null,
        collectMetrics:async(page,item)=>{
        const performance=await page.evaluate(measureGamePerformance);
        if(!replay && baseline.expectedMode!=='current' && ['pose_02','pose_03'].includes(item.id))
            await rawRadiance(page,path.join(runRoot,'raw-'+item.id));
        return performance;
    },
        afterCaptures:!replay && baseline.expectedMode!=='current'
            ? page=>lightingTransitions(page,path.join(runRoot,'transitions')) : null});
    const manifest=path.join(runRoot,'capture_receipt.json');return resultFiles(await receipt(manifest,ctx.key,{runRoot,replay},await listFiles(runRoot)),manifest);
}
