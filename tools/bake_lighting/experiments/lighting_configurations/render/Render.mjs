// Plan only requested Cycles jobs; authenticated per-image receipts survive interruption.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { config, authenticated, codeIdentity, selectIds, receipt, resultFiles } from '../StageInputs.mjs';
import { readJson, TOOL } from '../Inputs.mjs';
import { digest, writeJson, hashFile, listFiles } from '../../../../baking/Files.mjs';
import { runHeadlessBake } from '../../../../baking/Blender.mjs';

export async function renderComparisons(ctx,run,settings={}) {
    const scenePath=ctx.options.scene??(await readJson(path.join(run.runRoot,'scene.json'))).manifest;
    const scene=await authenticated(path.resolve(ctx.root,scenePath));
    if(scene.source!==run.source.sha256)throw new Error('Scene source differs from prepared run');
    const lighting=settings.lighting?{value:settings.lighting}:await config(ctx,run,'lighting');
    const profiles=settings.profiles?{value:settings.profiles}:await config(ctx,run,'render_profiles');
    const quality=ctx.options.quality??'pilot';let lights=lighting.value.configurations.map(item=>item.id);
    if(quality==='final'&&!ctx.options.lights)lights=['L00',...(await authenticated(path.join(run.runRoot,'analysis/pilot/analysis_manifest.json'))).shortlist];
    lights=selectIds(lights,ctx.options.lights,'lights');
    const poses=selectIds(run.poses.map(item=>item.id),ctx.options.poses,'poses');
    const code=await codeIdentity(ctx.root,['render/Render.mjs','render/render_scene.py','render/lighting.py','render/lighting_scales.py','render/calibration.py']);
    const environmentAlgorithm=await hashFile(path.join(ctx.root,'tools/receiver_lightmaps/blender/environment_sun.py'));
    const profile={...profiles.value[quality]};if(ctx.options.samples)profile.samples=ctx.options.samples;
    if(ctx.options.resolution){const [w,h]=ctx.options.resolution.split('x').map(Number);if(!Number.isInteger(w)||!Number.isInteger(h)||w<64||h<64)throw new Error('resolution must be WIDTHxHEIGHT');profile.width=w;profile.height=h;}
    const output=path.join(run.runRoot,'linear',quality);await mkdir(output,{recursive:true});
    const jobs=[];
    for(const pose of poses)for(const light of lights){
        const key=digest({scene:scene.key,pose,light:lighting.value.configurations.find(p=>p.id===light),calibration:lighting.value.calibration,hdri:lighting.value.hdri,
            profile,transport:profiles.value.transport,seed:profiles.value.seed,code,environmentAlgorithm,device:ctx.options.device??ctx.config.renderDevice});
        const id=`${pose}_${light}`,base=path.join(output,`${id}_${key.slice(0,10)}`);
        jobs.push({id,pose,light,key,profile,seed:profiles.value.seed,file:base+'.exr',receipt:base+'.json',timeLimitSeconds:ctx.options['time-limit']??profiles.value.timeLimitSeconds});
    }
    if(ctx.options.diagnostic==='true'){
        const check=profiles.value.qualityChecks;const reference=jobs.find(item=>item.pose===check.pose&&item.light===check.light);
        if(reference){const key=digest({base:reference.key,check});const base=path.join(output,`convergence_${key.slice(0,10)}`);
            jobs.push({...reference,id:'convergence_high_bounce',key,profile:{...profile,samples:Math.min(4096,profile.samples*check.sampleMultiplier)},seed:check.independentSeed,
                transportOverrides:{max_bounces:check.maxBounces,diffuse_bounces:check.diffuseBounces,glossy_bounces:check.glossyBounces},file:base+'.exr',receipt:base+'.json'});}
    }
    let pending=0;
    for(const job of jobs){try{const saved=await readJson(job.receipt);if(saved.key!==job.key||(await hashFile(job.file)).sha256!==saved.sha256)pending++;}catch{pending++;}}
    ctx.log.line(ctx.id,`${jobs.length} ${quality} renders planned; ${pending} missing or changed; ${jobs.length-pending} authenticated reuse`);
    const batchFile=path.join(output,'batch.json');await writeJson(batchFile,{sceneManifest:path.resolve(ctx.root,scenePath),lighting:lighting.value,profiles:profiles.value,
        device:ctx.options.device??ctx.config.renderDevice,output,jobs});
    const start=Date.now();
    if(pending)await runHeadlessBake(ctx,`${TOOL}/render/render_scene.py`,[batchFile]);
    if((await hashFile(path.join(ctx.root,'tools/receiver_lightmaps/blender/environment_sun.py'))).sha256!==environmentAlgorithm.sha256)throw new Error('Environment separation algorithm changed during rendering');
    const records=[];for(const job of jobs){const record=await readJson(job.receipt);if(record.status!=='validated'||record.key!==job.key||(await hashFile(job.file)).sha256!==record.sha256)throw new Error(`Invalid render receipt ${job.id}`);records.push(record);}
    const file=path.join(output,'render_manifest.json');
    const result=await receipt(file,digest(jobs.map(item=>item.key)),{quality,sceneManifest:path.resolve(ctx.root,scenePath),scene:scene.scene,
        colorManagement:scene.build.colorManagement,materialMasks:scene.build.materialMasks,records,seconds:(Date.now()-start)/1000,
        source:run.source.sha256,limitations:scene.limitations},[...jobs.flatMap(item=>[item.file,item.receipt,item.file.replace(/\.exr$/,'.png')]),path.join(output,'calibration.json'),path.join(output,'lighting_reference.blend'),...await listFiles(path.join(output,'calibration')),...await listFiles(path.join(output,'environments'))]);
    return resultFiles(result,file);
}
