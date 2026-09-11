// Laboratory publication, evidence and physical-input boundary regression checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {bakeJobs} from '../../../tools/baking/registry.mjs';
import {planBakes} from '../../../tools/baking/Graph.mjs';
import {REPO_ROOT} from '../../../tools/baking/Configuration.mjs';
import {TARGET,TOOL,outputPath,validateProfile} from '../../../tools/bake_lighting/experiments/material_calibration/Plan.mjs';
import {receipt,authenticated} from '../../../tools/bake_lighting/experiments/lighting_configurations/StageInputs.mjs';
import {generatedNormalToTangent} from '../../../tools/bake_lighting/experiments/material_calibration/NormalChannels.mjs';

test('Generated asphalt neutral normal points along tangent Z and preserves source bytes',()=>{
    const source=new Uint8Array([128,255,128,255,64,240,96,255]),saved=source.slice(),result=generatedNormalToTangent(source);
    assert.deepEqual(result,new Uint8Array([128,128,255,255,64,96,240,255]));assert.deepEqual(source,saved);assert.notEqual(result,source);
    assert.throws(()=>generatedNormalToTangent(new Uint8Array(3)));
});

test('Material experiments cannot enter routine production baking or escape artifact roots',()=>{
    assert.ok(!planBakes(bakeJobs,'all').some(j=>j.id.startsWith(TARGET)));
    for(const stage of ['audit','prepare','capture','render','analyze'])assert.ok(planBakes(bakeJobs,TARGET+'/'+stage).some(j=>j.id===TARGET+'/'+stage));
    for(const dir of ['assets/materials','tests/artifacts/screens/ai566_material_calibration/../other','C:/'])assert.throws(()=>outputPath(REPO_ROOT,dir));
});
test('Material proposals reject invalid physical ranges and publication intent',async()=>{
    const d=JSON.parse(await readFile(path.join(REPO_ROOT,TOOL,'defaults.json'))),p=JSON.parse(await readFile(path.join(REPO_ROOT,TOOL,'profiles.json')));validateProfile(d,p);
    for(const mutate of [v=>v.plausible.bus.paint.f0=1,v=>v.plausible.bus.glass.roughness=-1,v=>v.plausible.bus.paint.f0=NaN,v=>v.publication='production']){const copy=structuredClone(p);mutate(copy);assert.throws(()=>validateProfile(d,copy));}
    const bad=structuredClone(d);bad.angles[0]=90;assert.throws(()=>validateProfile(bad,p));
});
test('Material evidence rejects altered candidate inputs and render bytes',async()=>{
    const base=path.join(REPO_ROOT,'tests/artifacts/screens/ai566_material_calibration/unit');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'evidence-'));
    const file=path.join(dir,'candidate.json'),manifest=path.join(dir,'receipt.json');await writeFile(file,'original');await receipt(manifest,'key',{},[file]);await authenticated(manifest);await writeFile(file,'changed');await assert.rejects(authenticated(manifest),/changed/);
});
test('Window substitute has explicit bounded, non-emissive opaque semantics',async()=>{
    const c=JSON.parse(await readFile(path.join(REPO_ROOT,TOOL,'export_contract.json'))).windowInterior;
    assert.equal(c.emission,0);assert.equal(c.transmission,0);assert.equal(c.opacity,1);
    for(const rgb of [c.backgroundLinear,c.alternateLinear,c.silhouetteLinear])assert.ok(rgb.every(v=>v>0&&v<.5));
    assert.equal(c.owner,'AI562 production exporter; AI566 isolated laboratory adapter');
});
