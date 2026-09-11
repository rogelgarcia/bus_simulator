// Calibration selection must remain identifiable and fail closed on invalid evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {bakeJobs} from '../../../tools/baking/registry.mjs';
import {planBakes} from '../../../tools/baking/Graph.mjs';
import {REPO_ROOT} from '../../../tools/baking/Configuration.mjs';
import {TARGET,TOOL,outputPath,validateRecipe,assertPromotion} from '../../../tools/bake_lighting/experiments/automated_calibration/Plan.mjs';
import {receipt,authenticated} from '../../../tools/bake_lighting/experiments/lighting_configurations/StageInputs.mjs';
import {preserveBaselineAttempt} from '../../../tools/bake_lighting/experiments/automated_calibration/BaselineHistory.mjs';

test('Calibration is explicit, bounded to artifacts and excluded from all production jobs',()=>{
    assert.ok(!planBakes(bakeJobs,'all').some(j=>j.id.startsWith(TARGET)));
    for(const s of ['validate','baseline','prepare','calibrate','search','render','analyze','review'])assert.ok(planBakes(bakeJobs,TARGET+'/'+s).some(j=>j.id===TARGET+'/'+s));
    for(const p of ['assets/materials','tests/artifacts/screens/ai567_automated_calibration/../escaped'])assert.throws(()=>outputPath(REPO_ROOT,p));
});
test('Global exposure bounds, material set and held-out split cannot be silently refitted',async()=>{
    const original=JSON.parse(await readFile(path.join(REPO_ROOT,TOOL,'defaults.json')));validateRecipe(original);
    for(const change of [r=>r.exposureOffsets[0]=NaN,r=>r.threads=16,r=>r.training.push('pose_02'),r=>r.grade='vivid',r=>r.materials.push('fittedAlbedo'),r=>r.publication='production']){const copy=structuredClone(original);change(copy);assert.throws(()=>validateRecipe(copy));}
});
test('Optimizer success never overrides failed reference, identity, held-out or full-render checks',()=>{
    const valid={referenceValid:true,identitiesMatch:true,heldOutPassed:true,fullRenderVerified:true};assertPromotion(valid);
    for(const key of Object.keys(valid))assert.throws(()=>assertPromotion({...valid,[key]:false}));
});
test('Receipts detect altered candidate bytes instead of resuming them',async()=>{
    const root=outputPath(REPO_ROOT,'tests/artifacts/screens/ai567_automated_calibration/unit');await mkdir(root,{recursive:true});const dir=await mkdtemp(path.join(root,'tamper-')),file=path.join(dir,'candidate.json'),manifest=path.join(dir,'receipt.json');
    await writeFile(file,'{"exposure":0}');await receipt(manifest,'test',{},[file]);await authenticated(manifest);await writeFile(file,'{"exposure":2}');await assert.rejects(authenticated(manifest),/changed/);
});
test('Search ranking ignores held-out performance; black clipping and overexposure remain detectable',async()=>{
    const config=JSON.parse(await readFile(path.join(REPO_ROOT,'tools/baking/blender.local.json')));
    execFileSync(config.pythonExecutable,[path.join(REPO_ROOT,'tests/shared/automated_calibration_checks.py')],{cwd:REPO_ROOT,stdio:'pipe'});
});

test('Retrying a partial baseline preserves its original image and metadata bytes',async()=>{
    const root=outputPath(REPO_ROOT,'tests/artifacts/screens/ai567_automated_calibration/unit');await mkdir(root,{recursive:true});const out=await mkdtemp(path.join(root,'partial-')),runtime=path.join(out,'runtime');await mkdir(runtime);
    await writeFile(path.join(runtime,'pose.png'),'original capture');await writeFile(path.join(runtime,'pose.json'),'original metadata');
    const history=await preserveBaselineAttempt(REPO_ROOT,out);await writeFile(path.join(runtime,'pose.png'),'retry capture');
    assert.equal(await readFile(path.join(history,'runtime/pose.png'),'utf8'),'original capture');assert.equal(await readFile(path.join(history,'runtime/pose.json'),'utf8'),'original metadata');
    await assert.rejects(preserveBaselineAttempt(REPO_ROOT,path.join(REPO_ROOT,'assets')),/named run/);
});
