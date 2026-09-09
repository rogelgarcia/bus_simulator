// Check independence and authenticated handoffs; image correctness is tested on real captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {REPO_ROOT} from '../../../tools/baking/Configuration.mjs';
import {bakeJobs} from '../../../tools/baking/registry.mjs';
import {planBakes} from '../../../tools/baking/Graph.mjs';
import {parseBakeOptions,resolveBakeOptions} from '../../../tools/baking/Options.mjs';
import {EXPERIMENT,ARTIFACTS} from '../../../tools/bake_lighting/experiments/lighting_configurations/Inputs.mjs';
import {artifactPath,selectIds,receipt,authenticated,cache} from '../../../tools/bake_lighting/experiments/lighting_configurations/StageInputs.mjs';
import {executeBakes} from '../../../tools/baking/Runner.mjs';
import {createBakeLog} from '../../../tools/baking/Log.mjs';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {validateImageHandoff} from '../../../tools/bake_lighting/experiments/lighting_configurations/ImageHandoff.mjs';

test('Full experiment orders pilots before shortlist and finals; standalone stages stay independent',()=>{
    const ids=planBakes(bakeJobs,EXPERIMENT).map(job=>job.id);
    const phases=['prepare','capture-baselines','workflow/export-city','workflow/render-pilot','workflow/postprocess-pilot','workflow/analyze-pilot','workflow/capture-final','workflow/render-final','workflow/postprocess-final','workflow/analyze-final','workflow/report'];
    for(let i=1;i<phases.length;i++)assert.ok(ids.indexOf(`${EXPERIMENT}/${phases[i-1]}`)<ids.indexOf(`${EXPERIMENT}/${phases[i]}`));
    for(const stage of ['export-city','verify-scene','capture-display-variants','render','postprocess','analyze','report'])assert.deepEqual(planBakes(bakeJobs,`${EXPERIMENT}/${stage}`).map(j=>j.id),[`${EXPERIMENT}/${stage}`]);
    assert.ok(ids.indexOf(`${EXPERIMENT}/workflow/verify-scene`)<ids.indexOf(`${EXPERIMENT}/workflow/render-pilot`));
    assert.ok(ids.indexOf(`${EXPERIMENT}/workflow/capture-display-variants`)<ids.indexOf(`${EXPERIMENT}/workflow/report`));
    assert.ok(!planBakes(bakeJobs,'all').some(j=>j.id.startsWith(EXPERIMENT)));
    const review=planBakes(bakeJobs,`${EXPERIMENT}/review`).map(job=>job.id);
    assert.ok(review.includes(`${EXPERIMENT}/review/postprocess-pilot`));
    assert.ok(review.includes(`${EXPERIMENT}/review/postprocess-final`));
    assert.ok(!review.some(id=>id.endsWith('/export-city')||id.includes('/render-')));
});
test('Scoped render options propagate through the workflow and bad subsets are rejected',()=>{
    const plan=planBakes(bakeJobs,EXPERIMENT),settings=resolveBakeOptions(plan,parseBakeOptions(['--samples','64','--set',`${EXPERIMENT}:run=tests/artifacts/screens/illumination_560/runs/example`]));
    for(const phase of ['workflow/render-pilot','workflow/render-final'])assert.equal(settings.get(`${EXPERIMENT}/${phase}`).samples,64);
    assert.deepEqual(selectIds(['L00','L01'],'L01','lights'),['L01']);
    assert.throws(()=>selectIds(['L00'],'L00,L00','lights'),/duplicate/);
    assert.throws(()=>selectIds(['L00'],'L09','lights'),/Unknown/);
    assert.throws(()=>artifactPath(REPO_ROOT,'assets/output'),/must stay under/);
});
test('Stage receipts reject changed images and cannot reuse another configuration',async()=>{
    const base=path.join(REPO_ROOT,ARTIFACTS,'unit');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'receipt-'));
    const image=path.join(directory,'render.exr'),file=path.join(directory,'receipt.json');await writeFile(image,'linear pixels');
    await receipt(file,'scene-light-camera',{records:[]},[image]);assert.equal((await authenticated(file)).key,'scene-light-camera');assert.equal(await cache(file,'other-light'),null);
    await writeFile(image,'changed pixels');await assert.rejects(authenticated(file),/Upstream output changed/);assert.equal(await cache(file,'scene-light-camera'),null);
});
test('Scoped code checks reject owned changes while allowing independent stage work',async()=>{
    const base=path.join(REPO_ROOT,ARTIFACTS,'unit');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'code-scope-'));
    const owned=path.join(root,'tools/bake_lighting/owned/run.mjs'),other=path.join(root,'tools/bake_lighting/other/run.mjs');
    for(const file of [owned,other]){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,'original');}
    const log=createBakeLog({stream:{isTTY:false,write:()=>{}},env:{}});
    const job={id:'owned',always:true,codePaths:['tools/bake_lighting/owned'],run:async()=>{await writeFile(other,'independent change');return {state:'validated',files:[]};}};
    const context={root,signal:new AbortController().signal,log};
    assert.equal((await executeBakes([job],new Map([['owned',{}]]),context))[0].status,'success');
    job.run=async()=>{await writeFile(owned,'changed during execution');return {state:'validated',files:[]};};
    await assert.rejects(executeBakes([job],new Map([['owned',{}]]),context),/Bake input changed/);
});
test('EXR processing refuses stale camera layers and reads the requested camera',async(t)=>{
    let config;try{config=JSON.parse(await readFile(path.join(REPO_ROOT,'tools/baking/blender.local.json'),'utf8'));}catch{t.skip('Local image-processing Python is not configured');return;}
    if(!config.pythonExecutable){t.skip('Local image-processing Python is not configured');return;}
    const result=spawnSync(config.pythonExecutable,[path.join(REPO_ROOT,'tests/shared/lighting_experiment_passes.py'),path.join(REPO_ROOT,ARTIFACTS,'unit/exr-passes')],{encoding:'utf8',windowsHide:true,timeout:30000});
    assert.equal(result.status,0,result.error?.message??result.stderr??result.stdout);
});
test('Display analysis refuses images from a different camera, source, or render revision',()=>{
    const file=path.join(REPO_ROOT,ARTIFACTS,'unit/frame.exr');
    const renders={quality:'pilot',source:'city-a',records:[{file,sha256:'raw-a',pose:'pose_01',light:'L01',profile:{width:1920,height:1080}}]};
    const processed={quality:'pilot',records:[{id:'view',sourceExr:file,sourceSha256:'raw-a',pose:'pose_01',light:'L01',width:1920,height:1080}]};
    const expected={quality:'pilot',source:'city-a'};
    validateImageHandoff(renders,processed,expected);
    for(const change of [{sourceSha256:'old-render'},{pose:'pose_05'},{light:'L03'},{width:3840}]){
        const invalid=structuredClone(processed);Object.assign(invalid.records[0],change);
        assert.throws(()=>validateImageHandoff(renders,invalid,expected),/does not match|different dimensions/);
    }
    assert.throws(()=>validateImageHandoff(renders,processed,{...expected,source:'other-city'}),/quality\/source/);
});
