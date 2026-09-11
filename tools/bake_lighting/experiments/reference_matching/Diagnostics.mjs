// Source isolation in an owned game instance; every destructive diagnostic is confined to it.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import {resolvePoses} from '../lighting_configurations/Inputs.mjs';
import {settleGameFrames,readGameEvidence} from '../lighting_configurations/capture_baselines/GameEvidence.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {outputPath} from './Baseline.mjs';

export async function diagnostics(ctx){
    if(!ctx.options.output||ctx.publish)throw new Error('New diagnostic output required; no publication');
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    const poses=resolvePoses(JSON.parse(await readFile(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/poses.json'),'utf8')));
    const pose=poses.find(value=>value.id===(ctx.options.pose??'pose_03'));
    if(!pose)throw new Error('Unknown diagnostic pose');
    const errors=[];
    await withGameBrowser(ctx,{width:1920,height:1080},async(page,url)=>{
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>{localStorage.setItem('bus_sim.bakedLighting.v1',JSON.stringify({mode:'current',busAppearanceVersion:2,bus:{enabled:false,glassReflections:false,bodyReflections:false,rimShine:false}}));localStorage.setItem('bus_sim.colorGrading.v1',JSON.stringify({preset:'off',intensity:0}));});
        await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(pose.pose))}`);
        await page.waitForFunction(()=>!!window.__busSim?.sm?.current?.busModel);
        await page.evaluate(async()=>{await window.__busSim.sm.current.busModel.userData.readyPromise;await window.__busSim.engine.waitForLightingReady();const c=window.__busSim.engine.canvas;for(const el of document.body.querySelectorAll('*'))if(el!==c&&!el.contains(c)&&!['SCRIPT','STYLE','LINK'].includes(el.tagName))el.style.visibility='hidden';c.style.visibility='visible';});
        for(const mode of ['original','unshadowed','sky_only','direct_only','geometric_normals']){
            await page.evaluate(async mode=>{
                const {engine:e,sm}=window.__busSim,c=sm.current.city;
                if(mode==='unshadowed')e.renderer.shadowMap.enabled=false;
                if(mode==='sky_only')c.setSunIntensity(0);
                if(mode==='direct_only'){
                    c.setSunIntensity(e.lightingSettings.sunIntensity);
                    const {applyIBLToScene}=await import('/src/graphics/engine3d/lighting/IBL.js');applyIBLToScene(e.scene,null,{enabled:false});
                    e._ibl.envMap=null;
                }
                if(mode==='geometric_normals')e.scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.normalMap||m?.bumpMap){m.normalMap=null;m.bumpMap=null;m.needsUpdate=true;}});
            },mode);
            await page.evaluate(settleGameFrames,30);
            const evidence=await page.evaluate(readGameEvidence);
            evidence.lights=await page.evaluate(()=>{const e=window.__busSim.engine,a=[];e.scene.traverse(o=>{if(o.isLight)a.push({type:o.type,color:o.color.toArray(),intensity:o.intensity,shadow:o.castShadow,bias:o.shadow?.bias,normalBias:o.shadow?.normalBias});});return a;});
            evidence.materials=await page.evaluate(()=>{
                const e=window.__busSim.engine,materials=new Map();
                e.scene.traverse(object=>{
                    for(const material of Array.isArray(object.material)?object.material:[object.material]){
                        if(!material||materials.has(material.uuid))continue;
                        materials.set(material.uuid,{name:material.name,type:material.type,color:material.color?.toArray(),
                            environment:material.envMap?.uuid??null,environmentMapping:material.envMap?.mapping??null,
                            envMapIntensity:material.envMapIntensity,aoMapIntensity:material.aoMapIntensity,
                            roughness:material.roughness,metalness:material.metalness,normalMap:!!material.normalMap,
                            iblNoAuto:material.userData?.iblNoAutoEnvMapIntensity,iblFixed:material.userData?.iblEnvMapIntensity,
                            iblScale:material.userData?.iblEnvMapIntensityScale});
                    }
                });
                return {sceneEnvironment:e.scene.environment?.uuid??null,sceneEnvironmentIntensity:e.scene.environmentIntensity,
                    entries:[...materials.values()]};
            });
            await page.locator('canvas').first().screenshot({path:path.join(output,mode+'.png')});await writeJson(path.join(output,mode+'.json'),evidence);
        }
    });
    if(errors.length)throw new Error(errors.join('\n'));
    const file=path.join(output,'diagnostics_receipt.json');return resultFiles(await receipt(file,ctx.key,{output},await listFiles(output)),file);
}
