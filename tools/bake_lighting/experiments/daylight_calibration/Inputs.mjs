// @ts-check
// Authenticate the frozen city, its source tree and calibration prerequisite before reuse.
import path from 'node:path';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {hashFile,listFiles,writeJson} from '../../../baking/Files.mjs';
import {authenticated} from '../lighting_configurations/StageInputs.mjs';
import {verifyFiles} from '../lighting_configurations/Inputs.mjs';
/** @param {any} ctx @param {string} output */
export async function freezeInputs(ctx,output){
    if(!ctx.options['source-run']||!ctx.options['source-scene']||!ctx.options['calibration-run'])throw new Error('Specify source-run, source-scene and calibration-run');
    const sourceRun=path.resolve(ctx.root,ctx.options['source-run']);
    const prepared=JSON.parse(await readFile(path.join(sourceRun,'inputs/prepared.json'),'utf8'));
    await verifyFiles(ctx.root,prepared.source.files);
    const sceneFile=path.resolve(ctx.root,ctx.options['source-scene']);
    const scene=await authenticated(sceneFile);
    if(scene.source!==prepared.source.sha256||scene.build.cameras.length!==5||scene.build.busPlacements.length!==4||scene.build.projection.maximumPixelError>1)throw new Error('City export identity/projection mismatch');
    const assetChanges=execFileSync('git',['diff','--name-only',prepared.engineRevision,'--','assets'],{cwd:ctx.root,encoding:'utf8'}).trim();
    if(assetChanges)throw new Error('City assets changed since export; re-export before reuse: '+assetChanges);
    const calibration=path.resolve(ctx.root,ctx.options['calibration-run']);
    await authenticated(path.join(calibration,'analyze_receipt.json'));
    const contract=JSON.parse(await readFile(path.join(calibration,'report/summary.json'),'utf8'));
    if(contract.failed!==0||[...(contract.inputChecks??[]),...(contract.displayChecks??[])].some(c=>c.status!=='pass'))throw new Error('AI 564 calibration has unresolved failures');
    await mkdir(path.join(output,'inputs'),{recursive:true});
    await copyFile(sceneFile,path.join(output,'inputs/scene_manifest.json'));
    await copyFile(path.join(sourceRun,'inputs/prepared.json'),path.join(output,'inputs/prepared.json'));
    const assets=await listFiles(path.join(path.dirname(scene.scene),'color_management'));
    const identity={sourceRun,sourceScene:sceneFile,scene:scene.scene,sceneSha256:await hashFile(scene.scene),source:prepared.source.sha256,
        engineRevision:prepared.engineRevision,currentRuntimeHashesMatch:true,trackedAssetChanges:assetChanges,
        assetPolicy:'Authenticated packed export is the frozen asset source; unchanged original runtime hashes and tracked asset tree are required. New fixture-only files do not mutate the exported city.',
        calibration,poses:prepared.poses,ocioConfig:scene.build.colorManagement.config,ocioFiles:await Promise.all(assets.map(async file=>({file,sha256:await hashFile(file)})))};
    const manifest=JSON.parse(await readFile(scene.sourceManifest,'utf8'));
    await writeJson(path.join(output,'inputs/legacy_audit.json'),{lighting:manifest.lighting,atmosphere:manifest.atmosphere,lights:manifest.lights,limitations:manifest.limitations,
        interpretation:'Legacy intensity values are artistic scene-linear scalars, not established SI readings. CSM directional entries represent one sun. HDRI is unmeasured; separate camera sky/haze does not drive transport. Exporter combines HDRI and hemisphere/pi, and normalizes old analytic skies to arbitrary targets.'});
    await writeJson(path.join(output,'inputs/identity.json'),identity);
    const baselineDir=path.join(output,'baselines');await mkdir(baselineDir,{recursive:true});
    for(const pose of prepared.poses)for(const tone of ['aces','agx']){
        const stem=pose.id+'_'+tone+'_off';
        const dir=path.join(sourceRun,'runtime/G01_display_variants/1920x1080');const metadata=JSON.parse(await readFile(path.join(dir,stem+'.json'),'utf8'));
        if((await hashFile(path.join(dir,stem+'.png'))).sha256!==metadata.sha256)throw new Error('Baseline screenshot changed: '+stem);
        for(const suffix of ['.png','.json'])await copyFile(path.join(dir,stem+suffix),path.join(baselineDir,stem+suffix));
    }
    return identity;
}
