// Check ratio ownership, registry isolation and the exposure/scale-invariance calculation.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {REPO_ROOT} from '../../../tools/baking/Configuration.mjs';
import {bakeJobs} from '../../../tools/baking/registry.mjs';
import {planBakes} from '../../../tools/baking/Graph.mjs';
import {makeLighting,withinArtifacts,TARGET,TOOL} from '../../../tools/bake_lighting/experiments/sun_sky_ratios/Plan.mjs';

const read=async file=>JSON.parse(await readFile(path.join(REPO_ROOT,file),'utf8'));
test('Sun/sky experiment changes light ratios without changing source calibration',async()=>{
    const defaults=await read(TOOL+'/defaults.json');
    const source=await read('tools/bake_lighting/experiments/lighting_configurations/config/lighting.json');
    const original=structuredClone(source),result=makeLighting(defaults,source);
    assert.deepEqual(source,original);
    assert.equal(result.configurations.find(v=>v.id==='S04').sunMultiplier,4);
    assert.equal(result.configurations.find(v=>v.id==='F04').environmentMultiplier,1.5);
    assert.deepEqual(result.calibration,source.calibration);
    for(const patch of [{sunMultiplier:-1},{environmentMultiplier:NaN},{id:'S01'}]){
        const invalid=structuredClone(defaults);Object.assign(invalid.variants[1],patch);assert.throws(()=>makeLighting(invalid,source));
    }
    const invalid=structuredClone(defaults);invalid.variants.at(-1).sunMultiplier=4;
    assert.throws(()=>makeLighting(invalid,source),/preserve/);
});
test('Experiment has no export/game dependencies, remains outside production and confines artifacts',()=>{
    assert.deepEqual(planBakes(bakeJobs,TARGET).map(j=>j.id),[TARGET]);
    assert.deepEqual(planBakes(bakeJobs,TARGET+'/review').map(j=>j.id),[TARGET+'/review']);
    assert.ok(!planBakes(bakeJobs,'all').some(j=>j.id.startsWith(TARGET)));
    assert.throws(()=>withinArtifacts(REPO_ROOT,'assets/output'),/within/);
    assert.throws(()=>withinArtifacts(REPO_ROOT,'tests/artifacts/screens/ai563_sun_sky_ratios/../other'),/within/);
});
test('Exposure calibration, ROI measurements and both display transforms obey uniform scaling',async()=>{
    const config=await read('tools/baking/blender.local.json');
    assert.ok(config.pythonExecutable,'Configured image Python required');
    const result=spawnSync(config.pythonExecutable,[path.join(REPO_ROOT,'tests/shared/sun_sky_measurements.py')],{encoding:'utf8',windowsHide:true,timeout:30000});
    assert.equal(result.status,0,result.error?.message??result.stderr??result.stdout);
});
