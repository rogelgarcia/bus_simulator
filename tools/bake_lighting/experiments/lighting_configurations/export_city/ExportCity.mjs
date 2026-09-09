// Standalone actual-game export and reusable Blender scene construction.
import path from 'node:path';
import { mkdir, open, copyFile } from 'node:fs/promises';
import { withGameBrowser } from '../capture_baselines/GameBrowser.mjs';
import { readGameEvidence, setGamePose, settleGameFrames } from '../capture_baselines/GameEvidence.mjs';
import { exportGameScene } from './ExportGameScene.mjs';
import { assertAppliedBaseline, assertPoseMatches, verifyFiles, TOOL, readJson } from '../Inputs.mjs';
import { config, cache, receipt, codeIdentity, resultFiles, artifactPath } from '../StageInputs.mjs';
import { writeJson, digest, hashFile } from '../../../../baking/Files.mjs';
import { runHeadlessBake } from '../../../../baking/Blender.mjs';

export async function exportCity(ctx,run) {
    const lighting=await config(ctx,run,'lighting');
    const code=await codeIdentity(ctx.root,['export_city/ExportGameScene.mjs','export_city/ExportCity.mjs','export_city/build_scene.py']);
    const supplied=ctx.options.source?await readJson(artifactPath(ctx.root,ctx.options.source)):null;
    if(supplied && (supplied.source!==run.source.sha256||digest(supplied.poses)!==digest(run.poses)||(await hashFile(supplied.raw)).sha256!==supplied.sourceGlb.sha256))throw new Error('Explicit source export no longer matches this run');
    const key=digest({source:run.source.sha256,poses:run.poses,bakes:run.bakes.identity,code,raw:supplied?.sourceGlb,toolchain:ctx.toolchain?.executableSha256});
    const output=path.join(ctx.root,'tests/artifacts/screens/illumination_560/scene',key.slice(0,16));
    const manifestPath=path.join(output,'scene_manifest.json');
    const previous=await cache(manifestPath,key);
    if(previous){ctx.log.line(ctx.id,'Reusing authenticated Blender scene');await writeJson(path.join(run.runRoot,'scene.json'),{manifest:manifestPath});return resultFiles(previous,manifestPath);}
    await mkdir(output,{recursive:true});const started=Date.now(),raw=path.join(output,'source.glb');
    let fd,metadata;const evidence=supplied?.evidence??[];
    if(supplied){await copyFile(supplied.raw,raw);metadata=supplied;ctx.log.line(ctx.id,'Rebuilding from the explicitly supplied, hash-verified game export');}
    else try {
        fd=await open(raw,'w');let chunks=0;
        await withGameBrowser(ctx,run.viewport,async(page,url)=>{
            const errors=[];page.on('pageerror',error=>errors.push(error.message));
            const exportStorage=structuredClone(run.baseline.storage);
            exportStorage['bus_sim.bakedLighting.v1'].mode='current';
            await page.addInitScript(storage=>{for(const [key,value]of Object.entries(storage))localStorage.setItem(key,JSON.stringify(value));},exportStorage);
            await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(run.poses[0].pose))}`,{timeout:240000});
            await page.waitForFunction(()=>!!window.__busSim?.sm?.current?.busModel,null,{timeout:240000});
            await page.evaluate(async()=>{await window.__busSim.sm.current.busModel.userData.readyPromise;});
            await page.waitForLoadState('networkidle',{timeout:240000});
            await page.evaluate(async()=>{const {ensureGlobalPerfBar}=await import('/src/graphics/gui/perf_bar/PerfBar.js');ensureGlobalPerfBar().setHidden(true);});
            for(const item of run.poses) {
                await page.evaluate(setGamePose,item.pose);await page.evaluate(settleGameFrames,30);
                const record=await page.evaluate(readGameEvidence);assertPoseMatches(item.pose,record.actualPose);
                if(!record.placement.completelyInFrame||record.placement.buildingBoundsIntersections.length)throw new Error(`Export placement validation failed: ${item.id}`);
                evidence.push({id:item.id,busId:item.busId,...record});
            }
            await page.evaluate(setGamePose,run.poses[0].pose);await page.evaluate(settleGameFrames,30);
            await page.exposeFunction('__writeSceneChunk',async encoded=>{await fd.write(Buffer.from(encoded,'base64'));if(++chunks%64===0)ctx.log.line(ctx.id,`Exported ${chunks} MiB of scene geometry/textures`);});
            ctx.log.line(ctx.id,'Exporting unculled game meshes and source material inputs');
            metadata=await page.evaluate(exportGameScene,run.poses);
            if(errors.length)throw new Error(`Game export errors: ${errors.join('; ')}`);
        });
    } finally {await fd?.close();}
    await verifyFiles(ctx.root,[...run.source.files,...run.bakes.files]);
    const hdri=path.join(output,'german_town_street_2k.hdr');
    await copyFile(path.join(ctx.root,lighting.value.hdri.path),hdri);
    const input=path.join(output,'source_manifest.json');
    await writeJson(input,{...metadata,evidence,raw,hdri,source:run.source.sha256,sourceGlb:await hashFile(raw),baselineSettings:run.baseline,lightingConfig:lighting.value,output,
        exportStagePolicy:'Independent export browser uses Current to avoid loading unused baked atlases; G00 captures and lighting source settings remain unchanged.'});
    await runHeadlessBake(ctx,`${TOOL}/export_city/build_scene.py`,[input]);
    const build=await readJson(path.join(output,'build_receipt.json'));
    if(build.projection.maximumPixelError>1||build.cameras.length!==5||build.busPlacements.length!==4)throw new Error('Blender scene parity/placement count failed');
    const blend=path.join(output,'bigcity2_lighting_lab.blend');
    const result=await receipt(manifestPath,key,{scene:blend,sourceManifest:input,source:run.source.sha256,build,seconds:(Date.now()-started)/1000,
        limitations:metadata.limitations,materialAudit:metadata.materials,viewport:run.viewport},[blend,raw,input,hdri,path.join(output,'build_receipt.json'),...build.colorManagement.files]);
    await writeJson(path.join(run.runRoot,'scene.json'),{manifest:manifestPath});
    return resultFiles(result,manifestPath);
}
