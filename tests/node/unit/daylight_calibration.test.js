// Physical-input boundaries, immutable evidence, and independent daylight equations.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {bakeJobs} from '../../../tools/baking/registry.mjs';
import {planBakes} from '../../../tools/baking/Graph.mjs';
import {REPO_ROOT} from '../../../tools/baking/Configuration.mjs';
import {TARGET,TOOL,validateDefaults,outputPath} from '../../../tools/bake_lighting/experiments/daylight_calibration/Plan.mjs';
import {receipt,authenticated} from '../../../tools/bake_lighting/experiments/lighting_configurations/StageInputs.mjs';

test('Daylight experiment remains outside production publication and bounds its outputs',()=>{
    assert.ok(!planBakes(bakeJobs,'all').some(j=>j.id.startsWith(TARGET)));
    for(const stage of ['prepare','render','capture','analyze','afternoon'])assert.ok(planBakes(bakeJobs,TARGET+'/'+stage).some(j=>j.id===TARGET+'/'+stage));
    for(const output of ['assets/lighting','tests/artifacts/screens/ai565_daylight_calibration/../other','C:/'])assert.throws(()=>outputPath(REPO_ROOT,output));
});
test('Daylight contracts reject unsupported models and unbounded atmospheric inputs',async()=>{
    const d=JSON.parse(await readFile(path.join(REPO_ROOT,TOOL,'defaults.json'),'utf8'));validateDefaults(d);
    for(const change of [v=>v.skyModel='unknown',v=>v.profiles[0].aerosolDensity=-1,v=>v.profiles[2].horizontalIlluminanceLux=0,v=>v.threads=100,v=>v.sun.angularDiameterDeg=0]){
        const value=structuredClone(d);change(value);assert.throws(()=>validateDefaults(value));
    }
});
test('Altered raw daylight evidence cannot pass authenticated stage reuse',async()=>{
    const base=path.join(REPO_ROOT,'tests/artifacts/screens/ai565_daylight_calibration/unit');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'evidence-'));
    const raw=path.join(dir,'light.exr'),manifest=path.join(dir,'receipt.json');await writeFile(raw,'original');await receipt(manifest,'key',{},[raw]);await authenticated(manifest);
    await writeFile(raw,'altered');await assert.rejects(authenticated(manifest),/changed/);
});
test('Independent daylight integrals and spectral convergence validate the physical scale',async()=>{
    const config=JSON.parse(await readFile(path.join(REPO_ROOT,'tools/baking/blender.local.json'),'utf8'));
    const result=spawnSync(config.pythonExecutable,[path.join(REPO_ROOT,'tests/shared/daylight_calibration_math.py')],{windowsHide:true,encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.error?.message??result.stderr);
});
