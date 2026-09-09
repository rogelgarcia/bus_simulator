// Validate calibration isolation, input boundaries, and independent radiometric checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {bakeJobs} from '../../../tools/baking/registry.mjs';
import {planBakes} from '../../../tools/baking/Graph.mjs';
import {REPO_ROOT} from '../../../tools/baking/Configuration.mjs';
import {TARGET,TOOL,outputPath,validateDefaults} from '../../../tools/bake_lighting/experiments/physical_calibration/Plan.mjs';
import {receipt,authenticated} from '../../../tools/bake_lighting/experiments/lighting_configurations/StageInputs.mjs';
import {runBlenderStage,runHeadlessBake} from '../../../tools/baking/Blender.mjs';

test('Calibration stages share references and never enter the production tree',()=>{
    const plan=planBakes(bakeJobs,TARGET).map(j=>j.id);
    assert.equal(plan.filter(id=>id.endsWith('/references')).length,1);
    for(const stage of ['prepare','capture','render','analyze'])assert.ok(plan.includes(TARGET+'/'+stage));
    assert.ok(!planBakes(bakeJobs,'all').some(j=>j.id.startsWith(TARGET)));
    assert.throws(()=>outputPath(REPO_ROOT,'assets/lighting'),/named run/);
    assert.throws(()=>outputPath(REPO_ROOT,'tests/artifacts/screens/ai564_physical_calibration/../elsewhere'),/named run/);
});

test('Fixture inputs reject ambiguous or invalid light/material definitions',async()=>{
    const config=JSON.parse(await readFile(path.join(REPO_ROOT,TOOL,'defaults.json'),'utf8'));
    validateDefaults(config);
    for(const patch of [{irradiance:-1},{id:'../escape'},{color:[-1,0,1]},{source:'unknown'},{source:'point'},{textureBytes:[1,2,300]}]){
        const bad=structuredClone(config);Object.assign(bad.fixtures[0],patch);assert.throws(()=>validateDefaults(bad));
    }
});

test('Calibration handoffs reject changed raw evidence',async()=>{
    const base=path.join(REPO_ROOT,'tests/artifacts/screens/ai564_physical_calibration/unit');await mkdir(base,{recursive:true});
    const directory=await mkdtemp(path.join(base,'handoff-'));
    const raw=path.join(directory,'pixels.bin'),manifest=path.join(directory,'receipt.json');
    await writeFile(raw,'unchanged pixels');
    await receipt(manifest,'fixture-key',{},[raw]);
    await authenticated(manifest);
    await writeFile(raw,'changed pixels');
    await assert.rejects(authenticated(manifest),/Upstream output changed/);
});

test('Headed calibration stages preserve the existing headless bake contract and restore environment',async()=>{
    const base=path.join(REPO_ROOT,'tests/artifacts/screens/ai564_physical_calibration/unit');await mkdir(base,{recursive:true});
    const stage=await mkdtemp(path.join(base,'blender-'));
    const original={PRESERVE:'yes'},calls=[];
    const ctx={stage,root:REPO_ROOT,config:{executable:'fixture blender'},env:original,process:async(exe,args)=>{calls.push(args);}};
    await runBlenderStage(ctx,TOOL+'/blender.py',['request.json'],{background:false});
    await runHeadlessBake(ctx,TOOL+'/blender.py',['request.json']);
    assert.ok(!calls[0].includes('--background'));
    assert.ok(calls[1].includes('--background'));
    assert.strictEqual(ctx.env,original);
    ctx.process=async()=>{throw new Error('fixture failure');};
    await assert.rejects(runHeadlessBake(ctx,TOOL+'/blender.py',[]),/fixture failure/);
    assert.strictEqual(ctx.env,original);
});

test('Independent equations, penumbra geometry and negative controls agree',async()=>{
    const config=JSON.parse(await readFile(path.join(REPO_ROOT,'tools/baking/blender.local.json'),'utf8'));
    const result=spawnSync(config.pythonExecutable,[path.join(REPO_ROOT,'tests/shared/physical_calibration_math.py')],{encoding:'utf8',windowsHide:true,timeout:30000});
    assert.equal(result.status,0,result.error?.message??result.stderr);
});
