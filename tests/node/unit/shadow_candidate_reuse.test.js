// Verifies independent shadow candidates retain receiver and run provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {candidateInputs} from '../../../tools/bake_lighting/experiments/reference_matching/CandidateInputs.mjs';

test('shadow-only candidate reuses receivers with both run receipts and rejects failed or foreign runs',async()=>{
    const base=path.resolve('tests/artifacts/screens/shadow_resolution/unit');
    await mkdir(base,{recursive:true});
    const root=await mkdtemp(path.join(base,'candidate-'));
    const framework=path.join(root,'tests/artifacts/screens/ai556_bake_framework');
    const receiver=path.join(framework,'receiver'),shadow=path.join(framework,'shadow');
    await mkdir(receiver,{recursive:true});await mkdir(shadow,{recursive:true});
    const save=(file,value)=>writeFile(file,JSON.stringify(value));
    const receiverIndex=path.join(receiver,'package_index.json'),shadowIndex=path.join(shadow,'package_index.json');
    await save(receiverIndex,{channels:{indirect_irradiance:{url:'indirect.ilpkg'}}});
    await save(shadowIndex,{profiles:{'ai527.sun.az045.el55':{packagePath:'new-shadow.ilpkg'}}});
    const summary=(id,file)=>({completed:true,jobs:[{id,status:'success',state:'validated',outputs:[file]}]});
    await save(path.join(receiver,'summary.json'),summary('lighting/illumination',receiverIndex));
    await save(path.join(shadow,'summary.json'),summary('lighting/shadows',shadowIndex));
    const validations=[];
    const ctx={root,options:{'shadow-run':shadow},node:async(script,args)=>validations.push({script,args})};
    const candidate=await candidateInputs(ctx,receiver);
    assert.equal(candidate.receiverIndex,receiverIndex);
    assert.equal(candidate.shadowIndex,shadowIndex);
    assert.equal(candidate.files.length,4);
    assert.ok(candidate.files.every(file=>file.sha256.length===64));
    assert.deepEqual(validations,[{script:'tools/receiver_lightmaps/publish.mjs',args:['--enhanced','--validate-only','--from',path.dirname(receiver)]}]);
    const routed=candidate.resourceOverrides['assets/baked_lighting/receivers/enhanced/package_index.json'].content;
    assert.equal(routed.channels.indirect_irradiance.url,'/'+path.relative(root,path.join(receiver,'indirect.ilpkg')).replaceAll('\\','/'));
    await save(path.join(shadow,'summary.json'),{completed:false,jobs:[]});
    await assert.rejects(()=>candidateInputs(ctx,receiver),/unfinished or failed/);
    await assert.rejects(()=>candidateInputs({...ctx,options:{'shadow-run':root}},receiver),/existing bake framework run/);
});
