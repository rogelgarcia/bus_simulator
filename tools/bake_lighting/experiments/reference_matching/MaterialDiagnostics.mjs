// Isolate material AO and diffuse radiance at an authenticated single-pose comparison.
import path from 'node:path';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import {readGameEvidence,settleGameFrames} from '../lighting_configurations/capture_baselines/GameEvidence.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {outputPath} from './Baseline.mjs';
import {assertPoseMatches} from '../lighting_configurations/Inputs.mjs';
import {rawRadiance} from './RawRadiance.mjs';
import {analyzeMaterialCapture} from './MaterialAnalysis.mjs';

export async function materialDiagnostics(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output||!ctx.options.regions)
        throw new Error('input, output and normalized regions JSON required; diagnostic only');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(input,'comparison_receipt.json'));
    const regions=JSON.parse(await readFile(path.resolve(ctx.root,ctx.options.regions),'utf8'));
    for(const rect of Object.values(regions))if(!Array.isArray(rect)||rect.length!==4||rect.some(v=>!Number.isFinite(v)||v<0||v>1)||rect[0]>=rect[2]||rect[1]>=rect[3])
        throw new Error('Regions must be normalized [left,top,right,bottom] rectangles');
    const pose=JSON.parse(await readFile(path.join(input,'requested_pose.json'),'utf8'));
    const target=JSON.parse(await readFile(path.join(input,'cycles/renders.json'),'utf8'));
    if(target.length!==1)throw new Error('Exactly one reference pose required');
    await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    await writeJson(path.join(output,'request.json'),{input,regions,target:target[0],pose,diagnosticOnly:true});
    const errors=[];
    console.log('Material diagnostic: loading exact pose with repository defaults and installed bakes');
    await withGameBrowser(ctx,{width:1920,height:1080},async(page,url)=>{
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
        await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify({...pose,hud:{visible:false}}))}`);
        await page.waitForFunction(()=>{
            const d=window.__busSim?.engine?.getBakedLightingDebugInfo();
            return d?.status.effectiveMode==='baked'&&d.receiverLightmaps.effective.indirect&&d.receiverLightmaps.activationBlend===1&&d.view?.ready!==false&&!d.busLighting.transitionState;
        });
        await page.evaluate(async()=>{
            const {ensureGlobalPerfBar}=await import('/src/graphics/gui/perf_bar/PerfBar.js');
            ensureGlobalPerfBar().setHidden(true);
        });
        await page.evaluate(settleGameFrames,60);
        const before=await page.evaluate(readGameEvidence);
        assertPoseMatches(pose,before.actualPose);
        if(before.viewport.width!==1920||before.viewport.height!==1080)throw new Error('Unexpected canvas size');
        if(Math.abs(before.renderer.exposure-2**target[0].exposureEv)>1e-8)throw new Error('Game/reference exposure mismatch');
        await writeJson(path.join(output,'game_before.json'),before);
        await page.evaluate(()=>{
            const c=window.__busSim.engine.canvas;
            for(const el of document.body.querySelectorAll('*'))if(el!==c&&!el.contains(c)&&!['SCRIPT','STYLE','LINK'].includes(el.tagName))el.style.visibility='hidden';c.style.visibility='visible';
        });
        await page.locator('canvas').first().screenshot({path:path.join(output,'game_defaults.png')});
        console.log('Material diagnostic: bake active; capturing fixed-exposure AO and diffuse passes');
        await rawRadiance(page,path.join(output,'game_raw'),{materialDiagnostics:true});
        const samples=await page.evaluate(async regions=>{
            const THREE=await import('three'),e=window.__busSim.engine,result={};
            const ray=new THREE.Raycaster();
            for(const [name,r] of Object.entries(regions)){
                result[name]=[];
                for(let y=0;y<3;y++)for(let x=0;x<3;x++){
                    const u=r[0]+(r[2]-r[0])*(x+.5)/3,v=r[1]+(r[3]-r[1])*(y+.5)/3;
                    ray.setFromCamera(new THREE.Vector2(u*2-1,1-v*2),e.camera);
                    const hit=ray.intersectObjects(e.scene.children,true).find(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return h.object.layers.test(e.camera.layers);});
                    if(!hit)continue;
                    const o=hit.object,m=Array.isArray(o.material)?o.material[hit.face.materialIndex]:o.material;
                    const texture=t=>t?{name:t.name,colorSpace:t.colorSpace,repeat:t.repeat.toArray(),offset:t.offset.toArray(),channel:t.channel}:null;
                    const atlas=o.geometry.attributes.receiverAtlasCoordinate;
                    result[name].push({uv:[u,v],point:hit.point.toArray(),object:o.name,material:m.name,type:m.type,color:m.color?.toArray(),
                        metalness:m.metalness,roughness:m.roughness,aoMapIntensity:m.aoMapIntensity,normalScale:m.normalScale?.toArray(),envMapIntensity:m.envMapIntensity,
                        textures:Object.fromEntries(['map','aoMap','normalMap','roughnessMap','metalnessMap'].map(k=>[k,texture(m[k])])),
                        receiverCoordinates:atlas?[hit.face.a,hit.face.b,hit.face.c].map(i=>[atlas.getX(i),atlas.getY(i),atlas.getZ(i),atlas.getW(i)]):null});
                }
            }return result;
        },regions);
        await writeJson(path.join(output,'surface_samples.json'),samples);
        await page.evaluate(settleGameFrames,12);
        const after=await page.evaluate(readGameEvidence);
        for(const key of ['actualPose','lighting','atmosphere','graphics','savedSettings','sourceHashes'])
            if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw new Error('Diagnostic failed to preserve '+key);
        if(after.baked.status.effectiveMode!=='baked'||!after.baked.receiverLightmaps.effective.indirect||after.renderer.exposure!==before.renderer.exposure)
            throw new Error('Diagnostic changed bake/exposure state');
        await writeJson(path.join(output,'game_after.json'),after);
        await writeJson(path.join(output,'browser_errors.json'),errors);
        if(errors.length)throw new Error('Browser errors in material diagnostic: '+errors.slice(0,3).join('; '));
    });
    await copyFile(path.join(input,'cycles.png'),path.join(output,'cycles_reference.png'));
    await analyzeMaterialCapture(ctx,output,output);
    const file=path.join(output,'material_diagnostics_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{input,output,diagnosticOnly:true,publicationEligible:false},await listFiles(output)),file);
}
