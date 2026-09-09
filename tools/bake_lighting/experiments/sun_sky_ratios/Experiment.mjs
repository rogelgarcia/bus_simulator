// Authenticates the saved city, renders the matrix, then builds display comparisons.
// @ts-check
import path from 'node:path';
import {mkdir,copyFile} from 'node:fs/promises';
import {digest,hashFile,writeJson,listFiles} from '../../../baking/Files.mjs';
import {authenticated,receipt,resultFiles,selectIds} from '../lighting_configurations/StageInputs.mjs';
import {readJson} from '../lighting_configurations/Inputs.mjs';
import {renderComparisons} from '../lighting_configurations/render/Render.mjs';
import {makeLighting,withinArtifacts,TOOL,ARTIFACTS} from './Plan.mjs';

/** @param {any} ctx */
export async function executeExperiment(ctx){
    if(ctx.publish)throw new Error('Sun/sky experiments never publish game data');
    if(!ctx.options['source-run'])throw new Error('Supply source-run=tests/artifacts/screens/illumination_560/runs/<run-id>');
    const started=Date.now();
    const sourceRun=withinArtifacts(ctx.root,ctx.options['source-run'],'tests/artifacts/screens/illumination_560/runs');
    const prepared=await readJson(path.join(sourceRun,'inputs/prepared.json'));
    const sceneFile=(await readJson(path.join(sourceRun,'scene.json'))).manifest;
    const scene=await authenticated(sceneFile);
    if(scene.source!==prepared.source.sha256||scene.build.cameras.length!==prepared.poses.length)throw new Error('Saved scene/source/pose association mismatch');
    const defaults=await readJson(path.join(ctx.root,TOOL,'defaults.json'));
    const source=await readJson(scene.sourceManifest);
    const lighting=makeLighting(defaults,source.lightingConfig);
    const profiles=await readJson(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/render_profiles.json'));
    profiles.pilot={...defaults.render};
    if(ctx.options.samples)profiles.pilot.samples=ctx.options.samples;
    if(profiles.pilot.minimumSamples>profiles.pilot.samples)profiles.pilot.minimumSamples=profiles.pilot.samples;
    const poses=selectIds(prepared.poses.map(item=>item.id),ctx.options.poses,'poses');
    const code=[];
    for(const directory of [TOOL,'tools/bake_lighting/experiments/lighting_configurations/render','tools/bake_lighting/experiments/lighting_configurations/postprocess']){
        for(const file of await listFiles(path.join(ctx.root,directory)))if(/\.(mjs|py|css|html|js)$/.test(file))code.push({file,...await hashFile(file)});
    }
    const key=digest({source:scene.key,defaults,profiles,poses,code,toolchain:ctx.toolchain?.executableSha256,device:ctx.options.device??ctx.config.renderDevice});
    const output=ctx.options.output?withinArtifacts(ctx.root,ctx.options.output):path.join(ctx.root,ARTIFACTS,key.slice(0,16));
    let previous;
    try{previous=await readJson(path.join(output,'experiment.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(previous&&previous.sourceSceneKey!==scene.key)throw new Error('Output belongs to another scene');
    await mkdir(path.join(output,'inputs'),{recursive:true});
    const run={...prepared,runRoot:output};
    await writeJson(path.join(output,'scene.json'),{manifest:sceneFile});
    await writeJson(path.join(output,'inputs/experiment.json'),{defaults,lighting,profiles,poses,sourceRun,sourceScene:sceneFile,sourceLighting:source.lighting,sourceSun:source.atmosphere.sun});
    await writeJson(path.join(output,'inputs/lighting.json'),lighting);
    const before=Date.now();
    const rendered=await renderComparisons({...ctx,options:{...ctx.options,quality:'pilot',scene:sceneFile}},run,{lighting,profiles});
    const renderStageSeconds=(Date.now()-before)/1000;
    const firstStartedAt=previous?.firstStartedAt??previous?.startedAt??new Date(started).toISOString();
    const initialRenderStageSeconds=previous?.initialRenderStageSeconds??previous?.renderStageSeconds??renderStageSeconds;
    await writeJson(path.join(output,'experiment.json'),{schemaVersion:1,key,sourceRun,sourceScene:sceneFile,sourceSceneKey:scene.key,defaults,poses,code,renders:rendered.manifest,renderStageSeconds,initialRenderStageSeconds,firstStartedAt,startedAt:new Date(started).toISOString()});
    const result=await buildReview({...ctx,options:{...ctx.options,output:path.relative(ctx.root,output)}});
    const totalSeconds=(Date.now()-started)/1000;
    await writeJson(path.join(output,'execution.json'),{schemaVersion:1,startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),totalSeconds,renderStageSeconds,initialRenderStageSeconds,reviewStageSeconds:totalSeconds-renderStageSeconds,wallSecondsFromFirstAttempt:(Date.now()-Date.parse(firstStartedAt))/1000,sourceRun,report:result.manifest});
    ctx.log.line(ctx.id,`Completed in ${totalSeconds.toFixed(1)}s: ${path.join(output,'report/index.html')}`);
    return {...result,files:[...result.files,...rendered.files,path.join(output,'execution.json'),path.join(output,'experiment.json'),path.join(output,'inputs/experiment.json'),path.join(output,'inputs/lighting.json')]};
}

/** @param {any} ctx */
export async function buildReview(ctx){
    if(ctx.publish)throw new Error('Sun/sky experiments never publish');
    if(!ctx.options.output)throw new Error('Review requires output=<existing AI 563 artifact directory>');
    const started=Date.now(),output=withinArtifacts(ctx.root,ctx.options.output);
    const experiment=await readJson(path.join(output,'experiment.json'));
    const renders=await authenticated(experiment.renders);
    const scene=await authenticated(experiment.sourceScene);
    if(scene.key!==experiment.sourceSceneKey||renders.source!==scene.source)throw new Error('Review source mismatch');
    const report=path.join(output,'report');await mkdir(path.join(report,'baselines'),{recursive:true});
    let referenceInputs=[];
    try{referenceInputs=(await readJson(path.join(output,'references.json'))).images;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!Array.isArray(referenceInputs))throw new Error('references.json must contain an images array');
    const references=[];
    for(const reference of referenceInputs){
        const sourceFile=path.resolve(output,reference.file),relative=path.relative(output,sourceFile);
        if(relative.startsWith('..')||path.isAbsolute(relative)||!experiment.poses.includes(reference.pose)||!reference.label||!/^\w[\w-]*$/.test(reference.id))throw new Error('Invalid visual reference');
        if((await hashFile(sourceFile)).sha256!==reference.sha256)throw new Error('Visual reference hash mismatch: '+reference.file);
        const target=path.join(report,'references',reference.id+path.extname(sourceFile));
        await mkdir(path.dirname(target),{recursive:true});await copyFile(sourceFile,target);
        references.push({...reference,file:path.relative(report,target).replaceAll('\\','/'),kind:'reference'});
    }
    const baselines=[];
    for(const pose of experiment.poses)for(const tone of experiment.defaults.tones){
        const file=path.join(experiment.sourceRun,'runtime/G01_display_variants/1920x1080',`${pose}_${tone.id}_off.json`);
        const record=await readJson(file);
        if(record.pose!==pose||record.gameTone!==tone.id||record.gameGrade!=='off'||(await hashFile(record.file)).sha256!==record.sha256)throw new Error('Invalid native baseline: '+file);
        const target=path.join(report,'baselines',`${pose}_${tone.id}.png`);
        await copyFile(record.file,target);await copyFile(file,target.replace(/\.png$/,'.json'));
        baselines.push({pose,tone:tone.id,file:target,sha256:record.sha256,exposure:record.gameExposure,sourceMetadata:file});
    }
    const request=path.join(output,'review_request.json');
    await writeJson(request,{...experiment,report,baselines,references,colorManagement:scene.build.colorManagement,calibration:path.join(output,'linear/pilot/calibration.json')});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'process.py'),request]);
    for(const file of ['gallery.css','gallery.js'])await copyFile(path.join(ctx.root,TOOL,file),path.join(report,file));
    const sheetRequest=path.join(output,'sheets_request.json');
    await writeJson(sheetRequest,{report,poses:experiment.poses,browserExecutable:ctx.config.browserExecutable});
    await ctx.node(`${TOOL}/sheets.mjs`,[sheetRequest]);
    const summary=await readJson(path.join(report,'summary.json'));
    const manifest=path.join(report,'manifest.json');
    const files=(await listFiles(report)).filter(file=>file!==manifest);
    const value=await receipt(manifest,digest({renderKey:renders.key,defaults:experiment.defaults}),{...summary,seconds:(Date.now()-started)/1000},files);
    ctx.log.line(ctx.id,`${summary.imageCount} display images; ${summary.controlPassed?'uniform-scale check passed':'uniform-scale check failed'}; ${report}`);
    return resultFiles(value,manifest);
}
