// Compares complete receiver candidates in balanced, fresh sequential game browsers.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {captureBaselines} from '../lighting_configurations/capture_baselines/CaptureBaselines.mjs';
import {readGameEvidence} from '../lighting_configurations/capture_baselines/GameEvidence.mjs';
import {sourceFiles,snapshotFiles} from '../lighting_configurations/Inputs.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {collectShadowFrameSamples,summarizeShadowFrames,comparableShadowSettings} from '../../shadows/streamed/FrameSamples.mjs';
import {candidateInputs} from './CandidateInputs.mjs';
import {waitForShadowTiles} from './CaptureReadiness.mjs';
import {writeJson,listFiles,digest} from '../../../baking/Files.mjs';
import {outputPath} from './Baseline.mjs';

const read=async f=>JSON.parse(await readFile(f,'utf8'));
export async function bakePerformance(ctx){
    if(ctx.publish||!['capture','previous-run','candidate-run','shadow-run','output'].every(k=>ctx.options[k]))
        throw new Error('capture, previous-run, candidate-run, shadow-run and new output required; no publication');
    const input=outputPath(ctx.root,ctx.options.capture);
    await authenticated(path.join(input,'capture_receipt.json'));
    const original=await read(path.join(input,'prepared.json'));
    const candidates={before:await candidateInputs(ctx,ctx.options['previous-run']),after:await candidateInputs(ctx,ctx.options['candidate-run'])};
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(output);
    const files=await snapshotFiles(ctx.root,await sourceFiles(ctx.root)), runs=[];
    const allocations={};
    for(const [variant,candidate] of Object.entries(candidates)){
        const index=await read(candidate.receiverIndex),mapping=index.mapping;
        const atlasBytes=mapping.pageCount*Array.from({length:mapping.profile.mipLevels},(_,m)=>(mapping.profile.pageSize>>m)**2*4).reduce((a,b)=>a+b,0);
        allocations[variant]={pages:mapping.pageCount,atlasBytes,coordinateBytes:mapping.tableWidth*mapping.tableHeight*16,
            profile:mapping.profile,storage:await read(path.join(path.dirname(candidate.receiverIndex),'metrics.json'))};
    }
    for(let repeat=0;repeat<3;repeat++)for(const variant of repeat%2?['after','before']:['before','after']){
        const candidate=candidates[variant],runRoot=path.join(output,`${variant}-${repeat+1}`);await mkdir(runRoot);
        const baseline=structuredClone(original.baseline);baseline.id=path.basename(runRoot);baseline.expectedMode='baked';
        baseline.storage['bus_sim.bakedLighting.v1'].mode='baked';
        const prepared={...original,runRoot,runId:baseline.id,baseline,source:{files,sha256:digest(files)},
            engineRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:ctx.root,encoding:'utf8'}).trim(),
            configuration:[],replay:null,bakes:{files:candidate.files,shadowIndex:candidate.shadowIndex,receiverIndex:candidate.receiverIndex},
            viewport:{width:1920,height:1080},startedAt:new Date().toISOString()};
        await writeJson(path.join(runRoot,'prepared.json'),prepared);
        await captureBaselines(ctx,prepared,{configurePage:candidate.configurePage,resourceOverrides:candidate.resourceOverrides,beforeCapture:waitForShadowTiles,
            collectMetrics:async page=>{
                const sample=await page.evaluate(collectShadowFrameSamples,{sampleFrames:360,warmupFrames:120});
                const after=await page.evaluate(readGameEvidence);
                if(after.baked.receiverLightmaps.activationBlend!==1||!after.baked.receiverLightmaps.effective.indirect)
                    throw new Error('Bake changed during performance sample');
                return {...sample,summary:summarizeShadowFrames(sample.frames)};
            }});
        const manifest=await read((await read(path.join(runRoot,'manifest.json'))).baselineManifest);
        await receipt(path.join(runRoot,'capture_receipt.json'),ctx.key,{runRoot,diagnosticOnly:true,variant,repeat},await listFiles(runRoot));
        runs.push({variant,repeat,runRoot,manifest});
        await writeJson(path.join(output,'runs.json'),runs);
    }
    const poses=original.poses.map(p=>{
        const rows=runs.map(run=>({variant:run.variant,repeat:run.repeat,image:run.manifest.images.find(i=>i.id===p.id)}));
        if(rows.some(r=>comparableShadowSettings(r.image)!==comparableShadowSettings(rows[0].image)
            ||JSON.stringify(r.image.actualPose)!==JSON.stringify(rows[0].image.actualPose)))throw new Error('Pose or lighting mismatch: '+p.id);
        return {id:p.id,variants:Object.fromEntries(['before','after'].map(variant=>{
            const selected=rows.filter(r=>r.variant===variant);
            return [variant,{repeats:selected.map(r=>({repeat:r.repeat,summary:r.image.performance.summary})),
                pooled:summarizeShadowFrames(selected.flatMap(r=>r.image.performance.frames))}];
        }))};
    });
    await writeJson(path.join(output,'analysis.json'),{poses,allocations,
        policy:'Three fresh sequential browser sessions per candidate, balanced order. Per pose/session: 120 warmup, 360 measured frames; submission-matched GPU queries. Same shadow source, camera, display and authored materials. Memory is logical allocation; driver overhead unmeasured.'});
    const file=path.join(output,'bake_performance_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,diagnosticOnly:true},await listFiles(output)),file);
}
